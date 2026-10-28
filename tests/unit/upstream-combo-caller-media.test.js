import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The image route uses the real image core, Codex reader and combo. Persistence,
// provider transport and the unrelated shared TTS core are synthetic.
const io = vi.hoisted(() => ({
  combo: null, fetch: vi.fn(), unexpectedDb: vi.fn(), enqueue: vi.fn(),
  getCredentials: vi.fn(), markUnavailable: vi.fn(), clearError: vi.fn(),
  ttsCore: vi.fn(), info: vi.fn(), error: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("@/lib/db/driver.js", () => ({ getAdapter: io.unexpectedDb, getAdapterSync: io.unexpectedDb }));
vi.mock("@/lib/rateLimit/inferenceLimit.js", () => ({ withInferenceLimit: async (_request, _key, run) => run() }));
vi.mock("@/lib/usageDb.js", () => ({ enqueueRequestUsage: io.enqueue }));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: () => null, isValidApiKey: async () => true, getProviderCredentials: io.getCredentials,
  markAccountUnavailable: io.markUnavailable, clearAccountError: io.clearError,
}));
vi.mock("@/sse/services/model.js", () => ({
  getComboModels: async name => name === "fixture-combo" ? io.combo : null,
  getModelInfo: async value => {
    const slash = value.indexOf("/");
    return slash < 0 ? { provider: null, model: value } : { provider: value.slice(0, slash), model: value.slice(slash + 1) };
  },
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: async (_provider, credentials) => credentials, updateProviderCredentials: vi.fn(async () => true),
}));
vi.mock("@/sse/utils/logger.js", () => ({
  request: vi.fn(), debug: vi.fn(), info: io.info, warn: vi.fn(), error: io.error, maskKey: vi.fn(() => "synthetic"),
}));
vi.mock("../../open-sse/executors/index.js", () => ({ getExecutor: () => ({ noAuth: true }) }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: (url, options) => globalThis.fetch(url, options) }));
vi.mock("open-sse/handlers/ttsCore.js", () => ({ handleTtsCore: io.ttsCore }));

import { POST as imageRoute } from "@/app/api/v1/images/generations/route.js";
import { POST as speechRoute } from "@/app/api/v1/audio/speech/route.js";

const privateDetail = "synthetic private database detail";
const encoder = new TextEncoder();
const nativeUsage = { input_tokens: 3, output_tokens: 5, total_tokens: 8 };
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

function request(path, body, signal, headers = {}) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body), signal });
}
function imageRequest(signal, stream = false) {
  return request("/v1/images/generations", { model: "fixture-combo", prompt: "synthetic private prompt" }, signal,
    stream ? { accept: "text/event-stream" } : {});
}
function speechRequest(signal) {
  return request("/v1/audio/speech", { model: "fixture-combo", input: "synthetic speech" }, signal);
}

