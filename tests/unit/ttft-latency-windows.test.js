import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

vi.mock("@/dashboardGuard", () => ({
  hasValidCliToken: async (request) => request.headers.get("x-zen-cli-token") === "ttft-fixture-token",
  isAuthenticated: async () => false,
}));

const fixtureGlobals = [
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
];
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let dataDir;
let previousGlobals;
let previousListeners;
let saveRequestUsage;
let getUsageStats;
let metricsGet;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "zenrouter-ttft-window-"));
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("TZ", "Asia/Jakarta");
  previousGlobals = new Map(fixtureGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
  previousListeners = new Map(shutdownEvents.map((event) => [event, process.rawListeners(event)]));
  for (const key of fixtureGlobals) delete global[key];
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:34:56.789Z"));
  ({ saveRequestUsage, getUsageStats } = await import("@/lib/db/repos/usageRepo.js"));
  ({ GET: metricsGet } = await import("@/app/api/metrics/route.js"));
});

afterEach(async () => {
  try {
    for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
    global._statsEmitter?.removeAllListeners();
    await global._dbAdapter?.instance?.close();
  } finally {
    for (const event of shutdownEvents) {
      const existing = [...previousListeners.get(event)];
      for (const listener of process.rawListeners(event)) {
        const index = existing.indexOf(listener);
        if (index === -1) process.removeListener(event, listener);
        else existing.splice(index, 1);
      }
    }
    for (const key of fixtureGlobals) {
      const descriptor = previousGlobals.get(key);
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
    const resolved = await realpath(dataDir);
    if (dirname(resolved) !== await realpath(tmpdir()) || !resolved.includes("zenrouter-ttft-window-")) {
      throw new Error(`Refusing to remove unexpected fixture directory: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

function record(timestamp, ttft = 250) {
  return saveRequestUsage({
    timestamp,
    provider: "ttft-fixture",
    model: "ttft-window-model",
    tokens: { prompt_tokens: 10, completion_tokens: 2 },
    ...(ttft == null ? {} : { latency: { ttft, total: ttft + 100 } }),
  });
}

function metricsRequest(authenticated = true) {
  return new Request("http://localhost/api/metrics", {
    headers: authenticated ? { "x-zen-cli-token": "ttft-fixture-token" } : {},
  });
}

describe("persisted TTFT windows", () => {
  it("returns measured TTFT for the rolling 24h usage window", async () => {
    await record("2026-10-16T11:00:00.000Z");

    const stats = await getUsageStats("24h");

    expect(stats.totalRequests).toBe(1);
    expect(stats.latency).toEqual({
      samples: 1,
      ttftMinMs: 250,
      ttftMeanMs: 250,
      ttftMedianMs: 250,
      ttftP90Ms: 250,
      ttftMaxMs: 250,
    });
  });

  it.each([
    ["today", "2026-10-15T17:00:00.000Z", "2026-10-15T16:59:59.999Z"],
    ["7d", "2026-10-09T17:00:00.000Z", "2026-10-09T16:59:59.999Z"],
    ["30d", "2026-09-16T17:00:00.000Z", "2026-09-16T16:59:59.999Z"],
    ["60d", "2026-08-17T17:00:00.000Z", "2026-08-17T16:59:59.999Z"],
  ])("aligns %s TTFT with the local calendar usage window", async (period, start, beforeStart) => {
    expect(new Date().getTimezoneOffset()).toBe(-420);
    await record(beforeStart, 9000);
    await record(start, 100);
    await record("2026-10-16T12:34:56.789Z", 300);

    const stats = await getUsageStats(period);

    expect(stats.totalRequests).toBe(2);
    expect(stats.latency).toMatchObject({ samples: 2, ttftMinMs: 100, ttftMaxMs: 300, ttftMeanMs: 200 });
  });

  it.each(["today", "24h", "7d", "30d", "60d", "all"])(
    "excludes unmeasured and future-dated TTFT from %s",
    async (period) => {
      await record("2026-10-16T11:00:00.000Z", null);
      await record("2026-10-16T12:34:56.789Z", 250);
      await record("2026-10-16T12:34:56.790Z", 9000);

      const stats = await getUsageStats(period);

      expect(stats.latency).toMatchObject({ samples: 1, ttftMinMs: 250, ttftMeanMs: 250, ttftMaxMs: 250 });
    }
  );

  it.each(["", "8d", "24H", "7d') OR 1=1 --", null, 24, {}])(
    "rejects an unsupported usage period %j",
    async (period) => {
      await expect(getUsageStats(period)).rejects.toThrow("Invalid usage period");
    }
  );

  it("includes the exact rolling 24h boundary but not the preceding millisecond", async () => {
    await record("2026-10-15T12:34:56.788Z", 9000);
    await record("2026-10-15T12:34:56.789Z", 100);
    await record("2026-10-16T12:34:56.789Z", 300);

    const stats = await getUsageStats("24h");

    expect(stats.totalRequests).toBe(2);
    expect(stats.latency).toMatchObject({ samples: 2, ttftMinMs: 100, ttftMaxMs: 300 });
  });

  it("keeps calendar-day boundaries across a daylight-saving change", async () => {
    vi.stubEnv("TZ", "America/New_York");
    vi.setSystemTime(new Date("2026-11-02T17:00:00.000Z"));
    await record("2026-10-27T03:59:59.999Z", 9000);
    await record("2026-10-27T04:00:00.000Z", 100);
    await record("2026-11-02T17:00:00.000Z", 300);

    const stats = await getUsageStats("7d");

    expect(stats.totalRequests).toBe(2);
    expect(stats.latency).toMatchObject({ samples: 2, ttftMinMs: 100, ttftMaxMs: 300 });
  });

  it("counts distinct identical requests without duplicating same-object retries", async () => {
    const entry = {
      timestamp: "2026-10-16T11:00:00.000Z",
      provider: "ttft-fixture",
      model: "ttft-window-model",
      tokens: { prompt_tokens: 10, completion_tokens: 2 },
      latency: { ttft: 250, total: 350 },
    };
    const distinctEntry = { ...entry, tokens: { ...entry.tokens }, latency: { ...entry.latency } };
    await saveRequestUsage(entry);
    await saveRequestUsage(entry);
    await saveRequestUsage(distinctEntry);

    const stats = await getUsageStats("24h");

    expect(stats.totalRequests).toBe(2);
    expect(stats.latency).toMatchObject({ samples: 2, ttftMeanMs: 250 });
  });

  it("omits TTFT metrics rather than inventing zero for an unmeasured window", async () => {
    await record("2026-10-16T11:00:00.000Z", null);

    const stats = await getUsageStats("24h");
    const response = await metricsGet(metricsRequest());
    const text = await response.text();

    expect(stats.latency).toBeUndefined();
    expect(text).not.toContain("zenrouter_ttft_ms");
    expect(text).not.toContain("zenrouter_ttft_samples_total");
  });

  it("does not expose measured TTFT through an unauthenticated metrics GET", async () => {
    await record("2026-10-16T11:00:00.000Z");

    const response = await metricsGet(metricsRequest(false));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("emits persisted 24h TTFT through authenticated metrics GET", async () => {
    await record("2026-10-16T11:00:00.000Z");

    const response = await metricsGet(metricsRequest());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("zenrouter_metrics_scrape_ok 1\n");
    expect(text).toContain("# TYPE zenrouter_ttft_ms gauge\n");
    expect(text).toContain('zenrouter_ttft_ms{quantile="0.9"} 250\n');
    expect(text).toContain("zenrouter_ttft_samples_total 1\n");
  });
});
