import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  // Exercise the existing env contract with small, independently checked limits.
  vi.stubEnv("V1_RATE_LIMIT_RPM", "8");
  vi.stubEnv("V1_RATE_LIMIT_BURST", "2");
  return {
    getSettings: vi.fn(),
    getCombos: vi.fn(),
    getComboByName: vi.fn(),
    getProviderCredentials: vi.fn(),
    isValidApiKey: vi.fn(),
    markAccountUnavailable: vi.fn(),
    clearAccountError: vi.fn(),
    checkAndRefreshToken: vi.fn(),
    updateProviderCredentials: vi.fn(),
    assertPublicUrlAsync: vi.fn(),
    fetchCore: vi.fn(),
    searchCore: vi.fn(),
    imageCore: vi.fn(),
    sttCore: vi.fn(),
    ttsCore: vi.fn(),
    videoCore: vi.fn(),
    saveRequestUsage: vi.fn(),
    logger: {
      request: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
      maskKey: vi.fn(() => "[redacted]"),
    },
  };
});

// Keep real handlers, model/registry resolution, combos, errors and limiter.
// Replace persistence/account mutation and external provider/DNS boundaries only.
vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
  isApiKeyRequired: (settings) => settings?.requireApiKey === true,
  getCombos: mocks.getCombos,
  getComboByName: mocks.getComboByName,
  getModelAliases: async () => ({}),
  getProviderNodes: async () => [],
}));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: (request) => {
    const authorization = request.headers.get("authorization");
    return authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : request.headers.get("x-api-key");
  },
  isValidApiKey: mocks.isValidApiKey,
  getProviderCredentials: mocks.getProviderCredentials,
  markAccountUnavailable: mocks.markAccountUnavailable,
  clearAccountError: mocks.clearAccountError,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: mocks.checkAndRefreshToken,
  updateProviderCredentials: mocks.updateProviderCredentials,
}));
vi.mock("@/shared/utils/ssrfGuard.js", () => ({ assertPublicUrlAsync: mocks.assertPublicUrlAsync }));
vi.mock("@/lib/usageDb.js", () => ({ saveRequestUsage: mocks.saveRequestUsage }));
vi.mock("@/sse/utils/logger.js", () => mocks.logger);
vi.mock("open-sse/handlers/fetch/index.js", () => ({ handleFetchCore: mocks.fetchCore }));
vi.mock("open-sse/handlers/search/index.js", () => ({ handleSearchCore: mocks.searchCore }));
vi.mock("open-sse/handlers/imageGenerationCore.js", () => ({ handleImageGenerationCore: mocks.imageCore }));
vi.mock("open-sse/handlers/sttCore.js", () => ({ handleSttCore: mocks.sttCore }));
vi.mock("open-sse/handlers/ttsCore.js", () => ({ handleTtsCore: mocks.ttsCore }));
vi.mock("open-sse/handlers/videoCore.js", async (importOriginal) => ({
  ...await importOriginal(),
  handleVideoProxyCore: mocks.videoCore,
}));

import { handleFetch } from "@/sse/handlers/fetch.js";
import { handleSearch } from "@/sse/handlers/search.js";
import { handleImageGeneration } from "@/sse/handlers/imageGeneration.js";
import { handleStt } from "@/sse/handlers/stt.js";
import { handleTts } from "@/sse/handlers/tts.js";
import { handleVideoCreate, handleVideoGet } from "@/sse/handlers/videoGeneration.js";
import { consume, rateLimitKey, resetRateLimiter } from "@/lib/rateLimit/v1Limiter.js";
import { GET as getModelInfo } from "@/app/api/v1/models/info/route.js";
import { GET as getVoices } from "@/app/api/v1/audio/voices/route.js";
import { OPTIONS as searchOptions } from "@/app/api/v1/search/route.js";
import { OPTIONS as imageOptions } from "@/app/api/v1/images/generations/route.js";
import { OPTIONS as speechOptions } from "@/app/api/v1/audio/speech/route.js";
import { OPTIONS as transcriptionOptions } from "@/app/api/v1/audio/transcriptions/route.js";
import { OPTIONS as fetchOptions } from "@/app/api/v1/web/fetch/route.js";
import { OPTIONS as videoOptions } from "@/app/api/v1/videos/generations/route.js";

const CLIENT_KEY = "inference-fixture-not-a-credential";
const START = Date.UTC(2026, 0, 1);
const account = {
  connectionId: "inference-fixture-account",
  connectionName: "Fixture",
  apiKey: "upstream-fixture-not-a-credential",
};
const coreMocks = [mocks.fetchCore, mocks.searchCore, mocks.imageCore, mocks.sttCore, mocks.ttsCore, mocks.videoCore];

