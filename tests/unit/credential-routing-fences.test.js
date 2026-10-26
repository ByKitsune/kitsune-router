import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEventListeners } from "node:events";

const io = vi.hoisted(() => ({
  credentials: vi.fn(), markUnavailable: vi.fn(), clearError: vi.fn(), refresh: vi.fn(),
  update: vi.fn(), proactive: vi.fn(), execute: vi.fn(), latest: vi.fn(),
  usage: vi.fn(async () => ({ accepted: true })),
}));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: io.credentials, markAccountUnavailable: io.markUnavailable,
  clearAccountError: io.clearError, extractApiKey: () => null, isValidApiKey: async () => false,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken: io.proactive, updateProviderCredentials: io.update }));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => ({ requireApiKey: false, rtkEnabled: false }), isApiKeyRequired: () => false,
  getModelAliases: async () => ({}), getComboByName: async () => null, getProviderNodes: async () => [],
  getProviderConnectionById: io.latest,
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {},
  saveRequestUsage: io.usage, enqueueRequestUsage: io.usage,
}));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent() {} }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug() {}, info() {}, warn() {}, error() {}, errorLine() {}, line() {}, nextTag: () => "", tagForSession: () => "", fmtThink: () => "auto", maskKey: () => "fixture",
}));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: () => { throw new Error("Unexpected network"); } }));
vi.mock("open-sse/executors/index.js", () => ({ getExecutor: () => ({ execute: io.execute, refreshCredentials: io.refresh }), hasSpecializedExecutor: () => true }));
vi.mock("open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));

import { handleChat } from "@/sse/handlers/chat.js";

const model = "claude-sonnet-5-5";
function request() {
  return new Request("http://127.0.0.1:20128/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: `claude/${model}`, stream: false, max_tokens: 1024, messages: [{ role: "user", content: "fixture" }] }) });
}
function result(status = 200) {
  return { response: Response.json(status === 200 ? {
    id: "msg_fixture", type: "message", role: "assistant", model, content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
  } : { error: { type: "authentication_error", message: "fixture expired token" } }, { status }), url: "https://upstream.invalid/messages", headers: {}, transformedBody: null };
}
function credential() {
  const selected = { id: "account", connectionId: "account", provider: "claude", authType: "oauth", accessToken: "old", refreshToken: "old-refresh", isActive: true,
    providerSpecificData: { clientId: "fixture-id", clientSecret: "fixture-secret", region: "fixture-region", strictProxy: true, connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.invalid" } };
  Object.defineProperty(selected, "_writeFence", { value: { importRevision: "1", connection: structuredClone(selected) }, configurable: true });
  return selected;
}

beforeEach(() => {
  vi.clearAllMocks();
  io.credentials.mockResolvedValue(credential());
  io.proactive.mockImplementation(async (_provider, selected) => selected);
  io.update.mockResolvedValue(true);
  io.markUnavailable.mockResolvedValue({ shouldFallback: false });
  io.clearError.mockResolvedValue();
  io.usage.mockReset().mockResolvedValue({ accepted: true });
  io.execute.mockResolvedValue(result());
  io.refresh.mockResolvedValue({ accessToken: "new", refreshToken: "new-refresh", providerSpecificData: { profileArn: "new-profile" } });
  io.latest.mockResolvedValue({ ...credential(), accessToken: "new", refreshToken: "new-refresh", _writeFence: { importRevision: "2" } });
});

describe("routed credential persistence fences", () => {
  it("merges a reactive metadata patch without losing OAuth or strict proxy fields", async () => {
    const selected = credential();
    io.credentials.mockResolvedValue(selected);
    io.execute.mockResolvedValueOnce(result(401)).mockResolvedValueOnce(result());
    const client = request();
    const listenersBefore = getEventListeners(client.signal, "abort").length;
    const response = await handleChat(client);
    expect(getEventListeners(client.signal, "abort")).toHaveLength(listenersBefore);
    expect(response.status).toBe(200);
    await response.text();
    expect(io.update).toHaveBeenCalledTimes(1);
    expect(io.update.mock.calls[0][1]).toMatchObject({ providerSpecificData: { profileArn: "new-profile" }, existingProviderSpecificData: selected.providerSpecificData });
    expect(io.execute.mock.calls[1][0].credentials.providerSpecificData).toMatchObject({ clientId: "fixture-id", clientSecret: "fixture-secret", region: "fixture-region", profileArn: "new-profile", strictProxy: true, connectionProxyUrl: "http://proxy.invalid" });
    expect(io.markUnavailable).not.toHaveBeenCalled();
  });

  it("does not retry or mark replacement account health after a rejected reactive commit", async () => {
    io.update.mockResolvedValue(false);
    io.execute.mockResolvedValueOnce(result(401));
    const response = await handleChat(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Routing configuration changed");
    expect(io.execute).toHaveBeenCalledTimes(1);
    expect(io.markUnavailable).not.toHaveBeenCalled();
    expect(io.clearError).not.toHaveBeenCalled();
  });

  it("classifies cancellation during native JSON body consumption as 499 without account health writes", async () => {
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const abort = new AbortController();
    io.execute.mockImplementationOnce(async () => ({
      response: new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('{"content":['));
        abort.signal.addEventListener("abort", () => controller.error(abort.signal.reason), { once: true });
        entered();
      } }), { headers: { "Content-Type": "application/json" } }),
      url: "https://upstream.invalid/messages", headers: {}, transformedBody: null,
    }));
    const original = request();
    const client = new Request(original, { signal: abort.signal });
    const pending = handleChat(client);
    await ready;
    abort.abort(new Error("caller cancelled JSON"));
    const response = await pending;
    expect(response.status).toBe(499);
    expect(io.execute).toHaveBeenCalledTimes(1);
    expect(io.markUnavailable).not.toHaveBeenCalled();
    expect(getEventListeners(client.signal, "abort")).toHaveLength(0);
  });

  it("does not repeat incurred inference or write account health when usage acceptance fails", async () => {
    io.usage.mockRejectedValueOnce(new Error("private database path"));
    const client = request();
    const response = await handleChat(client);
    expect(response.status).toBe(503);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(await response.json()).toMatchObject({ error: { code: "usage_acceptance_failed" } });
    expect(io.execute).toHaveBeenCalledTimes(1);
    expect(io.usage).toHaveBeenCalledTimes(1);
    expect(io.markUnavailable).not.toHaveBeenCalled();
    expect(io.clearError).not.toHaveBeenCalled();
    expect(getEventListeners(client.signal, "abort")).toHaveLength(0);
  });

  it("stops before fallback when usage from an HTTP error cannot be accepted", async () => {
    io.execute.mockResolvedValueOnce({ ...result(), response: Response.json({ error: { message: "Upstream error" }, usage: { input_tokens: 2, output_tokens: 3 } }, { status: 500 }) });
    io.usage.mockRejectedValueOnce(new Error("private database path"));
    const response = await handleChat(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("x-should-retry")).toBe("false");
    const payload = await response.json();
    expect(payload.error.code).toBe("usage_acceptance_failed");
    expect(JSON.stringify(payload)).not.toContain("private database path");
    expect(io.execute).toHaveBeenCalledTimes(1);
    expect(io.usage).toHaveBeenCalledTimes(1);
    expect(io.usage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 2, completion_tokens: 3 });
    expect(io.markUnavailable).not.toHaveBeenCalled();
    expect(io.clearError).not.toHaveBeenCalled();
  });

  it("preserves failed usage acceptance over concurrent cancellation of SSE aggregation", async () => {
    const abort = new AbortController();
    const usage = { type: "message_start", message: { id: "msg_cancel", type: "message", role: "assistant", model, content: [], usage: { input_tokens: 2, output_tokens: 0 } } };
    let delivered;
    const ready = new Promise(resolve => { delivered = resolve; });
    io.execute.mockResolvedValueOnce({ ...result(), response: new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(`event: message_start\ndata: ${JSON.stringify(usage)}\n\n`)); },
      pull() { delivered(); },
    }, { highWaterMark: 0 }), { headers: { "Content-Type": "text/event-stream" } }) });
    io.usage.mockRejectedValueOnce(new Error("private database path"));
    const client = new Request(request(), { signal: abort.signal });
    const pending = handleChat(client);
    await ready;
    abort.abort(new Error("caller cancelled aggregation"));
    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect((await response.json()).error.code).toBe("usage_acceptance_failed");
    expect(io.execute).toHaveBeenCalledTimes(1);
    expect(io.usage).toHaveBeenCalledTimes(1);
    expect(io.usage.mock.calls[0][0].tokens.prompt_tokens).toBe(2);
    expect(io.markUnavailable).not.toHaveBeenCalled();
    expect(getEventListeners(client.signal, "abort")).toHaveLength(0);
  });

  it("does not refresh or hide usage already incurred in an unauthorized response", async () => {
    io.execute.mockResolvedValueOnce({ ...result(), response: Response.json({ error: { message: "Unauthorized" }, usage: { input_tokens: 2, output_tokens: 3 } }, { status: 401 }) });
    const response = await handleChat(request());
    expect(response.status).toBe(401);
    await response.text();
    expect(io.execute).toHaveBeenCalledTimes(1);
    expect(io.refresh).not.toHaveBeenCalled();
    expect(io.usage).toHaveBeenCalledTimes(1);
    expect(io.usage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 2, completion_tokens: 3 });
  });

  it("preserves actual usage reported by a failed post-refresh attempt", async () => {
    io.execute.mockResolvedValueOnce(result(401)).mockResolvedValueOnce({ ...result(), response: Response.json({ error: { message: "Invalid request" }, usage: { input_tokens: 4, output_tokens: 5 } }, { status: 400 }) });
    const response = await handleChat(request());
    expect(response.status).toBe(400);
    await response.text();
    expect(io.execute).toHaveBeenCalledTimes(2);
    expect(io.refresh).toHaveBeenCalledTimes(1);
    expect(io.usage).toHaveBeenCalledTimes(1);
    expect(io.usage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 4, completion_tokens: 5 });
  });

  it.each([401, 403, 500])("does not lose exact usage after a long private HTTP %s error prefix", async status => {
    const privateDetail = "private-account-detail".repeat(600);
    io.execute.mockResolvedValueOnce({ ...result(), response: Response.json({ error: { message: privateDetail, details: { secret: privateDetail } }, usage: { input_tokens: 2, output_tokens: 3 } }, { status }) });
    const response = await handleChat(request());
    expect(response.status).toBe(status === 500 ? 200 : status);
    const payload = await response.text();
    expect(payload).not.toContain("private-account-detail");
    expect(io.execute).toHaveBeenCalledTimes(status === 500 ? 2 : 1); expect(io.refresh).not.toHaveBeenCalled();
    expect(io.usage).toHaveBeenCalledTimes(status === 500 ? 2 : 1);
    expect(io.usage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 2, completion_tokens: 3 });
    if (status === 500) expect(io.usage.mock.calls[0][0].eventId).not.toBe(io.usage.mock.calls[1][0].eventId);
  });

  it.each([401, 403, 500])("stops retry and account mutation when HTTP %s accounting exceeds its bounded capture", async status => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ error: { message: "private-oversized-detail".repeat(8000) }, usage: { input_tokens: 2, output_tokens: 3 } })));
    }, cancel }, { highWaterMark: 0 });
    io.execute.mockResolvedValueOnce({ ...result(), response: new Response(stream, { status }) });
    const client = request(); const response = await handleChat(client);
    expect(response.status).toBe(503); expect(response.headers.get("x-should-retry")).toBe("false");
    expect(response.headers.get("retry-after")).toBeNull();
    expect(response.headers.get("access-control-expose-headers")).toContain("x-should-retry");
    const payload = await response.json(); expect(payload.error.code).toBe("usage_accounting_uncertain");
    expect(JSON.stringify(payload)).not.toContain("private-oversized-detail");
    expect(io.execute).toHaveBeenCalledOnce(); expect(io.refresh).not.toHaveBeenCalled(); expect(io.usage).not.toHaveBeenCalled();
    expect(io.markUnavailable).not.toHaveBeenCalled(); expect(io.clearError).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false);
    expect(getEventListeners(client.signal, "abort")).toHaveLength(0);
  });

  it.each([
    { error: { message: "Permission denied", code: "oauth_org_not_allowed" } },
    { error: { message: "Permission denied", details: { error_code: "oauth_org_not_allowed", private_note: "private-denial-note" } } },
    { error: { message: "Permission denied", details: [{ error_code: "oauth_not_allowed_for_organization" }] } },
  ])("classifies trusted typed permanent denial before hidden refresh %#", async errorBody => {
    io.execute.mockResolvedValueOnce({ ...result(), response: Response.json(errorBody, { status: 403 }) });
    const response = await handleChat(request());
    expect(response.status).toBe(403); expect(await response.text()).not.toContain("private-denial-note");
    expect(io.refresh).not.toHaveBeenCalled(); expect(io.execute).toHaveBeenCalledOnce(); expect(io.update).not.toHaveBeenCalled();
  });

  it.each(['Invalid label "oauth_org_not_allowed"', 'Invalid label "escaped \\" oauth_org_not_allowed"'])("does not mine quoted human input or unrelated nested records for permanent denial: %s", async message => {
    io.execute.mockResolvedValueOnce({ ...result(), response: Response.json({
      error: { message, details: { rejected_input: { error_code: "oauth_org_not_allowed" } } },
    }, { status: 403 }) }).mockResolvedValueOnce(result());
    const response = await handleChat(request());
    expect(response.status).toBe(200); await response.text();
    expect(io.refresh).toHaveBeenCalledOnce(); expect(io.execute).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("accepts known auth-error usage before cancellation and preserves failed ACK priority (reject=%s)", async reject => {
    const abort = new AbortController();
    const text = JSON.stringify({ error: { message: "Unauthorized" }, usage: { input_tokens: 2, output_tokens: 3 } });
    let controller;
    const stream = new ReadableStream({ start(value) { controller = value; value.enqueue(new TextEncoder().encode(text)); },
      pull() { abort.abort(new Error("caller left after error bytes")); controller.close(); },
    }, { highWaterMark: 0 });
    io.execute.mockResolvedValueOnce({ ...result(), response: new Response(stream, { status: 401 }) });
    if (reject) io.usage.mockRejectedValueOnce(new Error("private accounting failure"));
    const client = new Request(request(), { signal: abort.signal });
    const response = await handleChat(client);
    expect(response.status).toBe(reject ? 503 : 499);
    if (reject) { expect(response.headers.get("x-should-retry")).toBe("false"); expect((await response.json()).error.code).toBe("usage_acceptance_failed"); }
    expect(io.execute).toHaveBeenCalledOnce(); expect(io.refresh).not.toHaveBeenCalled();
    expect(io.usage).toHaveBeenCalledOnce(); expect(io.usage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 2, completion_tokens: 3 });
    expect(io.markUnavailable).not.toHaveBeenCalled(); expect(io.clearError).not.toHaveBeenCalled();
    expect(stream.locked).toBe(false); expect(getEventListeners(client.signal, "abort")).toHaveLength(0);
  });

  it("keeps cancellation without observed usage at 499 without health writes or an attempted accounting ACK", async () => {
    const abort = new AbortController();
    const cancel = vi.fn(); let entered;
    const pendingBody = new Promise(resolve => { entered = resolve; });
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"error":{"message":"')); },
      pull() { entered(); }, cancel,
    }, { highWaterMark: 0 });
    io.execute.mockResolvedValueOnce({ ...result(), response: new Response(stream, { status: 400 }) });
    const client = new Request(request(), { signal: abort.signal });
    const pending = handleChat(client);
    await pendingBody; abort.abort(new Error("caller left while diagnostic pending"));
    const response = await pending;
    expect(response.status).toBe(499);
    expect(response.headers.get("x-should-retry")).toBeNull();
    expect(io.usage).not.toHaveBeenCalled(); expect(io.markUnavailable).not.toHaveBeenCalled(); expect(io.clearError).not.toHaveBeenCalled();
    expect(io.execute).toHaveBeenCalledOnce(); expect(io.refresh).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false);
    expect(getEventListeners(client.signal, "abort")).toHaveLength(0);
  });

  it("reselects after a stale proactive snapshot without writing account health", async () => {
    io.proactive.mockRejectedValueOnce(Object.assign(new Error("replaced during refresh"), { code: "STALE_CONNECTION_WRITE" }));
    io.credentials.mockResolvedValueOnce(credential()).mockResolvedValueOnce({ ...credential(), id: "second", connectionId: "second" });
    const response = await handleChat(request());
    expect(response.status).toBe(200);
    await response.text();
    expect(io.credentials).toHaveBeenCalledTimes(2);
    expect(io.execute).toHaveBeenCalledTimes(1);
    expect(io.execute.mock.calls[0][0].credentials.connectionId).toBe("second");
    expect(io.markUnavailable).not.toHaveBeenCalled();
  });
});
