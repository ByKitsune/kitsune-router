import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real routing, account health and combo decisions; only persistence and
// upstream transport are replaced with synthetic in-memory fixtures.
const io = vi.hoisted(() => ({
  connections: [], combo: null, execute: vi.fn(), enqueue: vi.fn(),
  getProviderConnections: vi.fn(), getProviderConnectionById: vi.fn(), updateProviderConnection: vi.fn(),
  getSettings: vi.fn(), unexpectedDb: vi.fn(), unexpectedNetwork: vi.fn(),
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
  saveRequestUsage: io.enqueue, enqueueRequestUsage: io.enqueue,
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
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.unexpectedNetwork }));
vi.mock("../../open-sse/executors/index.js", () => ({ getExecutor: () => ({ execute: io.execute }), hasSpecializedExecutor: () => true }));
vi.mock("../../open-sse/translator/concerns/image.js", () => ({
  encodeDataUri: (mimeType, base64) => `data:${mimeType};base64,${base64}`,
  parseDataUri: () => null, fetchImageAsBase64: async () => null,
}));

const { handleChat } = await import("@/sse/handlers/chat.js");
const { POST: messagesPost } = await import("../../src/app/api/v1/messages/route.js");
const { POST: chatPost } = await import("../../src/app/api/v1/chat/completions/route.js");
const { POST: responsesPost } = await import("../../src/app/api/v1/responses/route.js");
const firstModel = "gpt-5.5";
const secondModel = "gpt-5.4";

const connection = (id, provider = "codex") => ({ id, provider, authType: "apikey", apiKey: "synthetic-key", isActive: true, providerSpecificData: {} });
const frame = event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
const upstream = event => ({ response: new Response(frame(event), { headers: { "content-type": "text/event-stream" } }),
  url: "https://upstream.invalid/responses", headers: {}, transformedBody: null });
const failed = () => upstream({ type: "response.failed", response: { id: "resp_failed", status: "failed",
  error: { type: "server_error", code: "unsupported_parameter", param: "max_tokens", status: 400, message: "Invalid parameter max_tokens" },
  usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 },
} });
const completed = () => upstream({ type: "response.completed", response: { id: "resp_success", status: "completed", object: "response",
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "synthetic answer" }] }],
  usage: { input_tokens: 11, output_tokens: 3, total_tokens: 14 },
} });
const request = (model, endpoint = "/v1/messages", extra = {}) => new Request(`http://localhost:20128${endpoint}`, { method: "POST",
  headers: { "content-type": "application/json", "user-agent": "synthetic-opposite-client" },
  body: JSON.stringify({ model, stream: false, max_tokens: 16,
    ...(endpoint === "/v1/responses" ? { input: [{ role: "user", content: "fixture" }] } : { messages: [{ role: "user", content: "fixture" }] }), ...extra }) });
const attempts = () => io.execute.mock.calls.map(([options]) => [options.credentials.connectionId, options.model]);
const noHealthWrites = () => expect(io.updateProviderConnection.mock.calls.filter(([, patch]) =>
  Object.keys(patch).some(key => key.startsWith("modelLock_") || key === "lastError") || patch.testStatus === "unavailable"
)).toEqual([]);

beforeEach(() => {
  vi.clearAllMocks();
  io.connections = [connection("account-a"), connection("account-b")];
  io.combo = null;
  io.execute.mockReset();
  io.enqueue.mockReset().mockImplementation(async entry => ({ accepted: true, eventId: entry.eventId }));
  io.unexpectedDb.mockReset().mockImplementation(() => { throw new Error("Unexpected database"); });
  io.unexpectedNetwork.mockReset().mockImplementation(() => { throw new Error("Unexpected network"); });
  vi.stubGlobal("fetch", io.unexpectedNetwork);
  io.getSettings.mockResolvedValue({ requireApiKey: false, fallbackStrategy: "fill-first", quotaAwareSelection: false, comboStrategy: "fallback" });
  io.getProviderConnections.mockImplementation(async ({ provider, isActive } = {}) => io.connections
    .filter(conn => (!provider || conn.provider === provider) && (!isActive || conn.isActive)).map(conn => structuredClone(conn)));
  io.getProviderConnectionById.mockImplementation(async id => structuredClone(io.connections.find(conn => conn.id === id) || null));
  io.updateProviderConnection.mockImplementation(async (id, patch) => {
    const conn = io.connections.find(candidate => candidate.id === id);
    if (!conn) throw new Error("Unknown synthetic account");
    Object.assign(conn, structuredClone(patch));
    return structuredClone(conn);
  });
});

