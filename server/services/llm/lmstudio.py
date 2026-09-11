"""LM Studio adapter with local non-thinking prompt injection."""

import os
from loguru import logger
from pipecat.services.openai.base_llm import OpenAILLMInvocationParams
from pipecat.services.openai.llm import OpenAILLMService

from ..base import LLMProviderProtocol
from ..config import LLMConfig


class NonThinkingLMStudioLLMService(OpenAILLMService):
    """Customized OpenAILLMService for local LM Studio Qwen models to bypass reasoning/thinking mode."""

    def build_chat_completion_params(self, params_from_context: OpenAILLMInvocationParams) -> dict:
        params = super().build_chat_completion_params(params_from_context)
        msgs = list(params.get("messages", []))
        if msgs and msgs[-1].get("role") == "user":
            msgs.append({"role": "assistant", "content": "<think>\n</think>\n"})
            params["messages"] = msgs
        params["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
        return params


class LMStudioLLMProvider(LLMProviderProtocol):
    """Provider for local LM Studio servers."""

    def __init__(self, config: LLMConfig):
        self.config = config

    def build_service(self) -> OpenAILLMService:
        base_url = self.config.base_url or os.getenv("LM_STUDIO_URL", "http://127.0.0.1:1234/v1")
        model = self.config.model or os.getenv("LM_STUDIO_MODEL", "qwen3.5-4b-uncensored-hauhaucs-aggressive")
        api_key = self.config.api_key or "lm-studio"

        logger.info(f"Initializing LM Studio LLM Provider: url={base_url}, model={model}")

        return NonThinkingLMStudioLLMService(
            base_url=base_url,
            api_key=api_key,
            settings=OpenAILLMService.Settings(
                model=model,
                system_instruction=self.config.system_instruction,
            ),
        )
