/**
 * Fish Audio PoC server.
 *
 * Goals, in order: expose every documented capability, let the caller set every
 * documented parameter, and make each call traceable down to the exact bytes on
 * the wire. The browser never sees the API key; everything is proxied here.
 *
 *   pnpm install && pnpm start   ->   http://localhost:8787
 *
 * Requires Node 23.6+ (runs TypeScript directly). On older Node:
 *   node --experimental-strip-types server.ts
 *
 * server.ts doubles as reference implementation: one small handler per endpoint.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { encode, decode } from "@msgpack/msgpack";
import WebSocket, { WebSocketServer } from "ws";

const API = "https://api.fish.audio";
const PORT = Number(process.env.PORT ?? 8787);
const HERE = import.meta.dirname;

// ---------------------------------------------------------------- credentials

async function loadApiKey(): Promise<string> {
  if (process.env.FISH_API_KEY) return process.env.FISH_API_KEY;
  let dir = HERE;
  for (let i = 0; i < 8; i++) {
    const envPath = join(dir, ".env");
    if (existsSync(envPath)) {
      const line = (await readFile(envPath, "utf8"))
        .split("\n")
        .find((l) => l.trim().toLowerCase().startsWith("fish_audio_api_key="));
      if (line) {
        // Tolerate quotes even though the current .env has none; a re-quoted
        // value otherwise yields a 401 that looks like a bad key.
        const value = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
        if (value) { console.log(`[fish-audio] key loaded from ${envPath}`); return value; }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("No API key. Set fish_audio_api_key in .env at the repo root, or export FISH_API_KEY.");
}

const API_KEY = await loadApiKey();
const authHeader = () => ({ Authorization: `Bearer ${API_KEY}` });

// --------------------------------------------------------------------- tracing

/** Every upstream call is recorded so the UI can show exactly what happened. */
type Trace = {
  id: number; at: string; label: string; method: string; url: string;
  reqHeaders: Record<string, string>; reqBody?: unknown;
  status?: number; resHeaders?: Record<string, string>; resBody?: unknown;
  ms?: number; ttfbMs?: number; bytes?: number; error?: string;
};
const traces: Trace[] = [];
let traceSeq = 0;

/** The key must never appear in a trace the browser can read. */
const redact = (h: Record<string, string>) => {
  const out = { ...h };
  if (out.Authorization) out.Authorization = "Bearer ***redacted***";
  return out;
};

function startTrace(label: string, method: string, url: string,
                    reqHeaders: Record<string, string>, reqBody?: unknown): Trace {
  const t: Trace = { id: ++traceSeq, at: new Date().toISOString(), label, method, url,
                     reqHeaders: redact(reqHeaders), reqBody };
  traces.unshift(t);
  if (traces.length > 200) traces.pop();
  return t;
}

const headersToObject = (h: Headers) => Object.fromEntries([...h.entries()]);

function classify(status: number): { code: string; retriable: boolean } {
  if (status === 401) return { code: "unauthorized", retriable: false };
  if (status === 402) return { code: "payment_required", retriable: false };
  if (status === 429) return { code: "rate_limited", retriable: true };
  if (status === 503) return { code: "overloaded", retriable: true };
  if (status >= 500) return { code: "provider_error", retriable: true };
  return { code: "bad_request", retriable: false };
}

/** Never swallow an upstream error: log it whole, return it whole. */
const fail = (status: number, message: string, traceId?: number) => {
  console.error(`[fish-audio] FAIL ${status}${traceId ? ` trace#${traceId}` : ""}: ${message}`);
  return Response.json({ error: { ...classify(status), message, traceId } }, { status });
};

/** Drop empty values so the UI can leave any field blank to mean "API default". */
function compact<T extends Record<string, any>>(o: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const inner = compact(v);
      if (Object.keys(inner).length) out[k] = inner;
    } else if (Array.isArray(v)) {
      if (v.length) out[k] = v;
    } else out[k] = v;
  }
  return out as Partial<T>;
}


/**
 * Traced JSON call. Most endpoints are thin passthroughs, so they share this
 * rather than repeating fetch/trace/classify boilerplate.
 */