afterEach(() => {
  try {
    expect(io.unexpectedDb).not.toHaveBeenCalled();
    expect(io.unexpectedNetwork).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

describe("Responses invalid input through actual account and combo selection", () => {
  it("does not rotate or lock an account for invalid input, and reuses it on the next request", async () => {
    io.execute.mockImplementationOnce(async () => failed()).mockImplementationOnce(async () => completed());
    const invalid = await handleChat(request(`cx/${firstModel}`));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toMatchObject({ code: "unsupported_parameter", param: "max_tokens" });
    expect(attempts()).toEqual([["account-a", firstModel]]);
    noHealthWrites();
    const valid = await handleChat(request(`cx/${firstModel}`));
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ content: [{ type: "text", text: "synthetic answer" }] });
    expect(attempts()).toEqual([["account-a", firstModel], ["account-a", firstModel]]);
    expect(io.enqueue).toHaveBeenCalledTimes(2);
    noHealthWrites();
  });

  it("falls back to the next combo model without locking or changing accounts", async () => {
    io.combo = { name: "synthetic-combo", models: [`cx/${firstModel}`, `cx/${secondModel}`] };
    io.execute.mockImplementation(async ({ model }) => model === firstModel ? failed() : completed());
    const result = await handleChat(request(io.combo.name));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ content: [{ type: "text", text: "synthetic answer" }] });
    expect(attempts()).toEqual([["account-a", firstModel], ["account-a", secondModel]]);
    expect(io.enqueue).toHaveBeenCalledTimes(2);
    const entries = io.enqueue.mock.calls.map(([entry]) => entry);
    expect(entries[0].tokens).toMatchObject({ prompt_tokens: 11, completion_tokens: 2 });
    expect(entries[1].tokens).toMatchObject({ prompt_tokens: 11, completion_tokens: 3 });
    expect(entries[0].eventId).not.toBe(entries[1].eventId);
    noHealthWrites();
  });

  it("maps the final error after all compatible combo models reject the request", async () => {
    io.combo = { name: "all-reject-combo", models: [`cx/${firstModel}`, `cx/${secondModel}`] };
    io.execute.mockImplementation(async () => failed());
    const result = await messagesPost(request(io.combo.name));
    expect(result.status).toBe(400);
    expect((await result.json()).error).toMatchObject({ type: "invalid_request_error", code: "unsupported_parameter", param: "max_tokens" });
    expect(attempts()).toEqual([["account-a", firstModel], ["account-a", secondModel]]);
    expect(io.enqueue).toHaveBeenCalledTimes(2);
    noHealthWrites();
  });

  it("does not rewrite type before combo classification of a sanitized validation error", async () => {
    io.combo = { name: "boundary-combo", models: [`cx/${firstModel}`, `cx/${secondModel}`] };
    io.execute.mockImplementation(async ({ model }) => model === firstModel ? upstream({ type: "response.failed", response: {
      status: "failed", error: { type: "quota_error", code: "opaque", status: 400, message: "{Invalid parameter value}" },
      usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 },
    } }) : completed());
    const result = await handleChat(request(io.combo.name));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ content: [{ type: "text", text: "synthetic answer" }] });
    expect(attempts()).toEqual([["account-a", firstModel], ["account-a", secondModel]]);
    noHealthWrites();
  });
});

