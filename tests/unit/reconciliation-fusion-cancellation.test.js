import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFusionChat } from "../../open-sse/services/combo.js";

const log = { info() {}, warn() {} };
const base = {
  body: { model: "fusion", messages: [{ role: "user", content: "answer" }], stream: false },
  models: ["fixture/fast-a", "fixture/fast-b", "fixture/slow"],
  log, comboName: "synthetic-fusion", tuning: { minPanel: 2, stragglerGraceMs: 10, panelHardTimeoutMs: 80 },
};
const answer = text => Response.json({ choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }] });
afterEach(() => vi.restoreAllMocks());

describe("fusion owns the cancellation of discarded panel attempts", () => {
  it("aborts a grace-window straggler without aborting the caller or judge", async () => {
    const caller = new AbortController();
    const attempts = [];
    let slowSignal;
    const response = await handleFusionChat({ ...base, signal: caller.signal,
      handleSingleModel(body, model, panel, signal) {
        attempts.push({ model, panel, signal });
        if (!panel) return Promise.resolve(answer("judged"));
        if (model !== "fixture/slow") return Promise.resolve(answer("panel response"));
        slowSignal = signal;
        return new Promise(resolve => signal?.addEventListener("abort", () => resolve(new Response(null, { status: 499 })), { once: true }));
      },
    });
    expect(slowSignal?.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
    expect(attempts.at(-1).panel).not.toBe(true);
    expect(attempts.at(-1).signal?.aborted).toBe(false);
    expect(await response.json()).toMatchObject({ choices: [{ message: { content: "judged" } }] });
  });

  it("stops all panel attempts promptly on ordinary-Error caller abort and never launches a judge", async () => {
    const caller = new AbortController();
    const signals = [];
    let judges = 0;
    let markLaunched;
    const started = new Promise(resolve => { markLaunched = resolve; });
    const pending = handleFusionChat({ ...base, signal: caller.signal,
        tuning: { minPanel: 2, panelHardTimeoutMs: 1000, stragglerGraceMs: 1000 },
        handleSingleModel(_body, _model, panel, signal) {
          if (!panel) { judges++; return answer("should not run"); }
          signals.push(signal);
          return new Promise(done => {
            signal?.addEventListener("abort", () => done(new Response(null, { status: 499 })), { once: true });
            if (signals.length === 3) markLaunched();
          });
        },
    });
    // Resolve a separate launch barrier, never wait for the operation being aborted.
    await started;
    caller.abort(new Error("synthetic caller cancellation"));
    const outcome = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 100))]);
    expect(outcome?.status).toBe(499);
    expect(signals.every(signal => signal?.aborted)).toBe(true);
    expect(judges).toBe(0);
  });

  it("includes streamed body consumption within the panel deadline", async () => {
    const signals = [];
    const result = handleFusionChat({ ...base, models: ["fixture/a", "fixture/b"],
      tuning: { minPanel: 2, panelHardTimeoutMs: 30, stragglerGraceMs: 10 },
      handleSingleModel(_body, _model, _panel, signal) {
        signals.push(signal);
        return Promise.resolve(new Response(new ReadableStream({
          start(controller) { signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true }); },
        }), { headers: { "Content-Type": "application/json" } }));
      },
    });
    const response = await Promise.race([result, new Promise(resolve => setTimeout(() => resolve(null), 150))]);
    expect(response?.status).toBe(503);
    expect(signals.every(signal => signal?.aborted)).toBe(true);
  });

  it("does not start even a single-model panel after an already-aborted caller", async () => {
    const caller = new AbortController(); caller.abort(new Error("cancelled"));
    const handleSingleModel = vi.fn();
    const result = await handleFusionChat({ ...base, models: ["fixture/a"], signal: caller.signal, handleSingleModel });
    expect(result).toMatchObject({ status: 499 });
    expect(handleSingleModel).not.toHaveBeenCalled();
  });
});
