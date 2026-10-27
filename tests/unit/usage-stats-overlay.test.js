import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dataDir;
let previousDataDir;
let previousListeners;
const shutdownEvents = ["beforeExit", "SIGINT", "SIGTERM"];
let saveRequestUsage;
let getUsageStats;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousListeners = new Map(
    shutdownEvents.map((event) => [event, process.rawListeners(event)])
  );
  dataDir = await mkdtemp(join(tmpdir(), "kitsunerouter-usage-overlay-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  delete global._dbAdapter;
  ({ saveRequestUsage, getUsageStats } = await import("../../src/lib/db/repos/usageRepo.js"));
});

afterEach(async () => {
  try {
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
    delete global._dbAdapter;
    vi.resetModules();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  }
});

describe("getUsageStats overlay aggregation", () => {

  it("calculates lastUsed correctly via SQL MAX aggregation", async () => {
    const ts1 = "2026-08-25T10:00:00.000Z";
    const ts2 = "2026-08-25T12:00:00.000Z";

    await saveRequestUsage({
      timestamp: ts1,
      provider: "openai",
      model: "gpt-4o",
      connectionId: "conn-12345678",
      apiKey: "sk-test123456",
      endpoint: "/v1/chat/completions",
      tokens: { prompt_tokens: 100, completion_tokens: 50 },
      status: "ok"
    });

    await saveRequestUsage({
      timestamp: ts2,
      provider: "openai",
      model: "gpt-4o",
      connectionId: "conn-12345678",
      apiKey: "sk-test123456",
      endpoint: "/v1/chat/completions",
      tokens: { prompt_tokens: 200, completion_tokens: 80 },
      status: "ok"
    });

    const stats = await getUsageStats("all");
    expect(stats.byModel["gpt-4o (openai)"]).toBeDefined();
    expect(stats.byModel["gpt-4o (openai)"].lastUsed).toBe(ts2);
    const accountKey = "gpt-4o (openai - Account conn-123...)";
    expect(stats.byAccount[accountKey]).toBeDefined();
    expect(stats.byAccount[accountKey].lastUsed).toBe(ts2);
  });

  it("counts native input/output tokens consistently in live and daily views", async () => {
    await saveRequestUsage({
      timestamp: new Date().toISOString(),
      provider: "native-stats-fixture",
      model: "native-model",
      connectionId: "synthetic-native-connection",
      apiKey: "sk-synthetic-native-stats-key",
      endpoint: "/v1/responses",
      tokens: { input_tokens: 407, output_tokens: 33, cache_read_input_tokens: 19 },
    });

    for (const period of ["today", "24h", "all"]) {
      const stats = await getUsageStats(period);
      expect(stats, period).toMatchObject({
        totalRequests: 1, totalPromptTokens: 407, totalCompletionTokens: 33, totalCachedTokens: 19,
      });
      for (const axis of ["byProvider", "byModel", "byAccount", "byApiKey", "byEndpoint"]) {
        expect(Object.values(stats[axis]), `${period}/${axis}`).toEqual([
          expect.objectContaining({ requests: 1, promptTokens: 407, completionTokens: 33, cachedTokens: 19 }),
        ]);
      }
    }
  });

  it("uses persisted token columns for legacy live-history rows without token JSON", async () => {
    await saveRequestUsage({
      timestamp: new Date().toISOString(),
      provider: "legacy-stats-fixture",
      model: "legacy-model",
      tokens: { prompt_tokens: 83, completion_tokens: 17 },
    });
    const { getAdapter } = await import("../../src/lib/db/driver.js");
    const db = await getAdapter();
    db.run("UPDATE usageHistory SET tokens = ?", ["{}"]);

    const stats = await getUsageStats("24h");
    expect(stats).toMatchObject({ totalRequests: 1, totalPromptTokens: 83, totalCompletionTokens: 17 });
    expect(stats.byProvider["legacy-stats-fixture"]).toMatchObject({ promptTokens: 83, completionTokens: 17 });
  });

  it("retains native prompt-cache hits when switching between live and daily statistics", async () => {
    await saveRequestUsage({
      timestamp: new Date().toISOString(),
      provider: "native-cache-fixture",
      model: "cache-model",
      tokens: { prompt_tokens: 100, completion_tokens: 10, prompt_cache_hit_tokens: 60 },
    });
    for (const period of ["today", "24h", "all"]) {
      const stats = await getUsageStats(period);
      expect(stats, period).toMatchObject({ totalPromptTokens: 100, totalCompletionTokens: 10, totalCachedTokens: 60 });
      expect(stats.byProvider["native-cache-fixture"], period).toMatchObject({ promptTokens: 100, completionTokens: 10, cachedTokens: 60 });
    }
  });
});
