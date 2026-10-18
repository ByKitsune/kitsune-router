import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Keep outer routing, account selection/health, core, translators and executor
// serialization real. Replace only storage, logging and the external HTTP edge.
const fixture = vi.hoisted(() => ({
  base: "", connections: [], requests: [], settings: {}, onRead: null,
  getConnections: vi.fn(), getConnection: vi.fn(), updateConnection: vi.fn(),
  getAdapter: vi.fn(() => { throw new Error("Unexpected database access"); }),
}));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: fixture.getConnections,
  getProviderConnectionById: fixture.getConnection,
  updateProviderConnection: fixture.updateConnection,
  getSettings: async () => fixture.settings,
  isApiKeyRequired: () => false,
  validateApiKey: async () => false,
  getProxyPools: async () => [], getProviderNodes: async () => [],
  getModelAliases: async () => ({}), getComboByName: async () => null,
}));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: fixture.getAdapter, getAdapterSync: fixture.getAdapter }));
vi.mock("../../src/lib/db/repos/aliasRepo.js", () => ({ getCustomModels: async () => [] }));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => ({}), pickProxyPoolId: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent() {} }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug() {}, info() {}, warn() {}, error() {}, line() {}, errorLine() {},
  nextTag: () => "", tagForSession: () => "", fmtThink: () => "high", maskKey: () => "offline",
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (url, init) => fetch(`${fixture.base}${new URL(url).pathname}`, init),
}));

import { handleChat } from "../../src/sse/handlers/chat.js";
import * as auth from "../../src/sse/services/auth.js";

const MODEL = "gpt-6.1-sol";
let server, selectionSpy, healthSpy;
beforeAll(async () => {
  server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    fixture.requests.push({ path: request.url, headers: request.headers, body });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "resp_offline", object: "response", status: "completed", model: body.model,
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 }, service_tier: body.service_tier || "default",
    }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fixture.base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
beforeEach(() => {
  vi.clearAllMocks();
  fixture.requests = [];
  fixture.onRead = null;
  fixture.settings = { requireApiKey: false, quotaAwareSelection: false, fallbackStrategy: "fill-first" };
  fixture.connections = [connection("account-a", ["priority"]), connection("account-b", ["priority", "ultrafast"])];
  fixture.getConnections.mockImplementation(async ({ provider, isActive } = {}) => {
    fixture.onRead?.();
    return fixture.connections.filter(conn => (!provider || provider === conn.provider) && (!isActive || conn.isActive)).map(conn => structuredClone(conn));
  });
  fixture.getConnection.mockImplementation(async id => structuredClone(fixture.connections.find(conn => conn.id === id) || null));
  fixture.updateConnection.mockImplementation(async (id, patch) => {
    const conn = fixture.connections.find(conn => conn.id === id);
    Object.assign(conn, structuredClone(patch));
    return structuredClone(conn);
  });
  selectionSpy = vi.spyOn(auth, "getProviderCredentials");
  healthSpy = vi.spyOn(auth, "markAccountUnavailable");
});
afterEach(() => {
  expect(fixture.getAdapter).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

function connection(id, tiers, extra = {}) {
  return {
    id, provider: "codex", apiKey: `offline-${id}`, authType: "apikey", isActive: true,
    providerSpecificData: {
      chatgptAccountId: id,
      models: [{ slug: MODEL, service_tiers: tiers.map(tier => ({ id: tier })), default_service_tier: "ultrafast" }],
      ...extra,
    },
  };
}
function request({ tier = "ultrafast", model = `codex/${MODEL}`, headers = {}, signal } = {}) {
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, signal,
    body: JSON.stringify({ model, service_tier: tier, reasoning_effort: "high", stream: false, messages: [{ role: "user", content: "hello" }] }),
  });
}
async function selectedIds() {
  return (await Promise.all(selectionSpy.mock.results.map(result => result.value))).flatMap(value => value?.connectionId ? [value.connectionId] : []);
}
function expectNoHealthWrites() {
  expect(healthSpy).not.toHaveBeenCalled();
  expect(fixture.updateConnection).not.toHaveBeenCalled();
}

