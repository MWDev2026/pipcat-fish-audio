---
name: fish-audio
description: Work with the Fish Audio API for text-to-speech, speech-to-text, voice cloning, voice design, low-latency WebSocket streaming, and the conversational agent API for speech-to-speech dialogue. Use this skill whenever the user mentions Fish Audio, fish.audio, api.fish.audio, a FISH_API_KEY or fish_audio_api_key, voice models or reference_id values, or asks to synthesize speech, clone or design a voice, transcribe audio, stream TTS in real time, or build a voice agent, even if they do not name Fish Audio explicitly. Also use it when evaluating or prototyping TTS, ASR or voice-agent vendors, since the runnable PoC bundled here exposes every parameter and traces every call.
---

# Fish Audio

Text-to-speech, speech-to-text, voice cloning and design, streaming synthesis, and
a conversational agent API for full speech-to-speech dialogue.

This skill merges Fish Audio's two official skills with findings verified against
the live API. Where they disagreed with observed behaviour, the observed
behaviour won and the change is marked **VERIFIED** in the reference.

## References

Read the one for the task before writing code.

| File | Covers |
|---|---|
| [`references/raw-api.md`](references/raw-api.md) | Raw REST and WebSocket: TTS, ASR, voice design, voice models, wallet. Full field tables and curl/Python/Node examples |
| [`references/sdk.md`](references/sdk.md) | Official Python (`fishaudio`) and JS (`fish-audio`) SDKs, method by method |
| [`references/agent.md`](references/agent.md) | The conversational agent API and per-conversation usage tracking. Documented nowhere else |
| [`references/streaming-playback.md`](references/streaming-playback.md) | Playing streamed audio as it arrives, via MediaSource |

## Setup

The API key lives in `.env` at the repository root as `fish_audio_api_key`
(lowercase). Load it rather than hardcoding it, and never log or print it.

```bash
export FISH_API_KEY=$(grep '^fish_audio_api_key=' .env | cut -d= -f2- | tr -d '"\r\n ')
```

The `tr` is defensive: a quoted value in `.env` sends the quotes in the header and
produces a 401 that looks exactly like a bad key.

Verify credentials with the model list rather than synthesis, because it works on
the free tier and so separates auth failures from billing ones:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $FISH_API_KEY" \
  'https://api.fish.audio/model?page_size=1&self=true'
