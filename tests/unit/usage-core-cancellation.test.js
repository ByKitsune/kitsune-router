import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const fixture = vi.hoisted(() => ({ executor: null, policy: {}, health: [], entries: [], provider: "codex" }));
vi.mock("../../open-sse/executors/index.js", () => ({ getExecutor: () => fixture.executor }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: (...args) => globalThis.fetch(...args) }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("@/lib/usageDb.js", () => ({ enqueueRequestUsage: async entry => { fixture.entries.push(structuredClone(entry)); return { accepted: true, eventId: entry.eventId }; } }));
vi.mock("@/sse/services/model.js", () => ({ getModelInfo: async () => ({ provider: fixture.provider, model: fixture.provider === "codex" ? "gpt-5.6-image" : "fixture" }), getComboModels: async () => null }));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: async () => ({ connectionId: "fixture", accessToken: "synthetic-token", apiKey: "synthetic-key", providerSpecificData: fixture.policy }),
  extractApiKey: () => null, isValidApiKey: async () => true, clearAccountError: async () => {},
  markAccountUnavailable: async (...args) => { fixture.health.push(args); return { shouldFallback: false }; },
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken: async (_provider, credentials) => credentials, updateProviderCredentials: async () => false }));

import { handleImageGenerationCore } from "../../open-sse/handlers/imageGenerationCore.js";
import { handleEmbeddingsCore } from "../../open-sse/handlers/embeddingsCore.js";
import codex from "../../open-sse/handlers/imageProviders/codex.js";
import { handleImageGeneration } from "@/sse/handlers/imageGeneration.js";
import { handleEmbeddings } from "@/sse/handlers/embeddings.js";

const tokens = { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 };
const nativeUsage = { input_tokens: 3, output_tokens: 5, total_tokens: 8 };
const metadata = { promptTokenCount: 3, candidatesTokenCount: 5, totalTokenCount: 8 };
const log = { debug() {}, info() {}, warn() {}, error() {} };
const servers = [];
const encoder = new TextEncoder();
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const usageEvent = event("response.completed", { response: { usage: nativeUsage } });
const imageEvent = event("response.output_item.done", { item: { type: "image_generation_call", result: "aW1hZ2U=" } });
const imageOptions = extra => ({ body: { prompt: "fixture" }, modelInfo: { provider: "codex", model: "gpt-5.6-image" }, credentials: { accessToken: "synthetic" }, log, ...extra });
const embeddingOptions = extra => ({ body: { input: "fixture" }, modelInfo: { provider: "openai", model: "embedding" }, credentials: { apiKey: "synthetic" }, log, ...extra });

