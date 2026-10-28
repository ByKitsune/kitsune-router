import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real public routes and combo; no provider traffic or persistent state.
const fixture = vi.hoisted(() => ({ chat: vi.fn(), image: vi.fn(), tts: vi.fn(), select: vi.fn(), health: vi.fn(), network: vi.fn() }));
vi.mock("open-sse/index.js", () => ({}));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false, getProviderConnectionById: vi.fn() }));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/lib/rateLimit/inferenceLimit.js", () => ({ withInferenceLimit: async (_request, _key, run) => run() }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent() {} }));
vi.mock("@/lib/usageDb.js", () => ({ enqueueRequestUsage: vi.fn(async () => ({ accepted: true })) }));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: () => null, isValidApiKey: async () => true, getProviderCredentials: fixture.select,
  markAccountUnavailable: fixture.health, clearAccountError: vi.fn(),
}));
vi.mock("@/sse/services/model.js", () => ({
  getComboModels: async name => name === "fixture-combo" ? ["openai/first", "openai/second"] : null,
  getModelInfo: async name => {
    const slash = name.indexOf("/");
    return slash < 0 ? { provider: null, model: name } : { provider: name.slice(0, slash), model: name.slice(slash + 1) };
  },
  resolveModelCapabilities: async () => new Map(),
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken: async (_provider, credentials) => credentials, updateProviderCredentials: vi.fn() }));
vi.mock("@/sse/services/antigravityQuota.js", () => ({ handleAntigravityQuotaError: vi.fn(), clearAntigravityStrikes: vi.fn() }));
vi.mock("open-sse/services/projectId.js", () => ({ getProjectIdForConnection: vi.fn() }));
vi.mock("open-sse/handlers/chatCore.js", () => ({ handleChatCore: fixture.chat }));
vi.mock("open-sse/handlers/imageGenerationCore.js", () => ({ handleImageGenerationCore: fixture.image }));
vi.mock("open-sse/handlers/ttsCore.js", () => ({ handleTtsCore: fixture.tts }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug() {}, info() {}, warn() {}, error() {}, errorLine() {}, request() {}, maskKey: () => "synthetic",
}));

import { POST as chatRoute } from "@/app/api/v1/chat/completions/route.js";
import { POST as imageRoute } from "@/app/api/v1/images/generations/route.js";
import { POST as speechRoute } from "@/app/api/v1/audio/speech/route.js";
import { resetRateLimiter } from "@/lib/rateLimit/v1Limiter.js";

function terminal() {
  const response = Response.json({ error: { message: "quota exceeded", code: "rate_limit_exceeded" }, fixture: "retained" }, {
    status: 500, headers: { "x-should-retry": "false", "x-fixture": "retained" },
  });
  return { success: false, localFailure: true, status: 500, error: "quota exceeded", response, diagnostics: { code: "rate_limit_exceeded" } };
}
function request(path, body, signal) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
  fixture.select.mockResolvedValue({ connectionId: "synthetic", apiKey: "synthetic", providerSpecificData: {} });
  fixture.health.mockResolvedValue({ shouldFallback: false });
  fixture.network.mockImplementation(() => { throw new Error("Unexpected real network"); });
  vi.stubGlobal("fetch", fixture.network);
  for (const core of [fixture.chat, fixture.image, fixture.tts]) {
    core.mockReset().mockResolvedValueOnce(terminal()).mockResolvedValueOnce({ success: true, response: Response.json({ unexpected: "fallback" }) });
  }
});
afterEach(() => {
  try { expect(fixture.network).not.toHaveBeenCalled(); }
  finally { resetRateLimiter(); vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});

describe("terminal decisions through public combo routes", () => {
  it.each([
    ["chat", () => chatRoute(request("/v1/chat/completions", { model: "fixture-combo", stream: false, messages: [{ role: "user", content: "fixture" }] }))],
    ["image", () => imageRoute(request("/v1/images/generations", { model: "fixture-combo", prompt: "fixture" }))],
    ["tts", () => speechRoute(request("/v1/audio/speech", { model: "fixture-combo", input: "fixture" }))],
  ])("does not rotate or normalize a terminal %s attempt", async (kind, call) => {
    const response = await call();
    expect(response.status).toBe(500);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(response.headers.get("x-fixture")).toBe("retained");
    const payload = await response.json();
    expect(payload.error).toMatchObject({ message: "quota exceeded", code: "rate_limit_exceeded" });
    // The chat public boundary deliberately strips non-error payload fields.
    if (kind !== "chat") expect(payload.fixture).toBe("retained");
    expect(fixture[kind]).toHaveBeenCalledOnce();
    expect(fixture.health).not.toHaveBeenCalled();
  });

  it("allows caller abort to release public chat when a terminal error body stalls", async () => {
    let close, reading;
    const started = new Promise(resolve => { reading = resolve; });
    const body = new ReadableStream({ start(controller) { close = () => controller.close(); }, pull() { reading(); } }, { highWaterMark: 0 });
    fixture.chat.mockReset().mockResolvedValue({ success: false, status: 500, error: "fixture error",
      response: new Response(body, { status: 500, headers: { "x-should-retry": "false", "content-type": "application/json" } }) });
    const caller = new AbortController();
    const pending = chatRoute(request("/v1/chat/completions", { model: "fixture-combo", stream: false, messages: [{ role: "user", content: "fixture" }] }, caller.signal));
    let timer;
    try {
      await started;
      caller.abort(new Error("caller left"));
      const result = await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => resolve(null), 500); })]);
      expect(result?.status).toBe(499);
      expect(fixture.chat).toHaveBeenCalledOnce();
      expect(fixture.health).not.toHaveBeenCalled();
    } finally {
      clearTimeout(timer);
      try { close(); } catch {}
      await pending;
    }
  }, 10000);
});
