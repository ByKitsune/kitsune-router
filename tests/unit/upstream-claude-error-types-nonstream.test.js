import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: store.enqueue,
  enqueueRequestUsage: store.enqueue,
}));

import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { handleForcedSSEToJson } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
import { correlateResponse } from "../../src/sse/utils/requestCorrelation.js";

const usage = { input_tokens: 11, output_tokens: 2, total_tokens: 13 };
const response = error => ({ id: "resp_fixture", object: "response", status: "failed", error, usage, output: [] });
const frame = error => `event: response.failed\ndata: ${JSON.stringify({ type: "response.failed", response: response(error) })}\n\n`;
const request = providerResponse => ({
  providerResponse, sourceFormat: F.CLAUDE, targetFormat: F.OPENAI_RESPONSES, provider: "codex", model: "fixture",
  body: { messages: [] }, stream: false, requestStartTime: Date.now(), connectionId: "fixture-account",
  clientRawRequest: { endpoint: "/v1/messages" }, usageEventId: "evt_fixture",
  trackDone: vi.fn(), appendLog: vi.fn(), onRequestSuccess: vi.fn(),
  reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() },
});

beforeEach(() => {
  store.enqueue.mockReset().mockImplementation(async entry => ({ accepted: true, eventId: entry.eventId }));
});

describe.each(["forced SSE", "non-stream SSE", "non-stream JSON"])("Claude %s failure accounting", path => {
  it.each([
    [{ type: "server_error", code: "internal_server_error", status: 500 }, 500, "api_error"],
    [{ type: "stream_error", code: "stream_disconnected", status: 502 }, 502, "api_error"],
    [{ type: "rate_limit_error", code: "rate_limit_exceeded", status: 429 }, 429, "rate_limit_error"],
    [{ type: "authentication_error", code: "invalid_api_key", status: 401 }, 401, "authentication_error"],
    [{ type: "server_error", code: "unsupported_parameter", status: 400, param: "max_tokens" }, 400, "invalid_request_error"],
    [{ type: "overloaded_error", code: "native_code", status: 529 }, 529, "overloaded_error"],
  ])("preserves classification and maps only the public error for %j", async (diagnostic, status, publicType) => {
    const error = { ...diagnostic, message: "Failure Bearer synthetic-secret private@example.test", debug: "private-debug" };
    const providerResponse = path === "non-stream JSON" ? Response.json(response(error))
      : new Response(frame(error), { headers: { "content-type": "text/event-stream" } });
    const ctx = request(providerResponse);
    const result = path === "forced SSE" ? await handleForcedSSEToJson(ctx)
      : await handleNonStreamingResponse(ctx);
    expect(result.success).toBe(false);
    expect(result.status).toBe(status);
    expect(result.response.status).toBe(status);
    expect(result.diagnostics).toMatchObject(diagnostic);
    const raw = await result.response.clone().json();
    expect(raw.error.type).toBe(diagnostic.type);
    const publicResponse = await correlateResponse(result.response, "req_client_fixture", F.CLAUDE);
    expect(publicResponse.status).toBe(status);
    expect(publicResponse.headers.get("x-request-id")).toBe("req_client_fixture");
    const body = await publicResponse.json();
    expect(body.error).toMatchObject({ type: publicType, code: diagnostic.code, request_id: "req_client_fixture", upstream_request_id: raw.error.request_id });
    if (diagnostic.param) expect(body.error.param).toBe(diagnostic.param);
    expect(JSON.stringify(body)).not.toContain("synthetic-secret");
    expect(JSON.stringify(body)).not.toContain("private@example.test");
    expect(JSON.stringify(body)).not.toContain("private-debug");
    expect(store.enqueue).toHaveBeenCalledOnce();
    expect(ctx.onRequestSuccess).not.toHaveBeenCalled();
    expect(store.enqueue.mock.calls[0][0]).toMatchObject({
      eventId: "evt_fixture", endpoint: "/v1/messages", tokens: { prompt_tokens: 11, completion_tokens: 2 },
    });
  });

  it("waits for incurred usage acceptance before returning the failure", async () => {
    let accept;
    const acceptance = new Promise(resolve => { accept = resolve; });
    store.enqueue.mockImplementation(entry => acceptance.then(() => ({ accepted: true, eventId: entry.eventId })));
    const error = { type: "server_error", code: "internal_server_error", status: 500, message: "Failure" };
    const providerResponse = path === "non-stream JSON" ? Response.json(response(error))
      : new Response(frame(error), { headers: { "content-type": "text/event-stream" } });
    const ctx = request(providerResponse);
    let settled = false;
    const pending = (path === "forced SSE" ? handleForcedSSEToJson(ctx) : handleNonStreamingResponse(ctx))
      .then(result => { settled = true; return result; });
    try {
      await vi.waitFor(() => expect(store.enqueue).toHaveBeenCalledOnce());
      expect(settled).toBe(false);
      expect(store.enqueue.mock.calls[0][0]).toMatchObject({ eventId: "evt_fixture", tokens: { prompt_tokens: 11, completion_tokens: 2 } });
    } finally { accept(); }
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.response.status).toBe(500);
    expect(store.enqueue).toHaveBeenCalledOnce();
  });
});

it("changes only the Claude error type after correlation, preserving safe diagnostics and headers", async () => {
  const payload = { type: "error", error: { type: "server_error", code: "upstream_error", param: "max_tokens", request_id: "upstream_fixture", message: "Failure" } };
  const original = new Response(JSON.stringify(payload), { status: 503, statusText: "Fixture failure",
    headers: { "content-type": "application/json", "retry-after": "60", "x-should-retry": "false", "x-fixture": "retained" } });
  const standard = await correlateResponse(original.clone(), "req_public", F.OPENAI);
  const claude = await correlateResponse(original.clone(), "req_public", F.CLAUDE);
  const openaiBody = await standard.json();
  const claudeBody = await claude.json();
  expect(claudeBody).toEqual({ ...openaiBody, error: { ...openaiBody.error, type: "api_error" } });
  expect(claude.status).toBe(standard.status);
  expect(claude.statusText).toBe("Fixture failure");
  expect([...claude.headers]).toEqual([...standard.headers]);
  expect(claude.headers.get("retry-after")).toBe("60");
  expect(claude.headers.get("x-should-retry")).toBe("false");
  expect(claude.headers.get("x-fixture")).toBe("retained");
  expect(claudeBody.error).toMatchObject({ code: "upstream_error", param: "max_tokens", request_id: "req_public", upstream_request_id: "upstream_fixture" });
});

it.each([
  ["invalid_request_error", 400], ["authentication_error", 401], ["billing_error", 402],
  ["permission_error", 403], ["not_found_error", 404], ["conflict_error", 409],
  ["request_too_large", 413], ["rate_limit_error", 429], ["api_error", 500],
  ["timeout_error", 504], ["overloaded_error", 529],
])("preserves the documented native %s error without narrowing its safe fields", async (type, status) => {
  const payload = { type: "error", error: { type, code: "native_code", param: "max_tokens", message: "Native failure", request_id: "upstream_fixture" } };
  const original = Response.json(payload, { status, headers: { "x-fixture": "retained" } });
  const standard = await correlateResponse(original.clone(), "req_public", F.OPENAI);
  const claude = await correlateResponse(original.clone(), "req_public", F.CLAUDE);
  expect(await claude.json()).toEqual(await standard.json());
  expect(claude.status).toBe(status);
  expect([...claude.headers]).toEqual([...standard.headers]);
});
