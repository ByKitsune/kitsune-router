import { describe, expect, it, vi } from "vitest";
import codex from "../../open-sse/handlers/imageProviders/codex.js";

// Exercise the real parser's configured event budget without allocating its
// production 64MiB ceiling for each regression test.
vi.mock("../../open-sse/utils/sse.js", async importActual => {
  const real = await importActual();
  return { ...real, createSSEParser: options => real.createSSEParser({ ...options, maxEventChars: 1024 }) };
});

const encoder = new TextEncoder();
const rawUsage = { input_tokens: 3, output_tokens: 5, total_tokens: 8 };
const usage = { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 };
const image = "c3ludGhldGljLWltYWdl";
const event = (type, data, ending = "\n") => `event: ${type}${ending}data: ${JSON.stringify(data)}${ending}${ending}`;
const imageDone = event("response.output_item.done", { item: { type: "image_generation_call", result: image } });
const inProgressUsage = event("response.in_progress", { response: { usage: rawUsage } });

function upstream(chunks, { close = false, hungCancel = false } = {}) {
  const remaining = chunks.map(chunk => typeof chunk === "string" ? encoder.encode(chunk) : chunk);
  let source;
  let acknowledge;
  let reads = 0;
  const waiting = new Promise(resolve => { acknowledge = resolve; });
  const cancel = vi.fn(() => hungCancel ? waiting : undefined);
  const stream = new ReadableStream({
    start(controller) { source = controller; },
    pull(controller) {
      reads++;
      if (remaining.length) controller.enqueue(remaining.shift());
      else if (close) controller.close();
    },
    cancel,
  }, { highWaterMark: 0 });
  return {
    response: new Response(stream, { headers: { "content-type": "text/event-stream" } }), stream, cancel,
    get reads() { return reads; },
    release() { try { source.close(); } catch { /* Already closed or cancelled. */ } acknowledge(); },
  };
}
function observe(promise) { return promise.then(value => ({ value }), error => ({ error })); }
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve({ pending: true }), 300); })]); }
  finally { clearTimeout(timer); }
}

describe("legacy Codex image SSE completion and ownership", () => {
  it("accepts a completed snapshot image and usage without waiting for EOF or cancellation acknowledgment", async () => {
    const source = upstream([event("response.completed", { response: {
      status: "completed", output: [{ type: "image_generation_call", result: image }], usage: rawUsage,
    } })], { hungCancel: true });
    const onUsage = vi.fn();
    const pending = observe(codex.parseResponse(source.response, { onUsage }));
    try {
      const result = await bounded(pending);
      expect(result.value?.data).toEqual([{ b64_json: image }]);
      expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage);
      expect(source.cancel).toHaveBeenCalledOnce();
      expect(source.stream.locked).toBe(false);
      expect(source.reads).toBe(1);
    } finally { source.release(); await pending; }
  });

  it("reads data-only event types and CR framing across every UTF-8 byte boundary", async () => {
    const wire = `data: ${JSON.stringify({ type: "response.completed", response: {
      status: "completed", output: [{ type: "image_generation_call", result: image }], usage: rawUsage,
    } })}\r\r`;
    const source = upstream(Array.from(encoder.encode(wire), byte => new Uint8Array([byte])), { close: true });
    const onUsage = vi.fn();
    expect((await codex.parseResponse(source.response, { onUsage })).data).toEqual([{ b64_json: image }]);
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage);
    expect(source.stream.locked).toBe(false);
  });

  it("keeps sanitized failed-response diagnostics and exact error usage", async () => {
    const secret = "synthetic-image-private-canary";
    const source = upstream([event("response.failed", { response: { usage: rawUsage, error: {
      message: `Image quota exhausted. access_token=${secret} url=https://private.invalid/path`, code: "insufficient_quota",
    } } })], { close: true });
    const onUsage = vi.fn();
    const error = await codex.parseResponse(source.response, { onUsage }).catch(value => value);
    expect(error.message).toContain("quota exhausted");
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain("https://private.invalid");
    expect(error.code).toBe("insufficient_quota");
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage, { status: "error" });
  });

  it("emits one failed terminal event with real diagnostics and never reports image success", async () => {
    const source = upstream([event("error", { message: "Image quota exhausted.", code: "insufficient_quota", usage: rawUsage })], { close: true });
    const onUsage = vi.fn(), onRequestSuccess = vi.fn();
    const { sseResponse } = await codex.parseResponse(source.response, { streamToClient: true, onUsage, onRequestSuccess });
    const wire = await sseResponse.text();
    expect(wire).toContain("quota exhausted");
    expect(wire).toContain("insufficient_quota");
    expect(wire.match(/event: error/g)).toHaveLength(1);
    expect(wire).not.toContain("event: done");
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage, { status: "error" });
  });

  it("releases a pending upstream read on ordinary Error abort even when cancel never acknowledges", async () => {
    const source = upstream([inProgressUsage], { hungCancel: true });
    const caller = new AbortController();
    const reason = new Error("synthetic image caller left");
    const onUsage = vi.fn();
    const { sseResponse } = await codex.parseResponse(source.response, { streamToClient: true, clientSignal: caller.signal, onUsage });
    const reader = sseResponse.body.getReader();
    await reader.read();
    const pending = observe(reader.read());
    caller.abort(reason);
    try {
      expect((await bounded(pending)).error).toBe(reason);
      expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage, { status: "aborted" });
      expect(source.cancel).toHaveBeenCalledOnce();
      expect(source.stream.locked).toBe(false);
    } finally { source.release(); await pending; }
  });

  it("retains already-received usage after a partial-image frame when downstream cancels", async () => {
    const source = upstream([event("response.image_generation_call.partial_image", { partial_image_b64: "cGFydGlhbA==", partial_image_index: 0 }) + inProgressUsage], { hungCancel: true });
    const onUsage = vi.fn();
    const { sseResponse } = await codex.parseResponse(source.response, { streamToClient: true, onUsage });
    const reader = sseResponse.body.getReader(); await reader.read();
    const pending = observe(reader.cancel("synthetic downstream cancellation"));
    try {
      expect(await bounded(pending)).toEqual({ value: undefined });
      expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage, { status: "aborted" });
      expect(source.cancel).toHaveBeenCalledOnce();
      expect(source.stream.locked).toBe(false);
      expect(source.reads).toBe(1);
    } finally { source.release(); await pending; }
  });

  it("enforces the shared parser's event budget and accounts for prior measured usage as failure", async () => {
    const source = upstream([inProgressUsage + event("response.in_progress", { padding: "x".repeat(2048) }) + imageDone], { close: true });
    const onUsage = vi.fn();
    const error = await codex.parseResponse(source.response, { onUsage }).catch(value => value);
    expect(error.message).toContain("exceeds limit");
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage, { status: "error" });
    expect(source.stream.locked).toBe(false);
  });

  it("retains the legacy image-done-only EOF artifact without inventing usage", async () => {
    const source = upstream([imageDone], { close: true });
    const onUsage = vi.fn();
    expect((await codex.parseResponse(source.response, { onUsage })).data).toEqual([{ b64_json: image }]);
    expect(onUsage).not.toHaveBeenCalled();
    expect(source.stream.locked).toBe(false);
  });
});
