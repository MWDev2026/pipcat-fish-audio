"""Whisper STT adapter."""

from loguru import logger
from pipecat.services.whisper.stt import WhisperSTTService

from ..base import STTProviderProtocol
from ..config import STTConfig


class WhisperSTTProvider(STTProviderProtocol):
    """Provider for local Whisper STT."""

    def __init__(self, config: STTConfig):
        self.config = config

    def build_service(self) -> WhisperSTTService:
        logger.info(f"Initializing Whisper STT Provider: model={self.config.model}, device={self.config.device}")
        return WhisperSTTService(
            device=self.config.device,
            settings=WhisperSTTService.Settings(
                model=self.config.model,
            ),
        )
