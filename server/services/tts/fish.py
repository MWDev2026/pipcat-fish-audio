"""Fish Audio TTS adapter supporting custom model/reference voices."""

import os
from loguru import logger
from pipecat.services.fish.tts import FishAudioTTSService

from ..base import TTSProviderProtocol
from ..config import TTSConfig

# Popular pre-configured Fish Audio reference voices
CURATED_FISH_VOICES = {
    "default": {"id": None, "name": "Default (Fish Audio s2.1 Free)"},
    "ai_assistant": {"id": "e47ccbcdcf4642f2b4b2174e3938cca7", "name": "AI Assistant (Natural Female)"},
    "tech_assistant": {"id": "4aa90c24bfdd4e628306d39377f4e3db", "name": "AI Voice Assistant (Crisp Female)"},
    "customer_service": {"id": "54cc428cee614c0c8c208659b0cbd66a", "name": "Customer Service (Warm Male)"},
    "announcer": {"id": "90e65eaaf50e4470b8e6d43ee6afd7d5", "name": "Dynamic Announcer (Cinematic Male)"},
    "google_assistant": {"id": "27098a25110c40d4aad5b72ef4737192", "name": "Modern Google Assistant"},
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
