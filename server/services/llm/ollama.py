"""Ollama local adapter."""

import os
from loguru import logger
from pipecat.services.openai.llm import OpenAILLMService

from ..base import LLMProviderProtocol
from ..config import LLMConfig


class OllamaLLMProvider(LLMProviderProtocol):
    """Provider for local Ollama instances via OpenAI-compatible endpoint."""

    def __init__(self, config: LLMConfig):
        self.config = config

    def build_service(self) -> OpenAILLMService:
        base_url = self.config.base_url or os.getenv("OLLAMA_URL", "http://localhost:11434/v1")
        model = self.config.model or os.getenv("OLLAMA_MODEL", "llama3.2")

        logger.info(f"Initializing Ollama LLM Provider: url={base_url}, model={model}")

        return OpenAILLMService(
            base_url=base_url,
            api_key="ollama",
            settings=OpenAILLMService.Settings(
                model=model,
                system_instruction=self.config.system_instruction,
            ),
        )
