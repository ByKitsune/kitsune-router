import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExpectedDiagnostics } from "../helpers/expectedDiagnostics.js";

// PR #6's reported production pattern (4 Nov 2026): a Plus ChatGPT account answers every
// gpt-6-astra request with HTTP 400 "The 'gpt-6-astra' model is not supported
// when using Codex with a ChatGPT account." while a Pro account serves it. A
// zero cooldown re-asked the Plus account on every request, adding a failed
// upstream round trip (~0.4 s, 1.3 extra attempts per success) before the
// entitled account answered. Those production figures are author-reported,
// not measurements from this synthetic test. Keep routing, account selection/health, core and
// the Codex executor real; replace only storage, logging and the HTTP edge.
const fixture = vi.hoisted(() => ({
  base: "", connections: [], requests: [], settings: {}, denied: new Map(), systemic: new Map(), onRequest: null,
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
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
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
// Keep the real transport retries and counts; omit wall-clock backoff in the
// loopback fixture so systemic-failure coverage does not take minutes.
vi.mock("../../open-sse/config/runtimeConfig.js", async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    DEFAULT_RETRY_CONFIG: Object.fromEntries(Object.entries(original.DEFAULT_RETRY_CONFIG)
      .map(([status, config]) => [status, { ...config, delayMs: 0 }])),
  };
});

import { handleChat } from "../../src/sse/handlers/chat.js";
import { clearCodexEntitlementDenials } from "../../src/sse/services/auth.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

const ASTRA = "gpt-6-astra";
const LUNA = "gpt-6-luna";
const DENIAL = (model) => `The '${model}' model is not supported when using Codex with a ChatGPT account.`;

let server;
let diagnostics;
beforeAll(async () => {
  server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const account = request.headers["chatgpt-account-id"];
    fixture.requests.push({ account, model: body.model });
    fixture.onRequest?.(account);
    if (fixture.systemic.has(account)) {
      const { status = 400, message = "model is unavailable", ...error } = fixture.systemic.get(account);
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message, type: "server_error", ...error } }));
      return;
    }
    if (fixture.denied.get(account)?.has(body.model)) {
      // The router journal shows the parsed upstream message, so production
      // carries it in the standard OpenAI error envelope.
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: DENIAL(body.model), type: "invalid_request_error" } }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "resp_offline", object: "response", status: "completed", model: body.model,
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
    }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fixture.base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

function connection(id, priority) {
  return {
    id, provider: "codex", apiKey: `offline-${id}`, authType: "apikey", isActive: true, priority,
    providerSpecificData: { chatgptAccountId: id },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  diagnostics = captureExpectedDiagnostics();
  clearCodexEntitlementDenials();
  fixture.requests = [];
  fixture.settings = { requireApiKey: false, quotaAwareSelection: false, fallbackStrategy: "fill-first" };
  fixture.connections = [connection("plus-account", 1), connection("pro-account", 2)];
  fixture.denied = new Map([["plus-account", new Set([ASTRA])]]);
  fixture.systemic = new Map();
  fixture.onRequest = null;
  fixture.getConnections.mockImplementation(async ({ provider, isActive } = {}) => fixture.connections
    .filter(conn => (!provider || provider === conn.provider) && (!isActive || conn.isActive))
    .map(conn => structuredClone(conn)));
  fixture.getConnection.mockImplementation(async id => structuredClone(fixture.connections.find(conn => conn.id === id) || null));
  fixture.updateConnection.mockImplementation(async (id, patch) => {
    const conn = fixture.connections.find(conn => conn.id === id);
    Object.assign(conn, structuredClone(patch));
    return structuredClone(conn);
  });
});
afterEach(() => {
  try {
    expect(fixture.getAdapter).not.toHaveBeenCalled();
    diagnostics.verify();
  } finally {
    vi.useRealTimers();
  }
});

function request(model) {
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: `codex/${model}`, stream: false, messages: [{ role: "user", content: "hello" }] }),
  });
}

