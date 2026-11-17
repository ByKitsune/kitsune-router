import { createServer } from "node:http";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real public route, combo, BaseExecutor, chat core and local HTTP transport.
// Persistence and proactive credential refresh use isolated synthetic fixtures.
const io = vi.hoisted(() => ({
  connections: [], combo: null, settings: {}, nativeFetch: globalThis.fetch, proactive: vi.fn(), project: vi.fn(), persist: vi.fn(), refresh: vi.fn(), warn: vi.fn(), origin: "", policyTarget: false, calls: [], unexpectedNetwork: vi.fn(), unexpectedDb: vi.fn(),
  getProviderConnections: vi.fn(), getProviderConnectionById: vi.fn(), updateProviderConnection: vi.fn(),
  enqueue: vi.fn(), info: vi.fn(), error: vi.fn(), comboLookupCount: 0, deferCombo: false,
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: io.getProviderConnections, getProviderConnectionById: io.getProviderConnectionById,
  updateProviderConnection: io.updateProviderConnection, getSettings: async () => io.settings,
  isApiKeyRequired: () => false, validateApiKey: vi.fn(async () => false),
  getProxyPools: vi.fn(async () => []), getModelAliases: vi.fn(async () => ({})),
  getProviderNodes: vi.fn(async () => []), getComboByName: vi.fn(async name => {
    if (name !== io.combo?.name) return null;
    io.comboLookupCount++;
    return io.deferCombo && io.comboLookupCount === 1 ? null : io.combo;
  }),
}));
vi.mock("../../src/lib/db/repos/aliasRepo.js", () => ({ getCustomModels: vi.fn(async () => []) }));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: io.unexpectedDb, getAdapterSync: io.unexpectedDb }));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: vi.fn(async () => []) }));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => null }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn(async value => ({ ...value, proxyPoolId: value.proxyPoolId ?? value.connectionProxyPoolId })), pickProxyPoolId: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}), enqueueRequestUsage: io.enqueue,
}));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent: vi.fn() }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: vi.fn(async () => null) }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: io.info, warn: io.warn, error: io.error, nextTag: vi.fn(() => ""),
  tagForSession: vi.fn(() => ""), line: vi.fn(), errorLine: vi.fn(), fmtThink: vi.fn(() => "auto"),
  request: vi.fn(), response: vi.fn(), stream: vi.fn(), maskKey: vi.fn(() => "synthetic"),
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));
vi.mock("../../open-sse/services/projectId.js", () => ({ getProjectIdForConnection: io.project }));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken: io.proactive, updateProviderCredentials: io.persist }));
vi.mock("../../open-sse/executors/index.js", async () => {
  const { BaseExecutor } = await import("../../open-sse/executors/base.js");
  const executor = new BaseExecutor("openai", { baseUrls: ["primary", "fallback"], retry: { 502: { attempts: 0 }, 503: { attempts: 0 } } });
  executor.buildUrl = (model, _stream, index) => {
    io.calls.push({ model, index });
    return `${io.policyTarget && index === 0 ? "https://routing-fixture.invalid" : io.origin}/${index ? "fallback" : "primary"}?model=${model}`;
  };
  executor.refreshCredentials = (...args) => io.refresh(...args);
  io.executor = executor;
  return { getExecutor: () => executor, hasSpecializedExecutor: () => true };
});
vi.mock("../../open-sse/translator/concerns/image.js", () => ({
  encodeDataUri: (mimeType, base64) => `data:${mimeType};base64,${base64}`,
  parseDataUri: () => null, fetchImageAsBase64: async () => null,
}));

import { POST as chatRoute } from "@/app/api/v1/chat/completions/route.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { resetRateLimiter } from "@/lib/rateLimit/v1Limiter.js";
import { closeUpstreamPools } from "../../open-sse/utils/proxyFetch.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { GithubExecutor } from "../../open-sse/executors/github.js";

