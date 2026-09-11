import os
import aiohttp
from typing import Optional
from dotenv import load_dotenv
from loguru import logger
from fastapi import FastAPI
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
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.workers.runner import WorkerRunner
from pipecat.runner.run import app

from services import create_llm_service, create_stt_service, create_tts_service
from services.config import TTSConfig
from services.tts.fish import CURATED_FISH_VOICES

load_dotenv(override=True)


# Mount voice listing endpoint onto Pipecat runner FastAPI app
@app.get("/api/voices")
async def get_voices():
    """Return available Fish Audio voices (curated and custom options)."""
    api_key = os.getenv("FISH_AUDIO_API_KEY", "")
    current_voice = os.getenv("FISH_VOICE", "default")
    
    voices = []
    for key, info in CURATED_FISH_VOICES.items():
        voices.append({
            "id": key,
            "voice_id": info["id"],
            "name": info["name"],
            "selected": key == current_voice or info["id"] == current_voice,
        })

    return {
        "current_voice": current_voice,
        "voices": voices,
    }


async def run_bot(transport: BaseTransport, voice: Optional[str] = None):
    """Main bot logic following official Pipecat cascade pipeline."""
    logger.info(f"Starting Pipecat voice bot session with voice: {voice or 'default'}")

    # Abstract STT service (Whisper, etc.)
    stt = create_stt_service()

    # Abstract TTS service with requested voice
    tts_config = TTSConfig(voice=voice) if voice else None
    tts = create_tts_service(tts_config)

    # Abstract LLM service (OpenAI, LM Studio, Ollama, etc.)
    llm = create_llm_service()

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
            body = getattr(runner_args, "body", {}) or {}
            voice = body.get("voice") if isinstance(body, dict) else None

            transport = SmallWebRTCTransport(
                webrtc_connection=webrtc_connection,
                params=TransportParams(
                    audio_in_enabled=True,
                    audio_out_enabled=True,
                ),
            )
            await run_bot(transport, voice=voice)
        case _:
            logger.error(f"Unsupported runner arguments type: {type(runner_args)}")
            return


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
