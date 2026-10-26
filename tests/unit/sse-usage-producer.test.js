import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ enqueueRequestUsage: vi.fn(), saveRequestUsage: vi.fn(), saveRequestDetail: vi.fn(async () => {}), appendRequestLog: vi.fn(async () => {}), trackPendingRequest: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => db);
import { buildOnStreamComplete, handleStreamingResponse } from "../../open-sse/handlers/chatCore/streamingHandler.js";
import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { handleForcedSSEToJson } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { createStreamController } from "../../open-sse/utils/streamHandler.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
const usage = { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 };
const encoder = new TextEncoder();
const frame = value => `data: ${JSON.stringify(value)}\n\n`;
const ctx = () => ({ provider: "offline", model: "offline", connectionId: "fixture", body: { messages: [] }, stream: true, requestStartTime: Date.now(), usageEventId: "attempt-one", usageTimestamp: "2026-10-26T01:00:00.000Z", sourceFormat: F.OPENAI_RESPONSES, targetFormat: F.OPENAI_RESPONSES, trackDone: vi.fn(), appendLog: vi.fn(), reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() } });
beforeEach(() => { vi.clearAllMocks(); db.enqueueRequestUsage.mockImplementation(async entry => ({ accepted: true, eventId: entry.eventId })); });