describe.each(["forced SSE", "non-stream SSE", "non-stream JSON"])("public Claude %s errors", path => {
  it.each([
    [{ type: "server_error", code: "internal_server_error", status: 500 }, "api_error"],
    [{ type: "stream_error", code: "stream_disconnected", status: 502 }, "api_error"],
    [{ type: "rate_limit_error", code: "rate_limit_exceeded", status: 429 }, "rate_limit_error"],
    [{ type: "authentication_error", code: "invalid_api_key", status: 401 }, "authentication_error"],
    [{ type: "server_error", code: "unsupported_parameter", status: 400, param: "max_tokens" }, "invalid_request_error"],
    [{ type: "overloaded_error", code: "native_code", status: 529 }, "overloaded_error"],
  ])("maps %j at the final client boundary", async (diagnostic, type) => {
    const provider = path === "forced SSE" ? "codex" : "deepseek";
    const route = provider === "codex" ? `cx/${firstModel}` : "deepseek/deepseek-flash";
    io.connections = [connection("account-a", provider)];
    const error = { ...diagnostic, message: "Failure Bearer synthetic-secret private@example.test", debug: "private-debug" };
    const failedResponse = { id: "resp_fixture", object: "response", status: "failed", error,
      usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 }, output: [] };
    io.execute.mockImplementation(async () => ({
      response: path === "non-stream JSON" ? Response.json(failedResponse) : new Response(frame({ type: "response.failed", response: failedResponse }), { headers: { "content-type": "text/event-stream" } }),
      responseFormat: "openai-responses", url: "https://upstream.invalid/responses", headers: {}, transformedBody: null,
    }));
    const result = await messagesPost(request(route));
    expect(io.execute.mock.calls[0][0].stream).toBe(path === "forced SSE");
    expect(result.status).toBe(diagnostic.status);
    const requestId = result.headers.get("x-request-id");
    expect(requestId).toBeTruthy();
    const body = await result.json();
    expect(body.error).toMatchObject({ type, code: diagnostic.code, request_id: requestId });
    if (diagnostic.param) expect(body.error.param).toBe(diagnostic.param);
    for (const secret of ["synthetic-secret", "private@example.test", "private-debug"]) expect(JSON.stringify(body)).not.toContain(secret);
    expect(io.enqueue).toHaveBeenCalledTimes([500, 502].includes(diagnostic.status) ? 2 : 1);
    for (const [entry] of io.enqueue.mock.calls) expect(entry.tokens).toMatchObject({ prompt_tokens: 11, completion_tokens: 2 });
  });

  it("keeps rejected usage acceptance terminal and does not lock an account", async () => {
    const provider = path === "forced SSE" ? "codex" : "deepseek";
    const route = provider === "codex" ? `cx/${firstModel}` : "deepseek/deepseek-flash";
    io.connections = [connection("account-a", provider)];
    const failedResponse = { id: "resp_fixture", object: "response", status: "failed",
      error: { type: "server_error", code: "internal_server_error", status: 500, message: "Failure" },
      usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 }, output: [] };
    io.execute.mockImplementation(async () => ({
      response: path === "non-stream JSON" ? Response.json(failedResponse) : new Response(frame({ type: "response.failed", response: failedResponse }), { headers: { "content-type": "text/event-stream" } }),
      responseFormat: "openai-responses", url: "https://upstream.invalid/responses", headers: {}, transformedBody: null,
    }));
    io.enqueue.mockRejectedValue(new Error("synthetic acceptance failure"));
    const result = await messagesPost(request(route));
    expect(io.execute.mock.calls[0][0].stream).toBe(path === "forced SSE");
    expect(result.status).toBe(503);
    expect(result.headers.get("x-should-retry")).toBe("false");
    expect((await result.json()).error).toMatchObject({ type: "api_error", code: "usage_acceptance_failed" });
    expect(io.execute).toHaveBeenCalledOnce();
    expect(io.enqueue).toHaveBeenCalledOnce();
    noHealthWrites();
  });
});

