import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}) }));
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { createStreamController, createDisconnectAwareStream, pipeWithDisconnect } from "../../open-sse/utils/streamHandler.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const frame = text => encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`);
afterEach(() => vi.useRealTimers());
describe("locked stream cancellation", () => {
  it.each(["timeout", "signal", "consumer"])("settles %s without relying on fetch to error its locked body", async cause => {
    const cancel = vi.fn(async () => {});
    const upstream = new ReadableStream({ cancel });
    const transform = createSSEStream();
    const controller = createStreamController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const stream = pipeWithDisconnect({ body: upstream }, transform, controller, null, 30, 30, 0);
    const reader = stream.getReader();
    const pending = reader.read();
    expect(upstream.locked).toBe(true);
    expect(transform.writable.locked).toBe(true);
    if (cause === "signal") controller.handleDisconnect("caller_cancel");
    else if (cause === "consumer") await reader.cancel("consumer_cancel");
    if (cause === "timeout") {
      const first = await pending;
      expect(first.done ? "" : decoder.decode(first.value)).toContain('"finish_reason":"network_error"');
      expect((await reader.read()).done).toBe(true);
    } else expect((await pending).done).toBe(true);
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(upstream.locked).toBe(false);
      expect(transform.writable.locked).toBe(false);
      expect(transform.readable.locked).toBe(false);
    });
    expect(remove.mock.calls.filter(([type]) => type === "abort").length).toBeGreaterThanOrEqual(add.mock.calls.filter(([type]) => type === "abort").length);
    await reader.cancel(); reader.releaseLock();
  });
  it("clears deferred completion and heartbeat timers on client cancellation", async () => {
    vi.useFakeTimers();
    const complete = vi.fn();
    const input = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('data: {"choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":"stop"}]}\n\n')); } });
    const transform = createSSEStream({ sourceFormat: F.OPENAI_RESPONSES, targetFormat: F.OPENAI, onStreamComplete: complete });
    const reader = pipeWithDisconnect({ body: input }, transform, createStreamController(), null, 10000, 10000, 10).getReader();
    let text = "";
    while (!text.includes("partial")) text += decoder.decode((await reader.read()).value);
    await vi.advanceTimersByTimeAsync(1);
    await reader.cancel("stop deferred response");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(complete).not.toHaveBeenCalled();
    expect(input.locked).toBe(false);
  });
  it("awaits and contains rejecting cancel/abort promises and releases the locks", async () => {
    const cancel = vi.fn(async () => { throw new Error("cancel rejected"); });
    const abort = vi.fn(async () => { throw new Error("abort rejected"); });
    const readable = new ReadableStream({ cancel });
    const writable = new WritableStream({ abort });
    const reader = createDisconnectAwareStream({ readable, writable }, createStreamController(), null, 0).getReader();
    await reader.cancel("stop");
    expect(cancel).toHaveBeenCalledTimes(1); expect(abort).toHaveBeenCalledTimes(1);
    expect(readable.locked).toBe(false); expect(writable.locked).toBe(false);
  });
});
describe("demand-aware output", () => {
  it("does not mistake a slow consumer for an upstream stall or read an unbounded number of chunks", async () => {
    let reads = 0;
    const upstream = new ReadableStream({ pull(controller) { controller.enqueue(frame(String(++reads))); } }, { highWaterMark: 0 });
    const onError = vi.fn();
    const controller = createStreamController({ onError });
    const reader = pipeWithDisconnect({ body: upstream }, createSSEStream(), controller, null, 20, 20, 0).getReader();
    expect(decoder.decode((await reader.read()).value)).toContain('"content"');
    await sleep(100); const count = reads; await sleep(60);
    expect(reads).toBe(count); expect(reads).toBeLessThanOrEqual(5);
    expect(onError).not.toHaveBeenCalled(); expect(controller.signal.aborted).toBe(false);
    await reader.cancel("slow consumer finished"); expect(upstream.locked).toBe(false);
  });
  it("bounds a single upstream chunk with thousands of events before the next client read", async () => {
    let emitted = 0;
    const wire = Array.from({ length: 4096 }, (_, index) => decoder.decode(frame(`token-${index}`))).join("");
    const transform = createSSEStream({ reqLogger: { appendConvertedChunk() { emitted++; } } });
    const upstream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(wire)); } });
    const reader = pipeWithDisconnect({ body: upstream }, transform, createStreamController(), null, 500, 500, 0).getReader();
    expect(decoder.decode((await reader.read()).value)).toContain("token-0");
    await sleep(20); expect(emitted).toBeLessThanOrEqual(5);
    await reader.cancel("stop a large batch"); expect(upstream.locked).toBe(false);
  });
  it("does not grow a heartbeat queue without demand", async () => {
    vi.useFakeTimers(); let readableController;
    const stream = new ReadableStream({ start(controller) { readableController = controller; } });
    const output = createDisconnectAwareStream({ readable: stream }, createStreamController(), null, 10, F.OPENAI);
    await vi.advanceTimersByTimeAsync(1000);
    const reader = output.getReader();
    expect(decoder.decode((await reader.read()).value)).toBe(": ping\n\n");
    const next = reader.read(); readableController.enqueue(encoder.encode("data: payload\n\n"));
    expect(decoder.decode((await next).value)).toBe("data: payload\n\n");
    await reader.cancel(); expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps upstream reads and the watchdog live after a client consumes a heartbeat", async () => {
    let upstream;
    const input = new ReadableStream({ start(controller) { upstream = controller; } });
    const reader = pipeWithDisconnect({ body: input }, createSSEStream(), createStreamController(), null, 500, 500, 10).getReader();
    await sleep(30); expect(decoder.decode((await reader.read()).value)).toBe(": ping\n\n");
    upstream.enqueue(encoder.encode('data: {"choices":[{"index":0,"delta":{"content":"after ping"}}]}\n\n'));
    let text;
    do { text = decoder.decode((await reader.read()).value); } while (text.includes(": ping"));
    expect(text).toContain("after ping"); await reader.cancel();
  });
  it("client reads of heartbeats do not keep resetting the upstream inactivity budget", async () => {
    const onError = vi.fn(); const cancel = vi.fn();
    const input = new ReadableStream({ cancel });
    const text = await new Response(pipeWithDisconnect({ body: input }, createSSEStream(), createStreamController({ onError }), null, 60, 60, 5)).text();
    expect(text).toContain(": ping"); expect(text).toContain('"finish_reason":"network_error"');
    expect(onError).toHaveBeenCalledTimes(1); expect(onError.mock.calls[0][0].message).toBe("TTFT timeout (60ms)"); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("only inserts Claude heartbeats between complete native events", async () => {
    let upstream;
    const input = new ReadableStream({ start(controller) { upstream = controller; } });
    const reader = pipeWithDisconnect({ body: input }, createSSEStream({ mode: "passthrough", sourceFormat: F.CLAUDE, targetFormat: F.CLAUDE }), createStreamController(), null, 500, 500, 10, F.CLAUDE).getReader();
    upstream.enqueue(encoder.encode("event: content_block_delta\r\n"));
    expect(decoder.decode((await reader.read()).value)).toBe("event: ping\ndata: {}\n\n");
    upstream.enqueue(encoder.encode('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"answer"}}\r\n\r\n'));
    let complete;
    do { complete = decoder.decode((await reader.read()).value); } while (complete.includes("event: ping"));
    expect(complete).toMatch(/^event: content_block_delta\ndata: .*\n\n$/); expect(complete).not.toContain("event: ping"); await reader.cancel();
  });
});
