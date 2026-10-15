import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

const encoder = new TextEncoder();
const openStreams = [];

function frame(type, fields = {}, newline = "\n") {
  return `event: ${type}${newline}data: ${JSON.stringify({ type, ...fields })}${newline}${newline}`;
}

function upstream(prefix = "", contentType = "text/event-stream") {
  let controller;
  let closed = false;
  const cancel = vi.fn(() => { closed = true; });
  const body = new ReadableStream({
    start(value) {
      controller = value;
      if (prefix) controller.enqueue(encoder.encode(prefix));
    },
    cancel,
  });
  const source = {
    response: new Response(body, { headers: { "Content-Type": contentType } }),
    cancel,
    enqueue(value) { controller.enqueue(typeof value === "string" ? encoder.encode(value) : value); },
    close() {
      if (!closed) {
        closed = true;
        controller.close();
      }
    },
  };
  openStreams.push(source);
  return source;
}

function execute(executor = new CodexExecutor(), signal) {
  return executor.execute({
    model: "gpt-5.5",
    body: { input: "hello" },
    stream: true,
    credentials: { accessToken: "test-token" },
    signal,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.mocked(proxyAwareFetch).mockReset();
});

afterEach(() => {
  for (const source of openStreams.splice(0)) source.close();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Codex preheader SSE inspection", () => {
  it("returns during opening/reasoning silence and preserves the outstanding read exactly", async () => {
    const prefix = frame("response.created", { response: { id: "resp_1" } })
      + frame("response.reasoning_summary_text.delta", { delta: "Thinking..." });
    const source = upstream(prefix);
    vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
    let result;
    const pending = execute().then(value => { result = value; return value; });

    await vi.advanceTimersByTimeAsync(1000);
    expect(result?.response.status).toBe(200);

    const suffix = encoder.encode(frame("response.output_text.delta", { delta: "Hello 🌍" })
      + frame("response.completed", { response: { status: "completed" } }));
    const split = suffix.indexOf(0xf0) + 2;
    source.enqueue(suffix.slice(0, split));
    source.enqueue(suffix.slice(split));
    source.close();
    const bytes = new Uint8Array(await (await pending).response.arrayBuffer());
    expect(bytes).toEqual(encoder.encode(prefix + new TextDecoder().decode(suffix)));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps inspecting split frames and empty text/tool deltas until a pre-output failure", async () => {
    const source = upstream("event: response.output_text.delta\r");
    vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
    const pending = execute();
    await vi.advanceTimersByTimeAsync(0);
    source.enqueue('\ndata: {"type":"response.output_text.delta","delta":""}\r\n\r');
    await vi.advanceTimersByTimeAsync(0);
    source.enqueue("\n" + frame("response.function_call_arguments.delta", { delta: "" }, "\r\n")
      + 'event: response.failed\r\ndata: {"type":"response.failed",\r\ndata: "response":{"error":{"message":"Selected model is at capacity. Please try a different model."}}}\r\n\r\n');
    const result = await pending;

    expect(result.response.status).toBe(503);
    expect(await result.response.json()).toMatchObject({
      error: { message: "Selected model is at capacity. Please try a different model." },
    });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(source.cancel).toHaveBeenCalledTimes(1);
  });

  it.each(["response.output_text.delta", "response.function_call_arguments.delta"])(
    "does not retry %s content or a later failure after real output",
    async type => {
      const text = frame(type, { delta: "server_is_overloaded; response.failed; Selected model is at capacity" })
        + frame("response.failed", { response: { error: { message: "service_unavailable_error" } } });
      const source = upstream(text);
      source.close();
      vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
      const executor = new CodexExecutor();
      executor.config = { ...executor.config, retry: { 503: { attempts: 0, delayMs: 0 } } };
      const result = await execute(executor);

      expect(result.response.status).toBe(200);
      expect(await result.response.text()).toBe(text);
      expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    },
  );

  it("does not consume or wait for a non-SSE successful JSON response", async () => {
    const source = upstream("", "application/json");
    vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
    let result;
    const pending = execute().then(value => { result = value; return value; });
    await vi.advanceTimersByTimeAsync(0);

    expect(result?.response).toBe(source.response);
    source.enqueue('{"output":[]}');
    source.close();
    expect(await (await pending).response.json()).toEqual({ output: [] });
  });

  it("cancels the outstanding upstream read when the replay body is cancelled", async () => {
    const source = upstream(frame("response.created"));
    vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
    let result;
    execute().then(value => { result = value; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(result?.response.status).toBe(200);

    await result.response.body.cancel("client left");
    expect(source.cancel).toHaveBeenCalledWith("client left");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a pending peek without waiting for the deadline or retrying", async () => {
    const source = upstream(frame("response.created"));
    vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
    const controller = new AbortController();
    let outcome;
    execute(new CodexExecutor(), controller.signal).then(
      () => { outcome = "resolved"; },
      error => { outcome = error; },
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(outcome?.name).toBe("AbortError");
    expect(source.cancel).toHaveBeenCalledTimes(1);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains the existing finite transient retry limit", async () => {
    const sources = [upstream(frame("error", { error: { code: "server_is_overloaded", message: "Busy" } })),
      upstream(frame("error", { error: { code: "server_is_overloaded", message: "Still busy" } }))];
    for (const source of sources) source.close();
    vi.mocked(proxyAwareFetch).mockResolvedValueOnce(sources[0].response).mockResolvedValueOnce(sources[1].response);
    const executor = new CodexExecutor();
    executor.config = { ...executor.config, retry: { 503: { attempts: 1, delayMs: 10 } } };
    const pending = execute(executor);
    await vi.advanceTimersByTimeAsync(10);
    const result = await pending;

    expect(result.response.status).toBe(503);
    expect(await result.response.json()).toMatchObject({ error: { message: "Still busy" } });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("interrupts transient retry backoff on client abort", async () => {
    const source = upstream(frame("error", { error: { code: "server_is_overloaded", message: "Busy" } }));
    source.close();
    vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
    const executor = new CodexExecutor();
    executor.config = { ...executor.config, retry: { 503: { attempts: 2, delayMs: 2000 } } };
    const controller = new AbortController();
    let outcome;
    execute(executor, controller.signal).then(
      () => { outcome = "resolved"; },
      error => { outcome = error; },
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(outcome?.name).toBe("AbortError");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a context overflow as 400, not a retryable 502/503", async () => {
    // Production: an over-long prompt produced context_length_exceeded inside the
    // 200-OK stream. The generic `response.failed` branch turned it into 503, the
    // client saw 502 (which ByKitsune treats as retryable), and every healthy
    // account was locked for 30s in turn for a request that could never succeed.
    const source = upstream(frame("response.failed", {
      response: {
        status: "failed",
        error: {
          code: "context_length_exceeded",
          message: "Your input exceeds the context window of this model. Please adjust your input and try again.",
        },
      },
    }));
    source.close();
    vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
    const result = await execute();

    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body.error.code).toBe("invalid_request_error");
    expect(body.error.message).toMatch(/exceeds the context window/i);
  });

  it("does not rotate accounts for a context overflow (no retry attempt)", async () => {
    const source = upstream(frame("error", {
      error: { code: "context_length_exceeded", message: "exceeds the context window" },
    }));
    source.close();
    vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
    const executor = new CodexExecutor();
    executor.config = { ...executor.config, retry: { 503: { attempts: 3, delayMs: 10 } } };
    const result = await execute(executor);

    expect(result.response.status).toBe(400);
    // A retry would have called the upstream again; the credential is healthy.
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still treats a genuine overload as a retryable transient error", async () => {
    // The client-error branch must not swallow real gateway faults.
    const source = upstream(frame("error", { error: { code: "server_is_overloaded", message: "Busy" } }));
    source.close();
    vi.mocked(proxyAwareFetch).mockResolvedValue(source.response);
    const executor = new CodexExecutor();
    executor.config = { ...executor.config, retry: { 503: { attempts: 0, delayMs: 10 } } };
    const result = await execute(executor);

    expect(result.response.status).toBe(503);
    const body = await result.response.json();
    expect(body.error.code).toBe("service_unavailable");
  });
});
