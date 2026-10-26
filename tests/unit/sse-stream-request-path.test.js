import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
}));
import { handleStreamingResponse } from "../../open-sse/handlers/chatCore/streamingHandler.js";
import { handleForcedSSEToJson, parseSSEToOpenAIResponse } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { createStreamController } from "../../open-sse/utils/streamHandler.js";
import { createResponsesApiTransformStream } from "../../open-sse/transformer/responsesTransformer.js";
import { convertResponsesStreamToJson } from "../../open-sse/transformer/streamToJsonConverter.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";

const encoder = new TextEncoder();
const frame = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
const usage = { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 };
const chunk = (content, finish_reason = null) => ({ id: "chatcmpl-request-path", choices: [{ index: 0, delta: { content }, finish_reason }] });
function upstream(text, type = "text/event-stream", bytes = false) {
  return new Response(new ReadableStream({ start(controller) {
    const wire = encoder.encode(text);
    if (bytes) for (const byte of wire) controller.enqueue(Uint8Array.of(byte));
    else controller.enqueue(wire);
    controller.close();
  } }), { headers: { "content-type": type } });
}
function context(response, targetFormat = F.OPENAI, sourceFormat = F.OPENAI) {
  return {
    providerResponse: response, provider: "offline", model: "offline", targetFormat, sourceFormat,
    requestStartTime: Date.now(), body: { model: "offline", messages: [] }, stream: true,
    streamController: createStreamController(), trackDone: vi.fn(), appendLog: vi.fn(),
    reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() },
  };
}
const network = vi.fn(() => { throw new Error("No network in SSE fixtures"); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("actual streaming request path", () => {
  it.each([F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES])("uses event framing on the request path into %s", async sourceFormat => {
    vi.stubGlobal("fetch", network);
    const wire = ': private debug\r\nevent: ignored\r\n\r\n' +
      'event: chunk\r\ndata: {"id":"chatcmpl-request-path",\r\ndata: "choices":[{"index":0,"delta":{"content":"世界 🌍"}}]}\r\n\r\n' +
      frame(chunk("", "stop")) + frame({ choices: [], usage }) + "data: [DONE]";
    const result = await handleStreamingResponse(context(upstream(wire, "text/event-stream", true), F.OPENAI, sourceFormat));
    expect(result.success).toBe(true);
    const text = await result.response.text();
    expect(text).toContain("世界 🌍");
    expect(text).not.toContain("private debug");
    expect(text).not.toContain("event: ignored");
    expect(text).not.toContain("�");
    if (sourceFormat === F.CLAUDE) expect(text).toContain("event: message_stop");
    if (sourceFormat === F.OPENAI_RESPONSES) expect(text).toContain("response.completed");
    expect(network).not.toHaveBeenCalled();
  });

  it("rejects actual JSON explicitly rather than silently feeding it to the SSE parser", async () => {
    const result = await handleStreamingResponse(context(Response.json({ choices: [{ message: { content: "not a stream" }, finish_reason: "stop" }] })));
    expect(result.success).toBe(false);
    expect(result.response.status).toBe(502);
    expect(await result.response.text()).not.toContain("not a stream");
  });

  it("retains compatibility with genuine SSE mislabeled application/json", async () => {
    const result = await handleStreamingResponse(context(upstream(frame(chunk("answer", "stop")) + "data: [DONE]\n\n", "application/json", true)));
    expect(result.success).toBe(true);
    expect(await result.response.text()).toContain("answer");
  });

  it("rejects HTML without buffering or leaking its payload", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const input = new ReadableStream({ pull(controller) { reads++; controller.enqueue(encoder.encode("private upstream diagnostics")); }, cancel }, { highWaterMark: 0 });
    const result = await handleStreamingResponse(context(new Response(input, { headers: { "content-type": "text/html" } })));
    expect(result.success).toBe(false);
    expect(reads).toBe(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(await result.response.text()).not.toContain("private");
  });

  it("normalizes flat event:error and drops comments/unknown lines without narrowing signed native fields", async () => {
    const signed = { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "reason", signature: "opaque==", provider_metadata: { opaque: "keep==" } } };
    const wire = ': Bearer private-comment-secret\r\nprivate-header: private-header-secret\r\n\r\n' +
      `event: content_block_start\r\n${frame(signed)}` +
      'event: error\r\ndata: {"message":"Bearer private-error-secret account private@example.test","code":"upstream_error","debug":"private-debug-secret"}\r\n\r\n';
    const result = await handleStreamingResponse(context(upstream(wire), F.CLAUDE, F.CLAUDE));
    const text = await result.response.text();
    expect(text).toContain('"signature":"opaque=="');
    expect(text).toContain('"opaque":"keep=="');
    for (const secret of ["private-comment-secret", "private-header-secret", "private-error-secret", "private@example.test", "private-debug-secret"]) expect(text).not.toContain(secret);
    expect(text).toContain("event: error");
    expect(text).not.toContain("event: message_stop");
  });

  it("keeps Ollama NDJSON explicit on the actual request path", async () => {
    const wire = [
      { message: { role: "assistant", content: "世界" }, done: false },
      { done: true, prompt_eval_count: 7, eval_count: 3 },
    ].map(value => JSON.stringify(value)).join("\r\n");
    const result = await handleStreamingResponse(context(upstream(wire, "application/x-ndjson", true), F.OLLAMA));
    const text = await result.response.text();
    expect(result.success).toBe(true);
    expect(text).toContain("世界");
    expect(text).toContain('"finish_reason":"stop"');
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
  });
});

describe.each(["forced", "nonstream"])("%s SSE-to-JSON request path", handler => {
  it("uses the same UTF-8/multiline/CRLF parser without calling response.text", async () => {
    const wire = 'data: {"id":"chatcmpl-request-path",\r\ndata: "choices":[{"index":0,"delta":{"content":"世界 🌍"}}]}\r\n\r\n' +
      frame(chunk("", "stop")) + frame({ choices: [], usage }) + "data: [DONE]";
    const response = upstream(wire, "text/event-stream", true);
    const textSpy = vi.spyOn(response, "text").mockRejectedValue(new Error("whole-body buffering forbidden"));
    const ctx = { ...context(response), stream: false };
    const result = await (handler === "forced" ? handleForcedSSEToJson(ctx) : handleNonStreamingResponse(ctx));
    expect(result.success).toBe(true);
    const body = await result.response.json();
    expect(body.choices[0].message.content).toBe("世界 🌍");
    expect(body.usage).toMatchObject(usage);
    expect(textSpy).not.toHaveBeenCalled();
  });
});

it.each(["forced", "nonstream"])("%s JSON aggregation cancels a locked pending read from the supplied caller signal", async handler => {
  const abort = new AbortController();
  const cancel = vi.fn();
  const input = new ReadableStream({ cancel });
  const ctx = { ...context(new Response(input, { headers: { "content-type": "text/event-stream" } })), signal: abort.signal, stream: false };
  const result = handler === "forced" ? handleForcedSSEToJson(ctx) : handleNonStreamingResponse(ctx);
  const error = new Error("caller cancelled aggregation");
  abort.abort(error);
  await expect(result).rejects.toBe(error);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(input.locked).toBe(false);
});

it("routes both standalone converters through incremental UTF-8 framing and EOF tails", async () => {
  const chatWire = 'data: {"id":"chatcmpl-request-path",\r\ndata: "choices":[{"index":0,"delta":{"content":"世界 🌍"},"finish_reason":"stop"}]}';
  const transformed = await new Response(upstream(chatWire, "text/event-stream", true).body.pipeThrough(createResponsesApiTransformStream())).text();
  expect(transformed).toContain('"text":"世界 🌍"');
  expect(transformed).toContain("response.completed");
  expect(transformed).not.toContain("�");
  const response = await convertResponsesStreamToJson(upstream('event: response.completed\r\ndata: {"response":{"id":"resp_tail","status":"completed",\r\ndata: "output":[],"usage":{"input_tokens":7,"output_tokens":3,"total_tokens":10}}}', "text/event-stream", true).body);
  expect(response).toMatchObject({ id: "resp_tail", status: "completed", usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } });
  expect(parseSSEToOpenAIResponse(chatWire, "fallback").choices[0].message.content).toBe("世界 🌍");
});
