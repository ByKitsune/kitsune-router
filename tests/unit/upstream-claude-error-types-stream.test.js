import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: store.enqueue,
  enqueueRequestUsage: store.enqueue,
}));

import { createSSEStream } from "../../open-sse/utils/stream.js";
import { buildOnStreamComplete } from "../../open-sse/handlers/chatCore/streamingHandler.js";
import { extractResponseError, responseErrorToClient } from "../../open-sse/translator/concerns/responseError.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
import { initState, translateResponse } from "../../open-sse/translator/index.js";

const encoder = new TextEncoder();
const frame = (data, event = data.type) => `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
const source = text => new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); } });
const frames = text => text.split(/\n\n/).flatMap(block => {
  const line = block.split("\n").find(value => value.startsWith("data:"));
  return line && line.slice(5).trim() !== "[DONE]" ? [JSON.parse(line.slice(5))] : [];
});
const failed = error => ({ type: "response.failed", response: {
  id: "resp_fixture", status: "failed", error,
  usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 },
} });

beforeEach(() => {
  store.enqueue.mockReset().mockImplementation(async entry => ({ accepted: true, eventId: entry.eventId }));
});

describe("Responses failures translated to Claude Messages", () => {
  it.each([
    [{ type: "server_error", code: "internal_server_error", message: "Failure", status: 500 }, "api_error", 500],
    [{ type: "stream_error", code: "stream_disconnected", message: "Disconnected", status: 502 }, "api_error", 502],
    [{ type: "unexpected_provider_error", code: "rate_limit_exceeded", message: "Limit reached", status: 429 }, "rate_limit_error", 429],
    [{ code: "invalid_api_key", message: "Invalid credentials", status: "401" }, "authentication_error", 401],
    [{ type: "unexpected_provider_error", code: "unsupported_parameter", message: "Unsupported parameter", status: 400, param: "max_tokens" }, "invalid_request_error", 400],
    [{ type: "server_error", code: "gateway_timeout", message: "Timed out", status: 504 }, "timeout_error", 504],
    [{ type: "server_error", code: "busy", message: "Overloaded", status: 529 }, "overloaded_error", 529],
    [{ type: "unknown", code: "missing", message: "Not found", status: 404 }, "not_found_error", 404],
    [{ type: "unknown", code: "conflict", message: "Conflict", status: 409 }, "conflict_error", 409],
    [{ type: "unknown", code: "large", message: "Too large", status: 413 }, "request_too_large", 413],
    [{ code: "rate_limit_exceeded", message: "Limit reached" }, "rate_limit_error", 429],
    [{ code: "invalid_api_key", message: "Invalid credentials" }, "authentication_error", 401],
    [{ code: "unsupported_parameter", message: "Unsupported parameter" }, "invalid_request_error", 400],
    [{ type: "provider_future_error", code: "opaque", message: "Failure" }, "api_error", 502],
    [{ type: "unknown", code: "malformed", message: "Invalid data", status: 422 }, "invalid_request_error", 422],
  ])("translates %j to %s while retaining status and code", async (error, expectedType, status) => {
    const complete = vi.fn();
    const input = frame({ type: "response.created", response: { id: "resp_fixture", status: "in_progress" } })
      + frame({ type: "response.output_text.delta", output_index: 0, item_id: "msg_fixture", delta: "partial answer" })
      + frame(failed(error)) + frame({ type: "response.completed", response: { status: "completed" } });
    const text = await new Response(source(input).pipeThrough(createSSEStream({
      targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.CLAUDE, model: "fixture",
      body: { messages: [] }, onStreamComplete: complete,
    }))).text();
    const output = frames(text);
    const errorFrames = output.filter(value => value.type === "error");
    expect(errorFrames).toHaveLength(1);
    expect(errorFrames[0].error).toMatchObject({ type: expectedType, code: error.code });
    if (error.param) expect(errorFrames[0].error.param).toBe(error.param);
    expect(text).toContain("partial answer");
    expect(text.indexOf("partial answer")).toBeLessThan(text.indexOf("event: error"));
    expect(output.at(-1).type).toBe("error");
    expect(text).not.toContain("event: message_stop");
    expect(text).not.toContain("[DONE]");
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][1]).toMatchObject({ prompt_tokens: 11, completion_tokens: 2 });
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: true, status });
  });

  it("sanitizes an error event after translating its type and preserves the code", async () => {
    const error = { type: "server_error", code: "upstream_error", status: 502,
      message: "Bearer synthetic-secret account private@example.test", debug: "private-debug" };
    const text = await new Response(source(frame(failed(error))).pipeThrough(createSSEStream({
      targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.CLAUDE,
    }))).text();
    const output = frames(text)[0];
    expect(output.error).toMatchObject({ type: "api_error", code: "upstream_error", request_id: expect.any(String) });
    expect(text).not.toContain("synthetic-secret");
    expect(text).not.toContain("private@example.test");
    expect(text).not.toContain("private-debug");
  });

  it("maps a flat Responses error and suppresses later translator events", () => {
    const state = initState(F.CLAUDE);
    const error = { type: "error", code: "rate_limit_exceeded", message: "Limit reached", status: 429, sequence_number: 7 };
    const translated = translateResponse(F.OPENAI_RESPONSES, F.CLAUDE, error, state);
    expect(translated).toEqual([{ type: "error", error: { code: "rate_limit_exceeded", message: "Limit reached", status: 429, type: "rate_limit_error" } }]);
    expect(translateResponse(F.OPENAI_RESPONSES, F.CLAUDE, failed({ message: "second error" }), state)).toEqual([]);
    expect(translateResponse(F.OPENAI_RESPONSES, F.CLAUDE, null, state)).toEqual([]);
  });

  it("translates a flat event: error from the actual SSE path", async () => {
    const flat = { code: "rate_limit_exceeded", message: "Limit reached", status: 429, sequence_number: 7 };
    const text = await new Response(source(frame(flat, "error")).pipeThrough(createSSEStream({
      targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.CLAUDE,
    }))).text();
    expect(frames(text)).toMatchObject([{ type: "error", error: { type: "rate_limit_error", code: "rate_limit_exceeded" } }]);
    expect(text).not.toContain("[DONE]");
  });

  it("maps synthesized truncation and abort errors to api_error", async () => {
    const input = frame({ type: "response.created", response: { id: "resp_fixture", status: "in_progress" } });
    const text = await new Response(source(input).pipeThrough(createSSEStream({ targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.CLAUDE }))).text();
    expect(frames(text).at(-1)).toMatchObject({ type: "error", error: { type: "api_error", code: "stream_disconnected" } });
    const stream = createSSEStream({ targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.CLAUDE });
    const abort = new TextDecoder().decode(await stream.abortTerminalBytes("Connection lost"));
    expect(frames(abort)).toMatchObject([{ type: "error", error: { type: "api_error", code: "stream_disconnected" } }]);
    stream.dispose();
  });

  it("waits for durable usage acceptance before emitting the error", async () => {
    let accept;
    const acceptance = new Promise(resolve => { accept = resolve; });
    store.enqueue.mockImplementation(entry => acceptance.then(() => ({ accepted: true, eventId: entry.eventId })));
    const onStreamFailed = vi.fn();
    const { onStreamComplete } = buildOnStreamComplete({
      provider: "openai", model: "fixture", connectionId: "fixture-account", body: { messages: [] },
      stream: true, requestStartTime: Date.now(), onStreamFailed, usageEventId: "evt_fixture",
    });
    const transform = createSSEStream({ targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.CLAUDE, onStreamComplete });
    const reader = source(frame(failed({ type: "server_error", code: "unsupported_parameter", status: 400, message: "Invalid request" })))
      .pipeThrough(transform).getReader();
    let settled = false;
    const pending = reader.read().then(result => { settled = true; return result; });
    try {
      await vi.waitFor(() => expect(store.enqueue).toHaveBeenCalledOnce());
      expect(settled).toBe(false);
      expect(store.enqueue.mock.calls[0][0]).toMatchObject({ eventId: "evt_fixture", tokens: { prompt_tokens: 11, completion_tokens: 2 } });
      expect(onStreamFailed).not.toHaveBeenCalled();
    } finally { accept(); }
    const result = await pending;
    expect(frames(new TextDecoder().decode(result.value))[0].error).toMatchObject({ type: "invalid_request_error", code: "unsupported_parameter" });
    expect((await reader.read()).done).toBe(true);
    expect(store.enqueue).toHaveBeenCalledOnce();
  });

  it("does not emit a terminal error when accepting incurred usage fails", async () => {
    store.enqueue.mockRejectedValue(new Error("synthetic acceptance failure"));
    const { onStreamComplete } = buildOnStreamComplete({
      provider: "openai", model: "fixture", connectionId: "fixture-account", body: { messages: [] },
      stream: true, requestStartTime: Date.now(), usageEventId: "evt_rejected",
    });
    const transform = createSSEStream({ targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.CLAUDE, onStreamComplete });
    const reader = source(frame(failed({ type: "server_error", code: "upstream_error", status: 500, message: "Failure" })))
      .pipeThrough(transform).getReader();
    await expect(reader.read()).rejects.toMatchObject({ code: "usage_acceptance_failed" });
    expect(store.enqueue).toHaveBeenCalledOnce();
    expect(store.enqueue.mock.calls[0][0]).toMatchObject({ eventId: "evt_rejected", tokens: { prompt_tokens: 11, completion_tokens: 2 } });
  });

  it("retains previously observed usage when the failure carries no usage", async () => {
    const complete = vi.fn();
    const input = frame({ type: "response.created", response: { id: "resp_fixture", status: "in_progress", usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 } } })
      + frame({ type: "response.failed", response: { status: "failed", error: { type: "server_error", code: "upstream_error", message: "Failure" } } });
    const text = await new Response(source(input).pipeThrough(createSSEStream({
      targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.CLAUDE, onStreamComplete: complete,
    }))).text();
    expect(frames(text).at(-1)).toMatchObject({ type: "error", error: { type: "api_error", code: "upstream_error" } });
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][1]).toMatchObject({ prompt_tokens: 11, completion_tokens: 2 });
  });

  it("keeps the original account-health status while changing only the client type", async () => {
    const onStreamFailed = vi.fn();
    const { onStreamComplete } = buildOnStreamComplete({
      provider: "openai", model: "fixture", connectionId: "fixture-account", body: { messages: [] },
      stream: true, requestStartTime: Date.now(), onStreamFailed, usageEventId: "evt_health",
    });
    const text = await new Response(source(frame(failed({ type: "server_error", code: "rate_limit_exceeded", status: 429, message: "Limit reached" })))
      .pipeThrough(createSSEStream({ targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.CLAUDE, onStreamComplete }))).text();
    expect(frames(text).at(-1).error).toMatchObject({ type: "rate_limit_error", code: "rate_limit_exceeded" });
    expect(onStreamFailed).toHaveBeenCalledExactlyOnceWith({ error: "Limit reached", status: 429 });
    expect(store.enqueue).toHaveBeenCalledOnce();
  });
});

describe("native Claude and non-Claude error preservation", () => {
  it.each([
    "invalid_request_error", "authentication_error", "billing_error", "permission_error", "not_found_error",
    "conflict_error", "request_too_large", "rate_limit_error", "api_error", "timeout_error", "overloaded_error",
  ])("retains a native Claude %s error", async type => {
    const native = { type: "error", error: { type, code: "native_code", message: "Native failure", status: 502 } };
    const text = await new Response(source(frame(native)).pipeThrough(createSSEStream({
      mode: "passthrough", targetFormat: F.CLAUDE, sourceFormat: F.CLAUDE,
    }))).text();
    expect(frames(text)).toMatchObject([{ type: "error", error: { type, code: "native_code", message: "Native failure" } }]);
  });

  it("preserves a documented native type even if a supplied status differs", () => {
    const failure = { status: 429, error: { type: "overloaded_error", code: "native_code", message: "Native failure" } };
    expect(responseErrorToClient(F.CLAUDE, failure).error).toEqual(failure.error);
    expect(failure.status).toBe(429);
  });

  it("preserves native Messages framing and partial content before a genuine overloaded error shape", async () => {
    const events = [
      { type: "message_start", message: { id: "msg_fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 11, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial answer" } },
      { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
      { type: "message_stop" },
    ];
    const complete = vi.fn();
    const text = await new Response(source(events.map(event => frame(event)).join("")).pipeThrough(createSSEStream({
      mode: "passthrough", targetFormat: F.CLAUDE, sourceFormat: F.CLAUDE, onStreamComplete: complete,
    }))).text();
    expect(frames(text).map(event => event.type)).toEqual(["message_start", "content_block_start", "content_block_delta", "error"]);
    expect(frames(text).at(-1).error).toMatchObject({ type: "overloaded_error", message: "Overloaded" });
    expect(text).toContain("partial answer");
    expect(text).not.toContain("[DONE]");
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][1]).toMatchObject({ prompt_tokens: 11 });
  });

  it("does not mutate upstream failures or change other output formats", () => {
    const upstream = failed({ type: "server_error", code: "upstream_error", message: "Failure", status: 503 });
    const original = structuredClone(upstream);
    const failure = extractResponseError(upstream);
    expect(failure.status).toBe(503);
    expect(responseErrorToClient(F.OPENAI, failure)).toMatchObject({ error: upstream.response.error });
    expect(responseErrorToClient(F.OPENAI_RESPONSES, failure).data.response.error).toEqual(upstream.response.error);
    expect(responseErrorToClient(F.CLAUDE, failure).error.type).toBe("api_error");
    expect(upstream).toEqual(original);
  });
});
