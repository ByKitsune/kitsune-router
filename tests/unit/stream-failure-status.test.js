import { describe, it, expect, vi } from "vitest";
import {
  createPassthroughStreamWithLogger,
  createSSETransformStreamWithLogger,
} from "../../open-sse/utils/stream.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

vi.mock("@/lib/usageDb.js", () => ({
  saveRequestDetail: vi.fn(async () => {}),
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
}));

const { buildOnStreamComplete } = await import(
  "../../open-sse/handlers/chatCore/streamingHandler.js"
);
const { saveRequestDetail } = await import("@/lib/usageDb.js");

async function drain(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function sseSource(lines) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + "\n"));
      controller.close();
    },
  });
}

// 9Router #4104: an upstream can end an HTTP-200 stream with a failure INSIDE
// the event body (Responses response.failed). ZenRouter recorded those as
// "success" in requestDetails/dashboard because completion never looked at
// the terminal event. The stream must now report failed + error.
describe("in-stream failure is not logged as success (#4104)", () => {
  it("passthrough: response.failed marks the stream failed with its message", async () => {
    const calls = [];
    const t = createPassthroughStreamWithLogger(
      "codex", null, "gpt-5.3-codex", null, { model: "gpt-5.3-codex" },
      (...args) => calls.push(args), null, null, FORMATS.OPENAI_RESPONSES
    );
    const out = await drain(
      sseSource([
        'data: {"type":"response.created","response":{"id":"resp_1","status":"in_progress"}}',
        "",
        'data: {"type":"response.failed","response":{"id":"resp_1","status":"failed","error":{"code":"server_error","message":"boom from upstream"}}}',
        "",
      ]).pipeThrough(t)
    );
    expect(calls.length).toBe(1);
    expect(calls[0][3]).toMatchObject({ failed: true, error: "boom from upstream" });
    // The failure retains its native event framing.
    expect(out).toContain("response.failed");
  });

  it("passthrough: response.completed stays success", async () => {
    const calls = [];
    const t = createPassthroughStreamWithLogger(
      "codex", null, "gpt-5.3-codex", null, { model: "gpt-5.3-codex" },
      (...args) => calls.push(args), null, null, FORMATS.OPENAI_RESPONSES
    );
    await drain(
      sseSource([
        'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
        "",
        "data: [DONE]",
        "",
      ]).pipeThrough(t)
    );
    expect(calls.length).toBe(1);
    expect(calls[0][3]).toEqual({ failed: false, error: null });
  });

  it("translate (Responses target): response.failed event marks failure", async () => {
    const calls = [];
    const t = createSSETransformStreamWithLogger(
      FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES, "codex", null, null,
      "gpt-5.3-codex", null, { model: "gpt-5.3-codex" },
      (...args) => calls.push(args), null
    );
    await drain(
      sseSource([
        "event: response.failed",
        'data: {"type":"response.failed","response":{"id":"resp_9","status":"failed","error":{"message":"translate boom"}}}',
        "",
      ]).pipeThrough(t)
    );
    expect(calls.length).toBe(1);
    expect(calls[0][3].failed).toBe(true);
    expect(calls[0][3].error).toContain("translate boom");
  });

  it("buildOnStreamComplete records status failed + error on failure meta", () => {
    const { onStreamComplete } = buildOnStreamComplete({
      provider: "codex",
      model: "gpt-5.3-codex",
      connectionId: "conn-1",
      apiKey: null,
      requestStartTime: Date.now(),
      body: { model: "x", messages: [] },
      stream: true,
    });
    onStreamComplete({ content: "partial", thinking: null }, null, Date.now(), {
      failed: true,
      error: "boom from upstream",
    });
    expect(saveRequestDetail).toHaveBeenCalled();
    const record = saveRequestDetail.mock.calls.at(-1)[0];
    expect(record.status).toBe("failed");
    expect(record.response.error).toBe("boom from upstream");
  });

  it("buildOnStreamComplete still records success without failure meta (compat)", () => {
    const { onStreamComplete } = buildOnStreamComplete({
      provider: "codex",
      model: "gpt-5.3-codex",
      connectionId: "conn-1",
      apiKey: null,
      requestStartTime: Date.now(),
      body: { model: "x", messages: [] },
      stream: true,
    });
    onStreamComplete({ content: "ok", thinking: null }, null, Date.now());
    const record = saveRequestDetail.mock.calls.at(-1)[0];
    expect(record.status).toBe("success");
    expect(record.response.error).toBeUndefined();
  });
  it("records a request-scoped late failure without poisoning the account", async () => {
    const onStreamFailed = vi.fn();
    const { onStreamComplete } = buildOnStreamComplete({
      provider: "openai", model: "gpt-5-pro", connectionId: "request-fault-fixture",
      body: { messages: [] }, stream: true, requestStartTime: Date.now(), onStreamFailed,
    });
    const transform = createSSETransformStreamWithLogger(
      FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, "openai", null, null,
      "gpt-5-pro", "request-fault-fixture", { messages: [] }, onStreamComplete,
    );
    await drain(sseSource([
      'data: {"type":"response.output_text.delta","delta":"Partial answer","output_index":0,"item_id":"partial"}', "",
      'data: {"type":"response.failed","response":{"status":"failed","error":{"type":"invalid_request_error","code":"unsupported_parameter","param":"max_tokens","message":"Invalid request control"},"usage":{"input_tokens":11,"output_tokens":2,"total_tokens":13}}}', "",
    ]).pipeThrough(transform));
    expect(onStreamFailed).not.toHaveBeenCalled();
    const record = saveRequestDetail.mock.calls.at(-1)[0];
    expect(record.status).toBe("failed");
    expect(record.tokens).toMatchObject({ prompt_tokens: 11, completion_tokens: 2 });
  });
});

describe("late OpenAI errors reach every client format", () => {
  it.each([
    FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES,
    FORMATS.GEMINI, FORMATS.ANTIGRAVITY,
  ])("preserves a partial answer and terminates %s as failed, not completed", async (sourceFormat) => {
    const calls = [];
    const transform = createSSETransformStreamWithLogger(
      FORMATS.OPENAI, sourceFormat, "qoder", null, null,
      "ultimate", null, { messages: [{ role: "user", content: "hello" }] },
      (...args) => calls.push(args), null,
    );
    const output = await drain(sseSource([
      `data: ${JSON.stringify({ id: "chat-1", choices: [{ index: 0, delta: { content: "partial answer" }, finish_reason: null }] })}`,
      "",
      `data: ${JSON.stringify({ error: { code: "10605", message: "Queue limit", retryAfterSeconds: 30 } })}`,
      "",
      "data: [DONE]",
      "",
    ]).pipeThrough(transform));
    expect(output).toContain("partial answer");
    expect(output).toContain("Queue limit");
    expect(output).toContain("10605");
    expect(output).not.toContain("response.completed");
    expect(output).not.toContain('"status":"completed"');
    expect(output).not.toContain('"finish_reason":"stop"');
    expect(output).not.toContain('"finishReason":"STOP"');
    expect(output).not.toContain("event: message_stop");
    if (sourceFormat === FORMATS.CLAUDE) expect(output).toContain("event: error");
    if (sourceFormat === FORMATS.OPENAI_RESPONSES) expect(output).toContain("event: response.failed");
    expect(calls).toHaveLength(1);
    expect(calls[0][3]).toMatchObject({ failed: true, error: "Queue limit" });
  });
});
