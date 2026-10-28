import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = vi.hoisted(() => ({ upstream: null, calls: [], fail: false, beforeAccept: null, health: [], executor: null, writes: [], commit: true, fence: null }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: async model => model.includes("embedding")
    ? { provider: "openai-compatible-producer", model: "embedding-fixture" }
    : { provider: "codex", model: "gpt-5.6-sol-image" },
  getComboModels: async model => model === "image-combo" ? ["cx/gpt-5.6-sol-image", "cx/gpt-5.6-sol-image"] : null,
}));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: async () => ({ connectionId: "producer-account", apiKey: "synthetic-upstream", accessToken: "synthetic-access", _writeFence: state.fence, providerSpecificData: { baseUrl: "http://127.0.0.1:1/v1" } }),
  clearAccountError: async () => {}, extractApiKey: () => "synthetic-client", isValidApiKey: async () => true,
  markAccountUnavailable: async (...args) => { state.health.push(args); return { shouldFallback: false }; },
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: async (_provider, credentials) => credentials,
  updateProviderCredentials: async (...args) => { state.writes.push(args); return state.commit; },
}));
vi.mock("@/sse/handlers/chat.js", () => ({ handleChat: async () => { throw new Error("Unexpected chat dispatch"); } }));
vi.mock("open-sse/translator/index.js", () => ({ initTranslators: async () => {} }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: async (...args) => state.upstream(...args) }));
vi.mock("open-sse/executors/index.js", () => ({ getExecutor: () => state.executor }));
vi.mock("@/lib/usageDb.js", () => ({
  enqueueRequestUsage: async entry => {
    state.calls.push(structuredClone(entry));
    if (state.beforeAccept) await state.beforeAccept();
    if (state.fail) throw new Error("private accounting database path");
    return (await import("@/lib/db/repos/usageRepo.js")).enqueueRequestUsage(entry);
  },
}));

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const model = "gemini-3.1-flash-tts-preview";
const metadata = { promptTokenCount: 3, candidatesTokenCount: 5, thoughtsTokenCount: 2, cachedContentTokenCount: 1, totalTokenCount: 10 };
let directory, previous, adapter, usage, embeddings, images, native, resetRateLimiter;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "zen-usage-producers-"));
  previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) delete globalThis[key];
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("ENABLE_REQUEST_LOGS", "false");
  state.calls = []; state.fail = false; state.beforeAccept = null; state.health = [];
  state.executor = { noAuth: true }; state.writes = []; state.commit = true; state.fence = { revision: "fixture" };
  state.upstream = async () => { throw new Error("Unexpected upstream dispatch"); };
  vi.stubGlobal("fetch", (...args) => state.upstream(...args));
  vi.resetModules();
  usage = await import("@/lib/db/repos/usageRepo.js");
  adapter = await (await import("@/lib/db/driver.js")).getAdapter();
  const queue = usage.initializeUsagePersistence(adapter);
  queue.stopped = true;
  clearTimeout(queue.timer); queue.timer = null;
  ({ handleEmbeddings: embeddings } = await import("@/sse/handlers/embeddings.js"));
  ({ handleImageGeneration: images } = await import("@/sse/handlers/imageGeneration.js"));
  ({ POST: native } = await import("@/app/api/v1beta/models/[...path]/route.js"));
  ({ resetRateLimiter } = await import("@/lib/rateLimit/v1Limiter.js"));
  resetRateLimiter();
});

