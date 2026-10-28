import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise real public routing, account selection, translation and the Codex
// serializer. Persistence and the external HTTP edge are synthetic only.
const fixture = vi.hoisted(() => ({
  connections: [], getConnections: vi.fn(), getConnection: vi.fn(), updateConnection: vi.fn(),
  debug: vi.fn(), dispatch: vi.fn(), unexpected: vi.fn(() => { throw new Error("Unexpected real I/O"); }),
}));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: fixture.getConnections, getProviderConnectionById: fixture.getConnection,
  updateProviderConnection: fixture.updateConnection,
  getSettings: async () => ({ requireApiKey: false, quotaAwareSelection: false, fallbackStrategy: "fill-first" }),
  isApiKeyRequired: () => false, validateApiKey: async () => false,
  getProxyPools: async () => [], getProviderNodes: async () => [],
  getModelAliases: async () => ({}), getComboByName: async () => null,
}));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: fixture.unexpected, getAdapterSync: fixture.unexpected }));
vi.mock("../../src/lib/db/repos/aliasRepo.js", () => ({ getCustomModels: async () => [] }));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => ({}), pickProxyPoolId: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent() {} }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: fixture.debug, info() {}, warn() {}, error() {}, line() {}, errorLine() {},
  nextTag: () => "", tagForSession: () => "", fmtThink: () => "auto", maskKey: () => "offline",
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
  appendProviderChunk() {}, appendConvertedChunk() {}, appendOpenAIChunk() {}, flush() {},
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: fixture.dispatch }));

import { handleChat } from "../../src/sse/handlers/chat.js";
import * as auth from "../../src/sse/services/auth.js";

