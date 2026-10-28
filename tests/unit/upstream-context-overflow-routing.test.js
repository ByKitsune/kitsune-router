import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the public handler, real Copilot executor, account health, combo
// routing and response correlation. Persistence and upstream transport are fake.
const io = vi.hoisted(() => ({
  connections: [], combo: null, transport: vi.fn(), unexpectedNetwork: vi.fn(), unexpectedDb: vi.fn(),
  getProviderConnections: vi.fn(), getProviderConnectionById: vi.fn(), updateProviderConnection: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: io.getProviderConnections, getProviderConnectionById: io.getProviderConnectionById,
  updateProviderConnection: io.updateProviderConnection, getSettings: io.getSettings,
  isApiKeyRequired: settings => settings.requireApiKey === true, validateApiKey: vi.fn(async () => false),
  getProxyPools: vi.fn(async () => []), getModelAliases: vi.fn(async () => ({})),
  getProviderNodes: vi.fn(async () => []), getComboByName: vi.fn(async name => name === io.combo?.name ? io.combo : null),
}));
vi.mock("../../src/lib/db/repos/aliasRepo.js", () => ({ getCustomModels: vi.fn(async () => []) }));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: io.unexpectedDb, getAdapterSync: io.unexpectedDb }));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: vi.fn(async () => []) }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn(async () => ({})), pickProxyPoolId: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}), enqueueRequestUsage: vi.fn(async () => ({ accepted: true })),
}));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent: vi.fn() }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: vi.fn(async () => null) }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), nextTag: vi.fn(() => ""),
  tagForSession: vi.fn(() => ""), line: vi.fn(), errorLine: vi.fn(), fmtThink: vi.fn(() => "auto"),
  request: vi.fn(), response: vi.fn(), stream: vi.fn(), maskKey: vi.fn(() => "synthetic"),
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.transport }));
vi.mock("../../open-sse/executors/index.js", async () => {
  const { GithubExecutor } = await import("../../open-sse/executors/github.js");
  const github = new GithubExecutor();
  github.knownCodexModels.add("gpt-5.3-codex");
  return {
    getExecutor: provider => {
      if (provider !== "github") throw new Error(`Unexpected executor ${provider}`);
      return github;
    },
    hasSpecializedExecutor: provider => provider === "github",
  };
});
vi.mock("../../open-sse/translator/concerns/image.js", () => ({
  encodeDataUri: (mimeType, base64) => `data:${mimeType};base64,${base64}`,
  parseDataUri: () => null, fetchImageAsBase64: async () => null,
}));

const { handleChat } = await import("@/sse/handlers/chat.js");

const model = "gpt-5.3-codex";
const capable = "gpt-5.5";
const contextMessage = "Your input exceeds the context window of this model. Please adjust your input and try again.";
const privateHistory = "synthetic private conversation to retain";

function connection(id) {
  return {
    id, provider: "github", authType: "oauth", accessToken: "synthetic-oauth", isActive: true,
    providerSpecificData: { copilotToken: `synthetic-copilot-${id}`, copilotTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600 },
  };
}

function request({ endpoint = "/v1/chat/completions", requestedModel = `gh/${model}`, stream = false, signal } = {}) {
  const content = [{ role: "user", content: privateHistory }];
  const body = endpoint === "/v1/responses" ? { input: content } : { messages: content };
  return new Request(`http://localhost:20128${endpoint}`, {
    method: "POST", headers: { "content-type": "application/json" }, signal,
    body: JSON.stringify({ model: requestedModel, stream, ...body }),
  });
}

function rejected(error = { message: contextMessage, code: "invalid_request_body" }, extra = {}) {
  return Response.json({ error, ...extra }, { status: 400, headers: { "retry-after": "120", "x-request-id": "upstream_fixture" } });
}

