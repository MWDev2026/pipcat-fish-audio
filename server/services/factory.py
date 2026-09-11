"""Central provider factory and registry."""

from typing import Dict, Optional, Type
from pipecat.services.llm_service import LLMService
from pipecat.services.stt_service import STTService
from pipecat.services.tts_service import TTSService

from .base import LLMProviderProtocol, STTProviderProtocol, TTSProviderProtocol
from .config import LLMConfig, STTConfig, TTSConfig
from .llm.lmstudio import LMStudioLLMProvider
from .llm.ollama import OllamaLLMProvider
from .llm.openai import OpenAILLMProvider
from .stt.whisper import WhisperSTTProvider
from .tts.fish import FishAudioTTSProvider

LLM_REGISTRY: Dict[str, Type[LLMProviderProtocol]] = {
    "lmstudio": LMStudioLLMProvider,
    "openai": OpenAILLMProvider,
    "ollama": OllamaLLMProvider,
}

STT_REGISTRY: Dict[str, Type[STTProviderProtocol]] = {
    "whisper": WhisperSTTProvider,
}

TTS_REGISTRY: Dict[str, Type[TTSProviderProtocol]] = {
    "fish": FishAudioTTSProvider,
}


def create_llm_service(config: Optional[LLMConfig] = None) -> LLMService:
    """Create concrete LLM service from configuration or environment defaults."""
    cfg = config or LLMConfig()
    provider_cls = LLM_REGISTRY.get(cfg.provider)
    if not provider_cls:
        valid_options = ", ".join(repr(k) for k in LLM_REGISTRY.keys())
        raise ValueError(
            f"Unsupported LLM provider: {cfg.provider!r}. Supported providers: [{valid_options}]. "
            "Please set LLM_PROVIDER in your .env file."
        )
    return provider_cls(cfg).build_service()


def create_stt_service(config: Optional[STTConfig] = None) -> STTService:
    """Create concrete STT service from configuration or environment defaults."""
    cfg = config or STTConfig()
    provider_cls = STT_REGISTRY.get(cfg.provider)
    if not provider_cls:
        valid_options = ", ".join(repr(k) for k in STT_REGISTRY.keys())
        raise ValueError(
            f"Unsupported STT provider: {cfg.provider!r}. Supported providers: [{valid_options}]."
        )
    return provider_cls(cfg).build_service()


def create_tts_service(config: Optional[TTSConfig] = None) -> TTSService:
    """Create concrete TTS service from configuration or environment defaults."""
    cfg = config or TTSConfig()
    provider_cls = TTS_REGISTRY.get(cfg.provider)
    if not provider_cls:
        valid_options = ", ".join(repr(k) for k in TTS_REGISTRY.keys())
        raise ValueError(
            f"Unsupported TTS provider: {cfg.provider!r}. Supported providers: [{valid_options}]."
        )
    return provider_cls(cfg).build_service()
