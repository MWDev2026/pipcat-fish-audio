import os

from dotenv import load_dotenv
from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments, SmallWebRTCRunnerArguments
from pipecat.services.fish.tts import FishAudioTTSService
from pipecat.services.openai.base_llm import OpenAILLMInvocationParams
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.workers.runner import WorkerRunner

load_dotenv(override=True)


class NonThinkingLMStudioLLMService(OpenAILLMService):
    """OpenAI LLM service customized for LM Studio Qwen models to bypass thinking mode."""

    def build_chat_completion_params(self, params_from_context: OpenAILLMInvocationParams) -> dict:
        params = super().build_chat_completion_params(params_from_context)
        msgs = list(params.get("messages", []))
        if msgs and msgs[-1].get("role") == "user":
            msgs.append({"role": "assistant", "content": "<think>\n</think>\n"})
            params["messages"] = msgs
        params["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
        return params


async def run_bot(transport: BaseTransport):
    """Main bot logic following official Pipecat cascade pipeline."""
    logger.info("Starting Pipecat voice bot session")

    # Speech-to-Text service using local Whisper
    stt = WhisperSTTService()

    # Text-to-Speech service using Fish Audio s2.1-pro-free
    tts = FishAudioTTSService(
        api_key=os.getenv("FISH_AUDIO_API_KEY"),
        settings=FishAudioTTSService.Settings(
            model=os.getenv("FISH_MODEL", "s2.1-pro-free"),
        ),
    )

    # LLM service targeting local LM Studio with non-thinking mode
    llm = NonThinkingLMStudioLLMService(
        base_url=os.getenv("LM_STUDIO_URL", "http://127.0.0.1:1234/v1"),
        api_key="lm-studio",
        settings=OpenAILLMService.Settings(
            model=os.getenv("LM_STUDIO_MODEL", "qwen3.5-4b-uncensored-hauhaucs-aggressive"),
            system_instruction=(
                "You are a helpful and friendly voice AI assistant. "
                "Your responses will be spoken aloud immediately, so keep responses concise, "
                "direct, conversational, and under two sentences. "
                "Do not use markdown, emojis, asterisks, or bullet points."
            ),
        ),
    )

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        observers=[],
    )

    @worker.rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):
        logger.info("RTVI client ready - triggering initial greeting")
        context.add_message(
            {"role": "user", "content": "Hello! Please introduce yourself briefly in one short sentence."}
        )
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Client connected to transport: {client}")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Client disconnected: {client}")
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments):
    """Main bot entry point invoked by Pipecat runner."""
    match runner_args:
        case SmallWebRTCRunnerArguments():
            webrtc_connection: SmallWebRTCConnection = runner_args.webrtc_connection
            transport = SmallWebRTCTransport(
                webrtc_connection=webrtc_connection,
                params=TransportParams(
                    audio_in_enabled=True,
                    audio_out_enabled=True,
                ),
            )
            await run_bot(transport)
        case _:
            logger.error(f"Unsupported runner arguments type: {type(runner_args)}")
            return


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
