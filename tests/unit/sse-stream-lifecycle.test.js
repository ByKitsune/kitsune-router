import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}) }));
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { createStreamController, pipeWithDisconnect } from "../../open-sse/utils/streamHandler.js";
import { convertResponsesStreamToJson } from "../../open-sse/transformer/streamToJsonConverter.js";
import { createResponsesApiTransformStream } from "../../open-sse/transformer/responsesTransformer.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
import { SSE_COMPLETION_GRACE_MS, SSE_LIMITS } from "../../open-sse/utils/sse.js";
const encoder = new TextEncoder();
const frame = (data, event = null) => `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
const chat = (delta, finish_reason = null, index = 0) => ({ id: "chatcmpl-lifecycle-new", object: "chat.completion.chunk", choices: [{ index, delta, finish_reason }] });
const usage = { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 };
const nativeUsage = { input_tokens: 7, output_tokens: 3, total_tokens: 10 };
const source = text => new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); } });
async function until(reader, marker) {
  let text = "";
  while (!text.includes(marker)) { const result = await reader.read(); if (result.done) throw new Error(`Missing ${marker}`); text += new TextDecoder().decode(result.value); }
  return text;
}
afterEach(() => vi.useRealTimers());
describe.each(["passthrough", "translate"])("%s terminal lifecycle", mode => {
  it.each(["data: [DONE]\n\n", ""])("reports truncation as failed before the first DONE: %j", async tail => {
    const complete = vi.fn();
    const text = await new Response(source(frame(chat({ content: "partial" })) + tail).pipeThrough(createSSEStream({ mode, onStreamComplete: complete }))).text();
    expect(text).toContain('"finish_reason":"network_error"');
    expect(text.indexOf('"finish_reason":"network_error"')).toBeLessThan(text.indexOf("data: [DONE]"));
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1); expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: true, status: 502 });
  });
  it("does not confuse an opaque done property with the protocol sentinel", async () => {
    const complete = vi.fn();
    const value = { ...chat({ content: "answer" }, "stop"), done: true, provider_metadata: { signature: "opaque==" } };
    const text = await new Response(source(frame(value) + "data: [DONE]\n\n").pipeThrough(createSSEStream({ mode, onStreamComplete: complete }))).text();
    expect(text).toContain('"signature":"opaque=="'); expect(text).toContain("answer"); expect(text.match(/data: \[DONE\]/g)).toHaveLength(1); expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
  });
  it("preserves usage on an otherwise empty delta and output in a non-first choice", async () => {
    const complete = vi.fn();
    const text = await new Response(source(frame({ choices: [{ index: 0, delta: {} }, { index: 1, delta: { content: "second choice" } }], usage }) + frame({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }, { index: 1, delta: {}, finish_reason: "stop" }] }) + "data: [DONE]\n\n").pipeThrough(createSSEStream({ mode, onStreamComplete: complete }))).text();
    expect(text).toContain("second choice"); expect(text).toContain('"prompt_tokens":7'); expect(complete.mock.calls[0][1]).toMatchObject(usage);
  });
  it("does not start terminal grace while another requested choice is still generating", async () => {
    vi.useFakeTimers(); let upstream; const complete = vi.fn();
    const input = new ReadableStream({ start(controller) { upstream = controller; } });
    const transform = createSSEStream({ mode, body: { n: 2 }, onStreamComplete: complete });
    const output = new Response(pipeWithDisconnect({ body: input }, transform, createStreamController(), null, 20000, 20000, 0)).text();
    upstream.enqueue(encoder.encode(frame(chat({ content: "first" }, "stop", 0))));
    await vi.advanceTimersByTimeAsync(SSE_COMPLETION_GRACE_MS + 1); expect(complete).not.toHaveBeenCalled();
    upstream.enqueue(encoder.encode(frame(chat({ content: "second" }, "stop", 1)) + frame({ choices: [], usage }) + "data: [DONE]\n\n"));
    const text = await output; expect(text).toContain("first"); expect(text).toContain("second"); expect(complete).toHaveBeenCalledTimes(1); expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
  });
  it("settles Chat at DONE without waiting for a held-open transport", async () => {
    const cancel = vi.fn(); const complete = vi.fn();
    const upstream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frame(chat({ content: "answer" })) + frame(chat({}, "stop")) + frame({ choices: [], usage }) + "data: [DONE]\n\n")); }, cancel });
    const transform = createSSEStream({ mode, onStreamComplete: complete });
    const output = pipeWithDisconnect({ body: upstream }, transform, createStreamController(), null, 500, 500, 0);
    expect(await new Response(output).text()).toContain("data: [DONE]"); expect(complete).toHaveBeenCalledTimes(1); expect(complete.mock.calls[0][1]).toMatchObject(usage);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1)); expect(upstream.locked).toBe(false); expect(transform.writable.locked).toBe(false);
  });
});
it("recognizes Chat-shaped executor terminals even when the provider format is Kiro", async () => {
  const complete = vi.fn();
  const text = await new Response(source(frame(chat({ content: "answer" })) + frame(chat({}, "stop")) + frame({ choices: [], usage }) + "data: [DONE]\n\n").pipeThrough(createSSEStream({ targetFormat: F.KIRO, sourceFormat: F.OPENAI, onStreamComplete: complete }))).text();
  expect(text).toContain("answer"); expect(text).not.toContain("network_error"); expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
});
it("native Messages accounts success before message_stop, even when the next action is cancellation", async () => {
  const complete = vi.fn(); const cancel = vi.fn();
  const upstream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frame({ type: "message_start", message: { usage: { input_tokens: 7, output_tokens: 0 } } }, "message_start") + frame({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "answer" } }, "content_block_delta") + frame({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }, "message_delta") + frame({ type: "message_stop" }, "message_stop"))); }, cancel });
  const transform = createSSEStream({ mode: "passthrough", sourceFormat: F.CLAUDE, targetFormat: F.CLAUDE, onStreamComplete: complete });
  const reader = pipeWithDisconnect({ body: upstream }, transform, createStreamController(), null, 500, 500, 0, F.CLAUDE).getReader();
  const text = await until(reader, "event: message_stop\n");
  expect(complete).toHaveBeenCalledTimes(1); expect(complete.mock.calls[0][3]).toEqual({ failed: false, error: null }); expect(complete.mock.calls[0][1]).toMatchObject({ prompt_tokens: 7, completion_tokens: 3 }); expect(text).not.toContain("[DONE]");
  await reader.cancel("terminal consumed"); expect(complete).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1); expect(upstream.locked).toBe(false);
});
it("holds a native completion without usage for the existing grace, preserving the late trailer", async () => {
  vi.useFakeTimers(); let upstream; const complete = vi.fn(); const cancel = vi.fn();
  const input = new ReadableStream({ start(controller) { upstream = controller; }, cancel });
  const transform = createSSEStream({ mode: "passthrough", targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.OPENAI_RESPONSES, onStreamComplete: complete });
  const output = new Response(pipeWithDisconnect({ body: input }, transform, createStreamController(), null, 10000, 10000, 0)).text();
  upstream.enqueue(encoder.encode(frame({ type: "response.completed", response: { id: "resp_grace", status: "completed" } }, "response.completed")));
  await vi.advanceTimersByTimeAsync(SSE_COMPLETION_GRACE_MS - 1); expect(complete).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
  upstream.enqueue(encoder.encode(frame({ usage: nativeUsage })));
  expect(await output).toContain("response.completed"); expect(complete).toHaveBeenCalledTimes(1); expect(complete.mock.calls[0][1]).toMatchObject({ prompt_tokens: 7, completion_tokens: 3 });
});
it("does not discard an upstream failure during a deferred native completion grace", async () => {
  vi.useFakeTimers(); let upstream; const complete = vi.fn();
  const input = new ReadableStream({ start(controller) { upstream = controller; } });
  const output = new Response(pipeWithDisconnect({ body: input }, createSSEStream({ targetFormat: F.OPENAI_RESPONSES, sourceFormat: F.OPENAI_RESPONSES, onStreamComplete: complete }), createStreamController(), null, 10000, 10000, 0)).text();
  upstream.enqueue(encoder.encode(frame({ type: "response.completed", response: { status: "completed" } }))); await vi.advanceTimersByTimeAsync(1000);
  upstream.enqueue(encoder.encode(frame({ type: "response.failed", response: { status: "failed", usage: nativeUsage, error: { message: "late failure" } } })));
  const text = await output; expect(text).toContain("response.failed"); expect(text).not.toContain("response.completed"); expect(complete).toHaveBeenCalledTimes(1); expect(complete.mock.calls[0][3]).toMatchObject({ failed: true });
});
it("native completion without a trailer has a bounded terminal wait", async () => {
  vi.useFakeTimers(); const input = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frame({ type: "response.completed", response: { status: "completed" } }, "response.completed"))); } });
  const output = new Response(pipeWithDisconnect({ body: input }, createSSEStream({ sourceFormat: F.OPENAI_RESPONSES, targetFormat: F.OPENAI_RESPONSES }), createStreamController(), null, 10000, 10000, 0)).text();
  await vi.advanceTimersByTimeAsync(SSE_COMPLETION_GRACE_MS); expect(await output).toContain('"status":"completed"');
});
describe.each([F.GEMINI, F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES])("Google terminal trailers for %s clients", sourceFormat => {
  const candidate = { responseId: "gemini_late_usage", candidates: [{ content: { role: "model", parts: [{ text: "late answer" }] }, finishReason: "STOP" }], opaque: { signature: "retained==" } };
  const trailer = { usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 } };
  const terminalMarker = sourceFormat === F.GEMINI ? '"finishReason":"STOP"' : sourceFormat === F.OPENAI ? '"finish_reason":"stop"' : sourceFormat === F.CLAUDE ? "event: message_stop\n" : "event: response.completed\n";
  it("retains a fragmented late usage trailer and accepts once before terminal delivery", async () => {
    vi.useFakeTimers(); let upstream; let accept; let text = ""; const cancel = vi.fn();
    const complete = vi.fn(() => new Promise(resolve => { accept = resolve; }));
    const input = new ReadableStream({ start(controller) { upstream = controller; }, cancel });
    const transform = createSSEStream({ targetFormat: F.GEMINI, sourceFormat, onStreamComplete: complete });
    const output = pipeWithDisconnect({ body: input }, transform, createStreamController(), null, 10000, 10000, 0, sourceFormat);
    const consume = (async () => { const reader = output.getReader(); for (;;) { const next = await reader.read(); if (next.done) return text; text += new TextDecoder().decode(next.value); } })();
    const enqueue = value => { const bytes = encoder.encode(frame(value)); for (let offset = 0; offset < bytes.length; offset += 17) upstream.enqueue(bytes.subarray(offset, offset + 17)); };
    enqueue(candidate); await vi.advanceTimersByTimeAsync(SSE_COMPLETION_GRACE_MS - 1);
    expect(complete).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled(); expect(text).not.toContain(terminalMarker);
    enqueue(trailer); await vi.advanceTimersByTimeAsync(0);
    expect(complete).toHaveBeenCalledTimes(1); expect(complete.mock.calls[0][1]).toMatchObject(usage); expect(text).not.toContain(terminalMarker);
    accept(); const wire = await consume; expect(wire).toContain(terminalMarker); expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
    const payloads = wire.split("\n\n").flatMap(value => { const data = value.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim(); return data && data !== "[DONE]" ? [JSON.parse(data)] : []; });
    if (sourceFormat === F.GEMINI) { expect(payloads).toEqual([candidate, trailer]); expect(wire).not.toContain("[DONE]"); }
    else if (sourceFormat === F.OPENAI) {
      expect(payloads.flatMap(value => value.choices || []).map(choice => choice.delta?.content || "").join("")).toBe("late answer");
      expect(payloads.flatMap(value => value.choices || []).filter(choice => choice.finish_reason)).toHaveLength(1);
      expect(payloads.find(value => value.usage).usage).toMatchObject(usage);
    } else if (sourceFormat === F.CLAUDE) {
      expect(payloads.filter(value => value.delta?.type === "text_delta").map(value => value.delta.text).join("")).toBe("late answer");
      expect(payloads.filter(value => value.type === "message_stop")).toHaveLength(1);
      expect(payloads.find(value => value.type === "message_delta").usage).toMatchObject({ input_tokens: 7, output_tokens: 3 });
    } else {
      expect(payloads.filter(value => value.type === "response.output_text.delta").map(value => value.delta).join("")).toBe("late answer");
      expect(payloads.filter(value => value.type === "response.completed")).toHaveLength(1);
      expect(payloads.find(value => value.type === "response.completed").response.usage).toMatchObject(nativeUsage);
    }
    expect(cancel).toHaveBeenCalledTimes(1); expect(input.locked).toBe(false);
  });
  it("keeps a failure during trailer grace from releasing a successful terminal", async () => {
    const complete = vi.fn();
    const wire = await new Response(source(frame(candidate) + frame({ error: { code: "upstream_error", message: "late provider failure" } })).pipeThrough(createSSEStream({ targetFormat: F.GEMINI, sourceFormat, onStreamComplete: complete }))).text();
    expect(wire).toContain("late provider failure"); expect(wire).not.toContain(terminalMarker); expect(complete).toHaveBeenCalledTimes(1); expect(complete.mock.calls[0][3]).toMatchObject({ failed: true });
  });
  it("cancels trailer grace without releasing a success terminal or leaving timers", async () => {
    vi.useFakeTimers(); const complete = vi.fn(); const cancel = vi.fn();
    const input = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frame(candidate))); }, cancel });
    const reader = pipeWithDisconnect({ body: input }, createSSEStream({ targetFormat: F.GEMINI, sourceFormat, onStreamComplete: complete }), createStreamController(), null, 10000, 10000, 0, sourceFormat).getReader();
    const pending = reader.read(); await vi.advanceTimersByTimeAsync(1); await reader.cancel("cancel trailer wait");
    expect((await pending).done).toBe(true); expect(complete).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); expect(cancel).toHaveBeenCalledTimes(1); expect(input.locked).toBe(false);
  });
  it("bounds the trailer wait when no usage or EOF arrives", async () => {
    vi.useFakeTimers(); const complete = vi.fn(); const cancel = vi.fn();
    const input = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frame(candidate))); }, cancel });
    const output = new Response(pipeWithDisconnect({ body: input }, createSSEStream({ targetFormat: F.GEMINI, sourceFormat, onStreamComplete: complete }), createStreamController(), null, 10000, 10000, 0, sourceFormat)).text();
    await vi.advanceTimersByTimeAsync(SSE_COMPLETION_GRACE_MS); expect(await output).toContain(terminalMarker); expect(complete).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1);
  });
});
describe("Responses JSON converter terminal validation", () => {
  it.each([1e12, -1, 0.5, SSE_LIMITS.outputItems])("rejects invalid/sparse upstream indexes %s", async output_index => {
    const result = await convertResponsesStreamToJson(source(frame({ type: "response.output_item.done", output_index, item: { type: "message" } }))); expect(result.status).toBe("failed"); expect(result.output).toEqual([]);
  });
  it("keeps native failed snapshot identity, output and incurred usage", async () => {
    expect(await convertResponsesStreamToJson(source(frame({ type: "response.failed", response: { id: "resp_failed", status: "failed", usage: nativeUsage, output: [], error: { message: "failure" } } })))).toMatchObject({ id: "resp_failed", status: "failed", usage: nativeUsage, error: { message: "failure" } });
  });
  it("does not call a clean but truncated EOF completed", async () => {
    expect(await convertResponsesStreamToJson(source(frame({ type: "response.created", response: { id: "resp_truncated", status: "in_progress" } })))).toMatchObject({ status: "failed", error: { code: "stream_disconnected" } });
  });
  it("keeps the native JSON completion grace open for a delayed usage trailer", async () => {
    vi.useFakeTimers(); let upstream; const cancel = vi.fn();
    const input = new ReadableStream({ start(controller) { upstream = controller; }, cancel }); const output = convertResponsesStreamToJson(input);
    upstream.enqueue(encoder.encode(frame({ type: "response.created", response: { usage: { input_tokens: 0, output_tokens: 0 } } }) + frame({ type: "response.completed", response: { id: "resp_late_usage", status: "completed" } })));
    await vi.advanceTimersByTimeAsync(SSE_COMPLETION_GRACE_MS - 1); expect(cancel).not.toHaveBeenCalled(); upstream.enqueue(encoder.encode(frame({ usage: nativeUsage })));
    expect(await output).toMatchObject({ status: "completed", usage: nativeUsage }); expect(cancel).toHaveBeenCalledTimes(1); expect(input.locked).toBe(false);
  });
  it("stops on validated terminal without waiting for EOF", async () => {
    const cancel = vi.fn(); const input = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frame({ type: "response.completed", response: { id: "resp_complete", status: "completed", usage: nativeUsage, output: [] } }))); }, cancel });
    expect(await convertResponsesStreamToJson(input)).toMatchObject({ id: "resp_complete", status: "completed" }); expect(cancel).toHaveBeenCalledTimes(1); expect(input.locked).toBe(false);
  });
});
it.each(["error", "eof"])("the legacy Responses transformer never turns an upstream %s into completed", async kind => {
  const text = await new Response(source(frame(chat({ content: "partial" })) + (kind === "error" ? frame({ message: "failure", debug: "private", code: "upstream_error" }, "error") : "")).pipeThrough(createResponsesApiTransformStream())).text();
  expect(text).toContain("response.failed"); expect(text).not.toContain("response.completed"); expect(text).not.toContain("private");
});