async function call(label: string, method: string, path: string,
                    opts: { query?: URLSearchParams; json?: unknown; form?: FormData;
                            echo?: unknown } = {}): Promise<Response> {
  const url = `${API}${path}${opts.query?.size ? `?${opts.query}` : ""}`;
  const headers: Record<string, string> = { ...authHeader() };
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";

  const t = startTrace(label, method, url, headers, opts.echo ?? opts.json);
  const started = performance.now();
  try {
    const upstream = await fetch(url, {
      method, headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.form,
    });
    t.status = upstream.status;
    t.resHeaders = headersToObject(upstream.headers);
    t.ms = performance.now() - started;

    const text = await upstream.text();
    if (!upstream.ok) {
      t.resBody = text;
      console.error(`[fish-audio] ${method} ${url} -> ${upstream.status}`,
                    `\n  request: ${JSON.stringify(opts.echo ?? opts.json ?? null)}`,
                    `\n  response: ${text}`);
      return fail(upstream.status, text, t.id);
    }
    if (!text) { t.resBody = "<empty>"; return Response.json({ ok: true, traceId: t.id }); }

    const json = JSON.parse(text);
    t.resBody = json;
    return Response.json(Array.isArray(json) ? { items: json, traceId: t.id } : { ...json, traceId: t.id });
  } catch (err) {
    t.error = (err as Error).message;
    return fail(502, t.error, t.id);
  }
}

// -------------------------------------------------------------------- handlers

/**
 * POST /v1/tts. The body is passed through verbatim so every documented
 * parameter is reachable; `model` is lifted into a HEADER, which is where the
 * API expects it. Putting a model in the body silently uses the default.
 */
async function tts(req: Request): Promise<Response> {
  const raw = (await req.json()) as Record<string, any>;
  const model = String(raw.model ?? "s2.1-pro-free");
  delete raw.model;
  const body = compact(raw);

  const headers = { ...authHeader(), "Content-Type": "application/json", model };
  const t = startTrace("tts", "POST", `${API}/v1/tts`, headers, body);
  const started = performance.now();

  try {
    const upstream = await fetch(`${API}/v1/tts`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    t.status = upstream.status;
    t.resHeaders = headersToObject(upstream.headers);

    if (!upstream.ok) {
      const text = await upstream.text();
      t.resBody = text; t.ms = performance.now() - started;
      console.error(`[fish-audio] POST /v1/tts -> ${upstream.status}`,
                    `\n  model header: ${model}`,
                    `\n  request: ${JSON.stringify(body)}`,
                    `\n  response: ${text}`);
      return fail(upstream.status, text, t.id);
    }

    // Time to FIRST byte, not total: that is the latency a listener perceives.
    const reader = upstream.body!.getReader();
    const chunks: Uint8Array[] = [];
    let ttfb = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!ttfb) ttfb = performance.now() - started;
      chunks.push(value);
    }
    const audio = new Blob(chunks as BlobPart[]);
    Object.assign(t, { ms: performance.now() - started, ttfbMs: ttfb, bytes: audio.size,
                       resBody: `<${audio.size} bytes of audio>` });

    return new Response(audio, {
      headers: {
        "Content-Type": String(t.resHeaders["content-type"] ?? "audio/mpeg"),
        "X-Trace-Id": String(t.id),
        "X-TTFB-Ms": ttfb.toFixed(0),
        "X-Total-Ms": (t.ms ?? 0).toFixed(0),
        "X-Bytes": String(audio.size),
      },
    });
  } catch (err) {
    t.error = (err as Error).message;
    return fail(502, t.error, t.id);
  }
}

