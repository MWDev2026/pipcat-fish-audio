# Fish Audio PoC server

```bash
pnpm install
pnpm start        # http://localhost:8787
```

Requires Node 23.6+, which runs TypeScript directly. On older Node use
`node --experimental-strip-types server.ts`.

Reads `fish_audio_api_key` from the nearest `.env` walking up from this
directory, so the repo root `.env` is found automatically. Override with
`FISH_API_KEY`. The key stays server-side and is never sent to the browser.

Six tabs: text to speech with every synthesis parameter, interactive WebSocket streaming with
true incremental playback through MediaSource, the conversational agent (create one, mint a session token server-side,
run a live call through the official @fishaudio/agent-client SDK with a chat
transcript, mute, interrupt and typed turns), speech to text, voice models, usage (balances, per-conversation
durations and metadata attribution), and a wire log of every upstream call. Reports time to first byte, which is the latency
that matters when audio feeds live playback.

All visual styling comes from daisyUI components via CDN. There is no local
stylesheet, no `<style>` block, and no inline styles; tab switching is the
library's radio-input pattern, so it needs no JavaScript either.

`server.ts` doubles as reference implementation: one compact handler per
endpoint.

The server must stay running while you use the page; a browser error reading
"Cannot reach the PoC server" means it has stopped, not that a call failed.

Errors are never summarised away: the page shows status, response headers and
the raw upstream body, and the server logs every non-2xx with its request and
full response.
