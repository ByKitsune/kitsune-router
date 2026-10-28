import { afterEach, describe, expect, it, vi } from "vitest";
import { handleComboChat } from "../../open-sse/services/combo.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const log = { info() {}, warn() {} };

afterEach(() => vi.useRealTimers());

describe("combo stream inspection", () => {
  it.each([
    ["single", ["first/model"]],
    ["multiple", ["first/model", "second/model"]],
  ])("passes a silent %s-member stream through without retrying or cancelling", async (_name, models) => {
    vi.useFakeTimers();
    let upstream;
    let closed = false;
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) { upstream = controller; },
      cancel(reason) { closed = true; cancel(reason); },
    });
    const handleSingleModel = vi.fn(async () => new Response(stream, { headers: { "content-type": "text/event-stream" } }));
    let result;
    const pending = handleComboChat({ body: { stream: true }, models, handleSingleModel, log, autoSwitch: false })
      .then(response => { result = response; return response; });

    try {
      await vi.advanceTimersByTimeAsync(200);
      expect(result?.status).toBe(200);
      expect(handleSingleModel).toHaveBeenCalledTimes(1);
      expect(handleSingleModel).toHaveBeenCalledWith({ stream: true }, "first/model");
      expect(cancel).not.toHaveBeenCalled();

      const reader = result.body.getReader();
      const wire = 'data: {"choices":[{"delta":{"content":"late"}}]}\n\n';
      upstream.enqueue(encoder.encode(wire));
      expect(decoder.decode((await reader.read()).value)).toBe(wire);
      upstream.close();
      closed = true;
      expect((await reader.read()).done).toBe(true);
      reader.releaseLock();
    } finally {
      if (!closed) upstream.close();
      await pending;
    }
  });

  it.each([
    ["reasoning", 'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n'],
    ["tool delta", 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1"}]}}]}\n\n'],
    ["later choice", 'data: {"choices":[{"index":0,"delta":{}},{"index":1,"delta":{"content":"answer"}}]}\n\n'],
    ["Responses tool opener", 'event: response.output_item.added\ndata: {"item":{"type":"function_call","name":"lookup"}}\n\n'],
    ["native paid usage", 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":7,"output_tokens":0}}}\n\n'],
    ["opaque reasoning", 'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"redacted_thinking","data":"opaque"}}\n\n'],
    ["native error", 'event: error\ndata: {"message":"upstream failure"}\n\n'],
  ])("preserves an early %s event and never starts a fallback", async (_name, wire) => {
    const handleSingleModel = vi.fn()
      .mockResolvedValueOnce(new Response(wire, { headers: { "content-type": "text/event-stream" } }))
      .mockResolvedValueOnce(Response.json({ unexpected: "fallback" }));
    const result = await handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false });
    expect(result.status).toBe(200);
    expect(await result.text()).toBe(wire);
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
  });

  it("replays fragmented bytes once, including the pending read, without reading ahead", async () => {
    vi.useFakeTimers();
    let upstream;
    let pulls = 0;
    const input = new ReadableStream({
      start(controller) { upstream = controller; },
      pull() { pulls++; },
    }, { highWaterMark: 0 });
    const chunks = [encoder.encode(": ping\r\n\r\n"), encoder.encode('data: {"choices":['), encoder.encode('{"delta":{"role":"assistant"}}]}\r\n\r\n')];
    for (const chunk of chunks) upstream.enqueue(chunk);
    let result;
    const pending = handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"],
      handleSingleModel: async () => new Response(input, { headers: { "content-type": "text/event-stream" } }), log, autoSwitch: false,
    }).then(response => { result = response; return response; });

    try {
      await vi.advanceTimersByTimeAsync(200);
      expect(result?.status).toBe(200);
      const reader = result.body.getReader();
      const pullsAtHandoff = pulls;
      const observed = [];
      for (const _chunk of chunks) observed.push((await reader.read()).value);
      expect(pulls).toBe(pullsAtHandoff);
      const late = encoder.encode('data: {"choices":[{"delta":{"content":"晚"}}]}\n\n');
      upstream.enqueue(late);
      observed.push((await reader.read()).value);
      upstream.close();
      expect((await reader.read()).done).toBe(true);
      expect(observed.map(chunk => Array.from(chunk))).toEqual([...chunks, late].map(chunk => Array.from(chunk)));
      reader.releaseLock();
    } finally {
      try { upstream.close(); } catch {}
      await pending;
    }
  });

  it("does not retry an unmarked stream closure that may be a caller disconnect", async () => {
    const handleSingleModel = vi.fn()
      .mockResolvedValueOnce(new Response(": ping\n\n", { headers: { "content-type": "text/event-stream" } }))
      .mockResolvedValueOnce(Response.json({ unexpected: "fallback" }));
    const result = await handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false });
    expect(result.status).toBe(200);
    expect(await result.text()).toBe(": ping\n\n");
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
  });

  it("ends a caller-aborted peek promptly without waiting for a blocked upstream cancel", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const cancel = vi.fn(() => new Promise(() => {}));
    const input = new ReadableStream({ cancel });
    const handleSingleModel = vi.fn(async () => new Response(input, { headers: { "content-type": "text/event-stream" } }));
    let result;
    const pending = handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false, signal: abort.signal })
      .then(response => { result = response; return response; });
    try {
      await vi.advanceTimersByTimeAsync(0);
      abort.abort(new Error("client disconnected"));
      await vi.advanceTimersByTimeAsync(10);
      expect(result?.status).toBe(499);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(handleSingleModel).toHaveBeenCalledTimes(1);
    } finally {
      await vi.advanceTimersByTimeAsync(200);
      if (result?.body) void result.body.cancel().catch(() => {});
      void pending.catch(() => {});
    }
  });

  it("cancels a timed-out replay promptly even when source cancellation never settles", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise(() => {}));
    const input = new ReadableStream({ cancel });
    const pending = handleComboChat({ body: { stream: true }, models: ["first/model"], log, autoSwitch: false,
      handleSingleModel: async () => new Response(input, { headers: { "content-type": "text/event-stream" } }),
    });
    await vi.advanceTimersByTimeAsync(200);
    const result = await pending;
    let settled = false;
    const cancellation = result.body.cancel("client closed").then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
    await cancellation;
  });

  it("still falls back after a completed genuinely empty stream", async () => {
    const handleSingleModel = vi.fn()
      .mockResolvedValueOnce(new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }))
      .mockResolvedValueOnce(Response.json({ answer: "second member" }));
    const result = await handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false });
    expect(await result.json()).toEqual({ answer: "second member" });
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
  });

  it("keeps the empty_stream diagnostic if every member finishes empty", async () => {
    const handleSingleModel = vi.fn(async () => new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }));
    const result = await handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false });
    expect(result.status).toBe(503);
    expect((await result.json()).error.code).toBe("empty_stream");
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
  });

  it("stops before dispatch if the caller has already aborted", async () => {
    const abort = new AbortController();
    abort.abort(new Error("caller cancelled"));
    const handleSingleModel = vi.fn();
    const result = await handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, signal: abort.signal });
    expect(result.status).toBe(499);
    expect(handleSingleModel).not.toHaveBeenCalled();
  });

  it("stops a pending attempt on caller abort and cancels its eventual response", async () => {
    const abort = new AbortController();
    let finishAttempt;
    const cancel = vi.fn();
    const handleSingleModel = vi.fn(() => new Promise(resolve => { finishAttempt = resolve; }));
    const pending = handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false, signal: abort.signal });
    await Promise.resolve();
    abort.abort(new Error("caller cancelled"));
    expect((await pending).status).toBe(499);
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    finishAttempt(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/event-stream" } }));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  });

  it("propagates a caller abort after handoff and cancels the outstanding read", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const cancel = vi.fn();
    const handleSingleModel = vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/event-stream" } }));
    const pending = handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false, signal: abort.signal });
    await vi.advanceTimersByTimeAsync(200);
    const result = await pending;
    const reader = result.body.getReader();
    const next = reader.read().catch(error => error);
    const reason = new Error("caller cancelled after handoff");
    abort.abort(reason);
    expect(await next).toBe(reason);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    expect(handleSingleModel).toHaveBeenCalledWith({ stream: true }, "first/model");
    reader.releaseLock();
  });

  it("waits for prompt cancellation accounting and propagates its failures", async () => {
    vi.useFakeTimers();
    let acceptCancellation;
    const cancel = vi.fn(() => new Promise(resolve => { acceptCancellation = resolve; }));
    const resultPromise = handleComboChat({ body: { stream: true }, models: ["first/model"], log, autoSwitch: false,
      handleSingleModel: async () => new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/event-stream" } }),
    });
    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;
    let settled = false;
    const cancelling = result.body.cancel("client closed").then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(20);
    expect(settled).toBe(false);
    acceptCancellation();
    await cancelling;
    expect(settled).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);

    const accountingError = Object.assign(new Error("usage acceptance failed"), { code: "usage_acceptance_failed" });
    const failing = handleComboChat({ body: { stream: true }, models: ["first/model"], log, autoSwitch: false,
      handleSingleModel: async () => new Response(new ReadableStream({ cancel: () => Promise.reject(accountingError) }), { headers: { "content-type": "text/event-stream" } }),
    });
    await vi.advanceTimersByTimeAsync(200);
    const failureResult = await failing;
    await expect(failureResult.body.cancel("client closed")).rejects.toBe(accountingError);
  });

  it("passes through the byte limit without cancelling or replaying an uncertain stream", async () => {
    let upstream;
    const cancel = vi.fn();
    const source = new ReadableStream({ start(controller) { upstream = controller; }, cancel });
    const bytes = encoder.encode(`: ${"x".repeat(256 * 1024)}\n\n`);
    upstream.enqueue(bytes);
    const handleSingleModel = vi.fn(async () => new Response(source, { headers: { "content-type": "text/event-stream" } }));
    const result = await handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false });
    expect(result.status).toBe(200);
    const reader = result.body.getReader();
    expect(Array.from((await reader.read()).value)).toEqual(Array.from(bytes));
    upstream.close();
    expect((await reader.read()).done).toBe(true);
    reader.releaseLock();
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("bounds the number of zero-byte chunks inspected before handing off", async () => {
    vi.useFakeTimers();
    let pulls = 0;
    const source = new ReadableStream({
      pull(controller) {
        pulls++;
        if (pulls <= 1100) controller.enqueue(new Uint8Array());
        else controller.close();
      },
    }, { highWaterMark: 0 });
    const result = await handleComboChat({ body: { stream: true }, models: ["first/model"], log, autoSwitch: false,
      handleSingleModel: async () => new Response(source, { headers: { "content-type": "text/event-stream" } }),
    });
    expect(result.status).toBe(200);
    expect(pulls).toBeLessThanOrEqual(1024);
    await result.body.cancel();
  });

  it("recognizes fragmented multi-line native usage before the timeout and replays it exactly", async () => {
    vi.useFakeTimers();
    let upstream;
    const source = new ReadableStream({ start(controller) { upstream = controller; } });
    const wire = 'event: message_start\r\ndata: {"type":"message_start",\r\ndata: "message":{"usage":{"input_tokens":7}}}\r\n\r\n';
    const chunks = [wire.slice(0, 20), wire.slice(20, 58), wire.slice(58)];
    for (const chunk of chunks) upstream.enqueue(encoder.encode(chunk));
    const handleSingleModel = vi.fn(async () => new Response(source, { headers: { "content-type": "text/event-stream" } }));
    let result;
    const pending = handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false })
      .then(response => { result = response; return response; });
    await vi.advanceTimersByTimeAsync(0);
    expect(result?.status).toBe(200);
    const reader = result.body.getReader();
    let observed = "";
    for (const _chunk of chunks) observed += decoder.decode((await reader.read()).value);
    expect(observed).toBe(wire);
    upstream.close();
    expect((await reader.read()).done).toBe(true);
    reader.releaseLock();
    await pending;
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["opaque Chat reasoning", 'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.encrypted","data":"opaque"}]}}]}\n\n'],
    ["opaque Responses reasoning", 'event: response.output_item.added\ndata: {"item":{"type":"reasoning","encrypted_content":"opaque"}}\n\n'],
  ])("hands off %s without waiting for a terminal frame", async (_name, wire) => {
    vi.useFakeTimers();
    let upstream;
    const source = new ReadableStream({ start(controller) { upstream = controller; controller.enqueue(encoder.encode(wire)); } });
    let result;
    const pending = handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], log, autoSwitch: false,
      handleSingleModel: async () => new Response(source, { headers: { "content-type": "text/event-stream" } }),
    }).then(response => { result = response; return response; });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(result?.status).toBe(200);
      const reader = result.body.getReader();
      expect(decoder.decode((await reader.read()).value)).toBe(wire);
      upstream.close();
      expect((await reader.read()).done).toBe(true);
      reader.releaseLock();
    } finally {
      try { upstream.close(); } catch {}
      await vi.advanceTimersByTimeAsync(200);
      await pending;
    }
  });

  it.each(["data: null\n\n", "data: not-json\n\n", "event: error\ndata: [DONE]\n\n"])("passes through unknown or error data without classifying it as empty: %j", async wire => {
    const handleSingleModel = vi.fn().mockResolvedValueOnce(new Response(wire, { headers: { "content-type": "text/event-stream" } }))
      .mockResolvedValueOnce(Response.json({ unexpected: "fallback" }));
    const result = await handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false });
    expect(await result.text()).toBe(wire);
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
  });

  it("forwards an upstream read failure without converting it into a paid retry", async () => {
    const error = new Error("synthetic upstream failure");
    const input = new ReadableStream({ start(controller) { controller.error(error); } });
    const handleSingleModel = vi.fn()
      .mockResolvedValueOnce(new Response(input, { headers: { "content-type": "text/event-stream" } }))
      .mockResolvedValueOnce(Response.json({ unexpected: "fallback" }));
    const result = await handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false });
    await expect(result.text()).rejects.toBe(error);
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
  });

  it("does not start a fallback when the caller aborts during a retry delay", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const handleSingleModel = vi.fn().mockResolvedValue(Response.json({ error: { message: "commandcode error" } }, { status: 503 }));
    let result;
    const pending = handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], handleSingleModel, log, autoSwitch: false, signal: abort.signal })
      .then(response => { result = response; return response; });
    await vi.advanceTimersByTimeAsync(10);
    expect(result).toBeUndefined();
    abort.abort(new Error("caller cancelled"));
    await vi.advanceTimersByTimeAsync(0);
    expect((await pending).status).toBe(499);
    await vi.advanceTimersByTimeAsync(6000);
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
  });

  it("lets late cancellation accounting finish after the bounded wait", async () => {
    vi.useFakeTimers();
    let finishAccounting;
    let accounted = false;
    const cancel = vi.fn(() => new Promise(resolve => { finishAccounting = () => { accounted = true; resolve(); }; }));
    const pending = handleComboChat({ body: { stream: true }, models: ["first/model"], log, autoSwitch: false,
      handleSingleModel: async () => new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/event-stream" } }),
    });
    await vi.advanceTimersByTimeAsync(200);
    const result = await pending;
    let settled = false;
    const cancelling = result.body.cancel("client closed").then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
    expect(accounted).toBe(false);
    finishAccounting();
    await cancelling;
    await Promise.resolve();
    expect(accounted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("reports a cancellation accounting failure that arrives after the grace period", async () => {
    vi.useFakeTimers();
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    let rejectAccounting;
    const source = new ReadableStream({ cancel: () => new Promise((_, reject) => { rejectAccounting = reject; }) });
    try {
      const pending = handleComboChat({ body: { stream: true }, models: ["first/model"], log, autoSwitch: false,
        handleSingleModel: async () => new Response(source, { headers: { "content-type": "text/event-stream" } }),
      });
      await vi.advanceTimersByTimeAsync(200);
      const result = await pending;
      const cancelling = result.body.cancel("client closed");
      await vi.advanceTimersByTimeAsync(200);
      await cancelling;
      rejectAccounting(Object.assign(new Error("private accounting detail"), { code: "usage_acceptance_failed" }));
      await vi.advanceTimersByTimeAsync(0);
      expect(logError).toHaveBeenCalledWith("[COMBO] Cancellation accounting could not be accepted");
    } finally {
      logError.mockRestore();
    }
  });

  it("reports an accounting failure when caller abort initiates cancellation", async () => {
    vi.useFakeTimers();
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const abort = new AbortController();
    const accountingError = Object.assign(new Error("private accounting detail"), { code: "usage_acceptance_failed" });
    const source = new ReadableStream({ cancel: () => Promise.reject(accountingError) });
    try {
      const pending = handleComboChat({ body: { stream: true }, models: ["first/model", "second/model"], log, autoSwitch: false, signal: abort.signal,
        handleSingleModel: async () => new Response(source, { headers: { "content-type": "text/event-stream" } }),
      });
      await vi.advanceTimersByTimeAsync(0);
      abort.abort(new Error("client closed"));
      expect((await pending).status).toBe(499);
      await vi.advanceTimersByTimeAsync(0);
      expect(logError).toHaveBeenCalledWith("[COMBO] Cancellation accounting could not be accepted");
    } finally {
      logError.mockRestore();
    }
  });
});
