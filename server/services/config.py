"""Strongly-typed service configuration with environment defaults."""

import os
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class LLMConfig:
    provider: str = field(default_factory=lambda: os.getenv("LLM_PROVIDER", "lmstudio").lower())
    model: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    system_instruction: str = (
        "You are a helpful and friendly voice AI assistant. "
        "Your responses will be spoken aloud immediately, so keep responses concise, "
        "direct, conversational, and under two sentences. "
        "Do not use markdown, emojis, asterisks, or bullet points."
    )
    extra_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class STTConfig:
    provider: str = field(default_factory=lambda: os.getenv("STT_PROVIDER", "whisper").lower())
    model: str = field(default_factory=lambda: os.getenv("WHISPER_MODEL", "tiny"))
    device: str = field(default_factory=lambda: os.getenv("WHISPER_DEVICE", "auto"))


@dataclass
class TTSConfig:
    provider: str = field(default_factory=lambda: os.getenv("TTS_PROVIDER", "fish").lower())
    api_key: Optional[str] = None
    model: Optional[str] = None
    voice: Optional[str] = field(default_factory=lambda: os.getenv("FISH_VOICE", None))
    latency: str = "low"
    prosody_speed: float = 1.0
