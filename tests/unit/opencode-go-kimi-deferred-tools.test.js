import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real Messages entry point, model resolution, account selection/fallback,
// translator, executor and JSON wire. Only storage and network are synthetic.
// Go V2 documents Kimi's native Chat endpoint and plan-quota references:
// https://opencode.ai/v2/docs/console/go/
// Its listed Chat URL is https://opencode.ai/inference/go/openai/v1/chat/completions.
// Provider-scoped capabilities come from the captured models.dev catalog
// (2026-10-29, sha256 a0af14e6709252ef4da167c43df2de1926e6116b0204859fe3c9e865dea5a38a).
// The /zen URL asserted below is the existing repository configuration, not a
// claim that its legacy compatibility or any account entitlement was verified.
// Free-tier Chat is not inferred to work outside OpenCode:
// https://opencode.ai/v2/docs/console/api/inference/#authentication
const io = vi.hoisted(() => ({
  connections: [], combo: null, combos: {}, aliases: {}, settings: {}, declared: {}, sent: [],
  getProviderConnections: vi.fn(), updateProviderConnection: vi.fn(),
  refresh: vi.fn(), unexpectedDb: vi.fn(), unexpectedNetwork: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: io.getProviderConnections,
  getProviderConnectionById: vi.fn(async id => structuredClone(io.connections.find(c => c.id === id) || null)),
  updateProviderConnection: io.updateProviderConnection,
  getSettings: vi.fn(async () => io.settings),
  isApiKeyRequired: () => false, validateApiKey: vi.fn(async () => false),
  getProxyPools: vi.fn(async () => []), getModelAliases: vi.fn(async () => io.aliases),
  getProviderNodes: vi.fn(async () => []), getComboByName: vi.fn(async name => io.combos[name] || (name === io.combo?.name ? io.combo : null)),
}));
vi.mock("../../src/lib/db/repos/aliasRepo.js", () => ({ getCustomModels: vi.fn(async () => []) }));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: io.unexpectedDb, getAdapterSync: io.unexpectedDb }));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: vi.fn(async () => []) }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn(async () => ({})), pickProxyPoolId: vi.fn() }));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken: io.refresh, updateProviderCredentials: vi.fn() }));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: vi.fn(async (provider, model) => io.declared[`${provider}/${model}`]) }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}), enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent: vi.fn() }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: vi.fn(async () => null) }));
vi.mock("@/lib/rateLimit/v1Limiter.js", () => ({
  consume: () => ({ allowed: true }), rateLimitKey: () => "synthetic", rateLimitHeaders: () => ({}), rateLimitedResponse: vi.fn(),
}));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), nextTag: () => "", tagForSession: () => "",
  line: vi.fn(), errorLine: vi.fn(), fmtThink: () => "auto", request: vi.fn(), response: vi.fn(), stream: vi.fn(), maskKey: () => "synthetic",
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(), logOpenAIRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn(async (url, init) => {
  io.sent.push({ url: String(url), headers: Object.fromEntries(new Headers(init.headers)), body: JSON.parse(init.body) });
  if (String(url).includes("api.kimi.com")) return Response.json({
    id: "msg_fixture", type: "message", role: "assistant", model: "k3",
    content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
  });
  return Response.json({
    id: "chatcmpl-fixture", object: "chat.completion", model: "kimi-k3.1-pro",
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}) }));

import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { getModelAliases, getComboByName } from "@/lib/localDb";
import { POST as messagesPost } from "../../src/app/api/v1/messages/route.js";
import { POST as chatPost } from "../../src/app/api/v1/chat/completions/route.js";

