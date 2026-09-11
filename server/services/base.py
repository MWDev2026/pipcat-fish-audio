"""Abstract base interfaces and protocols for AI services."""

from typing import Protocol, runtime_checkable
from pipecat.services.ai_service import AIService
from pipecat.services.llm_service import LLMService
from pipecat.services.stt_service import STTService
from pipecat.services.tts_service import TTSService


@runtime_checkable
class LLMProviderProtocol(Protocol):
    """Protocol implemented by all LLM service providers."""

    def build_service(self) -> LLMService:
        """Construct and return the concrete Pipecat LLM service instance."""
        ...


@runtime_checkable
class STTProviderProtocol(Protocol):
    """Protocol implemented by all STT service providers."""

    def build_service(self) -> STTService:
        """Construct and return the concrete Pipecat STT service instance."""
        ...


@runtime_checkable
class TTSProviderProtocol(Protocol):
    """Protocol implemented by all TTS service providers."""

    def build_service(self) -> TTSService:
        """Construct and return the concrete Pipecat TTS service instance."""
        ...