function healthWrites() {
  return fixture.updateConnection.mock.calls.filter(([, patch]) =>
    Object.keys(patch).some(key => key.startsWith("modelLock_")) || "testStatus" in patch || "lastError" in patch || "errorCode" in patch);
}

describe("Codex ChatGPT-account model entitlement denial", () => {
  it("tries the fourth entitled account after three canonical denials on the first request", async () => {
    fixture.connections = ["A", "B", "C", "D"].map((id, index) => connection(id, index + 1));
    fixture.denied = new Map(["A", "B", "C"].map(id => [id, new Set([ASTRA])]));
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    expect(fixture.requests.map(value => value.account)).toEqual(["A", "B", "C", "D"]);
    expect(healthWrites()).toEqual([]);
  });

  it.each([400, 403, 500, 502, 503, 504])("still fast-fails three generic systemic %is before a fourth account", async status => {
    fixture.connections = ["A", "B", "C", "D"].map((id, index) => connection(id, index + 1));
    fixture.denied.clear();
    const message = status === 400 ? "model is unavailable" : "Temporary upstream fault";
    fixture.systemic = new Map(["A", "B", "C"].map(id => [id, { status, message }]));
    for (let index = 0; index < 3; index++) diagnostics.expectError(`❌ codex [${status}]: [${status}]: ${message}`);
    expect((await handleChat(request(ASTRA))).status).toBe(status);
    // Generic 5xx retain one bounded same-account retry, then account fallback.
    const perAttempt = status === 502 || status === 503 ? 4 : status === 504 ? 3 : 1;
    const perAccount = perAttempt * (status >= 500 ? 2 : 1);
    const expectedAccounts = ["A", "B", "C"].flatMap(id => Array(perAccount).fill(id));
    expect(fixture.requests.map(value => value.account)).toEqual(expectedAccounts);
    expect(healthWrites()).toHaveLength(3);
  }, 20_000);

  it("bounds denial fallback to the initial account IDs while retaining current activation state", async () => {
    fixture.connections = ["A", "B", "C", "D"].map((id, index) => connection(id, index + 1));
    fixture.denied = new Map(fixture.connections.map(value => [value.id, new Set([ASTRA])]));
    fixture.onRequest = account => {
      if (account === "A") fixture.connections.find(value => value.id === "B").isActive = false;
      // A bounded stream of additions would extend the request on the old
      // implementation. The second logical request may select those new IDs.
      if (fixture.requests.length < 10) {
        const id = `added-${fixture.requests.length}`;
        fixture.connections.push(connection(id, fixture.connections.length + 1));
        fixture.denied.set(id, new Set([ASTRA]));
      }
    };
    expect((await handleChat(request(ASTRA))).status).toBe(400);
    expect(fixture.requests.map(value => value.account)).toEqual(["A", "C", "D"]);
    expect(healthWrites()).toEqual([]);
    fixture.onRequest = null;
    fixture.requests = [];
    expect((await handleChat(request(ASTRA))).status).toBe(400);
    expect(fixture.requests.map(value => value.account)).toEqual(["added-1", "added-2", "added-3", "A", "C", "D"]);
    expect(healthWrites()).toEqual([]);
  });

  it("checks each account once in an entirely denied pool and preserves the upstream client error", async () => {
    const accounts = ["A", "B", "C", "D", "E", "F"];
    fixture.connections = accounts.map((id, index) => connection(id, index + 1));
    fixture.denied = new Map(accounts.map(id => [id, new Set([ASTRA])]));
    for (let attempt = 0; attempt < 2; attempt++) {
      fixture.requests = [];
      const response = await handleChat(request(ASTRA));
      expect(response.status).toBe(400);
      expect(response.headers.get("retry-after")).toBeNull();
      expect(fixture.requests.map(value => value.account)).toEqual(accounts);
      expect(healthWrites()).toEqual([]);
    }
  });

  it("restarts the generic breaker count after a canonical denial without losing the bound", async () => {
    const accounts = ["A", "B", "C", "D", "E", "F", "G"];
    fixture.connections = accounts.map((id, index) => connection(id, index + 1));
    fixture.denied = new Map([["C", new Set([ASTRA])]]);
    const message = "model is unavailable";
    fixture.systemic = new Map(["A", "B", "D", "E", "F"].map(id => [id, { status: 400, message }]));
    for (let index = 0; index < 5; index++) diagnostics.expectError(`❌ codex [400]: [400]: ${message}`);
    expect((await handleChat(request(ASTRA))).status).toBe(400);
    expect(fixture.requests.map(value => value.account)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(healthWrites()).toHaveLength(5);
  });

  it.each([
    ["rate_limit_exceeded", 429],
    ["insufficient_credits", 503],
  ])("retains typed %s availability instead of caching a contradictory entitlement message", async (code, expectedStatus) => {
    fixture.connections = [connection("A", 1)];
    fixture.denied.clear();
    fixture.systemic = new Map([["A", { status: 400, message: DENIAL(ASTRA), code }]]);
    diagnostics.expectError(`❌ codex [${expectedStatus}]: ${`[400]: ${DENIAL(ASTRA)} (${code})`.slice(0, 100)}`);
    const response = await handleChat(request(ASTRA));
    expect(response.status).toBe(expectedStatus);
    expect(fixture.requests.map(value => value.account)).toEqual(["A"]);
    const writes = healthWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0][1].errorCode).toBe(expectedStatus);
    expect(Object.entries(writes[0][1]).some(([key, value]) => key.startsWith("modelLock_") && Date.parse(value) > Date.now())).toBe(true);
    expect(globalThis[Symbol.for("kitsunerouter.codex-entitlement-denials.v2")].size).toBe(0);
  });

  it("asks the denied account once, then sends later requests for that model straight to the entitled account", async () => {
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    expect(fixture.requests.map(r => r.account)).toEqual(["plus-account", "pro-account"]);

    fixture.requests = [];
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    expect(fixture.requests.map(r => r.account)).toEqual(["pro-account", "pro-account"]);
  });

  it("keeps the denied account in rotation for models it can serve and never marks its credential unhealthy", async () => {
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    fixture.requests = [];
    expect((await handleChat(request(LUNA))).status).toBe(200);
    expect(fixture.requests).toEqual([{ account: "plus-account", model: LUNA }]);
    expect(healthWrites()).toEqual([]);
  });

  it("asks the denied account again after the denial window so a plan upgrade is picked up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    fixture.denied.clear();
    fixture.requests = [];
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    expect(fixture.requests).toEqual([{ account: "plus-account", model: ASTRA }]);
  });

  it("forgets the denial as soon as that account serves the model", async () => {
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    fixture.denied.clear();
    fixture.connections[1].isActive = false;
    fixture.requests = [];
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    fixture.connections[1].isActive = true;
    fixture.requests = [];
    expect((await handleChat(request(ASTRA))).status).toBe(200);
    expect(fixture.requests).toEqual([{ account: "plus-account", model: ASTRA }]);
  });

  it("still asks a denied-only pool rather than reporting every account as rate-limited", async () => {
    fixture.connections = [connection("plus-account", 1)];
    expect((await handleChat(request(ASTRA))).status).toBe(400);
    fixture.requests = [];
    const second = await handleChat(request(ASTRA));
    expect(second.status).toBe(400);
    expect(second.headers.get("retry-after")).toBeNull();
    expect(fixture.requests).toEqual([{ account: "plus-account", model: ASTRA }]);
    expect(healthWrites()).toEqual([]);
  });

  it("keeps the account-level classification unchanged: fallback with no cooldown lock", () => {
    expect(checkFallbackError(400, JSON.stringify({ error: { message: DENIAL(ASTRA), type: "invalid_request_error" } })))
      .toEqual({ shouldFallback: true, cooldownMs: 0 });
  });
});
