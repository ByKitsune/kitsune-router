import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the public request handler, real core response classification, and
// real account selection/health logic. Only persistence and upstream I/O are fake.
const mocks = vi.hoisted(() => ({
  connections: [],
  combo: null,
  aliases: {},
  execute: vi.fn(),
  getProviderConnections: vi.fn(),
  getProviderConnectionById: vi.fn(),
  updateProviderConnection: vi.fn(),
  getSettings: vi.fn(),
  getAdapter: vi.fn(() => { throw new Error("Unexpected real database access"); }),
  fetch: vi.fn(() => { throw new Error("Unexpected network access"); }),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getProviderConnectionById: mocks.getProviderConnectionById,
  updateProviderConnection: mocks.updateProviderConnection,
  getSettings: mocks.getSettings,
  isApiKeyRequired: (settings) => settings.requireApiKey === true,
  validateApiKey: vi.fn(async () => false),
  getProxyPools: vi.fn(async () => []),
  getModelAliases: vi.fn(async () => mocks.aliases),
  getProviderNodes: vi.fn(async () => []),
  getComboByName: vi.fn(async (name) => name === mocks.combo?.name ? mocks.combo : null),
}));

// declaredCaps imports aliasRepo directly rather than through localDb.
vi.mock("../../src/lib/db/repos/aliasRepo.js", () => ({
  getCustomModels: vi.fn(async () => []),
}));
vi.mock("../../src/lib/db/driver.js", () => ({
  getAdapter: mocks.getAdapter,
  getAdapterSync: mocks.getAdapter,
}));
vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledByProvider: vi.fn(async () => []),
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
  pickProxyPoolId: vi.fn(),
}));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
}));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent: vi.fn() }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: vi.fn(async () => null) }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  nextTag: vi.fn(() => ""),
  tagForSession: vi.fn(() => ""),
  line: vi.fn(),
  errorLine: vi.fn(),
  fmtThink: vi.fn(() => "auto"),
  request: vi.fn(),
  response: vi.fn(),
  stream: vi.fn(),
  maskKey: vi.fn(() => "synthetic-key"),
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest: vi.fn(),
    logRawRequest: vi.fn(),
    logTargetRequest: vi.fn(),
    logProviderResponse: vi.fn(),
    logConvertedResponse: vi.fn(),
    logError: vi.fn(),
  }),
}));
// Do not install the global proxy-fetch patch in this offline integration test.
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: mocks.fetch }));
vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: () => ({ execute: mocks.execute }),
  hasSpecializedExecutor: () => true,
}));
vi.mock("../../open-sse/translator/concerns/image.js", () => ({
  encodeDataUri: (mimeType, base64) => `data:${mimeType};base64,${base64}`,
  parseDataUri: (url) => {
    const match = /^data:([^;]+);base64,(.*)$/.exec(url);
    return match ? { mimeType: match[1], base64: match[2] } : null;
  },
  fetchImageAsBase64: async () => null,
}));

const { handleChat } = await import("@/sse/handlers/chat.js");

const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5";

function connection(id) {
  return {
    id,
    provider: "claude",
    authType: "apikey",
    apiKey: `synthetic-budget-test-${id}`,
    isActive: true,
    providerSpecificData: {},
  };
}

function upstream(body, status = 200) {
  return {
    response: new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
    url: "https://upstream.invalid/v1/messages",
    headers: {},
    transformedBody: null,
  };
}

function exhausted() {
  return upstream({
    id: "msg_budget_exhausted",
    type: "message",
    role: "assistant",
    model: SONNET,
    content: [{ type: "thinking", thinking: "Reasoning consumed the available output budget." }],
    stop_reason: "max_tokens",
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 16 },
  });
}

function completed(model = SONNET) {
  return upstream({
    id: "msg_success",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: "The answer is 42." }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 6 },
  });
}

function serverFailure() {
  return upstream({ error: { type: "api_error", message: "Upstream internal server error" } }, 500);
}

function request(model = `cc/${SONNET}`) {
  return new Request("http://localhost:20128/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: 16,
      messages: [{ role: "user", content: "What is the answer?" }],
    }),
  });
}

function attempts() {
  return mocks.execute.mock.calls.map(([{ credentials, model }]) => [credentials.connectionId, model]);
}

function expectNoHealthWrites() {
  const healthWrites = mocks.updateProviderConnection.mock.calls.filter(([, patch]) =>
    Object.keys(patch).some((key) => key.startsWith("modelLock_") || key === "lastError")
      || patch.testStatus === "unavailable"
  );
  expect(healthWrites).toEqual([]);
}

