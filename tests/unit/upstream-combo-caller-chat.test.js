import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real public route, combo, Copilot executor, chat core and accounting. Only
// persistence and transport are replaced; unexpected network/DB access fails.
const io = vi.hoisted(() => ({
  connections: [], combo: null, settings: {}, transport: vi.fn(), unexpectedNetwork: vi.fn(), unexpectedDb: vi.fn(),
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
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn(async () => ({})), pickProxyPoolId: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}), enqueueRequestUsage: io.enqueue,
}));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent: vi.fn() }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: vi.fn(async () => null) }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: io.info, warn: vi.fn(), error: io.error, nextTag: vi.fn(() => ""),
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
  io.executor = github;
  return {
    getExecutor: provider => { if (provider !== "github") throw new Error(`Unexpected executor ${provider}`); return github; },
    hasSpecializedExecutor: provider => provider === "github",
  };
});
vi.mock("../../open-sse/translator/concerns/image.js", () => ({
  encodeDataUri: (mimeType, base64) => `data:${mimeType};base64,${base64}`,
  parseDataUri: () => null, fetchImageAsBase64: async () => null,
}));

import { POST as chatRoute } from "@/app/api/v1/chat/completions/route.js";
import { resetRateLimiter } from "@/lib/rateLimit/v1Limiter.js";

const firstModel = "gpt-5.5";
const nextModel = "gpt-5.3-codex";
const privateDetail = "synthetic private accounting detail";

function request(signal, stream = true) {
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json" }, signal,
    body: JSON.stringify({ model: "fixture-combo", stream, messages: [{ role: "user", content: "synthetic private prompt" }] }),
  });
}

function noAccountFaults() {
  expect(io.updateProviderConnection.mock.calls.filter(([, patch]) =>
    Object.keys(patch).some(key => key.startsWith("modelLock_") || key === "lastError") || patch.testStatus === "unavailable"
  )).toEqual([]);
}