beforeEach(() => {
  vi.clearAllMocks();
  io.combo = null;
  io.fetch.mockReset().mockImplementation(() => { throw new Error("Unexpected network request"); });
  io.unexpectedDb.mockReset().mockImplementation(() => { throw new Error("Unexpected database request"); });
  io.enqueue.mockReset().mockResolvedValue({ accepted: true });
  io.getCredentials.mockReset().mockResolvedValue({ connectionId: "fixture", accessToken: "synthetic-token", apiKey: "synthetic-key", providerSpecificData: {} });
  io.markUnavailable.mockReset().mockResolvedValue({ shouldFallback: false });
  io.clearError.mockReset().mockResolvedValue();
  io.ttsCore.mockReset();
  io.info.mockReset();
  vi.stubGlobal("fetch", io.fetch);
});
afterEach(() => {
  try { expect(io.unexpectedDb).not.toHaveBeenCalled(); }
  finally { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});

describe("public image combo caller cancellation", () => {
  it("preserves completed Codex image SSE and exact usage through a combo", async () => {
    io.combo = ["codex/gpt-5.6-image", "openai/gpt-image-1"];
    const wire = event("response.image_generation_call.partial_image", { partial_image_b64: "cGFydA==", partial_image_index: 0 })
      + event("response.output_item.done", { item: { type: "image_generation_call", result: "aW1hZ2U=" } })
      + event("response.completed", { response: { usage: nativeUsage } });
    io.fetch.mockResolvedValueOnce(new Response(wire, { headers: { "content-type": "text/event-stream" } }));
    const response = await imageRoute(imageRequest(undefined, true));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event: partial_image");
    expect(text).toContain('"b64_json":"cGFydA=="');
    expect(text).toContain("event: done");
    expect(text).toContain('"b64_json":"aW1hZ2U="');
    expect(io.enqueue).toHaveBeenCalledOnce();
    expect(io.enqueue.mock.calls[0][0]).toMatchObject({ status: "success", tokens: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } });
    expect(io.fetch).toHaveBeenCalledOnce();
    expect(io.markUnavailable).not.toHaveBeenCalled();
  });

  it.each(["accepted", "rejected"])("aborts the initial Codex image peek and observes %s late accounting", async outcome => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    io.combo = ["codex/gpt-5.6-image", "openai/gpt-image-1"];
    let reading, resolveAcceptance, rejectAcceptance;
    const started = new Promise(resolve => { reading = resolve; });
    let accepting;
    const acceptanceStarted = new Promise(resolve => { accepting = resolve; });
    const cancel = vi.fn();
    const source = new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode(event("response.completed", { response: { usage: nativeUsage } }))); },
      pull() { reading(); }, cancel,
    }, { highWaterMark: 0 });
    io.fetch.mockResolvedValueOnce(new Response(source, { headers: { "content-type": "text/event-stream" } }));
    io.enqueue.mockImplementation(() => new Promise((resolve, reject) => { resolveAcceptance = resolve; rejectAcceptance = reject; accepting(); }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const caller = new AbortController();
    let settled = false;
    const pending = imageRoute(imageRequest(caller.signal, true)).then(response => { settled = true; return response; });
    await started;
    await new Promise(resolve => setImmediate(resolve));
    expect(settled).toBe(false); // no peek timeout has elapsed
    caller.abort(new Error("caller closed"));
    expect((await pending).status).toBe(499);
    await acceptanceStarted;
    expect(io.enqueue).toHaveBeenCalledOnce();
    expect(io.enqueue.mock.calls[0][0]).toMatchObject({ status: "aborted", tokens: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } });
    if (outcome === "rejected") {
      rejectAcceptance(Object.assign(new Error(privateDetail), { code: "SQLITE_FULL" }));
      await new Promise(resolve => setImmediate(resolve));
      expect(io.error).toHaveBeenCalledWith("IMAGE", "Durable usage acceptance failed");
    } else {
      resolveAcceptance({ accepted: true });
      await new Promise(resolve => setImmediate(resolve));
      expect(io.error).not.toHaveBeenCalled();
    }
    expect(cancel).toHaveBeenCalledOnce();
    expect(io.fetch).toHaveBeenCalledOnce();
    expect(io.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(io.markUnavailable).not.toHaveBeenCalled();
    expect(io.clearError).not.toHaveBeenCalled();
    expect(JSON.stringify([...io.error.mock.calls, ...consoleError.mock.calls])).not.toContain(privateDetail);
    await vi.advanceTimersByTimeAsync(200);
  });

  it("reports a late real acceptance failure from a no-auth image attempt", async () => {
    io.combo = ["sdwebui/fixture-image", "openai/gpt-image-1"];
    let accepting, rejectAcceptance;
    const acceptanceStarted = new Promise(resolve => { accepting = resolve; });
    io.fetch.mockResolvedValueOnce(Response.json({ images: ["aW1hZ2U="], usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } }));
    io.enqueue.mockImplementation(() => new Promise((_resolve, reject) => { rejectAcceptance = reject; accepting(); }));
    const caller = new AbortController();
    const pending = imageRoute(imageRequest(caller.signal));
    await acceptanceStarted;
    caller.abort(new Error("caller closed"));
    expect((await pending).status).toBe(499);
    rejectAcceptance(Object.assign(new Error(privateDetail), { code: "SQLITE_FULL" }));
    await vi.waitFor(() => expect(io.error).toHaveBeenCalledWith("IMAGE", "Durable usage acceptance failed after client cancellation"));
    expect(io.enqueue).toHaveBeenCalledOnce();
    expect(io.fetch).toHaveBeenCalledOnce();
    expect(io.getCredentials).not.toHaveBeenCalled();
    expect(io.markUnavailable).not.toHaveBeenCalled();
    expect(JSON.stringify(io.error.mock.calls)).not.toContain(privateDetail);
  });

  it("does not retry or cool an account when real image usage acceptance fails without cancellation", async () => {
    io.combo = ["openai/dall-e-3", "openai/gpt-image-1"];
    io.fetch.mockImplementation(async () => Response.json({ data: [{ b64_json: "aW1hZ2U=" }],
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } }));
    io.enqueue.mockRejectedValue(Object.assign(new Error(privateDetail), { code: "SQLITE_FULL" }));
    const response = await imageRoute(imageRequest());
    expect(response.status).toBe(503);
    expect(response.headers.get("x-should-retry")).toBe("false");
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe("usage_acceptance_failed");
    expect(text).not.toContain(privateDetail);
    expect(io.enqueue).toHaveBeenCalledOnce();
    expect(io.fetch).toHaveBeenCalledOnce();
    expect(io.markUnavailable).not.toHaveBeenCalled();
    expect(io.clearError).not.toHaveBeenCalled();
  });

  it("interrupts combo backoff after a real first-image failure without starting a replacement", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    io.combo = ["openai/dall-e-3", "openai/gpt-image-1"];
    let waiting;
    const inBackoff = new Promise(resolve => { waiting = resolve; });
    io.info.mockImplementation((scope, message) => { if (scope === "COMBO" && message.includes("transient 502, waiting")) waiting(); });
    io.fetch.mockImplementation(async () => Response.json({ error: { message: "request not allowed" } }, { status: 502 }));
    const caller = new AbortController();
    const pending = imageRoute(imageRequest(caller.signal));
    await inBackoff;
    expect(io.fetch).toHaveBeenCalledOnce();
    expect(io.markUnavailable).toHaveBeenCalledOnce(); // the preceding provider failure, not the abort
    caller.abort(new Error("caller closed"));
    expect((await pending).status).toBe(499);
    await vi.advanceTimersByTimeAsync(6000);
    expect(io.fetch).toHaveBeenCalledOnce();
    expect(io.markUnavailable).toHaveBeenCalledOnce();
    expect(io.info.mock.calls.some(([scope, message]) => scope === "COMBO" && message.includes("Trying model 2/"))).toBe(false);
  });
});

