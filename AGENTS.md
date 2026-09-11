# AGENTS.md - Navigation & Architectural Guide

This guide documents the critical architecture, non-obvious conventions, protocol gotchas, and tricky failure modes discovered while implementing the Pipecat + Fish Audio real-time voice assistant. Future AI agents should consult this document before making structural changes.

---

## 1. High-Level Architecture

The repository is decoupled into three primary tiers:

```
[ Web Browser / Client ]
      │   ▲
      │   │  SmallWebRTC (Audio in/out + Data Channel / RTVI)
      ▼   │
[ Pipecat Server (bot.py) : 7860 ]
      │
      ├──> STT Layer: Local Whisper (`pipecat.services.whisper`)
      ├──> LLM Layer: Abstract Providers (OpenAI, LM Studio, Ollama)
      └──> TTS Layer: Fish Audio WebSocket (`pipecat.services.fish.tts`)
             ▲
             │  Voice & Agent Resolution API
             ▼
[ Fish Audio Cloud / cloudflare-fish-audio ]
```

---

## 2. Decoupled Service Architecture (`server/services/`)

Core pipelines should **never hardcode or directly instantiate** AI vendor SDKs in `bot.py`. Instead, all services go through protocols and factories:

* **Configuration**: `server/services/config.py` contains typed dataclasses (`LLMConfig`, `STTConfig`, `TTSConfig`).
* **Factory Pattern**: `server/services/factory.py` maintains provider registries (`LLM_REGISTRY`, `TTS_REGISTRY`, `STT_REGISTRY`).
* **Active Switching**: Switching the LLM from LM Studio to OpenAI requires only changing `LLM_PROVIDER=openai` in `.env` (or via `LLMConfig(provider=...)`).

---

## 3. Tricky Concept: SmallWebRTC Protocol & RTVI Handshake

### Port & Signaling
* The Pipecat server uses `SmallWebRTCConnection` running on FastAPI port `7860`.
* The signaling endpoint is `POST /api/offer`.
* The client passes WebRTC configuration and dynamic startup parameters (such as the chosen voice/agent) via `requestData`:
  ```ts
  client.connect({
    webrtcUrl: '/api/offer',
    requestData: {
      voice: selectedVoiceId,
    }
  });
  ```
* On the server, `SmallWebRTCRunnerArguments` extracts this body as `body = getattr(runner_args, "body", {})`.

### RTVI Protocol Negotiation
* `@pipecat-ai/client-js` expects the server to send `bot-ready` via the WebRTC data channel before it marks its transport state as `'ready'`.
* `PipelineWorker(pipeline, ...)` automatically mounts `RTVIProcessor` and creates `RTVIObserver`.
* **Never add a second RTVIProcessor manually** into the pipeline list in `bot.py`, otherwise duplicate frame handling will cause race conditions.

---

## 4. Fish Audio Voices vs. Conversational Agents

A common point of confusion is the distinction between **Fish Audio Voice Models** and **Fish Audio Conversational Agents**:

1. **Conversational Agents (`/v1/agent/agents`)**:
   * Created in the user's Fish Audio dashboard or via `cloudflare-fish-audio`.
   * Have 32-character hexadecimal IDs (e.g., `1e1c8fe092aa4f3fb09207a6d9e4d63e`).
   * Bundles their own system prompt, first message/greeting, and linked voice model.
2. **Trained Voice Models (`/model?self=true`)**:
   * Pure acoustic clones/TTS reference IDs (e.g., `eb40371539bf465da74708c45ffe0df5`).
   * Used strictly by TTS synthesis (`FishAudioTTSService.Settings(voice=...)`).

### Dynamic Agent Resolution in `run_bot`
When an agent ID is selected in the UI:
1. `bot.py` queries `GET /v1/agent/agents/{agent_id}/versions/1`.
2. It extracts `config.voice.voice_id` and overrides the TTS reference voice.
3. It extracts `config.prompt.system_prompt` and injects it into the LLM system prompt.
4. It extracts `config.prompt.first_message` to initialize the conversation greeting.

---

## 5. Text Input & Multimodal Interaction

### Sending Text via RTVI
* In `@pipecat-ai/client-js`, text input is sent using `client.sendText(content, options)`:
  ```ts
  await client.sendText(text, {
    run_immediately: true,
    audio_response: true
  });
  ```
* `run_immediately: true`: Interrupts any current bot speech and queues an immediate LLM turn.
* `audio_response: true`: Tells the server pipeline to synthesize speech via Fish Audio TTS in addition to streaming text back.

### Server-Side Data Channel Message Handling
* WebRTC data channel frames flow through `SmallWebRTCTransport`.
* Registered with `@transport.event_handler("on_app_message")`.
* The upstream `RTVIProcessor` unpacks `RTVI.SendText` frames and transforms them into `LLMMessagesAppendFrame` with `run_llm=True`.

---

## 6. Development Rules & Tooling

* **Python Tooling**: Always use `uv run <script>` instead of `python` or `pip`.
* **Node Tooling**: Always use `pnpm` instead of `npm`.
* **UI & Styling**: Rely on high-level pre-styled component libraries (Shadcn UI, Radix, Tailwind) without handrolled raw CSS.
* **Browser Automation**: Use `agent-browser` (e.g., `agent-browser open ...`, `agent-browser snapshot -i`, `agent-browser screenshot`).
* **Git Conventions**:
  * Never push automatically (`git push`).
  * Always start from a clean working tree.
  * Write conventional commit messages (e.g. `feat(...)`, `fix(...)`).
  * Never use em dashes ("—"). Use a standard dash ("-") instead.

---

## 7. Free Hosting & Deployment (Cloudflare + Hugging Face)

* **Backend (Hugging Face Docker Space)**:
  * Uses `server/Dockerfile` and `server/README.md` (metadata with `sdk: docker`, `app_port: 7860`).
  * Push the `server/` directory to a new Hugging Face Space.
  * Configure Secrets in the Space Settings: `FISH_AUDIO_API_KEY`, `OPENAI_API_KEY`, `LLM_PROVIDER`.
* **Frontend (Cloudflare Static Assets / Pages)**:
  * Uses `client/wrangler.jsonc`.
  * Set `VITE_SERVER_URL=https://<user>-<space-name>.hf.space` in `client/.env.production` or Cloudflare dashboard variables.
  * Deploy using `pnpm --filter client build && npx wrangler deploy --config client/wrangler.jsonc`.