describe("public endpoint and native error type preservation", () => {
  it.each(["/v1/chat/completions", "/v1/responses"])("does not apply Claude mapping to %s", async endpoint => {
    io.connections = [connection("account-a")];
    io.execute.mockImplementation(async () => upstream({ type: "response.failed", response: { status: "failed",
      error: { type: "server_error", code: "internal_server_error", status: 500, message: "Failure" },
      usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 },
    } }));
    const result = await (endpoint === "/v1/responses" ? responsesPost : chatPost)(request(`cx/${firstModel}`, endpoint, { system: "Claude-looking body" }));
    expect(result.status).toBe(500);
    expect((await result.json()).error).toMatchObject({ type: "server_error", code: "internal_server_error", request_id: result.headers.get("x-request-id") });
  });

  it("keeps the documented native Anthropic type", async () => {
    io.connections = [connection("account-a", "claude")];
    io.execute.mockImplementation(async () => ({
      response: Response.json({ type: "error", error: { type: "overloaded_error", code: "native_code", status: 529, message: "Native failure" },
        usage: { input_tokens: 11, output_tokens: 2 } }),
      responseFormat: "claude", url: "https://upstream.invalid/messages", headers: {}, transformedBody: null,
    }));
    const result = await messagesPost(request("cc/claude-sonnet-5-5"));
    expect(result.status).toBe(529);
    expect((await result.json()).error).toMatchObject({ type: "overloaded_error", code: "native_code", request_id: result.headers.get("x-request-id") });
    expect(io.enqueue).toHaveBeenCalledOnce();
  });

  it.each([
    ["/v1/messages", "api_error"],
    ["/v1/responses", "server_error"],
  ])("uses the endpoint format for an error before body decoding on %s", async (endpoint, type) => {
    io.getSettings.mockRejectedValueOnce(new Error("synthetic settings failure"));
    const result = await (endpoint === "/v1/messages" ? messagesPost : responsesPost)(request(`cx/${firstModel}`, endpoint));
    expect(result.status).toBe(500);
    expect((await result.json()).error).toMatchObject({ type, code: "internal_server_error", request_id: result.headers.get("x-request-id") });
    expect(io.execute).not.toHaveBeenCalled();
    noHealthWrites();
  });

  it("uses body detection only for an endpoint without a defined format", async () => {
    io.connections = [connection("account-a")];
    io.execute.mockImplementation(async () => upstream({ type: "response.failed", response: { status: "failed",
      error: { type: "server_error", code: "internal_server_error", status: 500, message: "Failure" },
      usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 },
    } }));
    const result = await handleChat(request(`cx/${firstModel}`, "/v1/api/chat", { system: "Claude system" }), null, "req_body_fixture");
    expect(result.status).toBe(500);
    expect((await result.json()).error).toMatchObject({ type: "api_error", code: "internal_server_error", request_id: "req_body_fixture" });
  });

  it("matches chatCore body detection after model qualification for an unrecognized endpoint", async () => {
    io.connections = [connection("account-a")];
    io.combo = { name: "body-format-combo", models: [`cx/${firstModel}`] };
    io.execute.mockImplementation(async () => upstream({ type: "response.failed", response: { status: "failed",
      error: { type: "server_error", code: "unsupported_parameter", param: "max_tokens", status: 400, message: "Invalid parameter max_tokens" },
      usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 },
    } }));
    const result = await handleChat(request(io.combo.name, "/v1/api/chat", { messages: [{ role: "user", content: [
      { type: "text", text: "fixture" }, { type: "tool_result", tool_use_id: "tool_1", content: "result" },
    ] }] }), null, "req_qualified_fixture");
    expect(result.status).toBe(400);
    expect((await result.json()).error).toMatchObject({ type: "server_error", code: "unsupported_parameter", request_id: "req_qualified_fixture" });
    expect(io.execute).toHaveBeenCalledOnce();
    noHealthWrites();
  });

  it("keeps concurrent endpoint formats isolated during fallback", async () => {
    io.connections = [connection("account-a")];
    io.execute.mockImplementation(async () => upstream({ type: "response.failed", response: { status: "failed",
      error: { type: "server_error", code: "unsupported_parameter", param: "max_tokens", status: 400, message: "Invalid parameter max_tokens" },
      usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 },
    } }));
    const [claude, openai] = await Promise.all([
      messagesPost(request(`cx/${firstModel}`)),
      chatPost(request(`cx/${firstModel}`, "/v1/chat/completions", { system: "Claude-looking body" })),
    ]);
    expect(claude.status).toBe(400);
    expect(openai.status).toBe(400);
    expect((await claude.json()).error).toMatchObject({ type: "invalid_request_error", code: "unsupported_parameter" });
    expect((await openai.json()).error).toMatchObject({ type: "server_error", code: "unsupported_parameter" });
    expect(io.execute).toHaveBeenCalledTimes(2);
    noHealthWrites();
  });

  it("does not buffer or rewrite successful HTTP streaming framing at correlation", async () => {
    io.connections = [connection("account-a")];
    io.execute.mockImplementation(async () => failed());
    const result = await messagesPost(request(`cx/${firstModel}`, "/v1/messages", { stream: true }));
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toContain("text/event-stream");
    const text = await result.text();
    expect(text).toContain("event: error");
    expect(text).toContain('"type":"invalid_request_error"');
    expect(text).toContain('"code":"unsupported_parameter"');
    expect(text).not.toContain("event: message_stop");
    expect(text).not.toContain("[DONE]");
    expect(io.enqueue).toHaveBeenCalledOnce();
    expect(io.enqueue.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 11, completion_tokens: 2 });
    noHealthWrites();
  });
});