const MESSAGE = "This destination cannot preserve tool_addition semantics; remove the block or select a route that supports mid-conversation tool changes.";
const addition = (name, extra = {}) => ({ type: "tool_addition", tool: { type: "tool_definition", definition: {
  name, description: "Synthetic tool", input_schema: { type: "object", properties: { path: { type: "string" } } }, ...extra,
} } });
const text = value => ({ type: "text", text: value });
const existing = { name: "lookup", description: "Existing tool", input_schema: { type: "object", properties: {} } };
const base = (model, messages) => ({ model, stream: false, max_tokens: 37, tools: [existing], messages });
const request = (body, extraHeaders = {}, signal = undefined) => new Request("http://localhost:20128/v1/messages", {
  method: "POST", headers: { "content-type": "application/json", "anthropic-version": "2023-06-01",
    "anthropic-beta": "inline-tools-2026-09-15", "user-agent": "synthetic-client", ...extraHeaders }, body: JSON.stringify(body), signal,
});
const warmup = model => base(model, [
  { role: "user", content: "Warmup" }, { role: "assistant", content: "Ready" },
  { role: "system", content: [addition("new")] }, { role: "user", content: "Continue" },
]);
const connection = (id, provider = "opencode-go") => ({ id, provider, authType: "apikey", apiKey: `synthetic-${id}`, isActive: true, providerSpecificData: {} });
const healthWrites = () => io.updateProviderConnection.mock.calls.filter(([, patch]) =>
  Object.keys(patch).some(key => key.startsWith("modelLock_") || ["lastError", "lastErrorAt", "errorCode", "backoffLevel", "testStatus"].includes(key)));

