import unittest
from services.config import LLMConfig, STTConfig, TTSConfig
from services.factory import create_llm_service, create_stt_service, create_tts_service
from services.llm.lmstudio import NonThinkingLMStudioLLMService
from services.tts.fish import CURATED_FISH_VOICES
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
        self.assertIs(type(service), OpenAILLMService)

    def test_stt_whisper_creation(self):
        cfg = STTConfig(provider="whisper", model="tiny")
        service = create_stt_service(cfg)
        self.assertIsNotNone(service)

    def test_tts_fish_default_creation(self):
        cfg = TTSConfig(provider="fish", api_key="sk-mock-fish-key", model="s2.1-pro-free")
        service = create_tts_service(cfg)
        self.assertIsNotNone(service)

    def test_tts_fish_voice_alias_resolution(self):
        cfg = TTSConfig(provider="fish", api_key="sk-mock-fish-key", model="s2.1-pro-free", voice="ai_assistant")
        service = create_tts_service(cfg)
        self.assertIsNotNone(service)
        expected_voice_id = CURATED_FISH_VOICES["ai_assistant"]["id"]
        self.assertEqual(service._settings.voice, expected_voice_id)

    def test_tts_fish_custom_voice_id(self):
        custom_id = "custom_voice_id_123456"
        cfg = TTSConfig(provider="fish", api_key="sk-mock-fish-key", model="s2.1-pro-free", voice=custom_id)
        service = create_tts_service(cfg)
        self.assertIsNotNone(service)
        self.assertEqual(service._settings.voice, custom_id)


if __name__ == "__main__":
    unittest.main()
