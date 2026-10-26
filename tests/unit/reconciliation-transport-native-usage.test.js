import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const state = vi.hoisted(() => ({ policy: null }));
vi.mock("@/sse/handlers/chat.js", () => ({ handleChat: async () => { throw new Error("unexpected shared chat"); } }));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: async () => ({ connectionId: "native-usage-fixture", apiKey: "provider-fixture", providerSpecificData: state.policy }),
  clearAccountError: async () => {}, isValidApiKey: async () => true,
  markAccountUnavailable: async () => ({ shouldFallback: false }),
}));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("open-sse/translator/index.js", () => ({ initTranslators: async () => {} }));

const nativeFetch = globalThis.fetch;
const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const servers = [];
let directory, previousGlobals, previousListeners, route, usage;
const metadata = { promptTokenCount: 3, candidatesTokenCount: 5, thoughtsTokenCount: 2, cachedContentTokenCount: 1, totalTokenCount: 10 };
const expectedTokens = { prompt_tokens: 3, completion_tokens: 7, total_tokens: 10, cached_tokens: 1, cache_creation_input_tokens: 0, reasoning_tokens: 2 };
const audio = { candidates: [{ content: { role: "model", parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: "AAE=" } }] } }] };
async function relay(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  state.policy = { strictProxy: true, vercelRelayUrl: `http://127.0.0.1:${server.address().port}` };
}
function dispatch({ signal, stream = false } = {}) {
  const action = stream ? ":streamGenerateContent" : ":generateContent";
  return route.POST(new Request(`http://localhost/v1beta/models/gemini-3.1-flash-tts-preview${action}`, {
    method: "POST", signal, headers: { authorization: "Bearer usage-caller-fixture" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "hello" }] }], generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: 37 } }),
  }), { params: Promise.resolve({ path: [`gemini-3.1-flash-tts-preview${action}`] }) });
}
beforeEach(async () => {
  directory = await mkdtemp("/tmp/opencode/native-usage-");
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  previousListeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  for (const key of globals) delete globalThis[key];
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  vi.stubEnv("TMPDIR", directory);
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(key, "");
  globalThis.fetch = (url, options) => new URL(url).hostname === "127.0.0.1"
    ? nativeFetch(url, options) : Promise.reject(new Error("fixture forbids direct egress"));
  vi.resetModules();
  route = await import("../../src/app/api/v1beta/models/[...path]/route.js");
  usage = await import("../../src/lib/db/repos/usageRepo.js");
});
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
  await globalThis._dbAdapter?.instance?.close();
  for (const event of events) for (const listener of process.listeners(event)) {
    if (!previousListeners.get(event).has(listener)) process.removeListener(event, listener);
  }
  for (const key of globals) {
    const descriptor = previousGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  globalThis.fetch = nativeFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("native Gemini authoritative usage through the real repository", () => {
  it("accepts native JSON usage before EOF and projects one canonical row with typed audio untouched", async () => {
    const text = JSON.stringify({ ...audio, usageMetadata: metadata });
    await relay((_req, res) => { res.setHeader("Content-Type", "application/json"); res.end(text); });
    const response = await dispatch();
    expect(await response.text()).toBe(text);
    await usage.flushUsageQueue();
    const rows = await usage.getUsageHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "gemini", connectionId: "native-usage-fixture", model: "gemini-3.1-flash-tts-preview",
      endpoint: "/v1beta/models/gemini-3.1-flash-tts-preview:generateContent", tokens: expectedTokens, status: "success" });
  });

  it("exposes native non-SSE headers and prefix bytes before upstream EOF without buffering the audio", async () => {
    const prefix = '{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"audio/L16","data":"AA';
    const suffix = `E="}}]}}],"usageMetadata":${JSON.stringify(metadata)}}`;
    let release;
    await relay((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("x-native-fixture", "streaming");
      release = () => res.end(suffix);
      res.write(prefix);
    });
    const pending = dispatch();
    const early = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 250))]);
    if (!early) {
      release();
      await (await pending).text();
    }
    expect(early).toBeInstanceOf(Response);
    expect(early.headers.get("x-native-fixture")).toBe("streaming");
    const reader = early.body.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe(prefix);
    release();
    const chunks = [first.value];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(Buffer.concat(chunks).toString()).toBe(prefix + suffix);
    await usage.flushUsageQueue();
    const rows = await usage.getUsageHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokens).toEqual(expectedTokens);
  });

  it("accepts cumulative SSE usage before EOF and projects one row without rewriting native framing or duplicating trailers", async () => {
    const text = `data: ${JSON.stringify(audio)}\n\ndata: ${JSON.stringify({ usageMetadata: metadata })}\n\ndata: ${JSON.stringify({ usageMetadata: metadata })}\n\n`;
    await relay((_req, res) => { res.setHeader("Content-Type", "text/event-stream"); res.end(text); });
    const response = await dispatch({ stream: true });
    expect(await response.text()).toBe(text);
    await usage.flushUsageQueue();
    const rows = await usage.getUsageHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokens).toEqual(expectedTokens);
  });

  it("finds a same-frame usage trailer after large typed audio without parsing audio as accounting data", async () => {
    const payload = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16", data: "A".repeat(2 * 1024 * 1024) } },
      { text: 'Example only: {"usageMetadata":{"promptTokenCount":99999,"candidatesTokenCount":99999}}' }] } }], usageMetadata: metadata };
    const text = `data: ${JSON.stringify(payload)}\n\n`;
    await relay((_req, res) => { res.setHeader("Content-Type", "text/event-stream"); res.end(text); });
    expect(await (await dispatch({ stream: true })).text()).toBe(text);
    await usage.flushUsageQueue();
    const rows = await usage.getUsageHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokens).toEqual(expectedTokens);
  });

  it("does not interpret usage examples inside model prose as authoritative counters", async () => {
    const payload = { candidates: [{ content: { parts: [{ text: JSON.stringify({ usageMetadata: metadata }) }] } }] };
    await relay((_req, res) => { res.setHeader("Content-Type", "text/event-stream"); res.end(`data: ${JSON.stringify(payload)}\n\n`); });
    await (await dispatch({ stream: true })).text();
    await usage.flushUsageQueue();
    expect(await usage.getUsageHistory()).toEqual([]);
  });

  it.each(["cancel", "error"])("retains positive incurred SSE usage when transport ends by %s", async end => {
    let upstream;
    const text = `data: ${JSON.stringify({ ...audio, usageMetadata: metadata })}\n\n`;
    await relay((_req, res) => { upstream = res; res.setHeader("Content-Type", "text/event-stream"); res.write(text); });
    const caller = new AbortController();
    const response = await dispatch({ stream: true, signal: caller.signal });
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(text);
    const pending = reader.read().then(() => "resolved", () => "failed");
    if (end === "cancel") caller.abort(new Error("caller left after usage"));
    else upstream.destroy();
    expect(await pending).toBe("failed");
    await usage.flushUsageQueue();
    const rows = await usage.getUsageHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokens).toEqual(expectedTokens);
    expect(rows[0].status).toBe(end === "cancel" ? "aborted" : "error");
  });

  it("retains authoritative JSON usage already received before caller cancellation", async () => {
    let sent;
    const entered = new Promise(resolve => { sent = resolve; });
    await relay((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.write(`{"usageMetadata":${JSON.stringify(metadata)},"candidates":[`);
      setTimeout(sent, 30);
    });
    const caller = new AbortController();
    const response = await dispatch({ signal: caller.signal });
    const reader = response.body.getReader();
    await reader.read();
    await entered;
    const pending = reader.read().then(() => "finished", () => "aborted");
    caller.abort(new Error("caller left JSON after usage"));
    expect(response.status).toBe(200); // Headers were already delivered; do not rewrite the protocol.
    expect(await pending).toBe("aborted");
    await usage.flushUsageQueue();
    const rows = await usage.getUsageHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tokens: expectedTokens, status: "aborted" });
  });

  it("persists observed SSE usage on request abort even when the client stops consuming its buffered body", async () => {
    await relay((_req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ ...audio, usageMetadata: metadata })}\n\n`);
    });
    const caller = new AbortController();
    const response = await dispatch({ stream: true, signal: caller.signal });
    await new Promise(resolve => setImmediate(resolve));
    caller.abort(new Error("caller stopped consuming SSE"));
    try {
      await vi.waitFor(async () => {
        await usage.flushUsageQueue();
        expect(await usage.getUsageHistory()).toHaveLength(1);
      }, { timeout: 500 });
      expect((await usage.getUsageHistory())[0]).toMatchObject({ tokens: expectedTokens, status: "aborted" });
    } finally {
      await response.body.cancel().catch(() => {});
    }
  });

  it("records positive incurred usage on an HTTP error without retrying or rewriting its native quota diagnostics", async () => {
    await relay((_req, res) => {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota" }, usageMetadata: metadata }));
    });
    const response = await dispatch();
    expect(response.status).toBe(429);
    expect((await response.json()).error.status).toBe("RESOURCE_EXHAUSTED");
    await usage.flushUsageQueue();
    const rows = await usage.getUsageHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tokens: expectedTokens, status: "error" });
  });

  it.each([undefined, {}, { ...metadata, estimated: true }, { ...metadata, promptTokenCount: "3" },
    { ...metadata, totalTokenCount: 100 }, { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 }])(
    "does not fabricate exact usage from missing, estimated or contradictory counters %#", async raw => {
      await relay((_req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ...audio, usageMetadata: raw })); });
      await (await dispatch()).text();
      await usage.flushUsageQueue();
      expect(await usage.getUsageHistory()).toEqual([]);
    });
});
