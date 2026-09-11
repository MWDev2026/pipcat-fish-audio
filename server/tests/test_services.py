import unittest
from services.config import LLMConfig, STTConfig, TTSConfig
from services.factory import create_llm_service, create_stt_service, create_tts_service
from services.llm.lmstudio import NonThinkingLMStudioLLMService
from pipecat.services.openai.llm import OpenAILLMService


class TestDecoupledServices(unittest.TestCase):
    def test_lmstudio_provider_creation(self):
        cfg = LLMConfig(
            provider="lmstudio",
            base_url="http://127.0.0.1:1234/v1",
            model="qwen3.5-4b-uncensored-hauhaucs-aggressive",
        )
        service = create_llm_service(cfg)
        self.assertIsInstance(service, NonThinkingLMStudioLLMService)
        self.assertIsInstance(service, OpenAILLMService)

    def test_openai_provider_creation(self):
        cfg = LLMConfig(
            provider="openai",
            api_key="sk-test-key-mock",
            model="gpt-4o-mini",
        )
        service = create_llm_service(cfg)
        self.assertIsInstance(service, OpenAILLMService)
        # Ensure it is standard OpenAILLMService, not the Qwen subclass
        self.assertIs(type(service), OpenAILLMService)

    def test_ollama_provider_creation(self):
        cfg = LLMConfig(
            provider="ollama",
            base_url="http://localhost:11434/v1",
            model="llama3.2",
        )
        service = create_llm_service(cfg)
        self.assertIsInstance(service, OpenAILLMService)

    def test_unsupported_provider_raises_informative_error(self):
        cfg = LLMConfig(provider="unsupported_xyz")
        with self.assertRaises(ValueError) as ctx:
            create_llm_service(cfg)
        self.assertIn("Unsupported LLM provider", str(ctx.exception))
        self.assertIn("Supported providers: ['lmstudio', 'openai', 'ollama']", str(ctx.exception))

    def test_stt_whisper_creation(self):
        cfg = STTConfig(provider="whisper", model="tiny")
        service = create_stt_service(cfg)
        self.assertIsNotNone(service)

    def test_tts_fish_creation(self):
        cfg = TTSConfig(provider="fish", api_key="sk-mock-fish-key", model="s2.1-pro-free")
        service = create_tts_service(cfg)
        self.assertIsNotNone(service)


if __name__ == "__main__":
    unittest.main()