async function expectBudgetError(response) {
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: {
      type: "invalid_request_error",
      code: "output_budget_exhausted",
      param: "max_tokens",
      message: expect.stringContaining("increase max_tokens or reduce reasoning effort"),
    },
  });
  expect(response.headers.get("retry-after")).toBeNull();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockReset();
  mocks.connections = [connection("account-a")];
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.combo = null;
  mocks.aliases = {};
  mocks.getSettings.mockResolvedValue({
    requireApiKey: false,
    fallbackStrategy: "fill-first",
    quotaAwareSelection: false,
    comboStrategy: "fallback",
  });
  mocks.getProviderConnections.mockImplementation(async ({ provider, isActive } = {}) =>
    mocks.connections
      .filter((conn) => (!provider || conn.provider === provider) && (!isActive || conn.isActive))
      .map((conn) => structuredClone(conn))
  );
  mocks.getProviderConnectionById.mockImplementation(async (id) => {
    const conn = mocks.connections.find((candidate) => candidate.id === id);
    return conn ? structuredClone(conn) : null;
  });
  mocks.updateProviderConnection.mockImplementation(async (id, patch) => {
    const conn = mocks.connections.find((candidate) => candidate.id === id);
    if (!conn) throw new Error(`Unknown synthetic account: ${id}`);
    Object.assign(conn, structuredClone(patch));
    return structuredClone(conn);
  });
});

afterEach(() => {
  try {
    // Swallowed DB/network failures must not make a hermetic test pass.
    expect(mocks.getAdapter).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

describe("output-budget exhaustion through handleChat and real account health logic", () => {
  it("returns a structured 400 without retrying or poisoning a healthy Claude account", async () => {
    mocks.execute.mockImplementation(async () => exhausted());

    await expectBudgetError(await handleChat(request()));

    expect(attempts()).toEqual([["account-a", SONNET]]);
    expectNoHealthWrites();

    // The same credential remains available for a subsequent healthy request.
    mocks.execute.mockImplementation(async () => completed());
    const response = await handleChat(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: [{ type: "text", text: "The answer is 42." }] });
    expect(attempts()).toEqual([["account-a", SONNET], ["account-a", SONNET]]);
    expectNoHealthWrites();
  });

  it("tries each of two accounts once and preserves the budget error when both exhaust", async () => {
    mocks.connections.push(connection("account-b"));
    mocks.execute.mockImplementation(async () => exhausted());

    await expectBudgetError(await handleChat(request()));

    expect(attempts()).toEqual([["account-a", SONNET], ["account-b", SONNET]]);
    expectNoHealthWrites();
  });

  it("preserves upstream diagnostics after a zero-cooldown model failure exhausts the account list", async () => {
    mocks.execute.mockImplementation(async () => upstream({
      error: {
        type: "invalid_request_error",
        code: "unsupported_schema",
        param: "tools",
        message: "Unsupported schema in tool definition",
      },
    }, 400));

    const response = await handleChat(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error", code: "unsupported_schema", param: "tools" },
    });
    expect(attempts()).toEqual([["account-a", SONNET]]);
    expectNoHealthWrites();
  });

  it("falls through to a second account without locking the exhausted first account", async () => {
    mocks.connections.push(connection("account-b"));
    mocks.execute.mockImplementation(async ({ credentials }) =>
      credentials.connectionId === "account-a" ? exhausted() : completed()
    );

    const response = await handleChat(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: [{ type: "text", text: "The answer is 42." }] });
    expect(attempts()).toEqual([["account-a", SONNET], ["account-b", SONNET]]);
    expectNoHealthWrites();
  });

  it("advances a combo to a model that can answer without changing credential health", async () => {
    mocks.combo = { name: "budget-safe-combo", models: [`cc/${SONNET}`, `cc/${OPUS}`] };
    mocks.execute.mockImplementation(async ({ model }) => model === SONNET ? exhausted() : completed(OPUS));

    const response = await handleChat(request("budget-safe-combo"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      model: "budget-safe-combo",
      content: [{ type: "text", text: "The answer is 42." }],
    });
    expect(attempts()).toEqual([["account-a", SONNET], ["account-a", OPUS]]);
    expectNoHealthWrites();
  });

  it.each([
    ["single-model alias", [`cc/${SONNET}`]],
    ["all exhausted models", [`cc/${SONNET}`, `cc/${OPUS}`]],
  ])("preserves the budget error through a %s combo", async (_, models) => {
    mocks.combo = { name: "claude-mythos-5", models };
    mocks.execute.mockImplementation(async () => exhausted());

    await expectBudgetError(await handleChat(request("claude-mythos-5")));

    expect(attempts()).toEqual(models.map((model) => ["account-a", model.slice(3)]));
    expectNoHealthWrites();
  });

  it("still grants a genuine upstream 500 one immediate retry before any health lock", async () => {
    mocks.execute.mockImplementationOnce(async () => serverFailure());
    mocks.execute.mockImplementation(async () => completed());

    const response = await handleChat(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: [{ type: "text", text: "The answer is 42." }] });
    expect(attempts()).toEqual([["account-a", SONNET], ["account-a", SONNET]]);
    expectNoHealthWrites();
  });

  it("still cools down a repeatedly failing upstream account for 30 seconds and uses its sibling", async () => {
    mocks.connections.push(connection("account-b"));
    mocks.execute.mockImplementation(async ({ credentials }) =>
      credentials.connectionId === "account-a" ? serverFailure() : completed()
    );
    const startedAt = Date.now();

    const response = await handleChat(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: [{ type: "text", text: "The answer is 42." }] });
    expect(attempts()).toEqual([["account-a", SONNET], ["account-a", SONNET], ["account-b", SONNET]]);
    expect(mocks.updateProviderConnection).toHaveBeenCalledWith("account-a", expect.objectContaining({
      testStatus: "unavailable",
      errorCode: 500,
      lastError: expect.stringContaining("Upstream internal server error"),
    }));
    const failedAccount = mocks.connections.find((conn) => conn.id === "account-a");
    const lockUntil = Date.parse(failedAccount[`modelLock_${SONNET}`]);
    expect(lockUntil).toBeGreaterThanOrEqual(startedAt + 30_000);
    expect(lockUntil).toBeLessThanOrEqual(Date.now() + 30_000);

    // Subsequent traffic respects the persisted lock instead of retrying A.
    const nextResponse = await handleChat(request());
    expect(nextResponse.status).toBe(200);
    expect(await nextResponse.json()).toMatchObject({ content: [{ type: "text", text: "The answer is 42." }] });
    expect(attempts()).toEqual([
      ["account-a", SONNET], ["account-a", SONNET], ["account-b", SONNET], ["account-b", SONNET],
    ]);
  });
});

