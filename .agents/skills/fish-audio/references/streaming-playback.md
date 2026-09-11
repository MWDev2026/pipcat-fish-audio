# Streaming playback

Getting audio from `wss://api.fish.audio/v1/tts/live` to actually play as it
arrives, rather than after the stream ends. Protocol details are in
[`raw-api.md`](raw-api.md#websocket-tts-wssapifishaudiov1ttslive).

---

## Playing it as it arrives

Collecting every chunk and building a Blob at the end is not streaming; it
sounds identical to the one-shot REST call and measures nothing. Feed chunks to
a `MediaSource` as they arrive instead:

```js
const ms = new MediaSource();
audio.src = URL.createObjectURL(ms);
ms.addEventListener("sourceopen", () => {
  const sb = ms.addSourceBuffer("audio/mpeg");
  sb.addEventListener("updateend", pump);   // appendBuffer throws while updating,
  pump();                                   // so drain through a queue
});
// on finish, once the queue is empty: ms.endOfStream()
```

`MediaSource` needs a container it can parse, so this path requires `mp3`. Raw
`pcm` cannot go through it; feed that to the Web Audio API instead, or fall back
to collect-then-play. The PoC does exactly this and logs both numbers.

Measured on the free tier: first audio byte at 1053ms, **audible at 1070ms**, and
the stream ran to 3811ms. Playback began 2.7 seconds before synthesis finished,
which is the entire reason to use this endpoint. The gap between first byte and
audible was 17ms, so `MediaSource` overhead is not the thing to optimise.

Set `latency: "low"` when feeding a realtime buffer.

See `poc/server.ts` for a working bridge, including the browser-side protocol.

