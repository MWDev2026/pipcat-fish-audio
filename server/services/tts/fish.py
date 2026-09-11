"""Fish Audio TTS adapter supporting custom model/reference voices."""

import os
from loguru import logger
from pipecat.services.fish.tts import FishAudioTTSService

from ..base import TTSProviderProtocol
from ..config import TTSConfig

# Preset voices aligned with cloudflare-fish-audio and user account models
CURATED_FISH_VOICES = {
    "default": {"id": None, "name": "Default (Fish Audio Native)"},
    "jensen_huang": {"id": "eb40371539bf465da74708c45ffe0df5", "name": "Jensen Huang"},
    "poc_voice": {"id": "7ba71ca98c824717a6032887a5282263", "name": "poc-voice (Japanese)"},
    "satoh_takeru": {"id": "3b983252c6bb476cbf77d7bb69a74b94", "name": "佐藤健 (Japanese)"},
}


class FishAudioTTSProvider(TTSProviderProtocol):
    """Provider for Fish Audio Cloud TTS with voice selection."""

    def __init__(self, config: TTSConfig):
        self.config = config

    def build_service(self) -> FishAudioTTSService:
        api_key = self.config.api_key or os.getenv("FISH_AUDIO_API_KEY")
        model = self.config.model or os.getenv("FISH_MODEL", "s2.1-pro-free")
        voice = self.config.voice or os.getenv("FISH_VOICE", None)

        # Resolve voice alias if provided from curated list
        if voice in CURATED_FISH_VOICES:
            voice_id = CURATED_FISH_VOICES[voice]["id"]
            voice_name = CURATED_FISH_VOICES[voice]["name"]
        else:
            voice_id = voice
            voice_name = voice or "Default"

        logger.info(f"Initializing Fish Audio TTS Provider: model={model}, voice='{voice_name}' (id={voice_id})")

        settings_kwargs = {
            "model": model,
            "latency": self.config.latency,
            "prosody_speed": self.config.prosody_speed,
        }
        if voice_id:
            settings_kwargs["voice"] = voice_id

        return FishAudioTTSService(
            api_key=api_key,
            settings=FishAudioTTSService.Settings(**settings_kwargs),
        )
