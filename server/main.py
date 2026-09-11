import asyncio
import os
from collections import deque
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

# In-memory log buffer for client debug panel
log_buffer = deque(maxlen=250)
logger.add(lambda msg: log_buffer.append(str(msg).strip()), format="{time:HH:mm:ss.SSS} | {level: <7} | {message}")

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.fish.tts import FishAudioTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import IceServer, SmallWebRTCConnection
from pipecat.transports.smallwebrtc.request_handler import (
    IceCandidate,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

load_dotenv()

FISH_AUDIO_API_KEY = os.getenv("FISH_AUDIO_API_KEY", "")
FISH_MODEL = os.getenv("FISH_MODEL", "s2.1-pro-free")
LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://localhost:1234/v1")
LM_STUDIO_MODEL = os.getenv("LM_STUDIO_MODEL", "qwen3.5-4b-uncensored-hauhaucs-aggressive")

# Request handler for SmallWebRTC
request_handler = SmallWebRTCRequestHandler(
    ice_servers=[IceServer(urls=["stun:stun.l.google.com:19302"])]
)


async def run_bot(webrtc_connection: SmallWebRTCConnection):
    logger.info(f"Starting voice bot session for peer connection: {webrtc_connection.pc_id}")

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            camera_in_enabled=False,
            camera_out_enabled=False,
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    # 1. Local Whisper STT running on Apple Silicon / CPU
    stt = WhisperSTTService(
        model="tiny",
        device="auto",
    )

    # 2. LM Studio LLM service with non-thinking mode explicitly enforced
    llm = OpenAILLMService(
        base_url=LM_STUDIO_URL,
        api_key="lm-studio",
        settings=OpenAILLMService.Settings(
            model=LM_STUDIO_MODEL,
            system_instruction=(
                "You are a friendly and helpful voice assistant. "
                "Keep responses concise, natural, conversational, and direct. "
                "Do not include any internal thinking, reasoning tags, or markdown formatting. "
                "Answer directly in 1 to 2 short spoken sentences."
            ),
            extra={
                "extra_body": {
                    "chat_template_kwargs": {"enable_thinking": False},
                    "reasoning_effort": "none",
                },
            },
        ),
    )

    # 3. Fish Audio TTS strictly using the free tier model
    tts = FishAudioTTSService(
        api_key=FISH_AUDIO_API_KEY,
        settings=FishAudioTTSService.Settings(
            model=FISH_MODEL,
            latency="low",
            prosody_speed=1.0,
        ),
    )

    # Universal LLM context and aggregators
    context = LLMContext()
    context_aggregator = LLMContextAggregatorPair(context)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected via WebRTC.")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected. Cancelling pipeline task...")
        await task.cancel()

    runner = PipelineRunner()
    await runner.run(task)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Server booting up...")
    yield
    logger.info("Server shutting down, closing active WebRTC connections...")
    await request_handler.close()


app = FastAPI(title="Pipecat Fish Audio Voice Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "fish_model": FISH_MODEL,
        "lm_studio_url": LM_STUDIO_URL,
        "lm_studio_model": LM_STUDIO_MODEL,
    }


@app.get("/api/logs")
async def get_logs():
    return {"logs": list(log_buffer)}


def munge_mdns_candidates(sdp: str, client_ip: str = "127.0.0.1") -> str:
    """Uncloak browser mDNS (.local) host candidates to client IP for aiortc compatibility."""
    lines = []
    munged_count = 0
    for line in sdp.splitlines():
        if line.startswith("a=candidate:") and ".local" in line:
            parts = line.split(" ")
            if len(parts) >= 8 and parts[4].endswith(".local"):
                logger.info(f"Uncloaking browser mDNS candidate: {parts[4]} -> {client_ip}")
                parts[4] = client_ip
                line = " ".join(parts)
                munged_count += 1
        lines.append(line)
    if munged_count > 0:
        logger.info(f"Uncloaked {munged_count} mDNS candidates in SDP offer.")
    return "\r\n".join(lines) + ("\r\n" if sdp.endswith("\r\n") or sdp.endswith("\n") else "")


@app.post("/api/offer")
async def handle_offer(request: Request, background_tasks: BackgroundTasks):
    try:
        body = await request.json()
        req = SmallWebRTCRequest.from_dict(body)

        client_host = request.client.host if request.client else "127.0.0.1"
        target_ip = "127.0.0.1" if client_host in ("127.0.0.1", "::1", "localhost") else client_host
        req.sdp = munge_mdns_candidates(req.sdp, target_ip)

        candidate_lines = [l for l in req.sdp.splitlines() if l.startswith("a=candidate:")]
        logger.info(f"Received offer with {len(candidate_lines)} candidate(s) from {client_host}")

        async def launch_bot(connection: SmallWebRTCConnection):
            background_tasks.add_task(run_bot, connection)

        answer = await request_handler.handle_web_request(
            request=req,
            webrtc_connection_callback=launch_bot,
        )
        return answer
    except Exception as e:
        logger.error(f"Error handling offer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/offer")
async def handle_patch(request: Request):
    try:
        body = await request.json()
        client_host = request.client.host if request.client else "127.0.0.1"
        target_ip = "127.0.0.1" if client_host in ("127.0.0.1", "::1", "localhost") else client_host

        raw_candidates = body.get("candidates", [])
        candidates = []
        for c in raw_candidates:
            cand_str = c.get("candidate", "") if isinstance(c, dict) else getattr(c, "candidate", "")
            if ".local" in cand_str:
                parts = cand_str.split(" ")
                if len(parts) >= 8 and parts[4].endswith(".local"):
                    logger.info(f"Uncloaking patch candidate: {parts[4]} -> {target_ip}")
                    parts[4] = target_ip
                    cand_str = " ".join(parts)
            candidates.append(
                IceCandidate(
                    candidate=cand_str,
                    sdp_mid=c.get("sdp_mid", c.get("sdpMid", "")) if isinstance(c, dict) else getattr(c, "sdp_mid", ""),
                    sdp_mline_index=c.get("sdp_mline_index", c.get("sdpMLineIndex", 0)) if isinstance(c, dict) else getattr(c, "sdp_mline_index", 0),
                )
            )

        logger.info(f"Received patch with {len(candidates)} candidate(s) for pc_id={body.get('pc_id')}")
        patch_req = SmallWebRTCPatchRequest(
            pc_id=body.get("pc_id"),
            candidates=candidates,
        )
        await request_handler.handle_patch_request(patch_req)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error handling candidate patch: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