describe("chat producers await durable acceptance only", () => {
  it("shares one synchronous terminal claim and stable identity across duplicate completion/abort callbacks", async () => {
    let accept;
    db.enqueueRequestUsage.mockImplementation(() => new Promise(resolve => { accept = resolve; }));
    const callbacks = buildOnStreamComplete(ctx());
    const first = callbacks.onStreamComplete({ content: "answer" }, usage);
    const second = callbacks.onStreamAborted({ content: "answer", usage }, "late cancel");
    const third = callbacks.onStreamComplete({ content: "answer" }, usage);
    expect(first).toBe(second); expect(first).toBe(third);
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
    expect(db.enqueueRequestUsage.mock.calls[0][0]).toMatchObject({ eventId: "attempt-one", timestamp: "2026-10-26T01:00:00.000Z", tokens: { prompt_tokens: 7, completion_tokens: 3 } });
    expect(db.saveRequestUsage).not.toHaveBeenCalled();
    accept({ accepted: true }); await first;
    const other = buildOnStreamComplete({ ...ctx(), usageEventId: "attempt-two" });
    const next = other.onStreamComplete({ content: "answer" }, usage); accept({ accepted: true }); await next;
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(2);
    expect(db.enqueueRequestUsage.mock.calls[1][0].eventId).toBe("attempt-two");
  });
  it.each([false, true])("surfaces rejected acceptance rather than resolving success (acceptedFalse=%s)", async acceptedFalse => {
    db.enqueueRequestUsage.mockImplementation(async () => { if (acceptedFalse) return { accepted: false }; throw new Error("private database path"); });
    const callbacks = buildOnStreamComplete(ctx());
    await expect(callbacks.onStreamComplete({ content: "answer" }, usage)).rejects.toMatchObject({ code: "usage_acceptance_failed", message: "Usage accounting could not be accepted" });
    await expect(callbacks.onStreamAborted({ usage }, "retry terminal")).rejects.toMatchObject({ code: "usage_acceptance_failed" });
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
  });
  it("withholds native terminal success until acceptance, without waiting for projection", async () => {
    let accept;
    db.enqueueRequestUsage.mockImplementation(() => new Promise(resolve => { accept = resolve; }));
    const context = ctx();
    const native = { type: "response.completed", response: { id: "resp_fixture", status: "completed", output: [], usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } } };
    const result = await handleStreamingResponse({ ...context, ...buildOnStreamComplete(context), streamController: createStreamController(), providerResponse: new Response(frame(native), { headers: { "content-type": "text/event-stream" } }) });
    let delivered = false;
    const text = result.response.text().then(value => { delivered = true; return value; });
    await vi.waitFor(() => expect(accept).toBeTypeOf("function")); expect(delivered).toBe(false);
    accept({ accepted: true }); expect(await text).toContain("response.completed"); expect(db.saveRequestUsage).not.toHaveBeenCalled();
  });
  it.each([false, true])("gates Chat finish on trailing usage acceptance (reject=%s)", async rejectAcceptance => {
    let accept; let reject;
    db.enqueueRequestUsage.mockImplementation(() => new Promise((resolve, failed) => { accept = resolve; reject = failed; }));
    const context = { ...ctx(), sourceFormat: F.OPENAI, targetFormat: F.OPENAI }; const onStreamFailed = vi.fn();
    const input = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta: { content: "answer" }, finish_reason: "stop" }] }) + frame({ choices: [], usage }) + "data: [DONE]\n\n")); } });
    const result = await handleStreamingResponse({ ...context, ...buildOnStreamComplete({ ...context, onStreamFailed }), streamController: createStreamController(), providerResponse: new Response(input, { headers: { "content-type": "text/event-stream" } }) });
    const reader = result.response.body.getReader(); let text = new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain("answer"); expect(text).not.toContain('"finish_reason":"stop"');
    let delivered = false; const terminal = (async () => { for (;;) { const next = await reader.read(); if (next.done) return text; text += new TextDecoder().decode(next.value); if (text.includes('"finish_reason":"stop"')) delivered = true; } })();
    const observed = rejectAcceptance ? expect(terminal).rejects.toMatchObject({ code: "usage_acceptance_failed" }) : null;
    await vi.waitFor(() => expect(accept).toBeTypeOf("function")); expect(delivered).toBe(false); expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 7, completion_tokens: 3 });
    if (rejectAcceptance) { reject(new Error("private storage detail")); await observed; expect(delivered).toBe(false); }
    else { accept({ accepted: true }); expect(await terminal).toContain('"finish_reason":"stop"'); }
    expect(onStreamFailed).not.toHaveBeenCalled(); expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1); expect(input.locked).toBe(false);
  });
  it("fails the native terminal stream when durable acceptance rejects without poisoning the account", async () => {
    db.enqueueRequestUsage.mockRejectedValue(new Error("private storage details"));
    const context = ctx(); const onStreamFailed = vi.fn();
    const input = new Response(frame({ type: "response.completed", response: { id: "resp_failed_accept", status: "completed", output: [], usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } } }), { headers: { "content-type": "text/event-stream" } });
    const result = await handleStreamingResponse({ ...context, ...buildOnStreamComplete({ ...context, onStreamFailed }), streamController: createStreamController(), providerResponse: input });
    await expect(result.response.text()).rejects.toMatchObject({ code: "usage_acceptance_failed", message: "Usage accounting could not be accepted" });
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1); expect(onStreamFailed).not.toHaveBeenCalled(); expect(input.body.locked).toBe(false);
  });
  it("caller signal cancellation releases upstream before rejecting failed acceptance", async () => {
    const context = { ...ctx(), sourceFormat: F.OPENAI, targetFormat: F.OPENAI }; const cancel = vi.fn(); const streamController = createStreamController();
    const input = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta: { content: "partial" } }], usage }))); }, cancel });
    const result = await handleStreamingResponse({ ...context, ...buildOnStreamComplete(context), streamController, providerResponse: new Response(input, { headers: { "content-type": "text/event-stream" } }) });
    const reader = result.response.body.getReader(); await reader.read(); db.enqueueRequestUsage.mockRejectedValue(new Error("private database failure"));
    const read = reader.read(); const observed = expect(read).rejects.toMatchObject({ code: "usage_acceptance_failed" }); streamController.handleDisconnect("caller signal"); await observed;
    expect(cancel).toHaveBeenCalledTimes(1); expect(input.locked).toBe(false); expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
  });
  it("captures complete buffered usage behind backpressure on cancellation without consuming another upstream read", async () => {
    const context = { ...ctx(), sourceFormat: F.OPENAI_RESPONSES, targetFormat: F.OPENAI }; const cancel = vi.fn(); const pull = vi.fn();
    const raw = frame({ choices: [{ index: 0, delta: { content: "partial" } }] }) + frame({ choices: [], usage });
    const input = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(raw)); }, pull, cancel }, { highWaterMark: 0 });
    const result = await handleStreamingResponse({ ...context, ...buildOnStreamComplete(context), streamController: createStreamController(), providerResponse: new Response(input, { headers: { "content-type": "text/event-stream" } }) });
    const reader = result.response.body.getReader(); let text = "";
    while (!text.includes("partial")) text += new TextDecoder().decode((await reader.read()).value);
    await reader.cancel("caller left");
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1); expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 7, completion_tokens: 3 }); expect(cancel).toHaveBeenCalledTimes(1); expect(pull).not.toHaveBeenCalled(); expect(input.locked).toBe(false);
  });
  it("cancels a locked upstream before awaiting slow cancel accounting and surfaces rejection", async () => {
    let accept;
    const cancel = vi.fn();
    const context = { ...ctx(), sourceFormat: F.OPENAI, targetFormat: F.OPENAI };
    const input = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta: { content: "partial" } }], usage }))); }, cancel });
    const result = await handleStreamingResponse({ ...context, ...buildOnStreamComplete(context), streamController: createStreamController(), providerResponse: new Response(input, { headers: { "content-type": "text/event-stream" } }) });
    const reader = result.response.body.getReader(); await reader.read();
    db.enqueueRequestUsage.mockImplementation(() => new Promise((_, reject) => { accept = reject; }));
    const cancelled = reader.cancel("caller left"); const observed = expect(cancelled).rejects.toMatchObject({ code: "usage_acceptance_failed" });
    await vi.waitFor(() => { expect(accept).toBeTypeOf("function"); expect(cancel).toHaveBeenCalledTimes(1); expect(input.locked).toBe(false); });
    accept(new Error("private billing details")); await observed;
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
  });
});