/** POST /v1/asr. multipart/form-data. ignore_timestamps=false returns segments. */
async function asr(req: Request): Promise<Response> {
  const inbound = await req.formData();
  const file = inbound.get("audio");
  if (!(file instanceof File)) return fail(400, "expected an 'audio' file part");

  const form = new FormData();
  form.append("audio", file, file.name || "audio.wav");
  const ignore = String(inbound.get("ignore_timestamps") ?? "false");
  form.append("ignore_timestamps", ignore);
  const language = inbound.get("language");
  if (language) form.append("language", String(language));

  const headers = authHeader();
  const t = startTrace("asr", "POST", `${API}/v1/asr`, headers,
    { audio: `<${file.name || "audio"}, ${file.size} bytes>`, ignore_timestamps: ignore,
      ...(language ? { language } : {}) });
  const started = performance.now();

  const upstream = await fetch(`${API}/v1/asr`, { method: "POST", headers, body: form });
  t.status = upstream.status;
  t.resHeaders = headersToObject(upstream.headers);
  t.ms = performance.now() - started;

  if (!upstream.ok) {
    const text = (await upstream.text());
    t.resBody = text;
    return fail(upstream.status, text, t.id);
  }
  const json = await upstream.json();
  t.resBody = json;
  return Response.json({ ...(json as object), traceId: t.id });
}

/** GET /model. Every documented filter is reachable. Note: not under /v1. */
function listModels(url: URL): Promise<Response> {
  const q = new URLSearchParams();
  for (const k of ["page_size", "page_number", "title", "tag", "self",
                   "author_id", "language", "title_language", "licensed", "sort_by"]) {
    const v = url.searchParams.get(k);
    if (v) q.set(k, v);
  }
  return call("models.list", "GET", "/model", { query: q });
}

/** POST /model. Voice cloning: 1-20 samples, train_mode=fast. */
async function createModel(req: Request): Promise<Response> {
  const inbound = await req.formData();
  const voices = inbound.getAll("voices").filter((v): v is File => v instanceof File);
  if (!voices.length) return fail(400, "at least one 'voices' file is required");
  if (voices.length > 20) return fail(400, "at most 20 'voices' files are allowed");

  const form = new FormData();
  const echo: Record<string, unknown> = { type: "tts", train_mode: "fast" };
  form.append("type", "tts");
  form.append("train_mode", "fast");
  for (const k of ["title", "visibility", "description", "enhance_audio_quality", "generate_sample"]) {
    const v = inbound.get(k);
    if (v !== null && v !== "") { form.append(k, String(v)); echo[k] = String(v); }
  }
  voices.forEach((v) => form.append("voices", v, v.name || "sample.wav"));
  echo.voices = voices.map((v) => `<${v.name}, ${v.size} bytes>`);
  // Optional transcripts improve fidelity; omitted means ASR infers them.
  const texts = inbound.getAll("texts").map(String).filter(Boolean);
  texts.forEach((x) => form.append("texts", x));
  if (texts.length) echo.texts = texts;
  const tags = inbound.getAll("tags").map(String).filter(Boolean);
  tags.forEach((x) => form.append("tags", x));
  if (tags.length) echo.tags = tags;

  return call("models.create", "POST", "/model", { form, echo });
}


// ------------------------------------------------------- conversational agent

/**
 * The agent API is speech-to-speech: you define an agent (prompt, voice,
 * language), then create a session which returns LiveKit WebRTC connection
 * details for the browser to join. Fish runs STT, the LLM turn-taking, and TTS.
 *
 * This is the endpoint family to use when you want a conversation rather than
 * synthesis. `overrides` lets one agent serve many sessions with a different
 * system prompt, first message, voice, or language each time.
 *
 * Note it is NOT listed in the published docs index; it comes from openapi.json.
 */
function listAgents(url: URL): Promise<Response> {
  const q = new URLSearchParams();
  for (const k of ["page_size", "page_number", "search", "status"]) {
    const v = url.searchParams.get(k);
    if (v) q.set(k, v);
  }
  return call("agent.list", "GET", "/v1/agent/agents", { query: q });
}

/**
 * Create payload is only { name, description, config }. `overrides_allowed`,
 * `status` and `public_enabled` are rejected here with extra_forbidden; they are
 * update-time fields.
 *
 * `config` is nested and passed through verbatim so every documented sub-object
 * is reachable: prompt, voice, conversation, tools, webhooks, knowledge_base,
 * analysis, guardrails, llm.
 */
