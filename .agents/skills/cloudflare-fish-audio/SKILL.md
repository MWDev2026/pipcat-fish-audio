---
name: cloudflare-fish-audio
description: Comprehensive API integration guide for the Cloudflare Worker Fish Audio TTS Gateway at tts.anprogrammer.org. Covers OpenAI-compatible speech endpoint, native Fish Audio REST proxy, low-latency WebSocket live streaming, LiveKit WebRTC conversational voice agents, and guaranteed free-tier model enforcement.
---

# Fish Audio Gateway (`tts.anprogrammer.org`)

A high-performance Cloudflare Worker gateway providing OpenAI-compatible Text-to-Speech (TTS), low-latency WebSocket streaming, and LiveKit WebRTC conversational agents powered by Fish Audio.

## Endpoint Base URLs

- **Public Base URL**: `https://tts.anprogrammer.org`
- **WebSocket Base URL**: `wss://tts.anprogrammer.org`
- **Guaranteed Free Model**: `s2.1-pro-free` (Hardcoded server-side to ensure zero credit spend)

## Authentication

All API and WebSocket endpoints require authorization:
- **HTTP Header**: `Authorization: Bearer <ACCESS_TOKEN>`
- **Query Parameter** (Required for browser WebSockets): `?token=<ACCESS_TOKEN>`

---

## 1. OpenAI-Compatible TTS (`/v1/audio/speech`)

Drop-in replacement for OpenAI's speech API. Fully compatible with the official OpenAI Python / Node SDKs.

### Quick curl Example
```bash
curl -X POST "https://tts.anprogrammer.org/v1/audio/speech" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "Hello from Cloudflare Fish Audio gateway!",
    "voice": "alloy",
    "response_format": "mp3",
    "speed": 1.0
  }' \
  --output speech.mp3
```

### Python (OpenAI SDK)
```python
from openai import OpenAI

client = OpenAI(
    base_url="https://tts.anprogrammer.org/v1",
    api_key="YOUR_ACCESS_TOKEN"
)

with client.audio.speech.with_streaming_response.create(
    model="tts-1",
    voice="alloy",  # or custom reference_id
    input="Streaming audio directly from Cloudflare Worker gateway.",
    response_format="mp3",
    speed=1.0
) as response:
    response.stream_to_file("output.mp3")
```

### TypeScript / Node.js
```typescript
import OpenAI from "openai";
import fs from "node:fs";

const openai = new OpenAI({
  baseURL: "https://tts.anprogrammer.org/v1",
  apiKey: "YOUR_ACCESS_TOKEN",
});

const mp3 = await openai.audio.speech.create({
  model: "tts-1",
  voice: "alloy",
  input: "Hello from TypeScript via Cloudflare Fish Audio gateway!",
  speed: 1.0,
});

const buffer = Buffer.from(await mp3.arrayBuffer());
await fs.promises.writeFile("output.mp3", buffer);
```

### Voice Mapping Reference
When using OpenAI voice names, the gateway maps them to custom reference IDs:
- `alloy`: Default Fish Audio voice
- `echo`: `eb40371539bf465da74708c45ffe0df5` (Jensen Huang)
- `fable`: `7ba71ca98c824717a6032887a5282263` (poc-voice JA)
- `onyx`: `3b983252c6bb476cbf77d7bb69a74b94` (佐藤健 JA)
- **Custom Voice**: Pass any valid 32-character Fish Audio `reference_id` directly in the `voice` field.

---

## 2. Native Fish Audio REST API (`/v1/tts`)

Direct proxy to Fish Audio's native synthesis engine with chunked HTTP streaming support.

```bash
curl -X POST "https://tts.anprogrammer.org/v1/tts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world from native Fish Audio endpoint!",
    "reference_id": "eb40371539bf465da74708c45ffe0df5",
    "format": "mp3",
    "prosody": { "speed": 1.0 }
  }' \
  --output speech.mp3
```

---

## 3. Realtime WebSocket Streaming (`/v1/tts/live`)

Ultra-low-latency full-duplex WebSocket streaming (~260ms Time to First Byte). Bridges JSON text events to upstream MessagePack protocol and delivers binary audio chunks directly.

### Protocol Flow
1. Connect to `wss://tts.anprogrammer.org/v1/tts/live?token=YOUR_ACCESS_TOKEN`.
2. Send `start` event with model and audio settings.
3. Send one or more `text` events as LLM tokens generate.
4. Send `flush` and `stop` to complete the stream.
5. Upstream sends raw binary audio frames followed by `{ "event": "finish" }`.

### JavaScript / Browser Implementation
```javascript
const ws = new WebSocket("wss://tts.anprogrammer.org/v1/tts/live?token=YOUR_ACCESS_TOKEN");
ws.binaryType = "arraybuffer";

ws.onopen = () => {
  // 1. Initialize session
  ws.send(JSON.stringify({
    event: "start",
    model: "s2.1-pro-free",
    request: {
      text: "",
      format: "mp3",
      latency: "low"
    }
  }));

  // 2. Stream tokens as they arrive from LLM
  ws.send(JSON.stringify({ event: "text", text: "Streaming chunk 1... " }));
  ws.send(JSON.stringify({ event: "text", text: "Streaming chunk 2..." }));

  // 3. Signal end of stream
  ws.send(JSON.stringify({ event: "flush" }));
  ws.send(JSON.stringify({ event: "stop" }));
};

ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    // Binary audio frame (e.g. MP3 or PCM)
    console.log("Audio chunk received:", event.data.byteLength, "bytes");
  } else {
    // Control events: {"event": "finish"} or error frames
    console.log("Control message:", JSON.parse(event.data));
  }
};
```

---

## 4. Conversational Voice Agent (WebRTC via LiveKit)

Mint session tokens and connect to real-time bi-directional voice agents.

### Step 1: List or Create Agent
```bash
# List available agents
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://tts.anprogrammer.org/v1/agent/agents"

# Create a new voice agent
curl -X POST "https://tts.anprogrammer.org/v1/agent/agents" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support",
    "config": {
      "prompt": {
        "system_prompt": "You are a concise voice agent. Ask one question at a time.",
        "first_message": "Hello! How can I assist you today?"
      },
      "voice": {
        "speaking_language": "en"
      }
    }
  }'
```

### Step 2: Mint Session Token
```bash
curl -X POST "https://tts.anprogrammer.org/v1/agent/sessions" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "agent_id": "YOUR_AGENT_ID" }'
```
Response: `{ "session_id": "sess_...", "token": "eyJ..." }`

### Step 3: Connect via `@fishaudio/agent-client`
```javascript
import { AgentSession } from "@fishaudio/agent-client";

// Start WebRTC session using the minted token
const session = await AgentSession.start({ sessionToken });

// Handle agent messages and transcript events
session.on("message", (msg) => {
  console.log(`[${msg.role}]:`, msg.content);
});

// Send user text turn into voice session
session.sendUserMessage("I have a question regarding my order.");

// Interrupt agent speech
session.interrupt();

// Hang up session
await session.end();
```

---

## 5. Voice Model Catalog (`/model`)

Query available voice models under current credentials:
```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://tts.anprogrammer.org/model?self=true"
```

## 6. Health & Configuration Check (`/health`)

No authentication required. Use this to verify service availability and default model:
```bash
curl "https://tts.anprogrammer.org/health"
```
Response:
```json
{
  "status": "ok",
  "service": "cloudflare-fish-audio",
  "model": "s2.1-pro-free",
  "custom_domain": "tts.anprogrammer.org",
  "auth_enabled": true
}
```
