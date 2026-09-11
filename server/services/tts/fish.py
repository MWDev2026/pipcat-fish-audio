"""Fish Audio TTS adapter."""

import os
from loguru import logger
from pipecat.services.fish.tts import FishAudioTTSService

from ..base import TTSProviderProtocol
from ..config import TTSConfig


class FishAudioTTSProvider(TTSProviderProtocol):
    """Provider for Fish Audio Cloud TTS."""

    def __init__(self, config: TTSConfig):
        self.config = config

    def build_service(self) -> FishAudioTTSService:
        api_key = self.config.api_key or os.getenv("FISH_AUDIO_API_KEY")
        model = self.config.model or os.getenv("FISH_MODEL", "s2.1-pro-free")

        logger.info(f"Initializing Fish Audio TTS Provider: model={model}")

        return FishAudioTTSService(
            api_key=api_key,
            settings=FishAudioTTSService.Settings(
                model=model,
                latency=self.config.latency,
                prosody_speed=self.config.prosody_speed,
            ),
        )
