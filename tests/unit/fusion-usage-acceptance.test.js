import { describe, expect, it, vi } from "vitest";
import { handleFusionChat } from "../../open-sse/services/combo.js";
import { errorResponse } from "../../open-sse/utils/error.js";

const answer = () => Response.json({ choices: [{ message: { content: "panel answer" } }] });
const failure = () => errorResponse(503, "Usage accounting could not be accepted", { code: "usage_acceptance_failed" });
const options = {
  body: { messages: [{ role: "user", content: "fixture" }], stream: false },
  models: ["fixture/one", "fixture/two"],
  log: { info() {}, warn() {} },
  tuning: { minPanel: 2, stragglerGraceMs: 5, panelHardTimeoutMs: 100 },
};

describe("fusion terminal accounting acceptance", () => {
  it.each([false, true])("does not regenerate or judge after a failed ACK, other panel success=%s", async otherSucceeds => {
    const handleSingleModel = vi.fn(async (_body, model) => model === "fixture/one" ? failure() : otherSucceeds ? answer() : failure());
    const result = await handleFusionChat({ ...options, handleSingleModel });
    expect(result.status).toBe(503);
    expect(result.headers.get("x-should-retry")).toBe("false");
    expect((await result.json()).error.code).toBe("usage_acceptance_failed");
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
    expect(handleSingleModel.mock.calls.every(([, , panel]) => panel === true)).toBe(true);
  });

  it("aborts a stalled sibling and retains the exact terminal response", async () => {
    let sibling;
    const terminal = failure();
    const handleSingleModel = vi.fn(async (_body, model, _panel, signal) => {
      if (model === "fixture/one") return terminal;
      sibling = signal;
      return new Promise(resolve => signal.addEventListener("abort", () => resolve(new Response(null, { status: 499 })), { once: true }));
    });
    const result = await handleFusionChat({ ...options, handleSingleModel });
    expect(result).toBe(terminal);
    expect(sibling.aborted).toBe(true);
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
    await result.body.cancel();
  });

  it("releases a sibling response arriving after terminal cancellation without launching another request", async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const cancel = vi.fn();
    const handleSingleModel = vi.fn(async (_body, model) => model === "fixture/one" ? failure() : pending);
    const result = await handleFusionChat({ ...options, handleSingleModel });
    expect(result.status).toBe(503);
    release(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
    await result.body.cancel();
  });

  it.each(["grace", "caller", "deadline"])("awaits a cancelled panel's failed ACK before any judge or regeneration: %s", async reason => {
    const caller = new AbortController();
    let release;
    let aborted;
    const abortObserved = new Promise(resolve => { aborted = resolve; });
    const acceptance = new Promise(resolve => { release = resolve; });
    const terminal = failure();
    const handleSingleModel = vi.fn(async (_body, model, panel, signal) => {
      if (!panel) return answer();
      if (model !== "fixture/slow") return answer();
      await new Promise(resolve => signal.addEventListener("abort", () => { aborted(); resolve(); }, { once: true }));
      await acceptance;
      return terminal;
    });
    const pending = handleFusionChat({ ...options, signal: caller.signal,
      models: ["fixture/one", "fixture/two", "fixture/slow"], handleSingleModel,
      tuning: { minPanel: 2, stragglerGraceMs: reason === "grace" ? 5 : 1000, panelHardTimeoutMs: reason === "deadline" ? 15 : 1000 },
    });
    if (reason === "caller") caller.abort(new Error("fixture caller cancellation"));
    await abortObserved;
    await new Promise(resolve => setTimeout(resolve, 15));
    expect(handleSingleModel).toHaveBeenCalledTimes(3);
    release();
    const result = await pending;
    expect(result).toBe(terminal);
    expect(result.status).toBe(503);
    expect(result.headers.get("x-should-retry")).toBe("false");
    expect((await result.json()).error.code).toBe("usage_acceptance_failed");
    expect(handleSingleModel.mock.calls.every(([, , panel]) => panel === true)).toBe(true);
  });

  it("bounds the accounting barrier so an unsettled straggler cannot stall the judge", async () => {
    const handleSingleModel = vi.fn(async (_body, model, panel) => {
      if (!panel) return answer("judged");
      if (model === "fixture/slow") return new Promise(() => {});
      return answer("panel answer");
    });
    const started = Date.now();
    const result = await handleFusionChat({ ...options, models: ["fixture/one", "fixture/two", "fixture/slow"], handleSingleModel,
      tuning: { minPanel: 2, stragglerGraceMs: 5, panelHardTimeoutMs: 1000, panelSettlementMs: 25 },
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.status).toBe(200);
    expect(handleSingleModel).toHaveBeenCalledTimes(4);
    expect(handleSingleModel.mock.calls.at(-1)[2]).toBeUndefined();
    await result.body.cancel();
  });

  it("still degrades to the successful model for an ordinary panel failure", async () => {
    const handleSingleModel = vi.fn(async (_body, model, panel) => panel && model === "fixture/one" ? new Response(null, { status: 503 }) : answer());
    const result = await handleFusionChat({ ...options, handleSingleModel });
    expect(result.status).toBe(200);
    expect(handleSingleModel).toHaveBeenCalledTimes(3);
    expect(handleSingleModel.mock.calls.at(-1)[1]).toBe("fixture/two");
    expect(handleSingleModel.mock.calls.at(-1)[2]).toBeUndefined();
    await result.body.cancel();
  });
});