async function createAgent(req: Request): Promise<Response> {
  const b = (await req.json()) as Record<string, any>;
  return call("agent.create", "POST", "/v1/agent/agents", {
    json: compact({ name: b.name, description: b.description, config: b.config }),
  });
}

const getAgent    = (id: string) => call("agent.get", "GET", `/v1/agent/agents/${id}`);
const deleteAgent = (id: string) => call("agent.delete", "DELETE", `/v1/agent/agents/${id}`);

async function updateAgent(id: string, req: Request): Promise<Response> {
  const b = (await req.json()) as Record<string, any>;
  return call("agent.update", "PATCH", `/v1/agent/agents/${id}`, { json: compact(b) });
}

/**
 * Returns { session_id, livekit_url, token, expires_at, max_duration_seconds }.
 *
 * `language` belongs inside `overrides`, not at the top level. A top-level
 * `language` is rejected with 422 extra_forbidden, which is easy to get wrong
 * because the field reads like session configuration.
 */
async function createSession(req: Request): Promise<Response> {
  const b = (await req.json()) as Record<string, any>;
  if (!b.agent_id) return fail(400, "agent_id is required");
  const overrides = compact({ ...(b.overrides ?? {}), ...(b.language ? { language: b.language } : {}) });
  // Under session-token auth the client cannot set these, so the host backend
  // decides them here. That is the point of creating the session server-side.
  return call("agent.session.create", "POST", "/v1/agent/sessions", {
    json: compact({ agent_id: b.agent_id, overrides,
                    timezone: b.timezone, world_context: b.world_context,
                    // Free-form tags that round-trip on the session. This is how
                    // a conversation gets attributed to your own records.
                    metadata: b.metadata }),
  });
}

function listSessions(url: URL): Promise<Response> {
  const q = new URLSearchParams();
  for (const k of ["page_size", "page_number", "agent_id", "status"]) {
    const v = url.searchParams.get(k);
    if (v) q.set(k, v);
  }
  return call("agent.session.list", "GET", "/v1/agent/sessions", { query: q });
}

/** items[] is the transcript: messages interleaved with tool calls. */
const getSession    = (id: string) => call("agent.session.get", "GET", `/v1/agent/sessions/${id}`);
const endSession    = (id: string) => call("agent.session.end", "POST", `/v1/agent/sessions/${id}/end`, { json: {} });
const getRecording  = (id: string) => call("agent.session.recording", "GET", `/v1/agent/sessions/${id}/recording`);

/** Answers "why am I getting 402" directly. user_id comes from any self model. */
const getCredit = (userId: string) => call("wallet.credit", "GET", `/wallet/${userId}/api-credit`);


/**
 * Usage. There is no per-request meter on TTS or ASR: those only move the
 * account balance. Agent conversations are the one thing billed per unit you
 * can read back, via `duration_seconds` on each session, so this aggregates
 * them and pairs the result with both balances.
 */
async function getUsage(url: URL): Promise<Response> {
  const headers = authHeader();
  const t = startTrace("usage", "GET", `${API}/wallet+sessions`, headers);
  const started = performance.now();
  try {
    const q = new URLSearchParams({ page_size: url.searchParams.get("page_size") ?? "100" });
    const agentId = url.searchParams.get("agent_id");
    if (agentId) q.set("agent_id", agentId);

    const [credit, pkg, sessions] = await Promise.all([
      fetch(`${API}/wallet/self/api-credit`, { headers }).then((r) => r.json()).catch(() => null),
      fetch(`${API}/wallet/self/package`, { headers }).then((r) => r.json()).catch(() => null),
      fetch(`${API}/v1/agent/sessions?${q}`, { headers }).then((r) => r.json()).catch(() => null),
    ]);

    const rows: any[] = sessions?.sessions ?? sessions?.items ?? [];
    const seconds = (r: any) => r.duration_seconds ?? 0;
    const byAgent: Record<string, { calls: number; seconds: number }> = {};
    for (const r of rows) {
      const k = r.agent_name ?? r.agent_id ?? "unknown";
      byAgent[k] ??= { calls: 0, seconds: 0 };
      byAgent[k].calls++;
      byAgent[k].seconds += seconds(r);
    }

    const body = {
      balances: {
        apiCredit: credit?.credit ?? null,          // pay as you go, paid models
        packageBalance: pkg?.balance ?? null,       // free plan allowance
        packageTotal: pkg?.total ?? null,
        packageType: pkg?.type ?? null,
      },
      conversations: {
        count: rows.length,
        totalSeconds: rows.reduce((a, r) => a + seconds(r), 0),
        byAgent,
        sessions: rows.map((r) => ({
          session_id: r.session_id, agent_name: r.agent_name, status: r.status,
          started_at: r.started_at, duration_seconds: seconds(r),
          metadata: r.metadata ?? {},
        })),
      },
      note: "TTS and ASR expose no per-request usage; only the balances move.",
    };
    Object.assign(t, { status: 200, ms: performance.now() - started,
                       resBody: { sessions: rows.length, totalSeconds: body.conversations.totalSeconds } });
    return Response.json({ ...body, traceId: t.id });
  } catch (err) {
    t.error = (err as Error).message;
    return fail(502, t.error, t.id);
  }
}