```

## What is free

Verified endpoint by endpoint on a zero-credit account:

| Endpoint | Free? |
|---|---|
| TTS with `model: s2.1-pro-free` | Yes, unmetered |
| WebSocket streaming with that model | Yes |
| Voice cloning, `POST /model` | Yes |
| Voice model list, get, delete | Yes |
| Agent session create | Yes |
| Agent conversation minutes | Drawn from the free package, roughly 124 credits/minute |
| TTS with `s2.1-pro`, `s2-pro`, `s1`, `drama-3-preview` | No, 402 |
| **ASR, `POST /v1/asr`** | **No, and there is no free variant** |

**API credit is billed separately from platform credit.** A funded fish.audio
account can still return 402 on the API; check `GET /wallet/self/api-credit`.

Two consequences worth knowing up front. Free-tier calls are **not metered at
all**, so development usage appears nowhere and your first real cost signal
arrives only when you switch to paid models. And agent conversations settle
**late** — a balance read straight after a call still shows the old figure, so
never gate anything on it in real time.

If you need a transcript of an agent conversation you already have one for free;
see [`agent.md`](references/agent.md). Paid ASR is only for audio that did not
come from a session.

## The five things that reliably cost an hour

1. **The default model is paid.** Omitting the `model` header gives `s2.1-pro`
   and a 402 on a fresh account. Use `s2.1-pro-free`.
2. **`model` is a header, not a body field.** In the body it is silently ignored
   and you get the paid default. An *unrecognized* header value also falls back
   to paid: `s2.1-pro-fre` returns 402 with no hint the name was wrong. Note the
   asymmetry — unknown **body** fields are ignored and succeed; an unknown
   **model header** is silently billed.
3. **The WebSocket protocol is MessagePack**, both directions, not JSON.
4. **There is no language parameter on TTS.** It is inferred from the text.
   Passing `language` does nothing. Agent sessions *do* take one, but inside
   `overrides`; at the top level it is a 422.
5. **Collecting stream chunks and playing at the end is not streaming.** See
   [`streaming-playback.md`](references/streaming-playback.md).

## The PoC server

`poc/` is a runnable server exposing every documented parameter through a browser
UI, recording every upstream call so you can see exactly what went over the wire.

```bash
cd .agents/SKILLS/fish-audio/poc
pnpm install
pnpm start        # http://localhost:8787
```

Requires Node 23.6+, which runs TypeScript directly. It reads
`fish_audio_api_key` from the repo root `.env` automatically, and the key never
reaches the browser: all calls are proxied and `Authorization` is redacted in the
trace log. Keep it running while the page is open; "Cannot reach the PoC server"
means the process stopped, not that a call failed.

Seven tabs: text to speech with every synthesis parameter, interactive WebSocket
streaming with true incremental playback, the conversational agent (create one,
mint a session token server-side, run a live call with transcript, mute,
interrupt and typed turns), speech to text, voice models, usage, and a wire log.

`poc/server.ts` doubles as reference implementation: one compact handler per
endpoint.

## Errors

The PoC never summarises an error away, and neither should your integration.
Client side it shows a one-line cause plus the full detail (status, response
headers, raw body, stack) and mirrors it to the console. Server side it logs
method, URL, request body and the complete upstream response before returning it
unmodified.

The two failure classes look alike and are not:

- **"Cannot reach the server"** is a browser network failure. Nothing reached
  Fish Audio.
- **An `HTTP <code>` summary** came back from Fish Audio, and the body is the
  vendor's own error, verbatim.

## Troubleshooting

| Symptom | Cause |
|---|---|
| 402 `Insufficient API credit` | Using a paid model. Switch to `s2.1-pro-free`. API credit is separate from platform credit |
| 402 despite selecting the free model | Typo in the `model` header; unrecognized values fall back to paid |
| 401 on every call, key looks right | Quotes from `.env` included in the header. See Setup |
| WebSocket closes at once, code 1002, "Expected 101" | Upgrade rejected before the protocol started, almost always 401 or 402. Test the same credentials against `POST /v1/tts` to see the real status |
| WebSocket hangs open after the audio arrives | Expected. Close it yourself after `finish` |
| WebSocket connects but nothing decodes | Messages are MessagePack, not JSON, both ways |
| Streaming produces no sound until the end | Chunks are being collected rather than appended to a `MediaSource` |
| A TTS parameter appears to have no effect | Unknown fields are ignored silently. Check the spelling |
| Synthesis ignores your model choice | `model` was put in the body. It is a header |
| `reference_id` rejected or gives the default voice | The model is not `trained` yet. Check `GET /model?self=true` |
| A cloned voice appears publicly | Set `visibility` explicitly on `POST /model`; do not rely on the default |
| ASR returns no `segments` | `ignore_timestamps` defaults to true. Set it false |
| 422 `extra_forbidden` on `language` creating a session | Move it into `overrides` |
| TypeScript rejects `pt`, `it` or `nl` as a session language | The SDK type lags the API; the server accepts all ten |
| Chinese output is Simplified when you wanted Traditional | The `zh` code cannot express this. Instruct the script in the system prompt |

## Guidance for integration code

When wiring this into an application rather than a prototype:

- **Put it behind a port.** Model names, `reference_id` values, format strings
  and locales map to your own domain types inside an adapter. A `reference_id` in
  a database column makes the vendor unswappable.
- **Persist which model and voice produced each artifact.** Model behaviour
  changes across versions; without this you cannot explain or reproduce old audio.
- **Retry only what is retryable.** 402 never succeeds on retry, 503 should back
  off with jitter, 401 means the key is wrong. Normalize these into your own
  error codes at the adapter boundary.
- **Measure time to first byte, not total duration,** whenever synthesis feeds
  live playback.
- **Tag every agent session with your own identifiers** via `metadata`, and
  persist the duration when the call ends. Cost attribution cannot be
  reconstructed later.
- **Concurrency caps before cost does.** The tested account allows 5 concurrent
  requests. Confirm your ceiling before sizing anything.
