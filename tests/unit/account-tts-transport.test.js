import { createServer } from "node:http";
import { fetch as directFetch } from "undici/index.js";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ credentials: null, health: [], selections: 0, pool: null, poolCalls: 0 }));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => ({}), isApiKeyRequired: () => false,
  getProviderConnections: async () => state.credentials ? [state.credentials] : [],
}));
vi.mock("@/models", () => ({ getProxyPoolById: async () => { state.poolCalls++; return state.pool; } }));
vi.mock("@/lib/rateLimit/inferenceLimit.js", () => ({ withInferenceLimit: async (_request, _key, run) => run() }));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: () => null, isValidApiKey: async () => true,
  getProviderCredentials: async (_provider, excluded) => { state.selections++; return excluded.size ? null : state.credentials; },
  markAccountUnavailable: async (...args) => { state.health.push(args); return { shouldFallback: true }; },
}));
vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: async value => { const index = value.indexOf("/"); return { provider: value.slice(0, index), model: value.slice(index + 1) }; },
  getComboModels: async () => null,
}));

import { handleTtsCore } from "../../open-sse/handlers/ttsCore.js";
import { handleTts } from "../../src/sse/handlers/tts.js";
import { GET as storedVoices } from "../../src/app/api/media-providers/tts/elevenlabs/voices/route.js";
import { GET as deepgramVoices } from "../../src/app/api/media-providers/tts/deepgram/voices/route.js";
import { GET as inworldVoices } from "../../src/app/api/media-providers/tts/inworld/voices/route.js";
import { GET as minimaxVoices } from "../../src/app/api/media-providers/tts/minimax/voices/route.js";
import { closeUpstreamPools } from "../../open-sse/utils/proxyFetch.js";
import { FETCH_CONNECT_TIMEOUT_MS } from "../../open-sse/config/runtimeConfig.js";
import { getTtsAdapter } from "../../open-sse/handlers/ttsProviders/index.js";

const audio = Buffer.alloc(2048, 7);
const servers = [];
const sources = [];