// ---------------------------------------------------------------------- server

function toRequest(req: IncomingMessage): Request {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(new URL(req.url ?? "/", `http://localhost:${PORT}`), {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error undici requires duplex for streaming bodies
    duplex: "half",
  });
}

async function send(res: ServerResponse, out: Response): Promise<void> {
  res.writeHead(out.status, Object.fromEntries(out.headers));
  if (out.body) await pipeline(Readable.fromWeb(out.body as any), res);
  else res.end();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname !== "/") console.log(`[fish-audio] ${req.method} ${url.pathname}${url.search}`);
  const path = url.pathname;
  const route = `${req.method} ${path}`;
  const modelId   = path.match(/^\/api\/models\/([^/]+)$/)?.[1];
  const agentId   = path.match(/^\/api\/agents\/([^/]+)$/)?.[1];
  const sessionId = path.match(/^\/api\/sessions\/([^/]+)$/)?.[1];
  const sessionEnd = path.match(/^\/api\/sessions\/([^/]+)\/end$/)?.[1];
  const sessionRec = path.match(/^\/api\/sessions\/([^/]+)\/recording$/)?.[1];

  try {
    if (route === "GET /") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(await readFile(join(HERE, "index.html")));
    }
    if (route === "GET /api/traces") {
      return await send(res, Response.json(traces.slice(0, 60)));
    }
    if (route === "POST /api/tts")    return await send(res, await tts(toRequest(req)));
    if (route === "POST /api/asr")    return await send(res, await asr(toRequest(req)));
    if (route === "GET /api/models")  return await send(res, await listModels(url));
    if (route === "POST /api/models") return await send(res, await createModel(toRequest(req)));
    if (modelId && req.method === "GET")    return await send(res, await call("models.get", "GET", `/model/${modelId}`));
    if (modelId && req.method === "DELETE") return await send(res, await call("models.delete", "DELETE", `/model/${modelId}`));

    // conversational agent
    if (route === "GET /api/agents")   return await send(res, await listAgents(url));
    if (route === "POST /api/agents")  return await send(res, await createAgent(toRequest(req)));
    if (agentId && req.method === "GET")    return await send(res, await getAgent(agentId));
    if (agentId && req.method === "PATCH")  return await send(res, await updateAgent(agentId, toRequest(req)));
    if (agentId && req.method === "DELETE") return await send(res, await deleteAgent(agentId));

    if (route === "GET /api/sessions")  return await send(res, await listSessions(url));
    if (route === "POST /api/sessions") return await send(res, await createSession(toRequest(req)));
    if (sessionId && req.method === "GET")  return await send(res, await getSession(sessionId));
    if (sessionEnd)  return await send(res, await endSession(sessionEnd));
    if (sessionRec)  return await send(res, await getRecording(sessionRec));

    if (route === "GET /api/usage") return await send(res, await getUsage(url));
    const creditUser = path.match(/^\/api\/credit\/([^/]+)$/)?.[1];
    if (creditUser) return await send(res, await getCredit(creditUser));

    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    const e = err as Error;
    console.error(`[fish-audio] UNHANDLED ${route}\n`, e.stack ?? e);
    if (!res.headersSent) await send(res, fail(500, `${e.name}: ${e.message}\n${e.stack ?? ""}`));
    else res.end();
  }
});