beforeEach(() => {
  vi.clearAllMocks();
  io.connections = [connection("account-a"), connection("account-b")];
  io.combo = null;
  io.combos = {};
  io.aliases = {};
  io.settings = { requireApiKey: false, fallbackStrategy: "fill-first", quotaAwareSelection: false, comboStrategy: "fallback" };
  io.declared = {};
  io.sent = [];
  io.getProviderConnections.mockImplementation(async ({ provider, isActive } = {}) => io.connections
    .filter(c => (!provider || c.provider === provider) && (!isActive || c.isActive)).map(c => structuredClone(c)));
  io.updateProviderConnection.mockImplementation(async (id, patch) => {
    const found = io.connections.find(c => c.id === id);
    Object.assign(found, structuredClone(patch));
    return structuredClone(found);
  });
  io.refresh.mockImplementation(async (_provider, credentials) => credentials);
  io.unexpectedDb.mockImplementation(() => { throw new Error("Unexpected database"); });
  io.unexpectedNetwork.mockImplementation(() => { throw new Error("Unexpected non-fixture network"); });
  vi.stubGlobal("fetch", io.unexpectedNetwork);
});
afterEach(() => {
  try { expect(io.unexpectedDb).not.toHaveBeenCalled(); expect(io.unexpectedNetwork).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

describe("Go Kimi deferred tools at the public Messages boundary", () => {
  it.each([
    ["ocg/kimi-k3.1-pro", [{ role: "system", content: [text("before"), addition("fresh")] }, { role: "user", content: "Continue" }], "messages.0.content.1"],
    ["opencode-go/kimi-k3-1-pro", [{ role: "user", content: [text("before"), { type: "tool_addition", tool: {} }] }], "messages.0.content.1"],
    ["ocg/kimi-k3.1-pro(high)", [{ role: "user", content: "earlier" }, { role: "system", content: [addition("first"), addition("second")] }], "messages.1.content.0"],
    ["ocg/kimi-k3.1-pro(low)", [{ role: "system", content: [addition("low_effort")] }, { role: "user", content: "Continue" }], "messages.0.content.0"],
    ["ocg/kimi-k3-1-pro(auto)", [{ role: "system", content: [addition("auto_effort")] }, { role: "user", content: "Continue" }], "messages.0.content.0"],
    ["ocg/kimi-k3-1-pro(max)", [{ role: "system", content: [text("x"), addition("lookup", { description: "Conflicting replacement" })] }], "messages.0.content.1"],
    ["ocg/kimi-k3.1-pro", [{ role: "system", content: [text("x"), addition("same"), addition("same")] }], "messages.0.content.1"],
    ["ocg/kimi-k3.1-pro", [{ role: "user", content: [text("x"), addition("", { input_schema: [] }), addition("valid")] }], "messages.0.content.1"],
    ["ocg/kimi-k3.1-pro", [{ role: "system", content: [addition("same")] }, { role: "user", content: [addition("same", { description: "later" })] }], "messages.0.content.0"],
    ["ocg/kimi-k3.1-pro", [{ role: "system", content: [text("x"), { type: "tool_addition", tool: { type: "tool_reference", name: "lookup" } }] }], "messages.0.content.1"],
    ["ocg/kimi-k3.1-pro", [{ role: "system", content: addition("singleton") }], "messages.0.content"],
    // Audio is dropped by earlier modality policy; the diagnostic must still
    // point to the original input rather than its post-filter position.
    ["ocg/kimi-k3.1-pro", [{ role: "user", content: [text("before"), { type: "input_audio", input_audio: { data: "AA==", format: "wav" } }, addition("after_audio")] }], "messages.0.content.2"],
  ])("rejects additions on %s without dispatch or account penalties", async (model, messages, param) => {
    const body = base(model, messages);
    const snapshot = structuredClone(body);
    const response = await messagesPost(request(body));
    expect(response.status).toBe(400);
    const error = (await response.json()).error;
    expect(error).toMatchObject({ type: "invalid_request_error", code: "unsupported_parameter", param, message: MESSAGE });
    expect(error.request_id).toBe(response.headers.get("x-request-id"));
    expect(body).toEqual(snapshot);
    expect(io.sent).toEqual([]);
    expect(io.refresh).toHaveBeenCalledOnce();
    expect(io.refresh.mock.calls[0][1].connectionId).toBe("account-a");
    expect(healthWrites()).toEqual([]);
    expect(checkFallbackError(400, error)).toMatchObject({ shouldFallback: false, cooldownMs: 0 });
  });

  it("rejects an addition in the invalid top-level system location", async () => {
    const body = { ...base("ocg/kimi-k3.1-pro", [{ role: "user", content: "Continue" }]), system: [text("instructions"), addition("wrong-location")] };
    const response = await messagesPost(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "system.1", message: MESSAGE });
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("does not bypass an addition on a Claude CLI warmup-shaped request", async () => {
    const body = warmup("ocg/kimi-k3.1-pro");
    const response = await messagesPost(request(body, { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.2.content.0", message: MESSAGE });
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("does not bypass a saved model alias resolving to Go Kimi", async () => {
    io.aliases = { "saved-route": "ocg/kimi-k3-1-pro(high)" };
    const response = await messagesPost(request(warmup("saved-route"), { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.2.content.0", message: MESSAGE });
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("does not bypass a combo whose only model is Go Kimi", async () => {
    io.combo = { name: "fixture-combo", models: ["ocg/kimi-k3.1-pro"] };
    const response = await messagesPost(request(warmup(io.combo.name), { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.2.content.0", message: MESSAGE });
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("resolves a Go alias inside nested combos before bypassing", async () => {
    io.aliases = { "saved-route": "ocg/kimi-k3.1-pro" };
    io.combos = {
      outer: { name: "outer", models: ["inner"] },
      inner: { name: "inner", models: ["saved-route"] },
    };
    const response = await messagesPost(request(warmup("outer"), { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.2.content.0", message: MESSAGE });
    expect(io.refresh).toHaveBeenCalledOnce();
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it.each([
    [["kimi/k3", "ocg/kimi-k3.1-pro"], ["kimi"]],
    [["ocg/kimi-k3.1-pro", "kimi/k3"], ["opencode-go", "kimi"]],
  ])("keeps shortcut behavior through mixed combo members %j", async (models, attempted) => {
    io.connections.push(connection("native-kimi", "kimi"));
    io.combo = { name: "mixed-combo", models };
    const response = await messagesPost(request(warmup(io.combo.name), { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(200);
    expect(io.refresh.mock.calls.map(([provider]) => provider)).toEqual(attempted);
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("checks an eligible Go capacity adapter before taking an unrelated shortcut", async () => {
    io.settings.capacityAdapter = { vision: { enabled: true, models: ["ocg/kimi-k3.1-pro"] } };
    io.declared = {
      "openai/gpt-4o": { vision: false },
      "opencode-go/kimi-k3.1-pro": { vision: true },
    };
    io.connections.push(connection("openai-account", "openai"));
    const body = warmup("openai/gpt-4o");
    body.messages.push({ role: "user", content: [{ type: "image", source: {
      type: "base64", media_type: "image/png", data: "iVBORw0KGgo=",
    } }] });
    const response = await messagesPost(request(body, { "user-agent": "claude-cli/synthetic" }));
    // The adapter rejects the addition; the unrelated fallback keeps its
    // existing shortcut. Neither attempt dispatches upstream or locks accounts.
    expect(response.status).toBe(200);
    expect(io.refresh.mock.calls.map(([provider]) => provider)).toEqual(["opencode-go", "openai"]);
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("does not bypass a fusion combo with a separately configured Go Kimi judge", async () => {
    io.connections.push(connection("native-kimi", "kimi"));
    io.combo = { name: "fusion-combo", models: ["kimi/k3", "kimi/k2"] };
    io.settings.comboStrategies = { "fusion-combo": { fallbackStrategy: "fusion", judgeModel: "ocg/kimi-k3.1-pro" } };
    const response = await messagesPost(request(warmup(io.combo.name), { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.2.content.0", message: MESSAGE });
    expect(io.refresh.mock.calls.map(([provider]) => provider).sort()).toEqual(["kimi", "kimi", "opencode-go"]);
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("does not treat an unused capacity adapter as a fusion member", async () => {
    io.combo = { name: "fusion-combo", models: ["openai/gpt-4o", "openai/gpt-4o-mini"] };
    io.settings.comboStrategies = { "fusion-combo": { fallbackStrategy: "fusion", judgeModel: "openai/gpt-4o" } };
    io.settings.capacityAdapter = { vision: { enabled: true, models: ["ocg/kimi-k3.1-pro"] } };
    io.declared = {
      "openai/gpt-4o": { vision: false }, "openai/gpt-4o-mini": { vision: false },
      "opencode-go/kimi-k3.1-pro": { vision: true },
    };
    const body = warmup(io.combo.name);
    body.messages.push({ role: "user", content: [{ type: "image", source: {
      type: "base64", media_type: "image/png", data: "iVBORw0KGgo=",
    } }] });
    const response = await messagesPost(request(body, { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(200);
    expect(io.refresh).not.toHaveBeenCalled();
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("keeps the shortcut when fusion's media filter leaves only one non-Go panel model", async () => {
    io.combo = { name: "fusion-combo", models: ["openai/gpt-4o", "openai/gpt-4o-mini"] };
    io.settings.comboStrategies = { "fusion-combo": { fallbackStrategy: "fusion", judgeModel: "ocg/kimi-k3.1-pro" } };
    io.declared = { "openai/gpt-4o": { vision: true }, "openai/gpt-4o-mini": { vision: false } };
    const body = warmup(io.combo.name);
    body.messages.push({ role: "user", content: [{ type: "image", source: {
      type: "base64", media_type: "image/png", data: "iVBORw0KGgo=",
    } }] });
    const response = await messagesPost(request(body, { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(200);
    expect(io.refresh).not.toHaveBeenCalled();
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("keeps the shortcut for single-member fusion, where no judge is called", async () => {
    io.combo = { name: "fusion-combo", models: ["kimi/k3"] };
    io.settings.comboStrategies = { "fusion-combo": { fallbackStrategy: "fusion", judgeModel: "ocg/kimi-k3.1-pro" } };
    const response = await messagesPost(request(warmup(io.combo.name), { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(200);
    expect(io.refresh).not.toHaveBeenCalled();
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("stops a pending shortcut alias lookup promptly when the caller aborts", async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    getComboByName.mockImplementationOnce(() => waiting);
    const controller = new AbortController();
    const pending = messagesPost(request(warmup("saved-route"), { "user-agent": "claude-cli/synthetic" }, controller.signal));
    await vi.waitFor(() => expect(getComboByName).toHaveBeenCalledOnce());
    controller.abort(new Error("synthetic caller cancellation"));
    const response = await pending;
    expect(response.status).toBe(499);
    release(null);
    await Promise.resolve();
    expect(io.refresh).not.toHaveBeenCalled();
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("resolves the same saved alias and combo normally when no shortcut matches", async () => {
    io.aliases = { "saved-kimi": "ocg/kimi-k3.1-pro" };
    io.combo = { name: "go-kimi-combo", models: ["ocg/kimi-k3.1-pro"] };
    for (const model of ["saved-kimi", "go-kimi-combo"]) {
      const response = await messagesPost(request(base(model, [{ role: "system", content: [addition("new")] }, { role: "user", content: "Continue" }])));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.0.content.0", message: MESSAGE });
      expect(io.sent).toEqual([]);
      expect(healthWrites()).toEqual([]);
    }
  });

  it("reports the original block index even when a Go capacity-adapter attempt compacts history", async () => {
    io.settings.capacityAdapter = { vision: { enabled: true, models: ["ocg/kimi-k3-1-pro"] } };
    // Model spellings deliberately have different operator-declared capacities
    // to exercise the adapter path with a small synthetic context window.
    io.declared = {
      "opencode-go/kimi-k3.1-pro": { vision: false, contextWindow: 64 },
      "opencode-go/kimi-k3-1-pro": { vision: true, contextWindow: 64 },
    };
    const image = { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } };
    const body = base("ocg/kimi-k3.1-pro", [
      { role: "user", content: "Warmup" }, { role: "assistant", content: "Ready" },
      { role: "user", content: "Earlier 1" }, { role: "assistant", content: "Earlier 2" },
      { role: "user", content: "Earlier 3" }, { role: "assistant", content: "Earlier 4" },
      { role: "user", content: "Earlier 5" }, { role: "assistant", content: "Earlier 6" },
      { role: "system", content: [addition("new")] },
      { role: "user", content: [text("x".repeat(400)), image] },
    ]);
    const before = structuredClone(body);
    const response = await messagesPost(request(body, { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.8.content.0", message: MESSAGE });
    expect(io.refresh.mock.calls.map(([, c]) => c.connectionId)).toEqual(["account-a", "account-a"]);
    expect(body).toEqual(before);
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("preserves existing shortcuts for unrelated Go models, saved aliases, and combos", async () => {
    // These alias and combo names are identical to the Go Kimi cases above;
    // their persisted targets, not the raw request, determine which is related.
    io.aliases = { "saved-route": "ocg/glm-5.3" };
    io.combo = { name: "fixture-combo", models: ["ocg/glm-5.3"] };
    for (const model of ["ocg/glm-5.3", "saved-route", "fixture-combo"]) {
      const response = await messagesPost(request(warmup(model), { "user-agent": "claude-cli/synthetic" }));
      expect(response.status).toBe(200);
      expect(io.sent).toEqual([]);
      expect(healthWrites()).toEqual([]);
    }
    expect(getModelAliases).toHaveBeenCalled();
    expect(getComboByName).toHaveBeenCalled();
    expect(io.refresh).not.toHaveBeenCalled();
  });

  it("does not infer the Messages endpoint from a Claude CLI user agent", async () => {
    const body = warmup("ocg/kimi-k3.1-pro");
    const response = await chatPost(new Request("http://localhost:20128/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", "user-agent": "claude-cli/synthetic" }, body: JSON.stringify(body),
    }));
    // The existing shortcut remains unchanged for this non-Messages source.
    expect(response.status).toBe(200);
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("does not reinterpret a tool_addition-shaped value inside tool arguments or results", async () => {
    const body = base("ocg/kimi-k3.1-pro", [
      { role: "user", content: "Warmup" },
      { role: "assistant", content: [{ type: "tool_use", id: "a", name: "lookup", input: { literal: addition("example") } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: JSON.stringify(addition("example")) }] },
    ]);
    const response = await messagesPost(request(body, { "user-agent": "claude-cli/synthetic" }));
    expect(response.status).toBe(200);
    expect(getModelAliases).not.toHaveBeenCalled();
    expect(getComboByName).not.toHaveBeenCalled();
    expect(io.sent).toEqual([]);
  });

  it.each([false, true])("validates a direct chatCore attempt before its own Claude CLI bypass (stream=%s)", async stream => {
    const body = warmup("kimi-k3.1-pro");
    body.stream = stream;
    const before = structuredClone(body);
    const result = await handleChatCore({
      body, modelInfo: { provider: "opencode-go", model: "kimi-k3.1-pro" },
      credentials: { apiKey: "synthetic-account-a", providerSpecificData: {} },
      connectionId: "account-a", userAgent: "claude-cli/synthetic", sourceFormatOverride: FORMATS.CLAUDE,
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    });
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.2.content.0", message: MESSAGE });
    expect(body).toEqual(before);
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it.each([
    [FORMATS.CLAUDE, [{ role: "user", content: "Warmup" }]],
    [FORMATS.OPENAI, warmup("kimi-k3.1-pro").messages],
  ])("keeps the direct chatCore shortcut for unrelated %s input", async (sourceFormat, messages) => {
    const result = await handleChatCore({
      body: base("kimi-k3.1-pro", messages), modelInfo: { provider: "opencode-go", model: "kimi-k3.1-pro" },
      credentials: { apiKey: "synthetic-account-a", providerSpecificData: {} },
      connectionId: "account-a", userAgent: "claude-cli/synthetic", sourceFormatOverride: sourceFormat,
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    });
    expect(result.response.status).toBe(200);
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
  });

  it("keeps the selected fallback account healthy and reuses it for a normal request", async () => {
    const locked = new Date(Date.now() + 60_000).toISOString();
    io.connections[0]["modelLock_kimi-k3.1-pro"] = locked;
    const invalid = await messagesPost(request(base("ocg/kimi-k3.1-pro", [{ role: "system", content: [addition("new")] }])));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toMatchObject({ code: "unsupported_parameter", param: "messages.0.content.0", message: MESSAGE });
    expect(io.refresh.mock.calls.map(([, c]) => c.connectionId)).toEqual(["account-b"]);
    expect(io.sent).toEqual([]);
    expect(healthWrites()).toEqual([]);
    expect(io.connections[0]["modelLock_kimi-k3.1-pro"]).toBe(locked);

    const valid = await messagesPost(request(base("ocg/kimi-k3.1-pro", [{ role: "user", content: "Continue" }])));
    expect(valid.status).toBe(200);
    expect(io.refresh.mock.calls.map(([, c]) => c.connectionId)).toEqual(["account-b", "account-b"]);
    expect(io.sent).toHaveLength(1);
    expect(io.sent[0].headers.authorization).toBe("Bearer synthetic-account-b");
    expect(healthWrites()).toEqual([]);
  });

  it("retains ordinary tools, history images and tool-result media on the OpenAI wire", async () => {
    const data = "iVBORw0KGgo=";
    const image = { type: "image", source: { type: "base64", media_type: "image/png", data } };
    const literal = addition("literal-in-tool-argument");
    const body = base("ocg/kimi-k3.1-pro(high)", [
      { role: "user", content: [text("Earlier context"), image] },
      { role: "assistant", content: [{ type: "tool_use", id: "call_a", name: "lookup", input: { example: literal } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_a", content: [text("Found it"), image] }] },
      { role: "user", content: "Continue" },
    ]);
    const before = structuredClone(body);
    const result = await messagesPost(request(body));
    expect(result.status).toBe(200);
    expect(body).toEqual(before);
    expect(io.sent).toHaveLength(1);
    const { url, body: wire } = io.sent[0];
    expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(io.sent[0].headers["user-agent"]).toBe("synthetic-client");
    expect(wire).toMatchObject({ model: "kimi-k3.1-pro", reasoning_effort: "high", max_tokens: 37,
      tools: [{ type: "function", function: { name: "lookup", description: "Existing tool", parameters: existing.input_schema } }] });
    const call = wire.messages.find(m => m.role === "assistant" && m.tool_calls)?.tool_calls[0];
    expect(call.id).toBe("call_a");
    expect(JSON.parse(call.function.arguments)).toEqual({ example: literal });
    expect(wire.messages.find(m => m.role === "tool")).toMatchObject({ tool_call_id: "call_a", content: "Found it" });
    const images = wire.messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(part => part.type === "image_url");
    expect(images).toEqual(Array(2).fill({ type: "image_url", image_url: { url: `data:image/png;base64,${data}` } }));
    expect(JSON.stringify(wire)).not.toContain("block omitted");
    expect(healthWrites()).toEqual([]);
  });

  it.each([["node", "kitsune-router"], ["real-editor/2.4", "real-editor/2.4"]])("keeps the truthful public Go identity for %s", async (caller, expected) => {
    const response = await messagesPost(request(base("ocg/kimi-k3.1-pro", [{ role: "user", content: "Continue" }]), {
      "user-agent": caller, "x-opencode-session": "untrusted-client-session",
    }));
    expect(response.status).toBe(200);
    expect(io.sent).toHaveLength(1);
    expect(io.sent[0].headers["user-agent"]).toBe(expected);
    expect(io.sent[0].headers).not.toHaveProperty("x-opencode-session");
    expect(healthWrites()).toEqual([]);
  });

  it("allows the existing combo policy to advance without retrying or locking Go accounts", async () => {
    io.connections.push(connection("native-kimi", "kimi"));
    io.combo = { name: "synthetic-combo", models: ["ocg/kimi-k3.1-pro", "kimi/k3"] };
    const body = base(io.combo.name, [{ role: "system", content: [addition("new_tool")] }, { role: "user", content: "Continue" }]);
    const before = structuredClone(body);
    const response = await messagesPost(request(body));
    expect(response.status).toBe(200);
    expect(body).toEqual(before);
    expect(io.refresh.mock.calls.map(([provider, c]) => [provider, c.connectionId])).toEqual([["opencode-go", "account-a"], ["kimi", "native-kimi"]]);
    expect(io.sent).toHaveLength(1);
    expect(io.sent[0].url).toContain("api.kimi.com");
    expect(io.sent[0].body.tools.map(tool => tool.name)).toEqual(["lookup", "new_tool"]);
    expect(healthWrites()).toEqual([]);
  });
});

describe("deferred tool guard scope and ownership", () => {
  it.each(["opencode-go", "ocg"])("rejects without changing even an owned request for provider %s", provider => {
    const body = base("fixture", [{ role: "user", content: [text("before"), addition("new")] }]);
    const before = structuredClone(body);
    expect(() => translateRequest(FORMATS.CLAUDE, FORMATS.OPENAI, "kimi-k3-1-pro(max)", body, false, null, provider, null, [], null, null, null, { ownership: "owned" }))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "messages.0.content.1", message: MESSAGE }));
    expect(body).toEqual(before);
  });

  it.each(["kimi-k3", "glm-5.3", "kimi-k3.1-pro-extra"])("leaves unrelated Go model %s unchanged", model => {
    const body = base("fixture", [{ role: "user", content: [text("before"), addition("new")] }]);
    const before = structuredClone(body);
    const wire = translateRequest(FORMATS.CLAUDE, FORMATS.OPENAI, model, body, false, null, "opencode-go");
    expect(JSON.stringify(wire.messages)).toContain("[tool_addition block omitted: not supported on this route]");
    expect(body).toEqual(before);
  });

  it("does not apply the Claude-to-Chat guard to other source or target formats", () => {
    const body = { max_tokens: 37, messages: [{ role: "user", content: [text("before"), addition("new")] }] };
    const before = structuredClone(body);
    const native = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, "kimi-k3.1-pro", body, false, null, "opencode-go");
    expect(native.messages[0].content).toContainEqual(addition("new"));
    expect(() => translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "kimi-k3.1-pro", body, false, null, "opencode-go")).not.toThrow();
    expect(body).toEqual(before);
  });

  it.each(["kimi-k3", "glm-5.3"])("keeps the prior public Go %s wire unchanged", async model => {
    const body = base(`ocg/${model}`, [{ role: "user", content: [text("before"), addition("new")] }]);
    const result = await messagesPost(request(body));
    expect(result.status).toBe(200);
    expect(io.sent).toHaveLength(1);
    expect(io.sent[0].body.model).toBe(model);
    expect(JSON.stringify(io.sent[0].body.messages)).toContain("[tool_addition block omitted: not supported on this route]");
  });

  it("leaves native Kimi lowering and other providers' wire behavior unchanged", () => {
    const body = base("fixture", [{ role: "system", content: [addition("new")] }, { role: "user", content: "Continue" }]);
    const before = structuredClone(body);
    const native = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, "k3", body, false, null, "kimi");
    expect(native.tools.map(tool => tool.name)).toEqual(["lookup", "new"]);
    const other = translateRequest(FORMATS.CLAUDE, FORMATS.OPENAI, "kimi-k3.1-pro", body, false, null, "openai");
    expect(other.tools.map(tool => tool.function.name)).toEqual(["lookup"]);
    expect(body).toEqual(before);
  });
});
