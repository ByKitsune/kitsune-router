// End-to-end: a cache-bearing request flows through canonicalizeUsage →
// saveRequestUsage → getUsageStats, proving cached tokens are persisted,
// aggregated, and cost is computed correctly (the bug this branch fixes).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { canonicalizeUsage } from "../../open-sse/utils/usageTracking.js";

const fixtureGlobals = [
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
];
let originalDataDir;
let originalGlobals;
let originalListeners;
let originalEmit;
let tempDir;
let db;

beforeAll(async () => {
  originalDataDir = process.env.DATA_DIR;
  originalGlobals = new Map(fixtureGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
  originalListeners = new Map(["beforeExit", "SIGINT", "SIGTERM"].map((event) => [event, process.rawListeners(event)]));
  originalEmit = process.emit;
  for (const key of fixtureGlobals) delete global[key];
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kitsunerouter-cached-e2e-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  await db.updateSettings({ enableObservability: true });
});

afterAll(async () => {
  try {
    const state = global._dbAdapter;
    const adapter = state?.instance ?? (state?.initPromise ? await state.initPromise : null);
    await adapter?.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  } finally {
    for (const timer of Object.values(global._pendingTimers ?? {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers ?? {})) clearTimeout(timer);
    for (const [event, listeners] of originalListeners) {
      for (const listener of process.rawListeners(event)) {
        if (!listeners.includes(listener)) process.removeListener(event, listener);
      }
    }
    process.emit = originalEmit;
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    vi.resetModules();
  }
});

describe("cached-token end-to-end (persist + aggregate + cost)", () => {
  it("Claude cache usage: canonical prompt is inclusive, cached persisted, cost correct", async () => {
    // Raw Claude usage (cache-EXCLUSIVE prompt): input 100, cache_read 200, cache_creation 30, output 50
    const canonical = canonicalizeUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 30,
    });
    expect(canonical.prompt_tokens).toBe(330); // inclusive

    await db.saveRequestUsage({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      connectionId: "c-cache",
      tokens: canonical,
      endpoint: "/v1/messages",
      status: "ok",
    });

    const stats = await db.getUsageStats("24h");
    expect(stats.totalCachedTokens).toBe(200);
    expect(stats.totalPromptTokens).toBe(330);
    expect(stats.byProvider.anthropic.cachedTokens).toBe(200);

    // Cost: nonCached=330-200-30=100 @3 + cached 200 @0.30 + creation 30 @3.75 + output 50 @15
    const expected = (100 * 3 + 200 * 0.3 + 30 * 3.75 + 50 * 15) / 1_000_000;
    const hist = await db.getUsageHistory({ provider: "anthropic" });
    expect(hist.length).toBe(1);
    expect(hist[0].cost).toBeCloseTo(expected, 12);
    expect(hist[0].tokens.cached_tokens).toBe(200);
    expect(hist[0].tokens.cache_creation_input_tokens).toBe(30);
  });

  it("OpenAI cache usage: inclusive prompt passes through, cached counted once", async () => {
    const canonical = canonicalizeUsage({
      prompt_tokens: 1000,        // already includes cached
      completion_tokens: 200,
      cached_tokens: 600,
    });
    expect(canonical.prompt_tokens).toBe(1000);
    expect(canonical.cached_tokens).toBe(600);

    await db.saveRequestUsage({
      provider: "openai",
      model: "gpt-4o",
      connectionId: "c-oai",
      tokens: canonical,
      endpoint: "/v1/chat/completions",
      status: "ok",
    });

    const hist = await db.getUsageHistory({ provider: "openai" });
    expect(hist[0].tokens.prompt_tokens).toBe(1000);
    expect(hist[0].tokens.cached_tokens).toBe(600);
  });
});