function request(path, body, { key = CLIENT_KEY, headers = {}, signal } = {}) {
  const init = { headers: { ...headers }, signal };
  if (key) init.headers.authorization = `Bearer ${key}`;
  if (body !== undefined) {
    init.method = "POST";
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }
  return new Request(`http://localhost${path}`, init);
}

function transcription(options) {
  const body = new FormData();
  body.set("model", "openai/whisper-1");
  body.set("file", new Blob(["fixture audio"], { type: "audio/wav" }), "fixture.wav");
  return request("/v1/audio/transcriptions", body, options);
}

const endpoints = [
  { name: "web fetch", call: (options) => handleFetch(request("/v1/web/fetch", { provider: "jina-reader", url: "https://example.com/article", max_characters: 37 }, options)) },
  { name: "web search", call: (options) => handleSearch(request("/v1/search", { provider: "brave-search", query: "fixture", max_results: 2 }, options)) },
  { name: "image generation", call: (options) => handleImageGeneration(request("/v1/images/generations", { model: "openai/dall-e-3", prompt: "fixture", n: 1 }, options)) },
  { name: "transcription", call: (options) => handleStt(transcription(options)) },
  { name: "speech", call: (options) => handleTts(request("/v1/audio/speech", { model: "openai/tts-1", input: "fixture" }, options)) },
  ...["generations", "edits", "extensions"].map((action) => ({
    name: `video ${action}`,
    call: (options) => handleVideoCreate(request(`/v1/videos/${action}`, { model: "xai/grok-imagine-video", prompt: "fixture" }, options), action),
  })),
  { name: "video polling", call: (options) => handleVideoGet(request("/v1/videos/fixture-job", undefined, options), "fixture-job") },
];

function success() {
  return { success: true, response: Response.json({ fixture: "ok" }) };
}

function exhaustMinute(key = CLIENT_KEY) {
  const bucket = key ? rateLimitKey(key) : "ip:unknown";
  for (let i = 0; i < 8; i++) expect(consume(bucket, START + i * 1000).allowed).toBe(true);
  vi.setSystemTime(START + 8000);
}

function expectNoDispatchOrMutation() {
  expect(mocks.getProviderCredentials).not.toHaveBeenCalled();
  expect(mocks.getComboByName).not.toHaveBeenCalled();
  expect(mocks.getCombos).not.toHaveBeenCalled();
  expect(mocks.assertPublicUrlAsync).not.toHaveBeenCalled();
  expect(mocks.checkAndRefreshToken).not.toHaveBeenCalled();
  expect(mocks.updateProviderCredentials).not.toHaveBeenCalled();
  expect(mocks.markAccountUnavailable).not.toHaveBeenCalled();
  expect(mocks.clearAccountError).not.toHaveBeenCalled();
  expect(mocks.saveRequestUsage).not.toHaveBeenCalled();
  for (const core of coreMocks) expect(core).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  vi.stubEnv("TRUST_PROXY", "false");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected external fetch in offline test"); }));
  resetRateLimiter();
  mocks.getSettings.mockResolvedValue({ requireApiKey: true });
  mocks.isValidApiKey.mockResolvedValue(true);
  mocks.getCombos.mockResolvedValue([]);
  mocks.getComboByName.mockResolvedValue(null);
  mocks.getProviderCredentials.mockResolvedValue(account);
  mocks.checkAndRefreshToken.mockImplementation(async (_provider, credentials) => credentials);
  mocks.markAccountUnavailable.mockResolvedValue({ shouldFallback: false });
  mocks.clearAccountError.mockResolvedValue(undefined);
  mocks.assertPublicUrlAsync.mockResolvedValue(undefined);
  mocks.fetchCore.mockImplementation(async () => ({ success: true, data: { content: { text: "fixture" } } }));
  for (const core of coreMocks.slice(1)) core.mockImplementation(async () => success());
  mocks.saveRequestUsage.mockResolvedValue(undefined);
});