describe("public TTS combo caller cancellation", () => {
  it("interrupts the helper's backoff as well as the existing outer abort race", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    io.combo = ["openai/tts-1", "openai/tts-1-hd"];
    let waiting;
    const inBackoff = new Promise(resolve => { waiting = resolve; });
    io.info.mockImplementation((scope, message) => { if (scope === "COMBO" && message.includes("transient 502, waiting")) waiting(); });
    io.ttsCore.mockResolvedValue({ success: false, status: 502, error: "request not allowed",
      response: Response.json({ error: { message: "request not allowed" } }, { status: 502 }) });
    const caller = new AbortController();
    const pending = speechRoute(speechRequest(caller.signal));
    await inBackoff;
    expect(io.ttsCore).toHaveBeenCalledOnce();
    expect(io.markUnavailable).toHaveBeenCalledOnce();
    caller.abort(new Error("caller closed"));
    expect((await pending).status).toBe(499);
    await vi.advanceTimersByTimeAsync(6000);
    expect(io.ttsCore).toHaveBeenCalledOnce();
    expect(io.markUnavailable).toHaveBeenCalledOnce();
    expect(io.info.mock.calls.some(([scope, message]) => scope === "COMBO" && message.includes("Trying model 2/"))).toBe(false);
  });

  it("does not dispatch another model after abort while a legacy TTS provider is still finishing", async () => {
    io.combo = ["openai/tts-1", "openai/tts-1-hd"];
    let started, finish;
    const running = new Promise(resolve => { started = resolve; });
    io.ttsCore.mockImplementation(() => new Promise(resolve => { finish = resolve; started(); }));
    const caller = new AbortController();
    const pending = speechRoute(speechRequest(caller.signal));
    await running;
    caller.abort(new Error("caller closed"));
    expect((await pending).status).toBe(499);
    // This core has no signal contract: resolving it proves its late result
    // cannot start a replacement or change account health after cancellation.
    finish({ success: true, response: new Response("synthetic audio") });
    await new Promise(resolve => setImmediate(resolve));
    expect(io.ttsCore).toHaveBeenCalledOnce();
    expect(io.markUnavailable).not.toHaveBeenCalled();
    expect(io.fetch).not.toHaveBeenCalled();
  });
});