afterEach(async () => {
  resetRateLimiter?.();
  await adapter?.close();
  for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

function request(path, body, signal) {
  return new Request(`http://127.0.0.1${path}`, { method: "POST", signal,
    headers: { authorization: "Bearer synthetic-client" }, body: JSON.stringify(body) });
}

function dispatchNative({ signal, sse = false } = {}) {
  const action = sse ? ":streamGenerateContent" : ":generateContent";
  return native(request(`/v1beta/models/${model}${action}`, {
    contents: [{ role: "user", parts: [{ text: "fixture" }] }], generationConfig: { responseModalities: ["AUDIO"] },
  }, signal), { params: Promise.resolve({ path: [`${model}${action}`] }) });
}

function pendingNativeBody({ sse = true } = {}) {
  let controller;
  const cancel = vi.fn();
  const prefix = sse ? `data: ${JSON.stringify({ usageMetadata: metadata })}\n\n` : `{"usageMetadata":${JSON.stringify(metadata)},"candidates":[`;
  const source = new ReadableStream({ start(value) { controller = value; value.enqueue(new TextEncoder().encode(prefix)); }, cancel }, { highWaterMark: 0 });
  const response = new Response(source, { headers: { "content-type": sse ? "text/event-stream" : "application/json" } });
  return { source, response, cancel, prefix, end: () => controller.close(), fail: () => controller.error(new Error("fixture upstream failed")) };
}

function outbox() {
  return adapter.all("SELECT eventId, payload FROM usageOutbox ORDER BY acceptedAt, eventId").map(row => ({ eventId: row.eventId, ...JSON.parse(row.payload) }));
}

describe("direct producers acknowledge durable acceptance rather than synchronous projection", () => {
  it("accepts embeddings before success, snapshots identity/time and counts distinct requests separately", async () => {
    const tokens = { prompt_tokens: 3, total_tokens: 3, prompt_tokens_details: { cached_tokens: 1 }, cache_write_tokens: 1, cache_write_30m_tokens: 1, actualServiceTier: "priority" };
    const payload = { data: [{ embedding: [0.25] }], usage: tokens };
    const dispatchTimes = [];
    state.upstream = async () => { dispatchTimes.push(Date.now()); return Response.json(payload); };
    for (let i = 0; i < 2; i++) {
      const response = await embeddings(request("/v1/embeddings", { model: "fixture/embedding", input: "hello" }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(payload);
    }
    expect(await usage.getUsageHistory()).toEqual([]);
    expect(outbox()).toHaveLength(2);
    const [first, second] = state.calls;
    expect(first.eventId).not.toBe(second.eventId);
    expect(first).toMatchObject({ eventId: expect.stringMatching(/^[0-9a-f-]{36}$/), timestamp: expect.any(String),
      endpoint: "/v1/embeddings", tokens: { ...tokens, completion_tokens: 0 } });
    for (const [index, entry] of state.calls.entries()) {
      expect(Date.parse(entry.timestamp)).toBeLessThanOrEqual(dispatchTimes[index]);
      expect(outbox().find(row => row.eventId === entry.eventId).tokens).toEqual({ ...tokens, completion_tokens: 0 });
    }
    await usage.enqueueRequestUsage(first);
    expect(outbox()).toHaveLength(2);
    await usage.flushUsageQueue();
    const history = await usage.getUsageHistory();
    expect(history).toHaveLength(2);
    expect(history[0].tokens).toEqual({ ...tokens, completion_tokens: 0 });
  });

  it.each(["embeddings", "images"])("rejects a stale %s reactive credential commit before the core retries", async producer => {
    let dispatches = 0;
    state.upstream = async () => { dispatches++; return Response.json({ error: "expired" }, { status: 401 }); };
    state.executor = { noAuth: false, refreshCredentials: async () => ({ accessToken: "synthetic-refreshed" }) };
    state.commit = false;
    const pending = producer === "embeddings"
      ? embeddings(request("/v1/embeddings", { model: "fixture/embedding", input: "hello" }))
      : images(request("/v1/images/generations", { model: "cx/gpt-5.6-sol-image", prompt: "fixture" }));
    const response = await pending;
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("STALE_CONNECTION_WRITE");
    expect(dispatches).toBe(1);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0][2]).toEqual({ expected: state.fence });
    expect(state.health).toEqual([]);
    expect(state.calls).toEqual([]);
  });

  it("withholds embedding success until acceptance settles and rejects storage failure without account fallback", async () => {
    state.upstream = async () => Response.json({ data: [], usage: { prompt_tokens: 3, total_tokens: 3 } });
    let release;
    state.beforeAccept = () => new Promise(resolve => { release = resolve; });
    let settled = false;
    const pending = embeddings(request("/v1/embeddings", { model: "fixture/embedding", input: "hello" }))
      .then(response => { settled = true; return response; });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(settled).toBe(false);
    state.fail = true;
    release();
    const response = await pending;
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("usage_acceptance_failed");
    expect(state.health).toEqual([]);
    expect(outbox()).toEqual([]);
  });

  it.each([false, true])("waits for the real Codex image adapter acceptance (stream=%s)", async stream => {
    const text = 'event: response.output_item.done\ndata: {"item":{"type":"image_generation_call","result":"aW1hZ2U="}}\n\n'
      + 'event: response.completed\ndata: {"response":{"usage":{"input_tokens":3,"output_tokens":5,"input_tokens_details":{"cached_tokens":1}}}}\n\n';
    state.upstream = async () => new Response(text, { headers: { "content-type": "text/event-stream" } });
    const req = request("/v1/images/generations", { model: "cx/gpt-5.6-sol-image", prompt: "fixture" });
    if (stream) req.headers.set("accept", "text/event-stream");
    let accept;
    state.beforeAccept = () => new Promise(resolve => { accept = resolve; });
    let settled = false;
    const pending = images(req).then(async response => {
      const body = await response.text();
      settled = true;
      return { response, body };
    });
    try {
      await vi.waitFor(() => expect(accept).toBeTypeOf("function"));
      expect(settled).toBe(false);
      expect(outbox()).toEqual([]);
    } finally { accept?.(); }
    const { response, body } = await pending;
    expect(response.status).toBe(200);
    expect(body).toContain(stream ? "event: done" : "b64_json");
    expect(outbox()).toHaveLength(1);
    expect(outbox()[0]).toMatchObject({ provider: "codex", tokens: { prompt_tokens: 3, completion_tokens: 5, cached_tokens: 1 } });
    expect(await usage.getUsageHistory()).toEqual([]);
  });

  it.each([false, true])("does not report image success after durable acceptance failure (stream=%s)", async stream => {
    const text = 'event: response.output_item.done\ndata: {"item":{"type":"image_generation_call","result":"aW1hZ2U="}}\n\n'
      + 'event: response.completed\ndata: {"response":{"usage":{"input_tokens":3,"output_tokens":5}}}\n\n';
    state.upstream = async () => new Response(text, { headers: { "content-type": "text/event-stream" } });
    state.fail = true;
    const req = request("/v1/images/generations", { model: "cx/gpt-5.6-sol-image", prompt: "fixture" });
    if (stream) req.headers.set("accept", "text/event-stream");
    const response = await images(req);
    const body = await response.text();
    if (stream && response.status === 200) {
      expect(body).toContain("event: error");
      expect(body).not.toContain("event: done");
    } else expect(response.status).toBe(503);
    expect(body).not.toContain("private accounting database path");
    expect(state.health).toEqual([]);
    expect(state.calls).toHaveLength(1);
  });

  it.each(["failed", "cancelled"])("durably accepts measured %s image usage once before projection", async terminal => {
    const frame = 'event: response.incomplete\ndata: {"response":{"usage":{"input_tokens":3,"output_tokens":5}}}\n\n';
    const cancel = vi.fn();
    const source = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(frame)); if (terminal === "failed") controller.close(); }, cancel }, { highWaterMark: 0 });
    state.upstream = async () => new Response(source, { headers: { "content-type": "text/event-stream" } });
    const req = request("/v1/images/generations", { model: "cx/gpt-5.6-sol-image", prompt: "fixture" });
    if (terminal === "cancelled") req.headers.set("accept", "text/event-stream");
    const response = await images(req);
    if (terminal === "failed") expect(response.status).toBe(502);
    else {
      const reader = response.body.getReader(); await reader.read(); await reader.cancel("client left");
      expect(cancel).toHaveBeenCalledOnce();
    }
    expect(source.locked).toBe(false);
    expect(state.calls).toHaveLength(1); expect(outbox()).toHaveLength(1);
    expect(outbox()[0]).toMatchObject({ status: terminal === "failed" ? "error" : "aborted", tokens: { prompt_tokens: 3, completion_tokens: 5 } });
    expect(await usage.getUsageHistory()).toEqual([]);
    await usage.flushUsageQueue();
    expect(await usage.getUsageHistory()).toHaveLength(1);
  });

  it("does not dispatch another combo model after a local image accounting failure", async () => {
    const text = 'event: response.output_item.done\ndata: {"item":{"type":"image_generation_call","result":"aW1hZ2U="}}\n\n'
      + 'event: response.completed\ndata: {"response":{"usage":{"input_tokens":3,"output_tokens":5}}}\n\n';
    let dispatches = 0;
    state.upstream = async () => { dispatches++; return new Response(text, { headers: { "content-type": "text/event-stream" } }); };
    state.fail = true;
    const response = await images(request("/v1/images/generations", { model: "image-combo", prompt: "fixture" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("usage_acceptance_failed");
    expect(dispatches).toBe(1);
    expect(state.calls).toHaveLength(1);
    expect(state.health).toEqual([]);
  });
});

describe("native Gemini bounded observation and terminal resource ownership", () => {
  it("keeps large audio bytes and cumulative counters intact while accepting a single event before EOF", async () => {
    const text = JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: "A".repeat(2 * 1024 * 1024), mimeType: "audio/L16" } },
      { text: JSON.stringify({ usageMetadata: { promptTokenCount: 99999, totalTokenCount: 99999 } }) }] } }], usageMetadata: metadata });
    const source = new Response(text, { headers: { "content-type": "application/json" } });
    state.upstream = async () => source;
    const response = await dispatchNative();
    expect(await response.text()).toBe(text);
    expect(source.body.locked).toBe(false);
    expect(state.calls).toHaveLength(1);
    expect(outbox()[0]).toMatchObject({ tokens: { prompt_tokens: 3, completion_tokens: 7, total_tokens: 10, cached_tokens: 1, reasoning_tokens: 2 } });
    expect(await usage.getUsageHistory()).toEqual([]);
  });

  it("keeps distinct native attempts separate and deduplicates repeated cumulative metadata", async () => {
    const text = `data: ${JSON.stringify({ usageMetadata: metadata })}\n\ndata: ${JSON.stringify({ usageMetadata: metadata })}\n\n`;
    state.upstream = async () => new Response(text, { headers: { "content-type": "text/event-stream" } });
    for (let i = 0; i < 2; i++) expect(await (await dispatchNative({ sse: true })).text()).toBe(text);
    expect(state.calls).toHaveLength(2);
    expect(state.calls[0].eventId).not.toBe(state.calls[1].eventId);
    expect(outbox()).toHaveLength(2);
    for (const entry of outbox()) expect(entry.tokens.total_tokens).toBe(10);
    await usage.enqueueRequestUsage(state.calls[0]);
    expect(outbox()).toHaveLength(2);
  });

  it("returns an accounting error before native HTTP error fallback when acceptance rejects", async () => {
    let dispatches = 0;
    state.upstream = async () => {
      dispatches++;
      return Response.json({ error: { code: 429, message: "fixture quota", status: "RESOURCE_EXHAUSTED" }, usageMetadata: metadata }, {
        status: 429, headers: { "Retry-After": "60" },
      });
    };
    state.fail = true;
    const response = await dispatchNative();
    expect(response.status).toBe(503);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(response.headers.get("access-control-expose-headers")).toContain("x-should-retry");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("retry-after")).toBeNull();
    expect((await response.json()).error).toEqual({ code: "usage_acceptance_failed", message: "Usage accounting could not be accepted" });
    expect(dispatches).toBe(1);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].status).toBe("error");
    expect(state.health).toEqual([]);
    expect(outbox()).toEqual([]);
  });

  it.each([false, true])("keeps native error accounting terminal when the caller aborts during acceptance (rejected=%s)", async rejected => {
    let dispatches = 0, accept;
    state.upstream = async () => {
      dispatches++;
      return Response.json({ error: { code: 429, message: "fixture quota", status: "RESOURCE_EXHAUSTED" }, usageMetadata: metadata }, { status: 429 });
    };
    state.beforeAccept = () => new Promise(resolve => { accept = resolve; });
    state.fail = rejected;
    const caller = new AbortController();
    const pending = dispatchNative({ signal: caller.signal });
    try {
      await vi.waitFor(() => expect(accept).toBeTypeOf("function"));
      caller.abort(new Error("caller left"));
      accept();
      const response = await pending;
      expect(response.status).toBe(rejected ? 503 : 499);
      if (rejected) {
        expect(response.headers.get("x-should-retry")).toBe("false");
        expect(response.headers.get("retry-after")).toBeNull();
        expect((await response.json()).error.code).toBe("usage_acceptance_failed");
      }
      expect(dispatches).toBe(1);
      expect(state.calls).toHaveLength(1);
      expect(state.health).toEqual([]);
      expect(outbox()).toHaveLength(rejected ? 0 : 1);
    } finally {
      accept?.();
      await pending;
    }
  });

  it("releases the reader and fails EOF when acceptance rejects", async () => {
    const source = new Response(JSON.stringify({ usageMetadata: metadata }), { headers: { "content-type": "application/json" } });
    state.upstream = async () => source;
    state.fail = true;
    const response = await dispatchNative();
    expect(response.status).toBe(200);
    await expect(response.text()).rejects.toMatchObject({ code: "usage_acceptance_failed" });
    expect(source.body.locked).toBe(false);
    expect(state.calls).toHaveLength(1);
    expect(state.health).toEqual([]);
  });

  it.each(["abort", "cancel", "error"])("releases upstream even when %s terminal acceptance rejects", async terminal => {
    const source = pendingNativeBody();
    state.upstream = async () => source.response;
    const caller = new AbortController();
    const response = await dispatchNative({ signal: caller.signal, sse: true });
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(source.prefix);
    state.fail = true;
    if (terminal === "cancel") {
      await expect(reader.cancel("caller cancelled")).rejects.toMatchObject({ code: "usage_acceptance_failed" });
      caller.abort();
    } else {
      const pending = reader.read();
      const observed = expect(pending).rejects.toMatchObject({ code: "usage_acceptance_failed" });
      if (terminal === "abort") caller.abort(new Error("caller left"));
      else source.fail();
      await observed;
    }
    expect(source.source.locked).toBe(false);
    if (terminal !== "error") expect(source.cancel).toHaveBeenCalledTimes(1);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].status).toBe(terminal === "error" ? "error" : "aborted");
    expect(state.health).toEqual([]);
  });

  it("cancels upstream promptly without waiting for a slow durable acknowledgment", async () => {
    const source = pendingNativeBody();
    state.upstream = async () => source.response;
    const caller = new AbortController();
    const response = await dispatchNative({ signal: caller.signal, sse: true });
    const reader = response.body.getReader();
    await reader.read();
    let accept;
    state.beforeAccept = () => new Promise(resolve => { accept = resolve; });
    const pending = reader.read();
    const observed = expect(pending).rejects.toThrow("caller left");
    caller.abort(new Error("caller left"));
    try {
      await vi.waitFor(() => {
        expect(accept).toBeTypeOf("function");
        expect(source.cancel).toHaveBeenCalledTimes(1);
        expect(source.source.locked).toBe(false);
      });
    } finally {
      accept?.();
      await observed;
    }
    expect(outbox()).toHaveLength(1);
  });

  it.each([undefined, { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 }, { ...metadata, estimated: true }])("does not manufacture native usage %#", async usageMetadata => {
    state.upstream = async () => Response.json({ candidates: [{ content: { parts: [{ text: "no usage" }] } }], usageMetadata });
    await (await dispatchNative()).text();
    expect(state.calls).toEqual([]);
    expect(outbox()).toEqual([]);
  });
});