const servers = new Set();
const wire = [];
let respond;
const privateDetail = "synthetic-private-refresh-secret";
const routingError = () => new Error(`[ProxyFetch] ${privateDetail}`);
const body = { model: "fixture-combo", stream: false, messages: [{ role: "user", content: "synthetic prompt" }] };
function request(signal) {
  return new Request("http://localhost/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
}
function success() {
  return { id: "fixture", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } };
}
function noAccountFaults() {
  expect(io.updateProviderConnection.mock.calls.filter(([, patch]) => Object.keys(patch).some(key => key.startsWith("modelLock_") || key === "lastError") || patch.testStatus === "unavailable")).toEqual([]);
}
async function terminal(response) {
  expect(response.status).toBe(502);
  expect(response.headers.get("x-should-retry")).toBe("false");
  const json = await response.json();
  expect(json.error.code).toBe("routing_configuration_error");
  expect(JSON.stringify(json)).not.toMatch(/ProxyFetch|routing-fixture|private-refresh|127\.0\.0\.1|openai|fixture-account/);
  noAccountFaults();
  expect(io.enqueue).not.toHaveBeenCalled();
  expect(io.calls.every(call => call.model === "gpt-4.1" && call.index === 0)).toBe(true);
  expect(wire.every(call => call.path.startsWith("/primary") && ["Bearer old-first", "Bearer new-first"].includes(call.auth))).toBe(true);
}
async function listen(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.add(server);
  return `http://127.0.0.1:${server.address().port}`;
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resetRateLimiter();
  io.settings = { requireApiKey: false, fallbackStrategy: "fill-first", quotaAwareSelection: false, comboStrategy: "fallback" };
  io.combo = { name: "fixture-combo", models: ["openai/gpt-4.1", "openai/gpt-4o"] };
  io.connections = ["first", "second"].map(name => ({ id: `fixture-account-${name}`, provider: "openai", authType: "oauth", accessToken: `old-${name}`, refreshToken: `refresh-${name}`, expiresAt: new Date(Date.now() + 3600000).toISOString(), isActive: true, providerSpecificData: {} }));
  io.calls.length = 0; wire.length = 0; io.policyTarget = false;
  io.proactive.mockReset().mockImplementation(async (_provider, credentials) => credentials);
  io.refresh.mockReset().mockResolvedValue({ accessToken: "new-first", refreshToken: "rotated-first" });
  io.persist.mockReset().mockResolvedValue(true);
  io.project.mockReset().mockResolvedValue("synthetic-project");
  io.enqueue.mockReset().mockResolvedValue({ accepted: true });
  io.unexpectedDb.mockReset().mockImplementation(() => { throw new Error("Unexpected real database"); });
  io.unexpectedNetwork.mockReset().mockImplementation(() => { throw new Error("Unexpected real network"); });
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(name, "");
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
  vi.stubGlobal("fetch", (url, init) => new URL(String(url)).hostname === "127.0.0.1" ? io.nativeFetch(url, init) : io.unexpectedNetwork(url, init));
  io.getProviderConnections.mockImplementation(async ({ provider, isActive } = {}) => io.connections.filter(conn => (!provider || conn.provider === provider) && (!isActive || conn.isActive)).map(conn => structuredClone(conn)));
  io.getProviderConnectionById.mockImplementation(async id => structuredClone(io.connections.find(conn => conn.id === id) || null));
  io.updateProviderConnection.mockImplementation(async (id, patch) => {
    const conn = io.connections.find(candidate => candidate.id === id);
    Object.assign(conn, structuredClone(patch));
    return structuredClone(conn);
  });
  respond = (_request, response) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(success())); };
  io.origin = await listen(async (req, res) => {
    for await (const _chunk of req) { /* Drain request. */ }
    wire.push({ path: req.url, auth: req.headers.authorization, relayTarget: req.headers["x-relay-target"] });
    respond(req, res);
  });
});
afterEach(async () => {
  try {
    expect(io.unexpectedNetwork).not.toHaveBeenCalled();
    expect(io.unexpectedDb).not.toHaveBeenCalled();
  } finally {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    servers.clear(); resetRateLimiter(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  }
});
afterAll(async () => { await closeUpstreamPools({ timeoutMs: 100 }); });

describe("public Chat routing failures are terminal across executor/account/combo boundaries", () => {
  it("refuses a real initial redirect without dispatching another URL/account/model or penalizing health", async () => {
    respond = (_req, res) => { res.writeHead(307, { Location: `${io.origin}/trap` }); res.end(); };
    await terminal(await chatRoute(request()));
    expect(wire).toHaveLength(1);
  });
  it("retains a legacy selected proxy pool and refuses missing proxy configuration before any egress", async () => {
    io.policyTarget = true;
    io.connections.forEach(conn => { conn.providerSpecificData = { connectionProxyPoolId: "selected-missing-pool" }; });
    await terminal(await chatRoute(request()));
    expect(io.calls).toHaveLength(1);
    expect(wire).toEqual([]);
  });
  it("returns the redirect failure after refreshed auth instead of replaying the original 401", async () => {
    respond = (req, res) => {
      if (req.headers.authorization === "Bearer old-first") { res.writeHead(401, { "content-type": "application/json" }); res.end('{"error":{"message":"expired"}}'); }
      else { res.writeHead(307, { Location: `${io.origin}/trap` }); res.end(); }
    };
    await terminal(await chatRoute(request()));
    expect(wire).toHaveLength(2); expect(io.refresh).toHaveBeenCalledOnce();
    expect(io.persist).toHaveBeenCalledWith("fixture-account-first", expect.objectContaining({ accessToken: "new-first", refreshToken: "rotated-first" }), expect.anything());
  });
  it("does not retry a reactive local refresh policy failure or penalize the selected account", async () => {
    respond = (_req, res) => { res.writeHead(401, { "content-type": "application/json" }); res.end('{"error":{"message":"expired"}}'); };
    const caller = new AbortController();
    let deadline;
    io.refresh.mockImplementation(async () => {
      deadline ??= setTimeout(() => caller.abort(new Error("bounded routing regression")), 800);
      throw routingError();
    });
    try { await terminal(await chatRoute(request(caller.signal))); }
    finally { clearTimeout(deadline); }
    expect(io.refresh).toHaveBeenCalledOnce(); expect(wire).toHaveLength(1);
  });
  it.each(["prefix", "code"])("returns a neutral terminal proactive refresh %s failure before inference", async variant => {
    io.proactive.mockRejectedValue(variant === "prefix" ? routingError() : Object.assign(new Error(privateDetail), { code: "ACCOUNT_REDIRECT_REFUSED" }));
    await terminal(await chatRoute(request()));
    expect(io.proactive).toHaveBeenCalledOnce(); expect(io.calls).toEqual([]); expect(wire).toEqual([]);
  });
  it("passes the request signal to proactive refresh and stops ordinary-Error cancellation before dispatch", async () => {
    let started;
    const refreshing = new Promise(resolve => { started = resolve; });
    io.proactive.mockImplementation((_provider, credentials, options) => new Promise((resolve, reject) => {
      started(options);
      options?.signal?.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      // Old call sites supply no signal; resolve on the caller event for a bounded regression.
      if (!options?.signal) caller.signal.addEventListener("abort", () => resolve(credentials), { once: true });
    }));
    const caller = new AbortController(); const req = request(caller.signal);
    const pending = chatRoute(req); const options = await refreshing;
    caller.abort(new Error("caller left"));
    expect((await pending).status).toBe(499);
    expect(options?.signal).toBe(req.signal); expect(Object.isFrozen(options?.proxyOptions)).toBe(true);
    expect(io.calls).toEqual([]); noAccountFaults();
  });
  it("keeps one frozen selected routing snapshot through proactive refresh and the actual relay request", async () => {
    io.policyTarget = true;
    let trapCalls = 0;
    const trap = await listen((_req, res) => { trapCalls++; res.end(JSON.stringify(success())); });
    io.connections[0].providerSpecificData = { vercelRelayUrl: `${io.origin}/primary-relay`, connectionProxyPoolId: "selected-pool" };
    let selected;
    io.proactive.mockImplementation(async (_provider, credentials, options) => {
      selected = options?.proxyOptions;
      return { ...credentials, providerSpecificData: { vercelRelayUrl: `${trap}/unexpected-new-route` } };
    });
    const execute = vi.spyOn(io.executor, "execute");
    const response = await chatRoute(request()); expect(response.status).toBe(200); await response.text();
    expect(selected).toMatchObject({ proxyPoolId: "selected-pool", vercelRelayUrl: `${io.origin}/primary-relay` });
    expect(Object.isFrozen(selected)).toBe(true); expect(execute.mock.calls[0][0].proxyOptions).toBe(selected);
    expect(trapCalls).toBe(0); expect(wire).toHaveLength(1); expect(wire[0].relayTarget).toBe("https://routing-fixture.invalid");
  });
  it("retains the selected relay policy after reactive refresh rotates credential metadata", async () => {
    io.policyTarget = true;
    let trapCalls = 0;
    const trap = await listen((_req, res) => { trapCalls++; res.end(JSON.stringify(success())); });
    io.connections[0].providerSpecificData = { vercelRelayUrl: `${io.origin}/primary-relay`, connectionProxyPoolId: "selected-pool" };
    io.refresh.mockResolvedValue({ accessToken: "new-first", refreshToken: "rotated-first", providerSpecificData: { vercelRelayUrl: `${trap}/trap` } });
    respond = (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization === "Bearer old-first") { res.statusCode = 401; res.end('{"error":{"message":"expired"}}'); }
      else res.end(JSON.stringify(success()));
    };
    const execute = vi.spyOn(io.executor, "execute");
    const response = await chatRoute(request()); expect(response.status).toBe(200); await response.text();
    const selected = io.proactive.mock.calls[0][2]?.proxyOptions;
    expect(Object.isFrozen(selected)).toBe(true);
    expect(io.refresh.mock.calls[0][2]).toBe(selected);
    expect(execute.mock.calls).toHaveLength(2);
    expect(execute.mock.calls.every(([options]) => options.proxyOptions === selected)).toBe(true);
    expect(trapCalls).toBe(0); expect(wire).toHaveLength(2);
    expect(wire.every(call => call.path === "/primary-relay" && call.relayTarget === "https://routing-fixture.invalid")).toBe(true);
  });
  it("uses the same selected policy for project discovery and makes its routing failure terminal", async () => {
    io.connections.forEach(conn => { conn.provider = "gemini-cli"; conn.providerSpecificData = { connectionProxyPoolId: "selected-project-pool" }; });
    io.combo.models = ["gemini-cli/gemini-2.5-pro", "gemini-cli/gemini-2.5-flash"];
    io.project.mockRejectedValue(routingError());
    await terminal(await chatRoute(request()));
    expect(io.project).toHaveBeenCalledOnce();
    const selected = io.proactive.mock.calls[0][2]?.proxyOptions;
    expect(selected).toMatchObject({ proxyPoolId: "selected-project-pool" }); expect(Object.isFrozen(selected)).toBe(true);
    expect(io.project.mock.calls[0][3]).toBe(selected);
    expect(io.calls).toEqual([]); expect(wire).toEqual([]);
  });
  it("preserves ordinary transient upstream fallback to the next account", async () => {
    respond = (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization === "Bearer old-first") { res.statusCode = 503; res.end('{"error":{"message":"temporary capacity"}}'); }
      else res.end(JSON.stringify(success()));
    };
    const response = await chatRoute(request()); expect(response.status).toBe(200); await response.text();
    expect(wire.map(item => item.auth)).toEqual(["Bearer old-first", "Bearer old-first", "Bearer old-second"]);
    expect(io.enqueue).toHaveBeenCalledOnce();
  });
  it("does not mistake untrusted upstream error text for a local policy exception", async () => {
    respond = (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization === "Bearer old-first") { res.statusCode = 503; res.end('{"error":{"message":"[ProxyFetch] provider-controlled text"}}'); }
      else res.end(JSON.stringify(success()));
    };
    const response = await chatRoute(request()); expect(response.status).toBe(200); await response.text();
    expect(wire).toHaveLength(3);
  });
});