describe("known service-tier denial through the real outer account router", () => {
  it("skips priority-only A and dispatches the unchanged Ultrafast request to B", async () => {
    const response = await handleChat(request());
    expect(response.status).toBe(200);
    expect(await selectedIds()).toEqual(["account-a", "account-b"]);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toMatchObject({ path: "/backend-api/codex/responses", headers: { "chatgpt-account-id": "account-b" }, body: {
      model: MODEL, service_tier: "ultrafast", reasoning: { effort: "high" }, stream: true, store: false,
    } });
    expectNoHealthWrites();
  });

  it.each([
    { serviceTierPermissions: { ultrafast: false } },
    { chatgptPlanType: "plus" },
  ])("skips only the account whose trusted metadata denies the tier: %j", async extra => {
    fixture.connections[0] = connection("account-a", ["priority", "ultrafast"], extra);
    expect((await handleChat(request())).status).toBe(200);
    expect(fixture.requests.map(item => item.headers["chatgpt-account-id"])).toEqual(["account-b"]);
    expectNoHealthWrites();
  });

  it("permits an unknown-entitlement B to ask upstream after known-ineligible A", async () => {
    delete fixture.connections[1].providerSpecificData.models;
    expect((await handleChat(request())).status).toBe(200);
    expect(fixture.requests.map(item => item.headers["chatgpt-account-id"])).toEqual(["account-b"]);
    expectNoHealthWrites();
  });

  it("skips an ineligible configured OpenAI account without changing either account's residency", async () => {
    fixture.connections = [
      { ...connection("account-a", []), provider: "openai", providerSpecificData: { dataResidency: "eu" } },
      { ...connection("account-b", []), provider: "openai", providerSpecificData: { dataResidency: "us" } },
    ];
    const response = await handleChat(request({ model: "openai/gpt-6-astra" }));
    expect(response.status).toBe(200);
    expect(await selectedIds()).toEqual(["account-a", "account-b"]);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toMatchObject({ path: "/v1/responses", headers: {
      authorization: "Bearer offline-account-b",
    }, body: { model: "gpt-6-astra", service_tier: "ultrafast" } });
    expect(fixture.connections.map(account => account.providerSpecificData.dataResidency)).toEqual(["eu", "us"]);
    expectNoHealthWrites();
  });

  it("does not apply the generic three-error circuit breaker to five known-ineligible accounts", async () => {
    fixture.connections = Array.from({ length: 5 }, (_, index) => connection(`denied-${index}`, ["priority"]));
    fixture.connections.push(connection("account-b", ["ultrafast"]));
    expect((await handleChat(request())).status).toBe(200);
    expect(await selectedIds()).toEqual(["denied-0", "denied-1", "denied-2", "denied-3", "denied-4", "account-b"]);
    expect(fixture.requests).toHaveLength(1);
    expectNoHealthWrites();
  });

  it("exhausts all ineligible accounts once and returns actionable 400 without Retry-After", async () => {
    fixture.connections = Array.from({ length: 5 }, (_, index) => connection(`denied-${index}`, ["priority"]));
    const response = await handleChat(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "unsupported_service_tier", param: "service_tier", message: expect.stringContaining("not advertised") } });
    expect(await selectedIds()).toEqual(["denied-0", "denied-1", "denied-2", "denied-3", "denied-4"]);
    expect(selectionSpy).toHaveBeenCalledTimes(6);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(fixture.requests).toHaveLength(0);
    expectNoHealthWrites();
  });

  it("returns the tier denial rather than a spurious rate-limit response when remaining accounts were already locked", async () => {
    fixture.connections[1][`modelLock_${MODEL}`] = new Date(Date.now() + 60000).toISOString();
    const response = await handleChat(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "unsupported_service_tier" } });
    expect(response.headers.get("retry-after")).toBeNull();
    expect(await selectedIds()).toEqual(["account-a"]);
    expect(fixture.requests).toHaveLength(0);
    expectNoHealthWrites();
  });

  it.each(["turbo", {}])("does not rotate for a globally invalid native tier %j", async tier => {
    const response = await handleChat(request({ tier }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_service_tier" } });
    expect(await selectedIds()).toEqual(["account-a"]);
    expect(selectionSpy).toHaveBeenCalledTimes(1);
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.updateConnection).not.toHaveBeenCalled();
  });

  it.each([["openai", "gpt-6-sol"], ["codex", "gpt-6-luna"]])("does not rotate for globally unsupported %s/%s + Ultrafast", async (provider, model) => {
    fixture.connections = fixture.connections.map(conn => ({ ...conn, provider }));
    const response = await handleChat(request({ model: `${provider}/${model}` }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "unsupported_service_tier" } });
    expect(await selectedIds()).toEqual(["account-a"]);
    expect(selectionSpy).toHaveBeenCalledTimes(1);
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.updateConnection).not.toHaveBeenCalled();
  });

  it("keeps explicit Standard on A rather than replacing it with a catalog or provider paid default", async () => {
    fixture.settings.providerServiceTier = { codex: { mode: "ultrafast" } };
    expect((await handleChat(request({ tier: "default" }))).status).toBe(200);
    expect(await selectedIds()).toEqual(["account-a"]);
    expect(fixture.requests[0].headers["chatgpt-account-id"]).toBe("account-a");
    expect(fixture.requests[0].body).not.toHaveProperty("service_tier");
    expectNoHealthWrites();
  });

  it.each(["account-b", "account-a"])("retains existing soft pinning semantics for %s", async pinned => {
    expect((await handleChat(request({ headers: { "x-connection-id": pinned } }))).status).toBe(200);
    expect(await selectedIds()).toEqual(pinned === "account-b" ? ["account-b"] : ["account-a", "account-b"]);
    expect(fixture.requests.map(item => item.headers["chatgpt-account-id"])).toEqual(["account-b"]);
    expectNoHealthWrites();
  });

  it("does not poison A for subsequent Standard requests", async () => {
    expect((await handleChat(request())).status).toBe(200);
    expect((await handleChat(request({ tier: "default", headers: { "x-connection-id": "account-a" } }))).status).toBe(200);
    expect(fixture.requests.map(item => item.headers["chatgpt-account-id"])).toEqual(["account-b", "account-a"]);
    expectNoHealthWrites();
  });

  it("honors caller abort between a denied account and the next selection without upstream traffic", async () => {
    const controller = new AbortController();
    let reads = 0;
    fixture.onRead = () => { if (++reads === 2) controller.abort(new Error("offline cancellation")); };
    const response = await handleChat(request({ signal: controller.signal }));
    expect(response.status).toBe(499);
    expect(fixture.requests).toHaveLength(0);
    expect(selectionSpy.mock.calls.length).toBeLessThanOrEqual(2);
    expectNoHealthWrites();
  });
});
