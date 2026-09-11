# Conversational agent

The `/v1/agent/*` family: speech-to-speech dialogue over WebRTC. **Neither official
Fish Audio skill documents this at all**, and it is absent from the published docs
index (`llms.txt`); it appears only in `openapi.json`.

For one-shot synthesis or transcription use [`raw-api.md`](raw-api.md) instead.

---

For dialogue rather than one-shot synthesis, use `/v1/agent/*`. Fish runs
transcription, turn-taking, and synthesis; you get WebRTC connection details and
join from the client.

**This family is absent from the published docs index** (`llms.txt`), so it is
easy to miss. It appears only in `openapi.json`.

| Endpoint | Purpose |
|---|---|
| `GET|POST /v1/agent/agents` | List and create agents |
| `GET|PATCH|DELETE /v1/agent/agents/{id}` | Inspect, update, remove |
| `POST /v1/agent/sessions` | Open a session, returns LiveKit details |
| `GET /v1/agent/sessions` | List sessions |
| `GET /v1/agent/sessions/{id}` | Status, `items[]` transcript, analysis |
| `GET /v1/agent/sessions/{id}/recording` | Time-limited URLs, one track per speaker |
| `POST /v1/agent/sessions/{id}/end` | Terminate |

An agent carries `name`, `description`, a `config` (prompt, voice, recording),
and `overrides_allowed`, which whitelists what a session may change:
`first_message`, `system_prompt`, `voice_id`, `language`.

Creating a session returns:

```json
{ "session_id": "...", "transport": "livekit",
  "livekit_url": "wss://...", "token": "...",
  "expires_at": "...", "max_duration_seconds": 1800 }
```

### The intended integration shape

Do not drive LiveKit yourself. The documented pattern is two steps, and the
official client owns the transport:

**1. Mint a session token on your server**, so the API key never reaches the
browser. Return the response body **verbatim**; it is the session token.

```ts
const sessionToken = await fetch("https://api.fish.audio/v1/agent/sessions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.FISH_API_KEY}`,
             "Content-Type": "application/json" },
  body: JSON.stringify({ agent_id }),
}).then(r => r.json());
```

**2. Hand it to the client SDK**, which connects, publishes the microphone, and
raises turn events.

```bash
pnpm add @fishaudio/agent-client     # framework-free core
pnpm add @fishaudio/agent-react      # React wrapper: useConversation()
```

```ts
import { AgentSession } from "@fishaudio/agent-client";

const session = await AgentSession.start({ sessionToken });
session.on("message", m => log.push(m));   // finalized turns, in order
session.on("statusChange", s => setStatus(s));
```

`AgentSession` gives you `getTranscript()`, `sendUserMessage(text)` for typed
turns, `interrupt()`, `setMicMuted()`, input/output device selection, output
volume and frequency data for a visualiser, client-side tool handlers, and a
screen wake lock during long calls. Reimplementing that over raw LiveKit is
wasted work.

**What the host backend controls.** Under session-token auth the browser cannot
set `timezone` or `world_context`; your server chooses them when it creates the
session. Per-session `overrides` (first message, system prompt, voice, language)
must each be allow-listed in the agent's `overrides_allowed`.

`GET /v1/agent/sessions/{id}` returns `items[]`, a chronological timeline of
`message`, `tool_call` and `tool_result` entries. That is the transcript, and it
is what you persist.

**Design note.** One agent plus per-session `overrides` is the right shape for
multi-tenant use: define the agent once, and vary prompt, voice and language per
conversation instead of creating an agent per end user. Recordings arrive as
separate tracks per speaker, which is what you want for diarised review.



---

## Tracking usage

There is no per-request meter. TTS and ASR responses carry no usage, cost or
credit headers at all; the only per-unit figure the API will give you back is
`duration_seconds` on an agent conversation.

| What you want | Where it comes from |
|---|---|
| Per-conversation usage | `duration_seconds` on `GET /v1/agent/sessions/{id}`, or on each row of the list |
| Attribution to your own records | `metadata` on the session, set at creation and returned on read |
| Pay-as-you-go balance | `GET /wallet/self/api-credit` -> `credit` |
| Free plan allowance | `GET /wallet/self/package` -> `balance` of `total` |
| Per-request TTS or ASR cost | **Not exposed.** Infer it from balance movement |

`self` works in place of a user id on both wallet paths. Passing `me` returns
403.

### Attribute a conversation before it happens

`metadata` is free-form, settable on `POST /v1/agent/sessions`, and round-trips
on read. Tag every session at creation, because after the fact you cannot
reconstruct which customer a call belonged to:

```jsonc
{ "agent_id": "...",
  "metadata": { "interview_id": "int_123", "candidate_id": "cand_456" } }
```

Then reconcile by listing sessions and grouping on your own key. The PoC's Usage
tab does exactly this, including a per-agent breakdown.

### Do not rely on the vendor as your ledger

Session listing is paginated and retention is the vendor's to change, so treat
Fish as the source of *measurement* and your own database as the source of
*record*. Persist `session_id`, `duration_seconds`, `started_at` and your
metadata when a call ends. Store `x-fish-trace-id` from response headers too;
it is the id support will ask for.

Free-tier calls (`s2.1-pro-free`) are not metered and move neither balance, so
development usage will not show up anywhere. Verified: repeated synthesis left
the free plan balance unchanged at 8000.

### Concurrency is capped

Responses carry `ratelimit-limit-concurrency` and
`ratelimit-current-concurrency`. This account's limit is **5**. For anything
where many conversations run at once, that ceiling matters more than any per-call
cost, and it needs confirming with the vendor before you size a launch.


---

## Language in agent sessions



```jsonc
// 422 extra_forbidden
{ "agent_id": "...", "language": "zh" }

// correct
{ "agent_id": "...", "overrides": { "language": "zh" } }
```

Allowed values are `en`, `ja`, `zh`, `ko`, `es`, `fr`, `de`, `pt`, `it`, `nl`,
all ten verified accepted by the live API. Note the SDK's `SessionLanguage` type
currently lists only the first seven, so `pt`, `it` and `nl` fail type-checking
despite working at runtime. Cast, or keep your own locale type and map at the
adapter boundary.

The agent must list `language` in its `overrides_allowed` for a session to
change it.

### Traditional versus Simplified Chinese

The enum has one `zh`. It cannot express the distinction, so if you need
Traditional output, say so in the system prompt ("respond in Traditional Chinese
characters") rather than expecting the language code to carry it. Keep your own
locale type richer than the vendor's and map down at the adapter boundary, or the
distinction is lost the moment it reaches the API.