beforeEach(() => {
  fixture.executor = { noAuth: true }; fixture.policy = {}; fixture.health = []; fixture.entries = []; fixture.provider = "codex";
});
afterEach(async () => {
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

function source(text, { close = false } = {}) {
  let controller;
  const cancel = vi.fn();
  const stream = new ReadableStream({ start(value) { controller = value; if (text) value.enqueue(encoder.encode(text)); if (close) value.close(); }, cancel }, { highWaterMark: 0 });
  return { stream, cancel, response: new Response(stream, { headers: { "content-type": "text/event-stream" } }), end: () => controller.close(), fail: () => controller.error(new Error("upstream failed")) };
}

async function loopback(handler) {
  const server = createServer(handler); servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function request(path, body, signal) {
  return new Request(`http://127.0.0.1${path}`, { method: "POST", body: JSON.stringify(body), signal });
}

describe("Codex image reader terminal ownership", () => {
  it.each([false, true])("accepts positive failed/no-image usage exactly once (stream=%s)", async streamToClient => {
    const upstream = source(event("response.failed", { response: { usage: nativeUsage, error: { message: "failed" } } }) + usageEvent, { close: true });
    const onUsage = vi.fn();
    const pending = codex.parseResponse(upstream.response, { streamToClient, onUsage });
    if (streamToClient) {
      const text = await (await pending).sseResponse.text();
      expect(text).toContain("event: error"); expect(text).not.toContain("event: done");
    } else await expect(pending).rejects.toThrow("completed image");
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(tokens, { status: "error" });
    expect(upstream.stream.locked).toBe(false);
  });

  it("retains usage already buffered after a partial-image frame when downstream cancels", async () => {
    const upstream = source(event("response.image_generation_call.partial_image", { partial_image_b64: "cGFydA==" }) + usageEvent);
    const onUsage = vi.fn();
    const { sseResponse } = await codex.parseResponse(upstream.response, { streamToClient: true, onUsage });
    const reader = sseResponse.body.getReader(); await reader.read();
    await reader.cancel("client left");
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(tokens, { status: "aborted" });
    expect(upstream.stream.locked).toBe(false);
  });

  it("preserves exact cache TTL counts and delivered tier without estimating image tokens", async () => {
    const raw = { ...nativeUsage, input_tokens_details: { cached_tokens: 1, cache_write_tokens: 1, cache_write_tokens_details: { ttl_30m_tokens: 1, ttl_12h_tokens: 0 } } };
    const upstream = source(imageEvent + event("response.completed", { response: { usage: raw, service_tier: "priority" } }), { close: true });
    const onUsage = vi.fn();
    await codex.parseResponse(upstream.response, { onUsage });
    expect(onUsage).toHaveBeenCalledExactlyOnceWith({ ...tokens, cached_tokens: 1, cache_write_tokens: 1, cache_write_30m_tokens: 1, cache_write_12h_tokens: 0, actualServiceTier: "priority" });
  });

  it("does not read eagerly or run past downstream backpressure", async () => {
    let reads = 0;
    const chunks = [event("response.image_generation_call.partial_image", { partial_image_b64: "cGFydA==", partial_image_index: 0 }), imageEvent + usageEvent];
    const stream = new ReadableStream({ pull(controller) { reads++; if (chunks.length) controller.enqueue(encoder.encode(chunks.shift())); else controller.close(); } }, { highWaterMark: 0 });
    const onUsage = vi.fn();
    const { sseResponse } = await codex.parseResponse(new Response(stream), { streamToClient: true, onUsage });
    await new Promise(resolve => setImmediate(resolve));
    expect(reads).toBe(0);
    const reader = sseResponse.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("partial_image");
    const stoppedAt = reads;
    await new Promise(resolve => setImmediate(resolve));
    expect(reads).toBe(stoppedAt);
    await reader.cancel("client left");
    expect(stream.locked).toBe(false);
    expect(onUsage).not.toHaveBeenCalled();
  });

  it.each(["abort", "cancel", "error"])("releases/cancels upstream with measured usage when %s accounting rejects", async terminal => {
    const upstream = source(usageEvent);
    const caller = new AbortController();
    const onUsage = vi.fn(async () => { throw Object.assign(new Error("accounting rejected"), { code: "usage_acceptance_failed" }); });
    const { sseResponse } = await codex.parseResponse(upstream.response, { streamToClient: true, clientSignal: caller.signal, onUsage });
    const reader = sseResponse.body.getReader();
    await reader.read();
    if (terminal === "cancel") await expect(reader.cancel("client left")).rejects.toMatchObject({ code: "usage_acceptance_failed" });
    else {
      const pending = reader.read();
      if (terminal === "abort") {
        const observed = expect(pending).rejects.toMatchObject({ code: "usage_acceptance_failed" });
        caller.abort(new Error("client left")); await observed;
      } else {
        upstream.fail();
        const frame = new TextDecoder().decode((await pending).value);
        expect(frame).toContain("event: error"); expect(frame).not.toContain("event: done");
      }
    }
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(tokens, { status: terminal === "error" ? "error" : "aborted" });
    expect(upstream.stream.locked).toBe(false);
    if (terminal !== "error") expect(upstream.cancel).toHaveBeenCalledOnce();
  });

  it("releases upstream before a slow abort acknowledgment and never emits done", async () => {
    const upstream = source(usageEvent);
    const caller = new AbortController();
    let accept;
    const onUsage = vi.fn(() => new Promise(resolve => { accept = resolve; }));
    const { sseResponse } = await codex.parseResponse(upstream.response, { streamToClient: true, clientSignal: caller.signal, onUsage });
    const reader = sseResponse.body.getReader(); await reader.read();
    const pending = reader.read(); const observed = expect(pending).rejects.toThrow("client left");
    caller.abort(new Error("client left"));
    try { await vi.waitFor(() => { expect(accept).toBeTypeOf("function"); expect(upstream.stream.locked).toBe(false); expect(upstream.cancel).toHaveBeenCalledOnce(); }); }
    finally { accept?.(); await observed; }
  });
});

describe("image core cancellation and exact provider usage", () => {
  it("forwards caller signal into actual loopback fetch and closes its socket", async () => {
    let started, closed;
    const seen = new Promise(resolve => { started = resolve; }); const disconnected = new Promise(resolve => { closed = resolve; });
    const base = await loopback((_req, res) => { res.on("close", closed); res.setHeader("content-type", "text/event-stream"); res.write(usageEvent); started(); });
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (_url, init) => nativeFetch(base, init));
    const caller = new AbortController(); const onUsage = vi.fn();
    const result = await handleImageGenerationCore(imageOptions({ clientSignal: caller.signal, streamToClient: true, onUsage }));
    await seen; const reader = result.response.body.getReader(); await reader.read();
    const pending = reader.read(); const observed = expect(pending).rejects.toThrow("client left");
    caller.abort(new Error("client left")); await observed;
    await expect(disconnected).resolves.toBeUndefined();
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(tokens, { status: "aborted" });
  });

  it.each(["openai", "gemini", "antigravity", "cloudflare-ai"])("accepts exact reported %s usage before normalized success without duplicates", async provider => {
    const wire = provider === "openai" ? { data: [{ b64_json: "image" }], usage: tokens }
      : provider === "cloudflare-ai" ? { result: { image: "image", usage: tokens } }
      : { candidates: [{ content: { parts: [{ inlineData: { data: "image" } }] } }], usageMetadata: metadata };
    fixture.executor = { noAuth: true, execute: vi.fn(async () => ({ response: Response.json(wire) })) };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(wire)));
    let accept; const onUsage = vi.fn(() => new Promise(resolve => { accept = resolve; }));
    const pending = handleImageGenerationCore(imageOptions({ modelInfo: { provider, model: "fixture-image" }, credentials: { apiKey: "synthetic", providerSpecificData: { accountId: "synthetic" } }, onUsage }));
    await vi.waitFor(() => expect(accept).toBeTypeOf("function"));
    expect(onUsage).toHaveBeenCalledOnce(); accept();
    expect((await pending).success).toBe(true);
    expect(onUsage.mock.calls[0][0]).toMatchObject(tokens);
  });

  it("retains executor-measured usage when normalization fails and propagates the caller signal", async () => {
    const caller = new AbortController();
    fixture.executor = { noAuth: true, execute: vi.fn(async () => ({ response: Response.json({ usageMetadata: metadata, candidates: [] }) })) };
    const onUsage = vi.fn();
    const result = await handleImageGenerationCore(imageOptions({ modelInfo: { provider: "antigravity", model: "fixture-image" }, clientSignal: caller.signal, onUsage }));
    expect(result.success).toBe(false); expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage.mock.calls[0]).toEqual([expect.objectContaining(tokens), { status: "error" }]);
    expect(fixture.executor.execute.mock.calls[0][0].signal).toBe(caller.signal);
  });

  it.each(["image", "embedding"])("releases bounded %s HTTP-error reader while retaining exact usage", async kind => {
    const usage = kind === "image" ? tokens : { prompt_tokens: 3, total_tokens: 3 };
    const upstream = Response.json({ error: { message: "quota" }, usage }, { status: 429 });
    vi.stubGlobal("fetch", vi.fn(async () => upstream));
    const onUsage = vi.fn();
    const result = kind === "image"
      ? await handleImageGenerationCore(imageOptions({ modelInfo: { provider: "openai", model: "fixture" }, onUsage }))
      : await handleEmbeddingsCore(embeddingOptions());
    expect(result.status).toBe(429); expect(upstream.body.locked).toBe(false);
    if (kind === "image") expect(onUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(tokens), { status: "error" });
    else expect(result.usage).toEqual(usage);
  });

  it.each(["image", "embedding"])("cancels a stalled %s HTTP error body after retaining bounded exact metadata", async kind => {
    const caller = new AbortController();
    const usage = kind === "image" ? tokens : { prompt_tokens: 3, total_tokens: 3 };
    const cancel = vi.fn(); let pulled;
    const read = new Promise(resolve => { pulled = resolve; });
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode(JSON.stringify({ usage, error: { message: "quota" } }))); },
      pull() { pulled(); }, cancel,
    }, { highWaterMark: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 429 })));
    const onUsage = vi.fn();
    const pending = kind === "image"
      ? handleImageGenerationCore(imageOptions({ modelInfo: { provider: "openai", model: "fixture" }, clientSignal: caller.signal, onUsage }))
      : handleEmbeddingsCore(embeddingOptions({ clientSignal: caller.signal }));
    await read; caller.abort(new Error("client left"));
    const result = await pending;
    expect(result.status).toBe(499); expect(stream.locked).toBe(false); expect(cancel).toHaveBeenCalledOnce();
    if (kind === "image") expect(onUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(tokens), { status: "aborted" });
    else expect(result.usage).toEqual(usage);
  });

  it("cancels a Cloudflare reference download before provider dispatch", async () => {
    const caller = new AbortController(); let began;
    const entered = new Promise(resolve => { began = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      began();
      return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
    }));
    const pending = handleImageGenerationCore(imageOptions({ modelInfo: { provider: "cloudflare-ai", model: "fixture" },
      body: { prompt: "fixture", image: "http://127.0.0.1/reference" }, credentials: { apiKey: "synthetic", providerSpecificData: { accountId: "fixture" } }, clientSignal: caller.signal }));
    await entered; caller.abort(new Error("client left"));
    expect((await pending).status).toBe(499); expect(fetch).toHaveBeenCalledOnce();
  });

  it("reports failed partial image usage through the app exactly once", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(event("response.incomplete", { response: { usage: nativeUsage } }))));
    const response = await handleImageGeneration(request("/v1/images/generations", { model: "fixture", prompt: "fixture" }));
    expect(response.status).toBe(502);
    expect(fixture.entries).toHaveLength(1);
    expect(fixture.entries[0]).toMatchObject({ status: "error", tokens });
  });

  it.each([null, {}, { prompt_tokens: 0, completion_tokens: 0 }, { ...tokens, estimated: true }, { prompt_tokens: "3", completion_tokens: 5 }])("never invents provider image counters %#", async usage => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [], usage })));
    const onUsage = vi.fn();
    const result = await handleImageGenerationCore(imageOptions({ modelInfo: { provider: "openai", model: "fixture" }, onUsage }));
    expect(result.success).toBe(true); expect(onUsage).not.toHaveBeenCalled();
  });

  it.each(["black-forest-labs", "fal-ai", "nanobanana", "runwayml"])("cancels %s polling delay before any next fetch", async provider => {
    const caller = new AbortController();
    const submit = { polling_url: "http://127.0.0.1/poll", status_url: "http://127.0.0.1/poll", response_url: "http://127.0.0.1/result", code: 200, data: { taskId: "fixture" }, id: "fixture" };
    const fetch = vi.fn(async () => Response.json(submit)); vi.stubGlobal("fetch", fetch);
    const pending = handleImageGenerationCore(imageOptions({ modelInfo: { provider, model: "fixture-image" }, clientSignal: caller.signal }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce()); caller.abort(new Error("client left"));
    expect((await pending).status).toBe(499); expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["black-forest-labs", "fal-ai", "nanobanana", "runwayml"])("retains exact %s polling HTTP-error usage without another dispatch", async provider => {
    const submit = { polling_url: "http://127.0.0.1/poll", status_url: "http://127.0.0.1/poll", response_url: "http://127.0.0.1/result", code: 200, data: { taskId: "fixture" }, id: "fixture" };
    let errorResponse;
    const onUsage = vi.fn();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json(submit))
      .mockImplementationOnce(async () => {
        errorResponse = Response.json({ error: { message: "quota" }, usage: tokens }, { status: 429 });
        return errorResponse;
      }));
    const result = await handleImageGenerationCore(imageOptions({ modelInfo: { provider, model: "fixture-image" }, onUsage }));
    expect(result.status).toBe(429); expect(fetch).toHaveBeenCalledTimes(2);
    expect(errorResponse.body.locked).toBe(false);
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(tokens), { status: "error" });
  });

  it("does not dispatch a replacement image account on cancellation", async () => {
    const caller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      caller.abort(new Error("client left"));
    })));
    const response = await handleImageGeneration(request("/v1/images/generations", { model: "fixture", prompt: "fixture" }, caller.signal));
    expect(response.status).toBe(499); expect(fixture.health).toEqual([]); expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("embedding incurred usage survives terminal cancellation/error", () => {
  it("keeps parsed positive usage if caller aborts before core return", async () => {
    const caller = new AbortController();
    const upstream = Response.json({ data: [], usage: { prompt_tokens: 3, total_tokens: 3 } });
    const json = upstream.json.bind(upstream);
    upstream.json = async () => { const body = await json(); caller.abort(new Error("client left")); return body; };
    vi.stubGlobal("fetch", vi.fn(async () => upstream));
    const result = await handleEmbeddingsCore(embeddingOptions({ clientSignal: caller.signal }));
    expect(result.status).toBe(499); expect(result.usage).toEqual({ prompt_tokens: 3, total_tokens: 3 });
  });

  it("durably admits embedding usage received just before caller abort without account health mutation", async () => {
    fixture.provider = "openai";
    const caller = new AbortController();
    const upstream = Response.json({ data: [], usage: { prompt_tokens: 3, total_tokens: 3 } });
    const json = upstream.json.bind(upstream);
    upstream.json = async () => { const body = await json(); caller.abort(new Error("client left")); return body; };
    vi.stubGlobal("fetch", vi.fn(async () => upstream));
    const response = await handleEmbeddings(request("/v1/embeddings", { model: "fixture", input: "fixture" }, caller.signal));
    expect(response.status).toBe(499); expect(fixture.entries).toHaveLength(1);
    expect(fixture.entries[0]).toMatchObject({ status: "aborted", tokens: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 } });
    expect(fixture.health).toEqual([]);
  });

  it("persists embedding HTTP error usage once through the app without changing upstream diagnostics", async () => {
    fixture.provider = "openai";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "quota" }, usage: { prompt_tokens: 3, total_tokens: 3 } }, { status: 429 })));
    const response = await handleEmbeddings(request("/v1/embeddings", { model: "fixture", input: "fixture" }));
    expect(response.status).toBe(429); expect(fixture.entries).toHaveLength(1);
    expect(fixture.entries[0]).toMatchObject({ status: "error", tokens: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 } });
  });

  it.each(["image", "embedding"])("does not hide an incurred %s authorization failure inside a refreshed retry", async kind => {
    const usage = kind === "image" ? tokens : { prompt_tokens: 3, total_tokens: 3 };
    fixture.executor = { noAuth: false, refreshCredentials: vi.fn(async () => ({ accessToken: "new" })) };
    const upstream = Response.json({ error: { message: "expired" }, usage }, { status: 401 });
    vi.stubGlobal("fetch", vi.fn(async () => upstream));
    const onUsage = vi.fn();
    const result = kind === "image"
      ? await handleImageGenerationCore(imageOptions({ modelInfo: { provider: "openai", model: "fixture" }, onUsage }))
      : await handleEmbeddingsCore(embeddingOptions());
    expect(result.status).toBe(401); expect(fetch).toHaveBeenCalledOnce();
    expect(fixture.executor.refreshCredentials).not.toHaveBeenCalled();
    expect(upstream.body.locked).toBe(false);
    if (kind === "image") expect(onUsage).toHaveBeenCalledOnce();
    else expect(result.usage).toEqual(usage);
  });

  it.each(["image", "embedding"])("returns local stale %s fence failure without mutating credentials or cooling a replacement", async kind => {
    const credentials = { accessToken: "old", apiKey: "synthetic" };
    fixture.executor = { noAuth: false, refreshCredentials: vi.fn(async () => ({ accessToken: "new" })) };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "expired" } }, { status: 401 })));
    const onCredentialsRefreshed = async () => { throw Object.assign(new Error("stale"), { code: "STALE_CONNECTION_WRITE" }); };
    const result = kind === "image"
      ? await handleImageGenerationCore(imageOptions({ credentials, onCredentialsRefreshed }))
      : await handleEmbeddingsCore(embeddingOptions({ credentials, onCredentialsRefreshed }));
    expect(result.status).toBe(503); expect(result.localFailure).toBe(true);
    expect((await result.response.json()).error.code).toBe("STALE_CONNECTION_WRITE");
    expect(credentials.accessToken).toBe("old"); expect(fetch).toHaveBeenCalledOnce();
  });
});