afterEach(() => {
  resetRateLimiter();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterAll(() => vi.unstubAllEnvs());

describe.each(endpoints)("inbound inference budget: $name", ({ call }) => {
  it("decorates an admitted response with one consumed request", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-limit")).toBe("8");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(response.headers.get("x-ratelimit-reset")).toBe("60");
    expect(consume(rateLimitKey(CLIENT_KEY), START + 1000).remaining).toBe(6);
  });

  it("rejects an exhausted key before DNS, combo/account selection or account mutation", async () => {
    exhaustMinute();
    const response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("52");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({ error: {
      message: expect.any(String),
      request_id: response.headers.get("x-request-id"),
      type: "rate_limit_error",
      code: "rate_limit_exceeded",
    } });
    expectNoDispatchOrMutation();
    const logArgs = Object.entries(mocks.logger)
      .filter(([name]) => name !== "maskKey") // masking inputs are not emitted logs
      .flatMap(([, logger]) => logger.mock.calls);
    expect(JSON.stringify(logArgs)).not.toContain(CLIENT_KEY);
  });

  it.each([null, "invalid-fixture-key"])("does not consume a request denied by auth (%s)", async (key) => {
    mocks.isValidApiKey.mockResolvedValue(false);
    const response = await call({ key });
    expect(response.status).toBe(401);
    expect(response.headers.has("x-ratelimit-limit")).toBe(false);
    expect(consume(key ? rateLimitKey(key) : "ip:unknown").remaining).toBe(7);
    expectNoDispatchOrMutation();
  });
});

describe("shared inference admission and response semantics", () => {
  it.each([
    ["web fetch", 0, mocks.fetchCore, "jina-reader", "webfetch:jina-reader"],
    ["web search", 1, mocks.searchCore, "brave-search", "websearch:brave-search"],
    ["image generation", 2, mocks.imageCore, "openai", "dall-e-3"],
    ["transcription", 3, mocks.sttCore, "openai", "whisper-1"],
    ["speech", 4, mocks.ttsCore, "openai", "tts-1"],
    ["video generations", 5, mocks.videoCore, "xai", "grok-imagine-video"],
    ["video edits", 6, mocks.videoCore, "xai", "grok-imagine-video"],
    ["video extensions", 7, mocks.videoCore, "xai", "grok-imagine-video"],
  ])("charges %s only once across account fallback, keeping upstream lock scopes", async (_name, index, core, provider, lockScope) => {
    mocks.markAccountUnavailable.mockResolvedValue({ shouldFallback: true });
    mocks.getProviderCredentials
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce({ ...account, connectionId: "fallback-fixture-account" });
    core.mockResolvedValueOnce({ success: false, status: 401, error: "fixture auth expired", response: Response.json({ error: "fixture auth expired" }, { status: 401 }) });
    const response = await endpoints[index].call({ headers: { "x-connection-id": "preferred-fixture-account", "idempotency-key": "fixture-idempotency" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(consume(rateLimitKey(CLIENT_KEY), START + 1000).remaining).toBe(6);
    expect(core).toHaveBeenCalledTimes(2);
    expect(mocks.getProviderCredentials).toHaveBeenCalledTimes(2);
    expect(mocks.getProviderCredentials.mock.calls[0][0]).toBe(provider);
    expect(mocks.getProviderCredentials.mock.calls[0][2]).toBe(lockScope);
    expect(mocks.markAccountUnavailable).toHaveBeenCalledWith(account.connectionId, 401, "fixture auth expired", provider, lockScope);
    if (index >= 5) {
      expect(response.headers.get("x-zenrouter-connection-id")).toBe("fallback-fixture-account");
      expect(core.mock.calls[1][0].idempotencyKey).toBe("fixture-idempotency");
    }
  });

  it.each([
    ["web fetch", mocks.fetchCore, ["jina-reader", "ollama"], (combo) => handleFetch(request("/v1/web/fetch", { provider: combo, url: "https://example.com/article" }))],
    ["web search", mocks.searchCore, ["brave-search", "tavily"], (combo) => handleSearch(request("/v1/search", { provider: combo, query: "fixture" }))],
    ["image generation", mocks.imageCore, ["openai/dall-e-3", "openai/gpt-image-1"], (combo) => handleImageGeneration(request("/v1/images/generations", { model: combo, prompt: "fixture" }))],
    ["speech", mocks.ttsCore, ["openai/tts-1", "openai/tts-1-hd"], (combo) => handleTts(request("/v1/audio/speech", { model: combo, input: "fixture" }))],
  ])("charges %s only once across real combo fallback", async (_name, core, models, call) => {
    const combo = { name: "inference-fixture-combo", models };
    mocks.getCombos.mockResolvedValue([combo]);
    mocks.getComboByName.mockResolvedValue(combo);
    core.mockResolvedValueOnce({ success: false, status: 401, error: "fixture auth expired", response: Response.json({ error: "fixture auth expired" }, { status: 401 }) });
    const response = await call(combo.name);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(consume(rateLimitKey(CLIENT_KEY), START + 1000).remaining).toBe(6);
    expect(core).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["search", () => handleSearch(request("/v1/search", { provider: "searxng", query: "fixture" }, { key: null }))],
    ["image", () => handleImageGeneration(request("/v1/images/generations", { model: "sdwebui/sdxl-base-1.0", prompt: "fixture" }, { key: null }))],
    ["speech", () => handleTts(request("/v1/audio/speech", { model: "edge-tts/en-US-AriaNeural", input: "fixture" }, { key: null }))],
  ])("meters a no-auth upstream %s provider without inventing an account", async (_name, call) => {
    mocks.getSettings.mockResolvedValue({ requireApiKey: false });
    const admitted = await call();
    expect(admitted.status).toBe(200);
    expect(admitted.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(mocks.getProviderCredentials).not.toHaveBeenCalled();
    resetRateLimiter();
    exhaustMinute(null);
    vi.clearAllMocks();
    expect((await call()).status).toBe(429);
    expectNoDispatchOrMutation();
  });

  it("preserves explicit fetch/search caps at the dispatch boundary", async () => {
    await endpoints[0].call();
    await endpoints[1].call();
    expect(mocks.fetchCore.mock.calls[0][0].maxCharacters).toBe(37);
    expect(mocks.searchCore.mock.calls[0][0].body.max_results).toBe(2);
  });

  it("decorates post-auth validation errors before any provider dispatch", async () => {
    const response = await handleImageGeneration(request("/v1/images/generations", { model: "openai/dall-e-3" }));
    expect(response.status).toBe(400);
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect((await response.json()).error.message).toBe("Missing required field: prompt");
    expectNoDispatchOrMutation();
  });

  it("uses the same hashed key budget across modalities, IPs and the existing chat limiter", async () => {
    expect(consume(rateLimitKey(CLIENT_KEY)).remaining).toBe(7); // existing chat's bucket
    for (let i = 0; i < 7; i++) {
      vi.setSystemTime(START + (i + 1) * 1000);
      const response = await endpoints[i].call({ headers: { "x-forwarded-for": `198.51.100.${i + 1}` } });
      expect(response.headers.get("x-ratelimit-remaining")).toBe(String(6 - i));
    }
    vi.clearAllMocks();
    vi.setSystemTime(START + 8000);
    expect((await endpoints[7].call()).status).toBe(429);
    expectNoDispatchOrMutation();
  });

  it("returns Retry-After at the minute boundary and admits at the exact reset", async () => {
    exhaustMinute();
    vi.setSystemTime(START + 59_999);
    const denied = await endpoints[1].call();
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("1");
    expect(denied.headers.get("x-ratelimit-reset")).toBe("1");
    expectNoDispatchOrMutation();
    vi.setSystemTime(START + 60_000);
    const admitted = await endpoints[1].call();
    expect(admitted.status).toBe(200);
    expect(admitted.headers.get("x-ratelimit-remaining")).toBe("7");
  });

  it("shares the burst guard across modalities without consuming denied requests", async () => {
    expect((await endpoints[0].call()).status).toBe(200);
    expect((await endpoints[1].call()).status).toBe(200);
    vi.clearAllMocks();
    vi.setSystemTime(START + 999);
    const denied = await endpoints[2].call();
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("1");
    expect(denied.headers.get("x-ratelimit-remaining")).toBe("6");
    expectNoDispatchOrMutation();
    vi.setSystemTime(START + 1000);
    expect((await endpoints[2].call()).headers.get("x-ratelimit-remaining")).toBe("5");
  });

  it("uses the trusted peer IP, not spoofed forwarding headers, when API keys are optional", async () => {
    mocks.getSettings.mockResolvedValue({ requireApiKey: false });
    vi.stubEnv("ZENROUTER_PEER_TOKEN", "peer-fixture-not-a-credential");
    const peer = { "x-zen-peer-token": "peer-fixture-not-a-credential", "x-zen-real-ip": "198.51.100.10" };
    expect((await endpoints[3].call({ key: null, headers: peer })).headers.get("x-ratelimit-remaining")).toBe("7");
    vi.setSystemTime(START + 1000);
    expect((await endpoints[4].call({ key: null, headers: { ...peer, "x-forwarded-for": "203.0.113.2" } })).headers.get("x-ratelimit-remaining")).toBe("6");
    expect(consume("ip:198.51.100.10").remaining).toBe(5);
    expect(consume("ip:203.0.113.2").remaining).toBe(7);
  });

  it("does not let unauthenticated clients rotate spoofed peer/XFF identities", async () => {
    mocks.getSettings.mockResolvedValue({ requireApiKey: false });
    for (let i = 0; i < 2; i++) {
      const response = await endpoints[i].call({ key: null, headers: { "x-zen-real-ip": `198.51.100.${i}`, "x-forwarded-for": `203.0.113.${i}` } });
      expect(response.headers.get("x-ratelimit-remaining")).toBe(String(7 - i));
    }
    expect((await endpoints[2].call({ key: null })).status).toBe(429);
  });

  it("attaches headers to a live image SSE response without reading, teeing or buffering it", async () => {
    let source;
    const cancelled = vi.fn();
    const body = new ReadableStream({ start(controller) { source = controller; }, cancel: cancelled }, { highWaterMark: 0 });
    const upstream = new Response(body, { headers: { "content-type": "text/event-stream", "x-upstream": "fixture" } });
    const methods = ["text", "json", "arrayBuffer", "clone"];
    for (const method of methods) vi.spyOn(upstream, method).mockImplementation(() => { throw new Error("SSE must not be buffered"); });
    mocks.imageCore.mockResolvedValue({ success: true, response: upstream });
    const response = await endpoints[2].call({ headers: { accept: "text/event-stream" } });
    expect(response.body).toBe(body);
    expect(body.locked).toBe(false);
    expect(upstream.bodyUsed).toBe(false);
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("x-upstream")).toBe("fixture");
    for (const method of methods) expect(upstream[method]).not.toHaveBeenCalled();
    expect(mocks.imageCore.mock.calls[0][0]).toMatchObject({ streamToClient: true, body: { n: 1 } });
    source.enqueue(new TextEncoder().encode('data: {"image":"fixture"}\n\n'));
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: {"image":"fixture"}\n\n');
    await reader.cancel("caller disconnected");
    expect(cancelled).toHaveBeenCalledWith("caller disconnected");
  });

  it("keeps upstream error status, diagnostics and Retry-After while adding inbound headers", async () => {
    const upstream = new Response('{"error":{"code":"upstream_fixture"}}', {
      status: 429, statusText: "Upstream quota", headers: { "retry-after": "99", "x-upstream": "fixture" },
    });
    mocks.searchCore.mockResolvedValue({ success: false, status: 429, error: "quota", errorScope: "request", response: upstream });
    const response = await endpoints[1].call();
    expect(response.status).toBe(429);
    expect(response.statusText).toBe("Upstream quota");
    expect(response.headers.get("retry-after")).toBe("99");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(await response.json()).toEqual({ error: { code: "upstream_fixture" } });
    expect(mocks.markAccountUnavailable).not.toHaveBeenCalled();
  });

  it("preserves binary audio bytes and content headers", async () => {
    const bytes = new Uint8Array([0, 255, 1, 129, 42]);
    const upstream = new Response(bytes, { status: 206, headers: { "content-type": "audio/mpeg", "content-length": "5", "content-range": "bytes 0-4/5" } });
    mocks.ttsCore.mockResolvedValue({ success: true, response: upstream });
    const response = await endpoints[4].call();
    expect(response.body).toBe(upstream.body);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-length")).toBe("5");
    expect(response.headers.get("content-range")).toBe("bytes 0-4/5");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("preserves video caller abort signals and propagates the original error", async () => {
    const controller = new AbortController();
    const reason = new Error("fixture caller disconnected");
    mocks.videoCore.mockImplementation(async ({ signal }) => {
      expect(signal.aborted).toBe(false);
      controller.abort(reason);
      signal.throwIfAborted();
    });
    await expect(endpoints[5].call({ signal: controller.signal })).rejects.toBe(reason);
    expect(mocks.videoCore).toHaveBeenCalledTimes(1);
    expect(mocks.getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(mocks.markAccountUnavailable).not.toHaveBeenCalled();
  });

  it("leaves passive catalog, voices and OPTIONS routes outside the inference budget", async () => {
    const catalog = await getModelInfo(request("/v1/models/info?id=brave/search"));
    expect(catalog.status).toBe(200);
    global.fetch.mockResolvedValueOnce(Response.json({ voices: [{ id: "fixture-voice", name: "Fixture", lang: "en-US" }] }));
    const voices = await getVoices(request("/v1/audio/voices?provider=edge-tts&lang=en-US"));
    expect(voices.status).toBe(200);
    expect((await voices.json()).data[0].id).toBe("fixture-voice");
    expect(global.fetch).toHaveBeenCalledWith("http://localhost/api/media-providers/tts/voices?provider=edge-tts&lang=en-US", { cache: "no-store" });
    global.fetch.mockClear();
    for (const options of [searchOptions, imageOptions, speechOptions, transcriptionOptions, fetchOptions, videoOptions]) {
      expect((await options()).status).toBe(200);
    }
    expect(consume(rateLimitKey(CLIENT_KEY)).remaining).toBe(7);
    expectNoDispatchOrMutation();
  });
});
