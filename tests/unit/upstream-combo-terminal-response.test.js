import { describe, expect, it, vi } from "vitest";
import { handleComboChat } from "../../open-sse/services/combo.js";

const log = { info() {}, warn() {} };
const models = ["first/model", "second/model"];
const run = (handleSingleModel, signal) => handleComboChat({
  body: { stream: false }, models, handleSingleModel, log, autoSwitch: false, signal,
});

describe("combo terminal response preservation", () => {
  it.each([
    [500, "quota exceeded", "rate_limit_exceeded"],
    [402, "insufficient credits", "insufficient_credits"],
    [500, "upstream overloaded", "provider_error"],
  ])("does not replace a non-retryable %s response during availability normalization", async (status, message, code) => {
    const first = Response.json({ error: { message, code }, fixture: "unchanged" }, {
      status, statusText: "Fixture failure", headers: { "X-Should-Retry": "false", "X-Fixture": "retained", "Retry-After": "19" },
    });
    const handleSingleModel = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(Response.json({ unexpected: "fallback" }));
    const response = await run(handleSingleModel);
    expect(response.status).toBe(status);
    expect(response.statusText).toBe("Fixture failure");
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(response.headers.get("x-fixture")).toBe("retained");
    expect(response.headers.get("retry-after")).toBe("19");
    expect(response.headers.get("access-control-expose-headers")).toContain("x-should-retry");
    expect(await response.json()).toEqual({ error: { message, code }, fixture: "unchanged" });
    expect(handleSingleModel).toHaveBeenCalledOnce();
  });

  it.each(["usage_acceptance_failed", "usage_accounting_uncertain"])("retains terminal code %s even if its header was omitted", async code => {
    const first = Response.json({ error: { message: "quota exceeded", code } }, {
      status: 500, statusText: "Fixture failure", headers: { "Retry-After": "60", "Access-Control-Expose-Headers": "x-fixture" },
    });
    const handleSingleModel = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(Response.json({ unexpected: "fallback" }));
    const response = await run(handleSingleModel);
    expect(response.status).toBe(500);
    expect(response.statusText).toBe("Fixture failure");
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(response.headers.get("retry-after")).toBeNull();
    expect(response.headers.get("access-control-expose-headers")).toContain("x-fixture");
    expect(response.headers.get("access-control-expose-headers")).toContain("x-should-retry");
    expect((await response.json()).error.code).toBe(code);
    expect(handleSingleModel).toHaveBeenCalledOnce();
  });

  it("explicitly exposes the terminal header alongside a wildcard for credentialed CORS clients", async () => {
    const first = Response.json({ error: { message: "uncertain", code: "usage_accounting_uncertain" } }, {
      status: 503, headers: { "Access-Control-Expose-Headers": "*", "Retry-After": "60" },
    });
    const handleSingleModel = vi.fn(async () => first);
    const response = await run(handleSingleModel);
    const exposed = response.headers.get("access-control-expose-headers").split(",").map(name => name.trim().toLowerCase());
    expect(exposed).toContain("*");
    expect(exposed).toContain("x-should-retry");
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(response.headers.get("retry-after")).toBeNull();
    expect(handleSingleModel).toHaveBeenCalledOnce();
  });

  it.each([500, 200])("explicitly exposes an existing no-retry header with wildcard CORS on HTTP %s", async status => {
    const first = status === 200
      ? new Response("data: [DONE]\n\n", { status, headers: { "content-type": "text/event-stream", "x-should-retry": "false", "Access-Control-Expose-Headers": "*" } })
      : Response.json({ error: { message: "quota exceeded", code: "rate_limit_exceeded" } }, { status, headers: { "x-should-retry": "false", "Access-Control-Expose-Headers": "*" } });
    const handleSingleModel = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(Response.json({ unexpected: "fallback" }));
    const response = await run(handleSingleModel);
    const exposed = response.headers.get("access-control-expose-headers").split(",").map(name => name.trim().toLowerCase());
    expect(response.status).toBe(status);
    expect(exposed).toContain("*");
    expect(exposed).toContain("x-should-retry");
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(handleSingleModel).toHaveBeenCalledOnce();
    await response.body?.cancel();
  });

  it("responds to caller abort while a terminal error body is stalled", async () => {
    let close, reading;
    const started = new Promise(resolve => { reading = resolve; });
    const stream = new ReadableStream({ start(controller) { close = () => controller.close(); }, pull() { reading(); } }, { highWaterMark: 0 });
    const first = new Response(stream, { status: 500, headers: { "x-should-retry": "false", "content-type": "application/json" } });
    const handleSingleModel = vi.fn(async () => first);
    const caller = new AbortController();
    const pending = run(handleSingleModel, caller.signal);
    try {
      await Promise.race([started, new Promise(resolve => setTimeout(resolve, 50))]);
      caller.abort(new Error("caller left"));
      expect((await pending).status).toBe(499);
      expect(handleSingleModel).toHaveBeenCalledOnce();
    } finally {
      try { close(); } catch {}
      await pending;
    }
  });

  it("does not retry a genuinely empty successful stream explicitly marked no-retry", async () => {
    const first = new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream", "x-should-retry": "false" } });
    const handleSingleModel = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(Response.json({ unexpected: "fallback" }));
    const response = await run(handleSingleModel);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(await response.text()).toBe("data: [DONE]\n\n");
    expect(handleSingleModel).toHaveBeenCalledOnce();
  });

  it("still cancels a flagged successful stream after handing it to the caller", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const cancel = vi.fn();
    const handleSingleModel = vi.fn(async () => new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "text/event-stream", "x-should-retry": "false" },
    }));
    let reader;
    try {
      const pending = run(handleSingleModel, caller.signal);
      await vi.advanceTimersByTimeAsync(200);
      const response = await pending;
      reader = response.body.getReader();
      const next = reader.read().catch(error => error);
      const reason = new Error("caller left");
      caller.abort(reason);
      const outcome = Promise.race([next, new Promise(resolve => setTimeout(() => resolve(null), 250))]);
      await vi.advanceTimersByTimeAsync(300);
      expect(await outcome).toBe(reason);
      expect(cancel).toHaveBeenCalledOnce();
      expect(handleSingleModel).toHaveBeenCalledOnce();
    } finally {
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      vi.useRealTimers();
    }
  });

  it("still normalizes a retryable quota error and tries the next model", async () => {
    const handleSingleModel = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: "quota exceeded", code: "rate_limit_exceeded" } }, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ answer: "second model" }));
    const response = await run(handleSingleModel);
    expect(await response.json()).toEqual({ answer: "second model" });
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
  });

  it("keeps caller cancellation terminal if it precedes a late no-retry response", async () => {
    let complete;
    const caller = new AbortController();
    const handleSingleModel = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    const pending = run(handleSingleModel, caller.signal);
    await Promise.resolve();
    caller.abort(new Error("caller left"));
    const response = await pending;
    expect(response.status).toBe(499);
    const cancel = vi.fn();
    complete(new Response(new ReadableStream({ cancel }), { status: 500, headers: { "x-should-retry": "false" } }));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(handleSingleModel).toHaveBeenCalledOnce();
  });
});
