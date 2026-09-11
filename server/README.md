---
title: Pipecat Voice Bot
emoji: 🎙️
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# Pipecat Voice Bot (Hugging Face Space Backend)

SmallWebRTC voice agent backend powered by Pipecat, Fish Audio Cloud TTS, and OpenAI / local LLMs.

## Required Environment Variables / Secrets
Set these in your Space **Settings -> Variables and secrets**:

* `FISH_AUDIO_API_KEY`: Your Fish Audio API Key.
* `OPENAI_API_KEY`: Your OpenAI API Key (if using OpenAI).
* `LLM_PROVIDER`: `openai` or `lmstudio` (default: `openai`).