function coreOptions(extra = {}) {
  return { body: { ...body, model: "openai/gpt-4.1" }, modelInfo: { provider: "openai", model: "gpt-4.1" }, credentials: { accessToken: "old-first", refreshToken: "refresh-first" }, connectionId: "fixture-account-first", log: { warn: io.warn }, ...extra };
}
async function within(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("cleanup blocked request")), 250); })]); }
  finally { clearTimeout(timer); }
}
describe("Chat refresh cleanup and diagnostics", () => {
  it("returns a stale-credential result without awaiting a hung response cancellation acknowledgment", async () => {
    let release;
    const cancel = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const response = Response.json({ error: { message: "expired" } }, { status: 401 });
    Object.defineProperty(response.body, "cancel", { value: cancel });
    vi.spyOn(io.executor, "execute").mockResolvedValue({ response });
    const pending = handleChatCore(coreOptions({ onCredentialsRefreshed: async () => false }));
    try { expect((await within(pending)).credentialsSuperseded).toBe(true); expect(cancel).toHaveBeenCalledOnce(); }
    finally { release?.(); await pending; }
  });
  it("returns 499 after late successful headers without awaiting a hung body cancellation", async () => {
    let release;
    const caller = new AbortController();
    const cancel = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } });
    vi.spyOn(io.executor, "execute").mockImplementation(async () => { caller.abort(new Error("caller left")); return { response }; });
    const pending = handleChatCore(coreOptions({ clientSignal: caller.signal }));
    try { expect((await within(pending)).status).toBe(499); expect(cancel).toHaveBeenCalledOnce(); }
    finally { release?.(); await pending; }
  });
  it("does not log an untrusted credential-persistence callback message", async () => {
    respond = (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization === "Bearer old-first") { res.statusCode = 401; res.end('{"error":{"message":"expired"}}'); }
      else res.end(JSON.stringify(success()));
    };
    const result = await handleChatCore(coreOptions({ onCredentialsRefreshed: async () => { throw new Error(privateDetail); } }));
    expect(result.success).toBe(true); await result.response.text();
    expect(JSON.stringify(io.warn.mock.calls)).not.toContain(privateDetail);
    expect(io.warn).toHaveBeenCalledWith("TOKEN", "onCredentialsRefreshed failed: Error");
  });
  it.each(["default", "copilot", "github"])("propagates local routing failure from %s credential refresh", async variant => {
    const executor = variant === "default" ? new DefaultExecutor("codex") : new GithubExecutor();
    const throwing = vi.fn(async () => { throw routingError(); });
    vi.stubGlobal("fetch", throwing);
    const outcome = await (variant === "default"
      ? executor.refreshCredentials({ refreshToken: "synthetic-rt" })
      : variant === "copilot" ? executor.refreshCopilotToken("synthetic-oauth")
        : executor.refreshGitHubToken("synthetic-rt")).catch(error => error);
    expect(outcome).toMatchObject({ message: `[ProxyFetch] ${privateDetail}` });
    expect(throwing).toHaveBeenCalledOnce();
  });
});