async function listen(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

function respond(response, shape) {
  if (shape === "catalog-error") {
    response.writeHead(503, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { message: "synthetic-key" } }));
  } else if (shape.startsWith("catalog-")) {
    const provider = shape.slice(8);
    const payload = provider === "deepgram" ? { tts: [{ canonical_name: "aura-synthetic-en", name: "Synthetic", languages: ["en"] }] }
      : provider === "inworld" ? { voices: [{ voiceId: "synthetic", displayName: "Synthetic", languages: ["en"] }] }
        : provider.startsWith("minimax") ? { system_voice: [{ voice_id: "English_synthetic", voice_name: "Synthetic" }], base_resp: { status_code: 0 } }
          : { voices: [{ voice_id: "synthetic", name: "Synthetic", labels: { language: "en" } }] };
    response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(payload));
  } else if (shape === "openrouter") {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: audio.toString("base64") } } }] })}\n\ndata: [DONE]\n\n`);
  } else if (["gemini", "xiaomi-mimo", "minimax", "minimax-cn", "inworld", "voices"].includes(shape)) {
    const payload = shape === "gemini" ? { candidates: [{ content: { parts: [{ inlineData: { data: audio.toString("base64") } }] } }] }
      : shape === "xiaomi-mimo" ? { choices: [{ message: { audio: { data: audio.toString("base64"), format: "wav" } } }] }
        : shape === "inworld" ? { audioContent: audio.toString("base64") }
          : shape === "voices" ? { voices: [{ voice_id: "synthetic", name: "Synthetic", labels: { language: "en" } }] }
            : { data: { audio: audio.toString("hex") }, base_resp: { status_code: 0 } };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  } else {
    response.writeHead(200, { "Content-Type": "audio/mpeg" });
    response.end(audio);
  }
}

async function routingFixture(shape = "openai") {
  const relayCalls = [], directCalls = [];
  const trap = await listen((request, response) => { directCalls.push(request.url); request.resume(); respond(response, shape); });
  const relay = await listen((request, response) => {
    relayCalls.push({ headers: request.headers, url: request.url });
    request.resume(); respond(response, shape);
  });
  // Every attempted direct request is routed to a real local egress trap. No
  // provider hostname or paid endpoint is contacted by this suite.
  vi.stubGlobal("fetch", (url, init) => directFetch(String(url).startsWith(relay) ? url : trap, init));
  return { relay, trap, relayCalls, directCalls };
}

const credentials = policy => ({ connectionId: "synthetic-account", apiKey: "synthetic-key", providerSpecificData: policy });
const request = (provider, model, signal) => new Request("http://localhost/v1/audio/speech?response_format=json", {
  method: "POST", headers: { "Content-Type": "application/json" }, signal,
  body: JSON.stringify({ model: `${provider}/${model}`, input: "Synthetic speech fixture" }),
});

beforeEach(() => { state.credentials = null; state.health = []; state.selections = 0; state.pool = null; state.poolCalls = 0; });
afterEach(async () => {
  vi.useRealTimers();
  for (const source of sources.splice(0)) { try { source.close(); } catch {} }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
afterAll(() => closeUpstreamPools({ timeoutMs: 1000 }));

describe("TTS account transport", () => {
  it.each([
    ["openai", "tts-1/alloy"], ["elevenlabs", "eleven_v4/synthetic"], ["selfhosted-tts", "kokoro/af_heart"],
  ])("preserves the legacy direct %s adapter base64 result when output mode is omitted", async (provider, model) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(audio)));
    const result = await getTtsAdapter(provider).synthesize("fixture", model, credentials({}));
    expect(result).toEqual({ base64: audio.toString("base64"), format: "mp3" });
    if (provider === "selfhosted-tts") expect(JSON.parse(fetch.mock.calls[0][1].body).response_format).toBe("mp3");
  });

  it.each([
    ["openai", "tts-1/alloy"], ["openrouter", "openai/synthetic/alloy"],
    ["elevenlabs", "eleven_flash_v2_5/synthetic"], ["gemini", "Kore"],
    ["xiaomi-mimo", "mimo-v2.5-tts/mimo_default"], ["selfhosted-tts", "kokoro/af_heart"],
    ["minimax", "speech-2.8-hd/English_expressive_narrator"], ["minimax-cn", "speech-2.8-hd/English_expressive_narrator"],
    ["inworld", "inworld-tts-2/Alex"], ["cartesia", "sonic-3.6/synthetic"],
    ["nvidia", "synthetic/default"], ["playht", "PlayDialog/synthetic"], ["fish-audio", "s2.1-pro/synthetic"],
  ])("carries %s credentials only through its selected real HTTP relay", async (provider, model) => {
    const fixture = await routingFixture(provider);
    state.credentials = { ...credentials({ vercelRelayUrl: fixture.relay, strictProxy: true }), baseUrl: fixture.trap };
    const response = await handleTts(request(provider, model));
    expect(response.status).toBe(200);
    expect(fixture.relayCalls).toHaveLength(1);
    expect(fixture.directCalls).toEqual([]);
    expect(fixture.relayCalls[0].headers["x-relay-target"]).toBeTruthy();
    expect(state.health).toEqual([]);
    const payload = await response.json();
    expect(Buffer.from(payload.audio, "base64").length).toBeGreaterThanOrEqual(audio.length);
  });

  it("fails closed for an unavailable account proxy without trying another account or direct egress", async () => {
    const fixture = await routingFixture();
    state.credentials = { ...credentials({ connectionProxyEnabled: true, connectionProxyUrl: "", strictProxy: true }), baseUrl: fixture.trap };
    const response = await handleTts(request("openai", "tts-1/alloy"));
    expect(response.status).toBe(502);
    expect(fixture.directCalls).toEqual([]);
    expect(state.health).toEqual([]);
    expect(state.selections).toBe(1);
  });

  it("stops a late body on caller cancellation and does not mark the account unavailable", async () => {
    const controller = new AbortController();
    const cancel = vi.fn(() => new Promise(() => {}));
    let source;
    const body = new ReadableStream({ start(value) { source = value; sources.push(value); value.enqueue(audio); }, cancel });
    const upstream = new Response(body, { headers: { "Content-Type": "audio/mpeg" } });
    vi.stubGlobal("fetch", vi.fn(async () => upstream));
    state.credentials = credentials({});
    const pending = handleTts(request("openai", "tts-1/alloy", controller.signal));
    await vi.waitFor(() => expect(upstream.body.locked).toBe(true));
    controller.abort(new Error("synthetic caller cancellation"));
    const outcome = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 300))]);
    if (!outcome) source.close();
    expect(outcome?.status).toBe(499);
    expect(cancel).toHaveBeenCalledOnce();
    expect(upstream.body.locked).toBe(false);
    expect(state.health).toEqual([]);
  });

  it("returns audio at the OpenRouter DONE event and cancels the unused source", async () => {
    const cancel = vi.fn(() => new Promise(() => {}));
    const body = new ReadableStream({ start(source) {
      sources.push(source);
      source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: audio.toString("base64") } } }] })}\n\ndata: [DONE]\n\n`));
    }, cancel });
    const upstream = new Response(body);
    vi.stubGlobal("fetch", vi.fn(async () => upstream));
    const pending = handleTtsCore({ provider: "openrouter", model: "openai/synthetic/alloy", input: "fixture", credentials: credentials({}), responseFormat: "json" });
    const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 300))]);
    if (!result) sources.at(-1).close();
    expect(result?.success).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(upstream.body.locked).toBe(false);
  });

  it("routes stored ElevenLabs voice discovery through the selected account policy", async () => {
    const fixture = await routingFixture("voices");
    state.credentials = credentials({ vercelRelayUrl: fixture.relay, strictProxy: true });
    const response = await storedVoices(new Request("http://localhost/api/media-providers/tts/elevenlabs/voices"));
    expect(response.status).toBe(200);
    expect(fixture.relayCalls).toHaveLength(1);
    expect(fixture.directCalls).toEqual([]);
    expect(fixture.relayCalls[0].headers["xi-api-key"]).toBe("synthetic-key");
  });

  describe("stored voice catalogs", () => {
    const catalogs = [
      ["elevenlabs", storedVoices, "xi-api-key", "synthetic-key"],
      ["deepgram", deepgramVoices, "authorization", "Token synthetic-key"],
      ["inworld", inworldVoices, "authorization", "Basic synthetic-key"],
      ["minimax", minimaxVoices, "authorization", "Bearer synthetic-key"],
      ["minimax-cn", minimaxVoices, "authorization", "Bearer synthetic-key"],
    ];
    it.each(catalogs)("binds %s voice discovery to its selected real HTTP relay", async (provider, handler, authHeader, proof) => {
      const fixture = await routingFixture(`catalog-${provider}`);
      state.credentials = credentials({ vercelRelayUrl: fixture.relay, strictProxy: true });
      const response = await handler(new Request(`http://localhost/api/media-providers/tts/catalog/voices?provider=${provider}`));
      expect(response.status).toBe(200);
      expect(fixture.relayCalls).toHaveLength(1);
      expect(fixture.directCalls).toEqual([]);
      expect(fixture.relayCalls[0].headers[authHeader]).toBe(proof);
      expect((await response.json()).languages.length).toBeGreaterThan(0);
    });
    it.each(catalogs)("fails closed for the missing strict route on %s voice discovery", async (provider, handler) => {
      const fixture = await routingFixture(`catalog-${provider}`);
      state.credentials = credentials({ connectionProxyEnabled: true, connectionProxyUrl: "", strictProxy: true });
      const response = await handler(new Request(`http://localhost/api/media-providers/tts/catalog/voices?provider=${provider}`));
      expect(response.status).toBe(502);
      expect(fixture.relayCalls).toEqual([]);
      expect(fixture.directCalls).toEqual([]);
      expect(JSON.stringify(await response.json())).not.toContain("synthetic-key");
    });
    it.each(catalogs)("resolves the selected %s pool once and discards a stale embedded relay", async (provider, handler) => {
      const fixture = await routingFixture(`catalog-${provider}`);
      state.pool = { id: "selected-pool", isActive: true, type: "vercel", proxyUrl: fixture.relay, strictProxy: true };
      state.credentials = credentials(Object.freeze({ proxyPoolId: "selected-pool", vercelRelayUrl: fixture.trap, strictProxy: true }));
      const response = await handler(new Request(`http://localhost/api/media-providers/tts/catalog/voices?provider=${provider}`));
      expect(response.status).toBe(200);
      expect(state.poolCalls).toBe(1);
      expect(fixture.relayCalls).toHaveLength(1);
      expect(fixture.directCalls).toEqual([]);
    });
    it.each(catalogs)("does not reflect provider error bodies containing the %s key", async (provider, handler) => {
      const fixture = await routingFixture("catalog-error");
      state.credentials = credentials({ vercelRelayUrl: fixture.relay, strictProxy: true });
      const response = await handler(new Request(`http://localhost/api/media-providers/tts/catalog/voices?provider=${provider}`));
      expect(response.status).toBe(502);
      expect(JSON.stringify(await response.json())).not.toContain("synthetic-key");
      expect(fixture.directCalls).toEqual([]);
    });
  });

  it.each([
    ["openai", "tts-1/alloy"], ["elevenlabs", "eleven_flash_v2_5/synthetic"],
    ["selfhosted-tts", "kokoro/af_heart"], ["cartesia", "sonic-3.6/synthetic"],
    ["nvidia", "synthetic/default"], ["playht", "PlayDialog/synthetic"], ["fish-audio", "s2.1-pro/synthetic"],
  ])("streams %s binary output before EOF and releases its source on consumer cancellation", async (provider, model) => {
    const cancel = vi.fn(() => new Promise(() => {}));
    const upstream = new Response(new ReadableStream({ start(source) { sources.push(source); source.enqueue(audio); }, cancel }), {
      headers: { "Content-Type": "audio/mpeg" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => upstream));
    const pending = handleTtsCore({ provider, model, input: "fixture", credentials: credentials({}), responseFormat: "mp3" });
    const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 300))]);
    if (!result) sources.at(-1).close();
    expect(result?.success).toBe(true);
    const reader = result.response.body.getReader();
    expect(Buffer.from((await reader.read()).value)).toEqual(audio);
    const waiting = reader.read();
    await Promise.resolve();
    await reader.cancel("synthetic consumer left");
    expect((await waiting).done).toBe(true);
    reader.releaseLock();
    expect(cancel).toHaveBeenCalledOnce();
    expect(upstream.body.locked).toBe(false);
  });

  it("returns cancellation before late response headers arrive and disposes the eventual body", async () => {
    let resolveFetch;
    const fetch = vi.fn(() => new Promise(resolve => { resolveFetch = resolve; }));
    vi.stubGlobal("fetch", fetch);
    state.credentials = credentials({});
    const caller = new AbortController();
    const pending = handleTts(request("openai", "tts-1/alloy", caller.signal));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    caller.abort(new Error("synthetic caller left before headers"));
    const response = await pending;
    expect(response.status).toBe(499);
    const cancel = vi.fn(() => new Promise(() => {}));
    const upstream = new Response(new ReadableStream({ start(source) { sources.push(source); }, cancel }));
    resolveFetch(upstream);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(upstream.body.locked).toBe(false);
    expect(state.health).toEqual([]);
    expect(state.selections).toBe(1);
  });

  it("maps the finite response-header deadline to a local 408 without account fallback", async () => {
    vi.useFakeTimers();
    let resolveFetch;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { resolveFetch = resolve; })));
    state.credentials = credentials({});
    const pending = handleTts(request("openai", "tts-1/alloy"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FETCH_CONNECT_TIMEOUT_MS + 1);
    const response = await pending;
    expect(response.status).toBe(408);
    expect(state.health).toEqual([]);
    expect(state.selections).toBe(1);
    resolveFetch(new Response(audio));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("clears its header timer before streaming a long audio response and still observes caller abort", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise(() => {}));
    const upstream = new Response(new ReadableStream({ start(source) { sources.push(source); source.enqueue(audio); }, cancel }));
    vi.stubGlobal("fetch", vi.fn(async () => upstream));
    const caller = new AbortController();
    const pending = handleTtsCore({ provider: "openai", model: "tts-1/alloy", input: "fixture", credentials: credentials({}), signal: caller.signal });
    await vi.advanceTimersByTimeAsync(0);
    const result = await pending;
    await vi.advanceTimersByTimeAsync(FETCH_CONNECT_TIMEOUT_MS + 1);
    const reader = result.response.body.getReader();
    expect(Buffer.from((await reader.read()).value)).toEqual(audio);
    caller.abort(new Error("synthetic streaming caller left"));
    await expect(reader.read()).rejects.toThrow("synthetic streaming caller left");
    reader.releaseLock();
    expect(cancel).toHaveBeenCalledOnce();
    expect(upstream.body.locked).toBe(false);
  });

  describe.each([
    ["elevenlabs", "eleven_flash_v2_5/synthetic", 1024],
    ["cartesia", "sonic-3.6/synthetic", 100],
  ])("%s binary audio validation prefix", (provider, model, minimum) => {
    it.each(["empty", "short"])("rejects an %s body before returning a successful stream", async kind => {
      const upstream = new Response(Buffer.alloc(kind === "empty" ? 0 : minimum - 1), { headers: { "Content-Type": "audio/mpeg" } });
      vi.stubGlobal("fetch", vi.fn(async () => upstream));
      const result = await handleTtsCore({ provider, model, input: "fixture", credentials: credentials({}) });
      expect(result.success).toBe(false);
      expect(result.status).toBe(502);
      expect(upstream.body.locked).toBe(false);
    });

    it("streams an exact validated prefix before EOF and preserves both prefix chunks", async () => {
      const first = Buffer.alloc(Math.floor(minimum / 2), 3);
      const second = Buffer.alloc(minimum - first.length, 5);
      const cancel = vi.fn(() => new Promise(() => {}));
      const upstream = new Response(new ReadableStream({ start(source) {
        sources.push(source); source.enqueue(first); source.enqueue(second);
      }, cancel }), { headers: { "Content-Type": "audio/mpeg" } });
      vi.stubGlobal("fetch", vi.fn(async () => upstream));
      const pending = handleTtsCore({ provider, model, input: "fixture", credentials: credentials({}) });
      const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 300))]);
      if (!result) sources.at(-1).close();
      expect(result?.success).toBe(true);
      const reader = result.response.body.getReader();
      const a = (await reader.read()).value, b = (await reader.read()).value;
      expect(Buffer.concat([a, b])).toEqual(Buffer.concat([first, second]));
      await reader.cancel(); reader.releaseLock();
      expect(cancel).toHaveBeenCalledOnce();
      expect(upstream.body.locked).toBe(false);
    });

    it("cancels a pending prefix read without waiting for cancellation acknowledgement", async () => {
      const cancel = vi.fn(() => new Promise(() => {}));
      const upstream = new Response(new ReadableStream({ start(source) {
        sources.push(source); source.enqueue(Buffer.alloc(minimum - 1));
      }, cancel }), { headers: { "Content-Type": "audio/mpeg" } });
      vi.stubGlobal("fetch", vi.fn(async () => upstream));
      const caller = new AbortController();
      const pending = handleTtsCore({ provider, model, input: "fixture", credentials: credentials({}), signal: caller.signal });
      await vi.waitFor(() => expect(upstream.body.locked).toBe(true));
      caller.abort(new Error("synthetic caller left during prefix"));
      const result = await pending;
      expect(result.status).toBe(499);
      expect(cancel).toHaveBeenCalledOnce();
      expect(upstream.body.locked).toBe(false);
    });
  });

  it("surfaces a post-prefix upstream failure as an audio body error", async () => {
    let source;
    const upstream = new Response(new ReadableStream({ start(value) { source = value; sources.push(value); value.enqueue(audio); } }));
    vi.stubGlobal("fetch", vi.fn(async () => upstream));
    const result = await handleTtsCore({ provider: "cartesia", model: "sonic-3.6/synthetic", input: "fixture", credentials: credentials({}) });
    const reader = result.response.body.getReader();
    expect(Buffer.from((await reader.read()).value)).toEqual(audio);
    source.error(new Error("synthetic audio interrupted after prefix"));
    await expect(reader.read()).rejects.toThrow("synthetic audio interrupted after prefix");
    reader.releaseLock();
    expect(upstream.body.locked).toBe(false);
  });
});
