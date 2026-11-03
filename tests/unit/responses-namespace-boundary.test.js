import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ credentials: vi.fn(), health: vi.fn(), clear: vi.fn(), write: vi.fn(), update: vi.fn(), execute: vi.fn(), refresh: vi.fn() }));
vi.mock("@/sse/services/auth.js", async importOriginal => {
  const actual = await importOriginal();
  io.health.mockImplementation(actual.markAccountUnavailable);
  return { ...actual, getProviderCredentials: io.credentials, markAccountUnavailable: io.health, clearAccountError: io.clear,
    extractApiKey: () => null, isValidApiKey: async () => false };
});
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken: async (_provider, selected) => selected, updateProviderCredentials: io.update }));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => ({ requireApiKey: false, rtkEnabled: false }), isApiKeyRequired: () => false,
  getModelAliases: async () => ({}), getComboByName: async () => null, getProviderNodes: async () => [],
  getProviderConnectionById: async () => null,
  getProviderConnections: async () => { throw new Error("Unexpected account health read"); },
  updateProviderConnection: io.write, getProxyPools: async () => [], validateApiKey: async () => false,
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {},
  saveRequestUsage: async () => ({ accepted: true }), enqueueRequestUsage: async () => ({ accepted: true }),
}));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent() {} }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug() {}, info() {}, warn() {}, error() {}, errorLine() {}, line() {}, nextTag: () => "", tagForSession: () => "", fmtThink: () => "auto", maskKey: () => "fixture",
}));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: () => { throw new Error("Unexpected network"); } }));
vi.mock("open-sse/executors/index.js", () => ({ getExecutor: () => ({ execute: io.execute, refreshCredentials: io.refresh }), hasSpecializedExecutor: provider => provider === "codex" }));
vi.mock("open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));

import { handleChat } from "@/sse/handlers/chat.js";
import { convertResponsesApiFormat } from "../../open-sse/translator/formats/responsesApi.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const namespace = type => ({ type: "namespace", name: "functions", description: "Preserve this namespace", tools: [
  { type, name: "exec", ...(type === "custom" ? { format: { type: "text" } } : { parameters: { type: "object", properties: { command: { type: "string" } } }, strict: false }) },
] });
const source = type => ({ input: "Run the declared tool", tools: [{ type: "function", name: "outside", parameters: { type: "object", properties: {} } }, namespace(type)] });
const request = body => new Request("http://localhost:20128/v1/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stream: false, ...body }) });

beforeEach(() => {
  vi.clearAllMocks();
  io.credentials.mockImplementation(async provider => ({ connectionId: "namespace-fixture", provider, apiKey: "synthetic-destination-key", providerSpecificData: {} }));
  io.execute.mockResolvedValue({ response: Response.json({ id: "resp_fixture", object: "response", status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }), url: "https://upstream.invalid/responses", headers: {}, transformedBody: null });
});

describe("Responses namespace tools stay on a supported protocol boundary", () => {
  it.each(["custom", "function"])("rejects a %s namespace at the lossy Responses-to-Chat codec without changing input", type => {
    const body = source(type);
    const original = structuredClone(body);
    expect(() => convertResponsesApiFormat(body)).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "tools.1", message: expect.stringContaining("native Responses-compatible route") }));
    expect(body).toEqual(original);
  });

  it.each(["custom", "function"])("returns a local 400 for a %s namespace before Chat dispatch or account writes", async type => {
    const response = await handleChat(request({ ...source(type), model: "openrouter/openai/gpt-4o" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "unsupported_parameter", param: "tools.1" });
    expect(io.execute).not.toHaveBeenCalled();
    expect(io.refresh).not.toHaveBeenCalled();
    expect(io.credentials).toHaveBeenCalledOnce();
    expect(io.write).not.toHaveBeenCalled();
    expect(io.clear).not.toHaveBeenCalled();
    expect(io.update).not.toHaveBeenCalled();
  });

  it.each(["custom", "function"])("preserves native Responses %s namespace wrappers through preparation and Codex execution shaping", type => {
    const body = { ...source(type), model: "gpt-6.1-sol", reasoning: { effort: "low" } };
    const originalTools = JSON.stringify(body.tools);
    const prepared = translateRequest(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES, body.model, body, true, { accessToken: "synthetic-codex" }, "codex");
    expect(JSON.stringify(prepared.tools)).toBe(originalTools);
    const wire = new CodexExecutor().transformRequest(body.model, prepared, true, { connectionId: "native-namespace", accessToken: "synthetic-codex" });
    expect(JSON.stringify(wire.tools)).toBe(originalTools);
    expect(JSON.stringify(body.tools)).toBe(originalTools);
  });

  it.each([
    ["custom", "codex/gpt-6.1-sol"], ["function", "codex/gpt-6.1-sol"],
    ["custom", "openai/gpt-6.1-terra"], ["function", "openai/gpt-6.1-terra"],
  ])("keeps a %s namespace intact on the public native %s path", async (type, model) => {
    const body = { ...source(type), model, reasoning: { effort: "low" } };
    const response = await handleChat(request(body));
    expect(response.status).toBe(200);
    await response.text();
    expect(io.execute).toHaveBeenCalledOnce();
    expect(JSON.stringify(io.execute.mock.calls[0][0].body.tools)).toBe(JSON.stringify(body.tools));
    expect(io.health).not.toHaveBeenCalled();
  });
});