/**
 * Interactive WebSocket bridge.
 *
 * The browser drives a real streaming session: start, then text chunks as they
 * become available, optional flush, then stop. We relay each event verbatim so
 * the UI can show the true event sequence and per-event timings.
 *
 * The Fish protocol is MessagePack in BOTH directions. Node's built-in
 * WebSocket cannot set request headers, so `ws` carries the Authorization
 * header on the upgrade.
 */
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (browser) => {
  let upstream: WebSocket | null = null;
  let t: Trace | null = null;
  let started = 0, ttfb = 0, bytes = 0, chunkCount = 0;
  const tell = (o: unknown) => browser.readyState === browser.OPEN && browser.send(JSON.stringify(o));

  browser.on("message", (raw) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    if (msg.event === "start") {
      const model = String(msg.model ?? "s2.1-pro-free");
      const request = compact(msg.request ?? {});
      const headers = { ...authHeader(), model };
      started = performance.now();
      t = startTrace("tts.stream", "WSS", `${API}/v1/tts/live`, headers,
                     { event: "start", request });

      upstream = new WebSocket(`${API.replace("https", "wss")}/v1/tts/live`, { headers });

      upstream.on("unexpected-response", (_q, r) => {
        if (t) { t.status = r.statusCode; t.error = `upgrade rejected ${r.statusCode}`; }
        tell({ type: "error", message:
          `websocket upgrade rejected with HTTP ${r.statusCode}` +
          (r.statusCode === 402 ? " (insufficient API credit: use s2.1-pro-free, or add credit)" : "") });
      });

      upstream.on("open", () => {
        upstream!.send(encode({ event: "start", request: { text: "", ...request } }));
        tell({ type: "open", ms: Math.round(performance.now() - started) });
      });

      upstream.on("message", (data: Buffer) => {
        const m = decode(new Uint8Array(data)) as any;
        const ms = Math.round(performance.now() - started);
        if (m.event === "audio") {
          if (!ttfb) ttfb = ms;
          bytes += m.audio.length; chunkCount++;
          browser.send(m.audio, { binary: true });     // audio as binary
          tell({ type: "event", event: "audio", ms, bytes: m.audio.length });
        } else {
          tell({ type: "event", event: m.event, ms, reason: m.reason });
          if (m.event === "finish") {
            // The server does NOT close after `finish`, despite the docs saying
            // it does. Close from our side or the socket leaks.
            if (t) Object.assign(t, { status: 200, ms, ttfbMs: ttfb, bytes,
                                      resBody: `<${chunkCount} audio chunks, ${bytes} bytes>` });
            tell({ type: "done", ms, ttfbMs: ttfb, bytes, chunks: chunkCount,
                   reason: m.reason, traceId: t?.id });
            try { upstream?.close(); } catch {}
          }
        }
      });

      upstream.on("error", (e) => {
        if (t) t.error = e.message;
        tell({ type: "error", message: e.message });
      });
      upstream.on("close", (code) => tell({ type: "closed", code }));
      return;
    }

    if (!upstream || upstream.readyState !== WebSocket.OPEN) {
      return tell({ type: "error", message: "not connected: send a start event first" });
    }
    if (msg.event === "text")  upstream.send(encode({ event: "text", text: String(msg.text ?? "") }));
    if (msg.event === "flush") upstream.send(encode({ event: "flush" }));
    if (msg.event === "stop")  upstream.send(encode({ event: "stop" }));
    tell({ type: "sent", event: msg.event, ms: Math.round(performance.now() - started) });
  });

  browser.on("close", () => { try { upstream?.close(); } catch {} });
});

server.listen(PORT, () => console.log(`[fish-audio] PoC on http://localhost:${PORT}`));