describe("aborted JSON aggregation retains observed usage", () => {
  it.each([F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES].flatMap(targetFormat => ["forced", "nonstream"].map(mode => [targetFormat, mode])))("settles %s %s before propagating caller cancellation", async (targetFormat, mode) => {
    const controller = new AbortController(); const cancel = vi.fn(); let accept;
    db.enqueueRequestUsage.mockImplementation(() => new Promise(resolve => { accept = resolve; }));
    const nativeUsage = { input_tokens: 7, output_tokens: 3, total_tokens: 10 };
    const chunk = targetFormat === F.OPENAI ? { choices: [{ index: 0, delta: { content: "partial" } }], usage }
      : targetFormat === F.CLAUDE ? { type: "message_start", message: { usage: nativeUsage } }
        : { type: "response.created", response: { usage: nativeUsage } };
    const input = new ReadableStream({ start(upstream) { upstream.enqueue(encoder.encode(frame(chunk))); }, pull() { controller.abort(new Error("caller left")); }, cancel }, { highWaterMark: 0 });
    const context = { ...ctx(), stream: false, sourceFormat: F.OPENAI, targetFormat, signal: controller.signal, providerResponse: new Response(input, { headers: { "content-type": "text/event-stream" } }) };
    let settled = false; const request = (mode === "forced" ? handleForcedSSEToJson(context) : handleNonStreamingResponse(context)).finally(() => { settled = true; });
    const observed = expect(request).rejects.toThrow("caller left");
    await vi.waitFor(() => expect(accept).toBeTypeOf("function")); expect(input.locked).toBe(false); expect(cancel).toHaveBeenCalledTimes(1); expect(settled).toBe(false);
    expect(db.enqueueRequestUsage.mock.calls[0][0]).toMatchObject({ eventId: "attempt-one", timestamp: "2026-10-26T01:00:00.000Z", tokens: { prompt_tokens: 7, completion_tokens: 3 } });
    accept({ accepted: true }); await observed; expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1);
  });
  it.each(["forced", "nonstream"])("does not swallow failed acceptance after %s cancellation", async mode => {
    const controller = new AbortController(); const cancel = vi.fn(); db.enqueueRequestUsage.mockRejectedValue(new Error("private storage detail"));
    const input = new ReadableStream({ start(upstream) { upstream.enqueue(encoder.encode(frame({ choices: [{ index: 0, delta: { content: "partial" } }], usage }))); }, pull() { controller.abort(new Error("caller left")); }, cancel }, { highWaterMark: 0 });
    const context = { ...ctx(), stream: false, sourceFormat: F.OPENAI, targetFormat: F.OPENAI, signal: controller.signal, providerResponse: new Response(input, { headers: { "content-type": "text/event-stream" } }) };
    const result = await (mode === "forced" ? handleForcedSSEToJson(context) : handleNonStreamingResponse(context));
    expect(result.response.status).toBe(503); expect((await result.response.json()).error.code).toBe("usage_acceptance_failed"); expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1); expect(input.locked).toBe(false);
  });
});

