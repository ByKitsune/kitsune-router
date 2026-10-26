import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real public routing, alias resolution, combos and core response translation.
// Only account/persistence/network boundaries are synthetic. Native envelopes
// below are constructed fixtures, not authenticated Google wire captures.
const mocks = vi.hoisted(() => ({
  aliases: {}, combos: {}, settings: {}, nativeSse: false,
  credentials: vi.fn(), markUnavailable: vi.fn(), clearError: vi.fn(),
  refresh: vi.fn(), updateCredentials: vi.fn(), getProject: vi.fn(),
  quotaError: vi.fn(), clearStrikes: vi.fn(), execute: vi.fn(),
  unexpectedIO: vi.fn(() => { throw new Error("Unexpected real I/O"); }),
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: mocks.credentials, markAccountUnavailable: mocks.markUnavailable,
  clearAccountError: mocks.clearError, extractApiKey: () => null, isValidApiKey: async () => false,
}));
vi.mock("@/sse/services/antigravityQuota.js", () => ({
  handleAntigravityQuotaError: mocks.quotaError, clearAntigravityStrikes: mocks.clearStrikes,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: mocks.refresh, updateProviderCredentials: mocks.updateCredentials,
}));
vi.mock("open-sse/services/projectId.js", () => ({ getProjectIdForConnection: mocks.getProject }));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => mocks.settings,
  isApiKeyRequired: settings => settings.requireApiKey === true,
  getModelAliases: async () => mocks.aliases,
  getComboByName: async name => mocks.combos[name] || null,
  getProviderNodes: async () => [],
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/lib/db/driver.js", () => ({ getAdapter: mocks.unexpectedIO, getAdapterSync: mocks.unexpectedIO }));
vi.mock("open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: mocks.trackPendingRequest, appendRequestLog: mocks.appendRequestLog,
  saveRequestDetail: mocks.saveRequestDetail, saveRequestUsage: mocks.saveRequestUsage,
  enqueueRequestUsage: mocks.enqueueRequestUsage,
}));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent: vi.fn() }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), errorLine: vi.fn(),
  nextTag: () => "", tagForSession: () => "", line: vi.fn(), fmtThink: () => "auto", maskKey: () => "synthetic-key",
}));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: mocks.unexpectedIO }));
vi.mock("open-sse/executors/index.js", () => ({
  getExecutor: () => ({ execute: mocks.execute }), hasSpecializedExecutor: () => true,
}));
vi.mock("open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));

import { handleChat } from "@/sse/handlers/chat.js";

const NOTICE = "Gemini 3.5 Flash is no longer available. Please switch to Gemini 3.7 Flash in the latest version of Antigravity.";
const RETIRED = ["gemini-3.5-flash-high", "gemini-3-flash-agent", "gemini-3.5-flash-low", "gemini-3.5-flash-extra-low"];
const ENDPOINTS = ["/v1/chat/completions", "/v1/responses", "/v1/messages", "/v1beta/models/fixture:generateContent"];
const matrix = RETIRED.flatMap(model => ENDPOINTS.flatMap(endpoint => [false, true].map(stream => ({ model, endpoint, stream }))));

function request(model, endpoint = ENDPOINTS[0], stream = false) {
  const input = endpoint.includes("/responses") ? { input: "Reply briefly." }
    : endpoint.includes("/v1beta/") ? { contents: [{ role: "user", parts: [{ text: "Reply briefly." }] }] }
      : { messages: [{ role: "user", content: "Reply briefly." }] };
  return new Request(`http://localhost:20128${endpoint}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream, max_tokens: 1024, ...input }),
  });
}

function noAccountSideEffects() {
  for (const spy of [mocks.credentials, mocks.refresh, mocks.updateCredentials, mocks.getProject,
    mocks.markUnavailable, mocks.clearError, mocks.quotaError, mocks.clearStrikes,
    mocks.execute, mocks.trackPendingRequest, mocks.appendRequestLog, mocks.saveRequestUsage, mocks.enqueueRequestUsage, mocks.saveRequestDetail]) {
    expect(spy).not.toHaveBeenCalled();
  }
}

async function expectRetired(response) {
  expect(response.status).toBe(410);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("retry-after")).toBeNull();
  expect(await response.json()).toMatchObject({ error: { type: "invalid_request_error", code: "model_retired" } });
  noAccountSideEffects();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.aliases = {};
  mocks.combos = {};
  mocks.settings = { requireApiKey: false, comboStrategy: "fallback" };
  mocks.nativeSse = false;
  mocks.credentials.mockResolvedValue({ connectionId: "fixture-ag", accessToken: "synthetic-token", projectId: "fixture-project" });
  mocks.refresh.mockImplementation(async (_provider, credentials) => credentials);
  mocks.execute.mockImplementation(async () => {
    const native = { response: { candidates: [{ content: { role: "model", parts: [{ text: NOTICE }] }, finishReason: "STOP" }] } };
    return {
      response: new Response(mocks.nativeSse ? `data: ${JSON.stringify(native)}\n\n` : JSON.stringify(native), {
        headers: { "content-type": mocks.nativeSse ? "text/event-stream" : "application/json" },
      }),
      url: "https://upstream.invalid/generateContent", headers: {}, transformedBody: null,
    };
  });
  vi.stubGlobal("fetch", mocks.unexpectedIO);
});
afterEach(() => {
  try { expect(mocks.unexpectedIO).not.toHaveBeenCalled(); } finally { vi.unstubAllGlobals(); }
});

describe("Antigravity proven retirements are rejected before account selection", () => {
  it.each(matrix)("rejects $model on $endpoint stream=$stream without inference, health or usage changes", async ({ model, endpoint, stream }) => {
    await expectRetired(await handleChat(request(`ag/${model}`, endpoint, stream)));
  });

  it.each([
    "antigravity/gemini-3-flash-agent", "ag/gemini-3-flash-agent(low)",
    "ag/gemini-3.5-flash-low(0)", "ag/gemini-3.5-flash-high[1m]",
    "saved-retired-flash", "saved-retired-agent",
  ])("also gates the resolved identity of %s", async model => {
    mocks.aliases = {
      "saved-retired-flash": "ag/gemini-3.5-flash-high",
      "saved-retired-agent": { provider: "antigravity", model: "gemini-3-flash-agent(high)" },
    };
    await expectRetired(await handleChat(request(model)));
  });

  it.each([false, true])("advances only through an explicitly configured combo, stream=%s", async stream => {
    mocks.combos["configured-fallback"] = { models: ["ag/gemini-3.5-flash-high", "ag/gemini-3-flash"] };
    mocks.nativeSse = stream;
    const response = await handleChat(request("configured-fallback", ENDPOINTS[0], stream));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(NOTICE);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.credentials.mock.calls.map(([provider, _excluded, model]) => `${provider}/${model}`)).toEqual(["antigravity/gemini-3-flash"]);
    expect(mocks.markUnavailable).not.toHaveBeenCalled();
    expect(mocks.quotaError).not.toHaveBeenCalled();
  });

  it("preserves model_retired diagnostics when every configured combo member is retired", async () => {
    mocks.combos["all-retired"] = { models: RETIRED.map(model => `ag/${model}`) };
    await expectRetired(await handleChat(request("all-retired")));
  });

  it.each([
    "ag/gemini-3-flash", "ag/gemini-3.8-flash-low", "ag/gemini-4-argon",
    "ag/claude-sonnet-5-5", "ag/claude-opus-5-5", "ag/gemini-3.7-flash-high",
    "ag/claude-sonnet-4-6", "ag/claude-opus-4-6-thinking", "ag/gpt-oss-120b-medium",
    "gemini/gemini-3-flash-agent",
  ])("does not infer retirement from prose, restrictions or scheduled lifecycle: %s", async model => {
    const response = await handleChat(request(model));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(NOTICE);
    expect(mocks.credentials).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it.each(ENDPOINTS.flatMap(endpoint => [false, true].map(stream => ({ endpoint, stream }))))("preserves the exact notice as ordinary working-model output on $endpoint stream=$stream", async ({ endpoint, stream }) => {
    mocks.nativeSse = stream;
    const response = await handleChat(request("ag/gemini-3-flash", endpoint, stream));
    expect(response.status).toBe(200);
    const wire = await response.text();
    expect(wire).toContain(NOTICE);
    expect(wire).not.toContain("model_retired");
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.markUnavailable).not.toHaveBeenCalled();
  });

  it("preserves caller cancellation instead of returning lifecycle diagnostics", async () => {
    const aborted = new Request(request("ag/gemini-3-flash-agent"), { signal: AbortSignal.abort() });
    const response = await handleChat(aborted);
    expect(response.status).toBe(499);
    noAccountSideEffects();
  });

  it("still authenticates before returning lifecycle diagnostics", async () => {
    mocks.settings = { requireApiKey: true };
    const response = await handleChat(request("ag/gemini-3-flash-agent"));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("model_retired");
    noAccountSideEffects();
  });
});