const model = "gpt-5.4";
function connection(id) {
  return { id, provider: "codex", apiKey: `offline-${id}`, authType: "apikey", isActive: true,
    providerSpecificData: { chatgptAccountId: id } };
}
function request(parameters, generationConfig) {
  return {
    model: `codex/${model}`, userAgent: "antigravity", stream: false,
    request: { contents: [{ role: "user", parts: [{ text: "Use the tool." }] }],
      tools: [{ functionDeclarations: [{ name: "inspect", parameters }] }],
      ...(generationConfig ? { generationConfig } : {}) },
  };
}
async function send(body) {
  const before = structuredClone(body);
  // /v1/api/chat delegates to the public handler without imposing a source
  // format, so the Antigravity envelope selects its real translator.
  const endpoint = "/v1/api/chat";
  const response = await handleChat(new Request(`http://localhost${endpoint}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), { endpoint, body, headers: {} });
  expect(body).toEqual(before);
  return response;
}

let selectionSpy;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fixture.unexpected);
  fixture.connections = [connection("account-a"), connection("account-b")];
  fixture.getConnections.mockImplementation(async ({ provider, isActive } = {}) => fixture.connections
    .filter(conn => (!provider || conn.provider === provider) && (!isActive || conn.isActive)).map(conn => structuredClone(conn)));
  fixture.getConnection.mockImplementation(async id => structuredClone(fixture.connections.find(conn => conn.id === id) || null));
  fixture.updateConnection.mockImplementation(async (id, patch) => {
    const conn = fixture.connections.find(item => item.id === id);
    Object.assign(conn, structuredClone(patch));
    return structuredClone(conn);
  });
  selectionSpy = vi.spyOn(auth, "getProviderCredentials");
  const reply = { type: "response.completed", response: { id: "resp_fixture", object: "response", status: "completed", model,
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "offline" }] }],
    usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } };
  fixture.dispatch.mockImplementation(async () => new Response(`event: response.completed\ndata: ${JSON.stringify(reply)}\n\n`, {
    headers: { "content-type": "text/event-stream" },
  }));
});
afterEach(() => {
  try { expect(fixture.unexpected).not.toHaveBeenCalled(); } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

describe("Antigravity -> Codex public outbound schema", () => {
  it("serializes legacy array bounds as numbers without corrupting literal values", async () => {
    const literal = { minItems: "2", maxItems: "unchanged", properties: { items: { minItems: "literal" } } };
    const body = request({ type: "OBJECT", properties: {
      minItems: { type: "ARRAY", minItems: "1", maxItems: "2", items: { type: "OBJECT" }, default: [literal], enum: [[literal]] },
      maxItems: { type: "ARRAY", minItems: "0", maxItems: "5", items: { type: "ARRAY", minItems: "2", items: { type: "STRING" } } },
    } }, { responseMimeType: "application/json", responseSchema: { type: "ARRAY", minItems: "0", maxItems: "3", items: { type: "STRING" } } });
    const response = await send(body);
    expect(response.status).toBe(200);
    await response.text();
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
    const [url, init] = fixture.dispatch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/backend-api/codex/responses");
    const wire = JSON.parse(init.body);
    expect(wire.tools[0]).toMatchObject({ type: "function", name: "inspect", parameters: { type: "object", properties: {
      minItems: { type: "array", minItems: 1, maxItems: 2, items: { type: "object" }, default: [literal], enum: [[literal]] },
      maxItems: { type: "array", minItems: 0, maxItems: 5, items: { type: "array", minItems: 2, items: { type: "string" } } },
    } } });
    expect(wire.text.format.schema).toEqual({ type: "array", minItems: 0, maxItems: 3, items: { type: "string" } });
    expect(fixture.debug).toHaveBeenCalledWith("FORMAT", expect.stringContaining("antigravity → openai-responses"));
    expect(selectionSpy).toHaveBeenCalledTimes(1);
    expect(fixture.updateConnection).not.toHaveBeenCalled();
  });

  it("passes the distinct JSON Schema fields through without interpreting shadowed legacy fields", async () => {
    const jsonSchema = { type: "object", properties: { rows: { type: "array", minItems: 2, maxItems: 5,
      items: { type: "string" }, default: ["one", "two"] } }, default: { minItems: "literal" } };
    const body = request({ type: "ARRAY", minItems: "invalid" }, {
      responseMimeType: "application/json", responseSchema: { maxItems: "invalid" }, responseJsonSchema: jsonSchema,
    });
    body.request.tools[0].functionDeclarations[0].parametersJsonSchema = jsonSchema;
    const response = await send(body);
    expect(response.status).toBe(200);
    await response.text();
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
    const wire = JSON.parse(fixture.dispatch.mock.calls[0][1].body);
    expect(wire.tools[0].parameters).toEqual(jsonSchema);
    expect(wire.text.format.schema).toEqual(jsonSchema);
    expect(selectionSpy).toHaveBeenCalledTimes(1);
    expect(fixture.updateConnection).not.toHaveBeenCalled();
  });

  it.each([
    { minItems: "-1" }, { maxItems: "1.5" }, { minItems: "9007199254740992" },
    { minItems: "4", maxItems: "3" }, { minItems: "quota exhausted retry-after 30s" },
  ])("returns a local 400 for %j without dispatch, retry or account lock", async bounds => {
    const body = request({ type: "OBJECT", properties: { rows: { type: "ARRAY", ...bounds, items: { type: "STRING" } } } });
    const response = await send(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { type: "invalid_request_error", code: "unsupported_parameter", param: "tools" } });
    expect(response.headers.get("retry-after")).toBeNull();
    expect(fixture.dispatch).not.toHaveBeenCalled();
    expect(selectionSpy).toHaveBeenCalledTimes(1);
    expect(fixture.updateConnection).not.toHaveBeenCalled();
    expect(fixture.connections).toEqual([connection("account-a"), connection("account-b")]);
  });

  it("rejects an invalid legacy structured-output bound before dispatch", async () => {
    const body = request({ type: "OBJECT", properties: {} }, {
      responseMimeType: "application/json", responseSchema: { type: "ARRAY", minItems: "2", maxItems: "1" },
    });
    const response = await send(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "unsupported_parameter", param: "generationConfig.responseSchema" } });
    expect(fixture.dispatch).not.toHaveBeenCalled();
    expect(selectionSpy).toHaveBeenCalledTimes(1);
    expect(fixture.updateConnection).not.toHaveBeenCalled();
  });
});