describe("unsupported-media JSON producer boundary", () => {
  const google = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16", data: "private-media-bytes" } }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 } };
  it.each(["json", "forced", "nonstream-sse"])("rejects %s before lossy conversion while accepting incurred usage", async mode => {
    const context = { ...ctx(), stream: false, sourceFormat: F.OPENAI, targetFormat: F.GEMINI };
    const response = mode === "json" ? Response.json(google) : new Response(frame(google), { headers: { "content-type": "text/event-stream" } });
    const result = mode === "forced" ? await handleForcedSSEToJson({ ...context, providerResponse: response }) : await handleNonStreamingResponse({ ...context, providerResponse: response });
    expect(result.success).toBe(false); expect(result.response.status).toBe(502);
    const body = await result.response.json(); expect(body.error.code).toBe("unsupported_response_media"); expect(JSON.stringify(body)).not.toContain("private-media-bytes");
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1); expect(db.enqueueRequestUsage.mock.calls[0][0]).toMatchObject({ eventId: "attempt-one", tokens: { prompt_tokens: 7, completion_tokens: 3 } });
  });
  it("keeps prior incurred native usage when an unsupported later event has no usage", async () => {
    const context = { ...ctx(), sourceFormat: F.OPENAI, targetFormat: F.CLAUDE, stream: false };
    const raw = frame({ type: "message_start", message: { usage: { input_tokens: 7, output_tokens: 2 } } }) + frame({ type: "content_block_start", index: 0, content_block: { type: "image", source: { type: "base64", data: "private-media-bytes", media_type: "image/png" } } });
    const result = await handleForcedSSEToJson({ ...context, providerResponse: new Response(raw, { headers: { "content-type": "text/event-stream" } }) });
    expect(result.response.status).toBe(502); expect((await result.response.json()).error.code).toBe("unsupported_response_media");
    expect(db.enqueueRequestUsage).toHaveBeenCalledTimes(1); expect(db.enqueueRequestUsage.mock.calls[0][0].tokens).toMatchObject({ prompt_tokens: 7, completion_tokens: 2 });
  });
  it("returns a public 503 rather than a nonstream success when acceptance fails", async () => {
    db.enqueueRequestUsage.mockRejectedValue(new Error("private database path"));
    const result = await handleNonStreamingResponse({ ...ctx(), stream: false, sourceFormat: F.OPENAI, targetFormat: F.OPENAI, providerResponse: Response.json({ choices: [{ message: { content: "answer" }, finish_reason: "stop" }], usage }) });
    expect(result.response.status).toBe(503); const text = await result.response.text(); expect(text).toContain("usage_acceptance_failed"); expect(text).not.toContain("private database path");
  });
});