describe("public quota status through direct, alias and combo routing", () => {
  it("keeps typed validation authoritative through real account-health and combo boundaries", async () => {
    mocks.connections.push(connection("account-b"));
    mocks.combo = { name: "validation-combo", models: [`cc/${SONNET}`, `cc/${OPUS}`] };
    mocks.execute.mockImplementation(async () => upstream({ error: {
      type: "invalid_request_error", code: "invalid_parameter", param: "messages.0.role",
      message: "Expected one of system, user, assistant; received 'quota exhausted retry in 6 hours'",
    } }, 400));
    const response = await handleChat(request("validation-combo"));
    expect(response.status).toBe(400);
    expect(response.headers.get("retry-after")).toBeNull();
    expect((await response.json()).error).toMatchObject({ code: "invalid_parameter", param: "messages.0.role" });
    expect(attempts()).toEqual([["account-a", SONNET]]);
    expectNoHealthWrites();
    mocks.execute.mockImplementation(async () => completed());
    expect((await handleChat(request())).status).toBe(200);
  });
  it.each(["direct", "alias", "combo"])("keeps first failure and later cooldown status truthful on a %s route", async route => {
    mocks.aliases = { "quota-alias": `cc/${SONNET}` };
    mocks.combo = { name: "quota-combo", models: ["quota-alias"] };
    const model = route === "direct" ? `cc/${SONNET}` : route === "alias" ? "quota-alias" : "quota-combo";
    mocks.execute.mockImplementation(async () => ({
      ...upstream({ error: { type: "rate_limit_error", code: "usage_limit_reached", message: "Your usage limit has been reached. Try again in 60 seconds." } }, 400),
    }));
    const startedAt = Date.now();
    const first = await handleChat(request(model));
    expect(first.status).toBe(429);
    const firstError = (await first.json()).error;
    expect(firstError).toMatchObject({ type: "rate_limit_error", code: "rate_limit_exceeded", request_id: expect.any(String), message: expect.stringContaining("usage limit") });
    expect(Number(first.headers.get("retry-after"))).toBeGreaterThanOrEqual(59);
    expect(attempts()).toEqual([["account-a", SONNET]]);
    const lock = Date.parse(mocks.connections[0][`modelLock_${SONNET}`]);
    expect(lock).toBeGreaterThanOrEqual(startedAt + 59000);
    const later = await handleChat(request(model));
    expect(later.status).toBe(429);
    expect((await later.json()).error).toMatchObject({ type: "rate_limit_error", code: "rate_limit_exceeded", request_id: expect.any(String) });
    expect(Number(later.headers.get("retry-after"))).toBeGreaterThanOrEqual(59);
    expect(attempts()).toEqual([["account-a", SONNET]]);
  });

  it("returns a true unknown-model 404 without cooling a healthy credential", async () => {
    mocks.execute.mockImplementation(async () => upstream({ error: { message: "Unknown model", code: "model_not_found" } }, 404));
    const response = await handleChat(request());
    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatchObject({ type: "invalid_request_error", code: "model_not_found", request_id: expect.any(String) });
    expect(response.headers.get("retry-after")).toBeNull();
    expectNoHealthWrites();
    mocks.execute.mockImplementation(async () => completed());
    expect((await handleChat(request())).status).toBe(200);
  });
});
