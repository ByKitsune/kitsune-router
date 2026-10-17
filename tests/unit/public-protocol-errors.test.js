import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
}));
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { sanitizeErrorResponse } from "../../src/sse/utils/requestCorrelation.js";
import { validateAgentRequestControls } from "../../open-sse/utils/cursorProtobuf.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
import { initState, translateResponse } from "../../open-sse/translator/index.js";
import { parseUpstreamError, errorResponse } from "../../open-sse/utils/error.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

const privateError = { message: "Cursor AgentService; account private@example.test; Bearer synthetic-private-key", type: "invalid_request_error", code: "unsupported_parameter", param: "max_tokens", debug: { token: "must-not-leave-host" } };
function assertPublic(error) {
  expect(error).toMatchObject({ type: "invalid_request_error", code: "unsupported_parameter", param: "max_tokens" });
  const json = JSON.stringify(error);
  for (const detail of ["cursor", "private@example.test", "synthetic-private-key", "must-not-leave-host"]) expect(json).not.toContain(detail);
  expect(json).not.toMatch(/cursor|agentservice/i);
  expect(error).not.toHaveProperty("debug");
}
async function streamError(format, nativeResponse = false) {
  const payload = nativeResponse
    ? { type: "response.failed", response: { id: "resp_public_alias", status: "failed", output: [], error: privateError, usage: { input_tokens: 11, output_tokens: 0, total_tokens: 11 } } }
    : { error: privateError };
  const bytes = new TextEncoder().encode(`${nativeResponse ? "event: response.failed\n" : ""}data: ${JSON.stringify(payload)}\n\n`);
  const source = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  const text = await new Response(source.pipeThrough(createSSEStream({
    mode: nativeResponse ? "passthrough" : "translate", targetFormat: nativeResponse ? F.OPENAI_RESPONSES : F.OPENAI,
    sourceFormat: format, provider: "cursor", model: "public-alias", body: { messages: [] },
  }))).text();
  return text.split(/\r?\n/).filter((line) => line.startsWith("data:") && line.slice(5).trim() !== "[DONE]").map((line) => JSON.parse(line.slice(5)));
}

const failedResponse = () => ({ type: "response.failed", response: {
  id: "resp_after_output", status: "failed", error: privateError,
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Partial answer" }] }],
  usage: { input_tokens: 11, output_tokens: 2, total_tokens: 13 },
} });
async function failureAfterOutput(format, flat = false) {
  const events = [
    { type: "response.created", response: { id: "resp_after_output", status: "in_progress", output: [] } },
    { type: "response.output_text.delta", item_id: "msg_partial", output_index: 0, content_index: 0, delta: "Partial answer" },
    flat ? { ...privateError, type: "error", sequence_number: 7 } : failedResponse(),
  ];
  const bytes = new TextEncoder().encode(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
  const input = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  const text = await new Response(input.pipeThrough(createSSEStream({
    mode: format === F.OPENAI_RESPONSES ? "passthrough" : "translate",
    targetFormat: F.OPENAI_RESPONSES, sourceFormat: format, provider: "codex", model: "public-alias", body: { messages: [] },
  }))).text();
  const frames = text.split(/\r?\n/).filter(line => line.startsWith("data:") && line.slice(5).trim() !== "[DONE]").map(line => JSON.parse(line.slice(5)));
  return { frames, text };
}

describe("public protocol errors preserve diagnostics without internal routing", () => {
  it("retains HTTP diagnostics through the real default executor instead of treating JSON as message text", async () => {
    const parsed = await parseUpstreamError(Response.json({ error: privateError }, { status: 400 }), new DefaultExecutor("openai"));
    const response = await sanitizeErrorResponse(errorResponse(parsed.statusCode, parsed.message, parsed), "req_http");
    assertPublic((await response.json()).error);
    expect(parsed.message).not.toMatch(/^\s*\{/);
  });

  it("supplements provider-specific reset parsing with the original numeric code and parameter", async () => {
    const response = Response.json({ error: { message: "Quota exceeded", type: "rate_limit_error", code: 429, param: "model" } }, { status: 429 });
    const parsed = await parseUpstreamError(response, { parseError: () => ({ status: 429, message: "Provider quota reset", resetsAtMs: 1900000000000 }) });
    expect(parsed).toMatchObject({ statusCode: 429, type: "rate_limit_error", code: 429, param: "model", resetsAtMs: 1900000000000 });
  });

  it("neutralizes HTTP errors while retaining correlation and actionable fields", async () => {
    const response = await sanitizeErrorResponse(Response.json({ error: privateError }, { status: 400 }), "req_public");
    const body = await response.json();
    assertPublic(body.error);
    expect(body.error.request_id).toBe("req_public");
    expect(response.headers.get("x-request-id")).toBe("req_public");
  });
  it.each([F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES])("sanitizes a terminal error in %s SSE", async (format) => {
    const frames = await streamError(format);
    const error = frames.map((frame) => frame.error || frame.response?.error).find(Boolean);
    assertPublic(error);
  });
  it("retains native Responses failure identity and usage without forwarding debug payloads", async () => {
    const frames = await streamError(F.OPENAI_RESPONSES, true);
    const terminal = frames.find((frame) => frame.type === "response.failed");
    assertPublic(terminal.response.error);
    expect(terminal.response.id).toBe("resp_public_alias");
    expect(terminal.response.usage).toEqual({ input_tokens: 11, output_tokens: 0, total_tokens: 11 });
  });
  it("does not disclose a hidden native transport when rejecting a request control", () => {
    try { validateAgentRequestControls({ max_tokens: 7 }); }
    catch (error) {
      expect(error).toMatchObject({ code: "unsupported_parameter", param: "max_tokens" });
      expect(error.message).not.toMatch(/cursor|agentservice/i);
      return;
    }
    throw new Error("An unsupported control was silently accepted");
  });
  it.each([F.OPENAI, F.CLAUDE])("keeps a native Responses failure structured after output for %s clients", async (format) => {
    const { frames, text } = await failureAfterOutput(format);
    assertPublic(frames.map(frame => frame.error).find(Boolean));
    expect(text).not.toContain("[Error]");
    if (format === F.OPENAI) expect(frames.find(frame => frame.error).usage).toMatchObject({ prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 });
    const answer = frames.map(frame => frame.choices?.[0]?.delta?.content || (frame.delta?.type === "text_delta" ? frame.delta.text : "")).join("");
    expect(answer).toBe("Partial answer");
    expect(frames.some(frame => frame.choices?.[0]?.finish_reason === "stop")).toBe(false);
  });

  it("sanitizes flat native error events after output without losing framing or sequence", async () => {
    const { frames } = await failureAfterOutput(F.OPENAI_RESPONSES, true);
    const error = frames.find(frame => frame.type === "error");
    expect(error).toMatchObject({ type: "error", code: "unsupported_parameter", param: "max_tokens", sequence_number: 7 });
    expect(JSON.stringify(error)).not.toMatch(/cursor|agentservice|private@example|must-not-leave-host/i);
    expect(error).not.toHaveProperty("debug");
  });

  it.each([F.OPENAI, F.CLAUDE])("does not manufacture successful assistant text in the registered %s failure codec", (format) => {
    const chunks = translateResponse(F.OPENAI_RESPONSES, format, failedResponse(), initState(format));
    expect(chunks.find(chunk => chunk.error)?.error).toMatchObject({ code: "unsupported_parameter", param: "max_tokens" });
    expect(chunks.some(chunk => chunk.choices?.[0]?.delta?.content)).toBe(false);
  });
});