function successWithUsage() {
  return Response.json({ id: "fixture", object: "chat.completion", model: firstModel,
    choices: [{ index: 0, message: { role: "assistant", content: "fixture" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
  io.settings = { requireApiKey: false, fallbackStrategy: "fill-first", quotaAwareSelection: false, comboStrategy: "fallback" };
  io.combo = { name: "fixture-combo", models: [`gh/${firstModel}`, `gh/${nextModel}`] };
  io.comboLookupCount = 0;
  io.deferCombo = false;
  io.connections = [{ id: "fixture-account", provider: "github", authType: "oauth", accessToken: "synthetic-oauth", isActive: true,
    providerSpecificData: { copilotToken: "synthetic-copilot", copilotTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600 } }];
  io.transport.mockReset();
  io.enqueue.mockReset().mockResolvedValue({ accepted: true });
  io.info.mockReset();
  io.error.mockReset();
  io.unexpectedNetwork.mockReset().mockImplementation(() => { throw new Error("Unexpected real network"); });
  io.unexpectedDb.mockReset().mockImplementation(() => { throw new Error("Unexpected real database"); });
  vi.stubGlobal("fetch", io.unexpectedNetwork);
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
    expect(io.unexpectedNetwork).not.toHaveBeenCalled();
    expect(io.unexpectedDb).not.toHaveBeenCalled();
  } finally {
    resetRateLimiter();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

describe("public chat combo caller cancellation", () => {
  it("aborts a silent first stream during the initial peek without dispatching the next model", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let reading;
    const started = new Promise(resolve => { reading = resolve; });
    const cancel = vi.fn();
    let upstreamSignal;
    io.transport.mockImplementation(async (_url, init) => {
      upstreamSignal = init.signal;
      return new Response(new ReadableStream({ pull() { reading(); }, cancel }, { highWaterMark: 0 }),
        { headers: { "content-type": "text/event-stream" } });
    });
    const caller = new AbortController();
    let settled = false;
    const pending = chatRoute(request(caller.signal)).then(response => { settled = true; return response; });
    await started;
    await new Promise(resolve => setImmediate(resolve));
    expect(settled).toBe(false); // the 150 ms peek deadline has not advanced
    caller.abort(new Error("caller closed"));
    expect((await pending).status).toBe(499);
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(upstreamSignal.aborted).toBe(true);
    expect(io.transport).toHaveBeenCalledOnce();
    noAccountFaults();
  });

  it.each(["late combo lookup", "capacity adapter"])("passes the caller signal through the %s route", async variant => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let started, finish;
    const dispatched = new Promise(resolve => { started = resolve; });
    const execute = vi.spyOn(io.executor, "execute").mockImplementation(options => new Promise(resolve => {
      finish = () => resolve({ response: successWithUsage(), transformedBody: options.body });
      started();
    }));
    const caller = new AbortController();
    let req = request(caller.signal, false);
    if (variant === "late combo lookup") io.deferCombo = true;
    else {
      io.settings.capacityAdapter = { vision: { enabled: true, models: [`gh/${firstModel}`] } };
      req = new Request("http://localhost/v1/chat/completions", {
        method: "POST", headers: { "content-type": "application/json" }, signal: caller.signal,
        body: JSON.stringify({ model: "gh/fixture-text-only", stream: false,
          messages: [{ role: "user", content: [{ type: "text", text: "fixture" }, { type: "image_url", image_url: { url: "data:image/png;base64,YQ==" } }] }] }),
      });
    }
    let response;
    const pending = chatRoute(req).then(result => { response = result; return result; });
    try {
      await dispatched;
      expect(execute).toHaveBeenCalledOnce();
      expect(execute.mock.calls[0][0].model).toBe(firstModel);
      if (variant === "late combo lookup") expect(io.comboLookupCount).toBeGreaterThanOrEqual(3);
      else expect(io.info.mock.calls.some(([scope, message]) => scope === "CHAT" && message.includes("Capacity adapter"))).toBe(true);
      caller.abort(new Error("caller closed"));
      await vi.advanceTimersByTimeAsync(0);
      expect(response?.status).toBe(499);
      expect(execute.mock.calls[0][0].signal.aborted).toBe(true);
      expect(execute).toHaveBeenCalledOnce();
      noAccountFaults();
    } finally {
      finish?.();
      await pending;
      await new Promise(resolve => setImmediate(resolve));
    }
  });

  it("interrupts a transient backoff without dispatching the next model or writing new health state", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let waiting;
    const inBackoff = new Promise(resolve => { waiting = resolve; });
    io.info.mockImplementation((scope, message) => {
      if (scope === "COMBO" && message.includes("transient 502, waiting")) waiting();
    });
    const execute = vi.spyOn(io.executor, "execute").mockImplementation(async ({ body }) => ({
      response: Response.json({ error: { message: "request not allowed" } }, { status: 502 }),
      transformedBody: body,
    }));
    const caller = new AbortController();
    const pending = chatRoute(request(caller.signal, false));
    await inBackoff;
    // The first model's real account policy gets one same-account retry; no
    // replacement model should start after the caller aborts the combo delay.
    expect(execute).toHaveBeenCalledTimes(2);
    const writesAtAbort = io.updateProviderConnection.mock.calls.length;
    caller.abort(new Error("caller closed"));
    expect((await pending).status).toBe(499);
    await vi.advanceTimersByTimeAsync(6000);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.every(([options]) => options.model === firstModel)).toBe(true);
    expect(io.updateProviderConnection).toHaveBeenCalledTimes(writesAtAbort);
    expect(io.info.mock.calls.some(([scope, message]) => scope === "COMBO" && message.includes("Trying model 2/"))).toBe(false);
  });

  it.each(["rejected", "declined"])("returns 499 while real usage acceptance is pending and reports a late %s receipt", async outcome => {
    let started, resolveAcceptance, rejectAcceptance;
    const accepting = new Promise(resolve => { started = resolve; });
    io.transport.mockImplementation(async () => successWithUsage());
    io.enqueue.mockImplementation(() => new Promise((resolve, reject) => { resolveAcceptance = resolve; rejectAcceptance = reject; started(); }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const caller = new AbortController();
    const pending = chatRoute(request(caller.signal, false));
    await accepting;
    caller.abort(new Error("caller closed"));
    expect((await pending).status).toBe(499);
    if (outcome === "rejected") rejectAcceptance(Object.assign(new Error(privateDetail), { code: "SQLITE_FULL" }));
    else resolveAcceptance({ accepted: false });
    await vi.waitFor(() => expect(io.error).toHaveBeenCalledWith("CHAT", "Durable usage acceptance failed after client cancellation"));
    expect(io.enqueue).toHaveBeenCalledOnce();
    expect(io.enqueue.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 3, completion_tokens: 5 });
    expect(io.transport).toHaveBeenCalledOnce();
    expect(JSON.stringify([...io.error.mock.calls, ...consoleError.mock.calls])).not.toContain(privateDetail);
    noAccountFaults();
  });

  it.each(["accepted", "rejected"])("retains buffered stream usage after handoff and caller cancellation when accounting is %s", async outcome => {
    let accepting, finishAcceptance, rejectAcceptance;
    const acceptanceStarted = new Promise(resolve => { accepting = resolve; });
    io.enqueue.mockImplementation(() => new Promise((resolve, reject) => { finishAcceptance = resolve; rejectAcceptance = reject; accepting(); }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const wire = [
      { id: "fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "first" }, finish_reason: null }] },
      { id: "fixture", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } },
    ].map(data => `data: ${JSON.stringify(data)}\n\n`).join("");
    const cancel = vi.fn();
    io.transport.mockImplementation(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(wire)); }, cancel,
    }, { highWaterMark: 0 }), { headers: { "content-type": "text/event-stream" } }));
    const caller = new AbortController();
    const response = await chatRoute(request(caller.signal));
    expect(response.status).toBe(200);
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("first");
    caller.abort(new Error("caller closed"));
    await acceptanceStarted;
    expect(io.enqueue).toHaveBeenCalledOnce();
    expect(io.enqueue.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 3, completion_tokens: 5 });
    if (outcome === "rejected") {
      rejectAcceptance(Object.assign(new Error(privateDetail), { code: "SQLITE_FULL" }));
      await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith("[USAGE] Persistence failed:", "SQLITE_FULL"));
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateDetail);
    } else {
      finishAcceptance({ accepted: true });
      await new Promise(resolve => setImmediate(resolve));
    }
    await expect(reader.read()).rejects.toThrow("caller closed");
    reader.releaseLock();
    expect(cancel).toHaveBeenCalledOnce();
    expect(io.transport).toHaveBeenCalledOnce();
    noAccountFaults();
  });

  it("keeps an uncancelled real acceptance rejection terminal and does not rotate or cool an account", async () => {
    io.transport.mockImplementation(async () => successWithUsage());
    io.enqueue.mockRejectedValue(Object.assign(new Error(privateDetail), { code: "SQLITE_FULL" }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await chatRoute(request(undefined, false));
    expect(response.status).toBe(503);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect((await response.json()).error.code).toBe("usage_acceptance_failed");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateDetail);
    expect(io.enqueue).toHaveBeenCalledOnce();
    expect(io.transport).toHaveBeenCalledOnce();
    noAccountFaults();
  });
});