function succeeded() {
  return Response.json({ id: "chatcmpl_fixture", object: "chat.completion", model: capable,
    choices: [{ index: 0, message: { role: "assistant", content: "offline answer" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } });
}

function noHealthWrites() {
  expect(io.updateProviderConnection.mock.calls.filter(([, patch]) =>
    Object.keys(patch).some(key => key.startsWith("modelLock_") || key === "lastError") || patch.testStatus === "unavailable"
  )).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  io.transport.mockReset();
  io.unexpectedNetwork.mockReset().mockImplementation(() => { throw new Error("Unexpected real network"); });
  io.unexpectedDb.mockReset().mockImplementation(() => { throw new Error("Unexpected real database"); });
  vi.stubGlobal("fetch", io.unexpectedNetwork);
  io.connections = [connection("account-a"), connection("account-b")];
  io.combo = null;
  io.getSettings.mockResolvedValue({ requireApiKey: false, fallbackStrategy: "fill-first", quotaAwareSelection: false, comboStrategy: "fallback" });
  io.getProviderConnections.mockImplementation(async ({ provider, isActive } = {}) => io.connections
    .filter(conn => (!provider || conn.provider === provider) && (!isActive || conn.isActive)).map(conn => structuredClone(conn)));
  io.getProviderConnectionById.mockImplementation(async id => {
    const conn = io.connections.find(candidate => candidate.id === id);
    return conn ? structuredClone(conn) : null;
  });
  io.updateProviderConnection.mockImplementation(async (id, patch) => {
    const conn = io.connections.find(candidate => candidate.id === id);
    if (!conn) throw new Error("Unknown synthetic account");
    Object.assign(conn, structuredClone(patch));
    return structuredClone(conn);
  });
});

afterEach(() => {
  try {
    expect(io.unexpectedNetwork).not.toHaveBeenCalled();
    expect(io.unexpectedDb).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

describe("Copilot context overflow through real routing", () => {
  it.each([
    ["/v1/chat/completions", false], ["/v1/chat/completions", true],
    ["/v1/responses", false], ["/v1/responses", true],
  ])("returns the structured terminal HTTP error for %s stream=%s without rotating or locking accounts", async (endpoint, stream) => {
    io.transport.mockImplementation(async () => rejected({ message: contextMessage, code: "invalid_request_body", debug: "private-field" }, { debug: "private-outer" }));
    const response = await handleChat(request({ endpoint, stream }), null, "req_client_fixture");
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("retry-after")).toBeNull();
    const body = await response.json();
    expect(body.error).toMatchObject({ message: contextMessage, type: "invalid_request_error", code: "context_length_exceeded", request_id: "req_client_fixture" });
    expect(JSON.stringify(body)).not.toMatch(/private-field|private-outer|synthetic-oauth|synthetic-copilot|synthetic private conversation/);
    expect(io.transport).toHaveBeenCalledTimes(1);
    expect(io.transport.mock.calls[0][0]).toBe("https://api.githubcopilot.com/responses");
    noHealthWrites();
  });

  it("leaves the same account available for a later valid request", async () => {
    io.transport.mockResolvedValueOnce(rejected());
    await handleChat(request());
    // Return an unrelated request error so this control does not depend on a
    // successful upstream stream or mutate health on success.
    io.transport.mockResolvedValueOnce(rejected({ message: "Invalid parameter temperature", code: "invalid_parameter", param: "temperature" }));
    const response = await handleChat(request());
    expect((await response.json()).error).toMatchObject({ code: "invalid_parameter", param: "temperature" });
    expect(io.transport).toHaveBeenCalledTimes(2);
    expect(io.getProviderConnectionById.mock.calls.every(([id]) => id === "account-a")).toBe(true);
    noHealthWrites();
  });

  it.each(["/v1/chat/completions", "/v1/responses"])("tries a larger-capable combo member for %s without altering history or account health", async endpoint => {
    io.combo = { name: "large-context-combo", models: [`gh/${model}`, `gh/${capable}`] };
    io.transport.mockImplementation(async (_url, init) => JSON.parse(init.body).model === model ? rejected() : succeeded());
    const response = await handleChat(request({ endpoint, requestedModel: io.combo.name }));
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain("offline answer");
    expect(io.transport).toHaveBeenCalledTimes(2);
    expect(io.transport.mock.calls.map(([, init]) => JSON.parse(init.body).model)).toEqual([model, capable]);
    for (const [, init] of io.transport.mock.calls) expect(init.body).toContain(privateHistory);
    noHealthWrites();
  });

  it("retains the final structured context error when all configured combo models reject it", async () => {
    io.combo = { name: "all-too-small", models: [`gh/${model}`, `gh/${capable}`] };
    io.transport.mockImplementation(async () => rejected());
    const response = await handleChat(request({ requestedModel: io.combo.name }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("context_length_exceeded");
    expect(io.transport).toHaveBeenCalledTimes(2);
    noHealthWrites();
  });

  it("still falls back across fake accounts for a genuine typed quota error", async () => {
    io.transport.mockImplementation(async () => Response.json({ error: {
      message: "Quota exceeded", type: "rate_limit_error", code: "rate_limit_exceeded",
    } }, { status: 429, headers: { "retry-after": "30" } }));
    const response = await handleChat(request());
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("rate_limit_exceeded");
    expect(io.transport.mock.calls.map(([, init]) => init.headers.Authorization)).toEqual([
      "Bearer synthetic-copilot-account-a", "Bearer synthetic-copilot-account-b",
    ]);
    // These are in-memory fake records only; the real DB and network are guarded.
    expect(io.updateProviderConnection).toHaveBeenCalledTimes(2);
    expect(io.connections.every(conn => conn.testStatus === "unavailable")).toBe(true);
  });

  it.each([
    ["/v1/chat/completions", `Invalid parameter value: "${contextMessage} quota exhausted; retry in 6 hours"`],
    ["/v1/responses", `Invalid parameter value: "${contextMessage} quota exhausted; retry in 6 hours"`],
    ["/v1/chat/completions", `Bad input: "${contextMessage} quota exhausted; retry in 6 hours; debug: private"`],
    ["/v1/responses", `Bad input: "${contextMessage} quota exhausted; retry in 6 hours; debug: private"`],
    ["/v1/responses", `Bad input: "${contextMessage} quota exhausted; retry in 6 hours; ${"x".repeat(700)}"`],
  ])("preserves unrelated validation and quoted malicious text in a %s combo", async (endpoint, message) => {
    io.combo = { name: "validation-combo", models: [`gh/${model}`, `gh/${capable}`] };
    io.transport.mockImplementation(async () => rejected({ message, code: "invalid_request_body" }));
    const response = await handleChat(request({ endpoint, requestedModel: io.combo.name }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request_body");
    expect(JSON.stringify(body)).not.toContain("debug: private");
    expect(response.headers.get("retry-after")).toBeNull();
    expect(io.transport).toHaveBeenCalledTimes(1);
    noHealthWrites();
  });

  it("keeps caller abort terminal while reading a partial error, without trying another model or account", async () => {
    io.combo = { name: "abort-combo", models: [`gh/${model}`, `gh/${capable}`] };
    let reading;
    const started = new Promise(resolve => { reading = resolve; });
    const cancel = vi.fn();
    io.transport.mockImplementation(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"error":{"message":"')); },
      pull() { reading(); }, cancel,
    }, { highWaterMark: 0 }), { status: 400 }));
    const abort = new AbortController();
    const pending = handleChat(request({ endpoint: "/v1/responses", requestedModel: io.combo.name, stream: true, signal: abort.signal }));
    await started;
    abort.abort(new Error("synthetic caller left"));
    const response = await pending;
    expect(response.status).toBe(499);
    expect(io.transport).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    noHealthWrites();
  });
});
