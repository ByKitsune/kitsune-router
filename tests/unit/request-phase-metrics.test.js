import { afterEach, describe, expect, it } from "vitest";
import { getRequestPhaseMetrics, recordRequestPhase, startRequestPhase } from "../../open-sse/utils/requestTiming.js";

const previous = process.env.KITSUNE_ROUTER_REQUEST_TIMING;
afterEach(() => {
  if (previous === undefined) delete process.env.KITSUNE_ROUTER_REQUEST_TIMING;
  else process.env.KITSUNE_ROUTER_REQUEST_TIMING = previous;
});

describe("bounded request phase measurements", () => {
  it("is opt-in and does not record sensitive request fields", () => {
    delete process.env.KITSUNE_ROUTER_REQUEST_TIMING;
    recordRequestPhase("disabled_phase", 12);
    expect(getRequestPhaseMetrics().some(entry => entry.phase === "disabled_phase")).toBe(false);
  });

  it("retains a bounded percentile window and counts all samples", () => {
    process.env.KITSUNE_ROUTER_REQUEST_TIMING = "1";
    for (let n = 1; n <= 600; n++) recordRequestPhase("test_phase", n);
    const metric = getRequestPhaseMetrics().find(entry => entry.phase === "test_phase");
    expect(metric.count).toBe(600);
    expect(metric.windowSamples).toBe(256);
    expect(metric.maximumMs).toBe(600);
    expect(metric.p50).toBe(472);
    expect(metric.p95).toBe(588);
    expect(metric.p99).toBe(598);
    expect(Object.keys(metric).sort()).toEqual(["count", "maximumMs", "p50", "p95", "p99", "phase", "totalMs", "windowSamples"]);
  });

  it("records each timer once and ignores invalid durations", () => {
    process.env.KITSUNE_ROUTER_REQUEST_TIMING = "1";
    const done = startRequestPhase("single_phase");
    done(); done();
    recordRequestPhase("single_phase", NaN);
    recordRequestPhase("single_phase", -1);
    expect(getRequestPhaseMetrics().find(entry => entry.phase === "single_phase").count).toBe(1);
  });
});
