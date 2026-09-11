"""Standard OpenAI adapter."""

import os
from loguru import logger
from pipecat.services.openai.llm import OpenAILLMService

from ..base import LLMProviderProtocol
from ..config import LLMConfig


class OpenAILLMProvider(LLMProviderProtocol):
    """Provider for official OpenAI models (e.g. gpt-4o, gpt-4o-mini)."""

    def __init__(self, config: LLMConfig):
        self.config = config

    def build_service(self) -> OpenAILLMService:
        api_key = self.config.api_key or os.getenv("OPENAI_API_KEY")
        model = self.config.model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        base_url = self.config.base_url or os.getenv("OPENAI_BASE_URL", None)

        logger.info(f"Initializing OpenAI LLM Provider: model={model}")

        settings_kwargs = {
            "model": model,
            "system_instruction": self.config.system_instruction,
        }
        if self.config.extra_params:
            settings_kwargs.update(self.config.extra_params)

        service_kwargs = {
            "api_key": api_key,
            "settings": OpenAILLMService.Settings(**settings_kwargs),
        }
        if base_url:
            service_kwargs["base_url"] = base_url

        return OpenAILLMService(**service_kwargs)
