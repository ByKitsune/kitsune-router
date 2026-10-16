// P04 asked whether TTFT and latency were queryable. They were not.
//
// The streaming handler already computed `ttftAt - requestStartTime` and printed
// it, and the production journal carries real samples (the audit measured a
// 5,471 ms median and an 18,067 ms p90 by parsing log lines). But the value was
// never persisted, so answering "TTFT p90?" required grepping journald by hand —
// which is exactly what the audit had to do.
//
// The fix is additive: two nullable columns, written on the path that already had
// the number, and a percentile aggregate surfaced through /api/metrics.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

describe("latency is persisted, not just printed", () => {
  const schema = read("src/lib/db/schema.js");

  it("usageHistory carries ttftMs and totalMs", () => {
    expect(schema).toMatch(/ttftMs:\s*"INTEGER"/);
    expect(schema).toMatch(/totalMs:\s*"INTEGER"/);
  });

  it("they are nullable, so an unmeasured request is not recorded as 0", () => {
    // A NULL means "not measured"; 0 would read as "measured, instant" and would
    // drag the median down — the exact number an operator needs to trust.
    expect(schema).not.toMatch(/ttftMs:\s*"INTEGER[^"]*DEFAULT\s+0"/);
    expect(schema).not.toMatch(/totalMs:\s*"INTEGER[^"]*DEFAULT\s+0"/);
  });

  it("the insert writes NULL rather than 0 when unmeasured", () => {
    const repo = read("src/lib/db/repos/usageRepo.js");
    expect(repo).toMatch(/ttftMs, totalMs\)/);
    expect(repo).toMatch(/entry\.latency\?\.ttft[\s\S]{0,80}\?\s*Math\.round\(entry\.latency\.ttft\)\s*:\s*null/);
    expect(repo).toMatch(/entry\.latency\?\.total[\s\S]{0,80}\?\s*Math\.round\(entry\.latency\.total\)\s*:\s*null/);
  });

  it("the value flows from the streaming handler that computes it", () => {
    const handler = read("open-sse/handlers/chatCore/streamingHandler.js");
    // It must be passed to the persistence call, not only to the log line.
    expect(handler).toMatch(/saveUsageStats\(\{[^}]*latency[^}]*\}\)/);
  });

  it("saveUsageStats forwards it and stays backward compatible", () => {
    const detail = read("open-sse/handlers/chatCore/requestDetail.js");
    expect(detail).toMatch(/latency\s*=\s*null/);
    // Spread conditionally, so existing callers that omit latency are unchanged.
    expect(detail).toMatch(/\.\.\.\(latency\s*\?\s*\{\s*latency\s*\}\s*:\s*\{\}\)/);
  });
});

describe("latency aggregates exclude unmeasured rows", () => {
  const repo = read("src/lib/db/repos/usageRepo.js");

  it("filters NULL out of every percentile", () => {
    const block = repo.slice(repo.indexOf("Latency aggregates over rows"), repo.indexOf("return stats;", repo.indexOf("Latency aggregates over rows")));
    expect(block).toMatch(/ttftMs IS NOT NULL/);
  });

  it("reports the sample count so a thin window is visible", () => {
    expect(repo).toMatch(/samples:\s*row\.n/);
  });

  it("emits median and p90, the two numbers P04 named", () => {
    expect(repo).toMatch(/ttftMedianMs:/);
    expect(repo).toMatch(/ttftP90Ms:/);
  });

  it("cannot break the stats call if the query fails", () => {
    // Latency is additive; the surrounding try/catch must stay.
    const start = repo.indexOf("Latency aggregates over rows");
    const block = repo.slice(start, start + 2500);
    expect(block).toMatch(/catch\s*\{/);
  });
});

describe("metrics exposes the latency series", () => {
  const metrics = read("src/app/api/metrics/route.js");

  it("emits a Prometheus gauge with quantile labels", () => {
    expect(metrics).toMatch(/zenrouter_ttft_ms/);
    expect(metrics).toMatch(/quantile="0\.5"/);
    expect(metrics).toMatch(/quantile="0\.9"/);
    expect(metrics).toMatch(/# TYPE zenrouter_ttft_ms gauge/);
  });

  it("is gated on having samples, so a scrape never records a fake 0", () => {
    expect(metrics).toMatch(/stats\.latency\?\.samples\s*>\s*0/);
  });

  it("publishes the sample count alongside", () => {
    expect(metrics).toMatch(/zenrouter_ttft_samples_total/);
  });
});
