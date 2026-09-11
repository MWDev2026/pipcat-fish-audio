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


# Cache for voices/agents to avoid repeated external API calls
_CACHED_VOICES = []
_LAST_FETCH_TIME = 0.0


@app.get("/api/voices")
async def get_voices():
    """Return available Fish Audio voices & conversational agents directly from Fish Audio account."""
    global _CACHED_VOICES, _LAST_FETCH_TIME
    import time

    current_voice = os.getenv("FISH_VOICE", "default")
    api_key = os.getenv("FISH_AUDIO_API_KEY", "")

    # Return cached results if fetched within last 60 seconds
    if _CACHED_VOICES and (time.time() - _LAST_FETCH_TIME < 60):
        return {
            "current_voice": current_voice,
            "voices": _CACHED_VOICES,
        }

    items = []

    # 1. Fetch user's Conversational Agents from Fish Audio API (/v1/agent/agents)
    if api_key:
        try:
            timeout = aiohttp.ClientTimeout(total=5)
            headers = {"Authorization": f"Bearer {api_key}"}
            async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
                async with session.get("https://api.fish.audio/v1/agent/agents") as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        agents = data.get("agents", [])
                        for a in agents:
                            agent_id = a.get("agent_id", "")
                            name = a.get("name", "Unnamed Agent")
                            items.append({
                                "id": agent_id,
                                "voice_id": agent_id,
                                "name": f"{name} ({agent_id[:8]}...)",
                                "type": "agent",
                                "selected": agent_id == current_voice,
                            })
        except Exception as e:
            logger.warning(f"Failed to fetch Fish Audio agents: {e}")

    # 2. Fetch user's custom Voice Models from Fish Audio API (/model?self=true)
    if api_key:
        try:
            timeout = aiohttp.ClientTimeout(total=5)
            headers = {"Authorization": f"Bearer {api_key}"}
            async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
                async with session.get("https://api.fish.audio/model?self=true") as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        models = data.get("items", [])
                        for m in models:
                            mid = m.get("_id", "")
                            title = m.get("title", "Voice Model")
                            # Avoid duplicate display if already present
                            if not any(it["voice_id"] == mid for it in items):
                                items.append({
                                    "id": mid,
                                    "voice_id": mid,
                                    "name": f"{title} ({mid[:8]}...)",
                                    "type": "model",
                                    "selected": mid == current_voice,
                                })
        except Exception as e:
            logger.warning(f"Failed to fetch Fish Audio user models: {e}")

    # 3. Always include Preset Voices from CURATED_FISH_VOICES (Default, Jensen Huang, poc-voice, 佐藤健)
    for key, info in CURATED_FISH_VOICES.items():
        vid = info["id"]
        # If voice_id already present from agents or models, don't duplicate
        if vid and any(it["voice_id"] == vid for it in items):
            continue
        items.append({
            "id": key,
            "voice_id": vid,
            "name": info["name"],
            "type": "preset",
            "selected": key == current_voice or (vid and vid == current_voice),
        })

    if items:
        _CACHED_VOICES = items
        _LAST_FETCH_TIME = time.time()

    return {
        "current_voice": current_voice,
        "voices": items,
    }


async def run_bot(transport: BaseTransport, voice: Optional[str] = None):
    """Main bot logic following official Pipecat cascade pipeline."""
    logger.info(f"Starting Pipecat voice bot session with voice/agent: {voice or 'default'}")

    actual_voice_id = voice
    custom_system_prompt: Optional[str] = None
    initial_greeting: Optional[str] = None

    # Check if selected voice is a Fish Audio Conversational Agent ID
    api_key = os.getenv("FISH_AUDIO_API_KEY", "")
    if voice and api_key and len(voice) >= 20 and not voice.startswith("default"):
        try:
            timeout = aiohttp.ClientTimeout(total=4)
            headers = {"Authorization": f"Bearer {api_key}"}
            async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
                # Try fetching agent live version configuration
                async with session.get(f"https://api.fish.audio/v1/agent/agents/{voice}/versions/1") as resp:
                    if resp.status == 200:
                        cfg_data = (await resp.json()).get("config", {})
                        voice_cfg = cfg_data.get("voice", {})
                        if voice_cfg.get("voice_id"):
                            actual_voice_id = voice_cfg["voice_id"]
                            logger.info(f"Resolved Agent '{voice}' to Fish Audio voice model: {actual_voice_id}")
                        prompt_cfg = cfg_data.get("prompt", {})
                        if prompt_cfg.get("system_prompt"):
                            custom_system_prompt = prompt_cfg["system_prompt"]
                        if prompt_cfg.get("first_message"):
                            initial_greeting = prompt_cfg["first_message"]
        except Exception as e:
            logger.warning(f"Could not fetch Fish Audio agent details for '{voice}': {e}")

    # Abstract STT service (Whisper, etc.)
    stt = create_stt_service()

    # Abstract TTS service with resolved voice ID
    tts_config = TTSConfig(voice=actual_voice_id) if actual_voice_id else None
    tts = create_tts_service(tts_config)

    # Abstract LLM service with optional agent system prompt
    from services.config import LLMConfig
    llm_config = LLMConfig(system_instruction=custom_system_prompt) if custom_system_prompt else None
    llm = create_llm_service(llm_config)

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
        greeting_text = initial_greeting or "Hello! Please introduce yourself briefly in one short sentence."
        context.add_message(
            {"role": "user", "content": f"Greet the user: {greeting_text}" if initial_greeting else greeting_text}
        )
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Client connected to transport: {client}")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Client disconnected: {client}")
        await worker.cancel()

    @transport.event_handler("on_app_message")
    async def on_app_message(transport, message, sender):
        logger.info(f"Received WebRTC app/data channel message from '{sender}': {message}")

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
