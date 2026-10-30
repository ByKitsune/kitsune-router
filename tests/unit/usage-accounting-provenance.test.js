import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { toOpenAIUsage } from "../../open-sse/translator/concerns/usage.js";
import { canonicalizeUsage, extractUsage, mergeUsage, normalizeUsage } from "../../open-sse/utils/usageTracking.js";

const nativeCounters = [
  ["openai", { prompt_tokens: "100", completion_tokens: "10", total_tokens: "110", prompt_tokens_details: { cached_tokens: "20" } }, 100, 10],
  ["responses", { input_tokens: "100", output_tokens: "10", total_tokens: "110", input_tokens_details: { cached_tokens: "20" } }, 100, 10],
  ["codex", { input_tokens: "100", output_tokens: "10", total_tokens: "110", input_tokens_details: { cached_tokens: "20" } }, 100, 10],
  ["claude", { input_tokens: "80", output_tokens: "10", cache_read_input_tokens: "20" }, 100, 10],
  ["gemini", { promptTokenCount: "100", candidatesTokenCount: "7", thoughtsTokenCount: "3", totalTokenCount: "110", cachedContentTokenCount: "20" }, 100, 10],
  ["kiro", { inputTokens: "100", outputTokens: "10", cachedTokens: "20" }, 100, 10],
  ["ollama", { prompt_eval_count: "100", eval_count: "10", prompt_eval_cached_count: "20" }, 100, 10],
  ["commandcode", { inputTokens: "100", outputTokens: "10", totalTokens: "110", cachedInputTokens: "20" }, 100, 10],
];

describe("accepted native accounting counters survive the shared usage bridge", () => {
  it.each(nativeCounters)("retains numeric-string %s counters through extraction and canonicalization", (kind, raw, prompt, completion) => {
    const original = structuredClone(raw);
    const wire = toOpenAIUsage(raw, kind);
    expect(wire).toMatchObject({ prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion });
    const tokens = canonicalizeUsage(extractUsage({ usage: JSON.parse(JSON.stringify(wire)) }));
    expect(tokens).toMatchObject({ prompt_tokens: prompt, completion_tokens: completion, cached_tokens: 20 });
    expect(tokens).not.toHaveProperty("usage_invalid");
    expect(raw).toEqual(original);
  });

  it.each([
    ["responses", { input_tokens: 0, prompt_tokens: 100, output_tokens: 0, completion_tokens: 10 }, 0, 0, 0],
    ["openai", { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 }, prompt_cache_hit_tokens: 40, cached_tokens: 50 }, 100, 10, 0],
    ["commandcode", { inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, inputTokenDetails: { cacheReadTokens: 40 } }, 100, 10, 0],
    ["kiro", { inputTokens: 100, outputTokens: 10, cache_read_input_tokens: 0, cachedTokens: 40 }, 100, 10, 0],
  ])("keeps explicit primary zeroes above stale %s aliases", (kind, raw, prompt, completion, cached) => {
    const usage = canonicalizeUsage(extractUsage({ usage: toOpenAIUsage(raw, kind) }));
    expect(usage).toMatchObject({ prompt_tokens: prompt, completion_tokens: completion, cached_tokens: cached });
  });

  it("does not present an estimate as measured after conversion, merging and JSON round trips", () => {
    const native = { promptTokenCount: 100, candidatesTokenCount: 10, totalTokenCount: 110, estimated: true };
    let usage = extractUsage({ usageMetadata: native });
    expect(usage).toHaveProperty("estimated", true);
    usage = mergeUsage(usage, { completion_tokens: 12 });
    usage = canonicalizeUsage(normalizeUsage(JSON.parse(JSON.stringify(usage))));
    expect(usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 12, estimated: true });
    expect(mergeUsage({ prompt_tokens: 100 }, usage)).toHaveProperty("estimated", true);
  });
});

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousGlobals, listeners, db, usage, tracking, saveUsageStats;
const provider = "native-counter-fixture", model = "exact-model";

describe("native usage accuracy at the actual SQLite acceptance boundary", () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "kitsune-native-counter-"));
    previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
    listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
    vi.stubEnv("DATA_DIR", join(directory, "data"));
    vi.stubEnv("TMPDIR", directory);
    for (const key of globals) delete global[key];
    vi.resetModules();
    const pricing = await import("../../src/lib/db/repos/pricingRepo.js");
    usage = await import("../../src/lib/db/repos/usageRepo.js");
    tracking = await import("../../open-sse/utils/usageTracking.js");
    ({ saveUsageStats } = await import("../../open-sse/handlers/chatCore/requestDetail.js"));
    db = await (await import("../../src/lib/db/driver.js")).getAdapter();
    await pricing.updatePricing({ [provider]: { [model]: { input: 2, output: 10, cached: 0.1 } } });
  });

  afterEach(async () => {
    for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
    await global._dbAdapter?.instance?.close();
    for (const event of events) for (const listener of process.listeners(event)) {
      if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
    }
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
    vi.unstubAllEnvs();
    vi.resetModules();
    await rm(directory, { recursive: true, force: true });
  });

  it("does not silently skip a native numeric-string request as zero usage", async () => {
    const native = toOpenAIUsage({ inputTokens: "100", outputTokens: "10", cachedInputTokens: "20" }, "commandcode");
    const tokens = tracking.canonicalizeUsage(tracking.extractUsage({ usage: native }));
    const saved = saveUsageStats({ provider, model, tokens, silent: true });
    expect(saved).toBeInstanceOf(Promise);
    await saved;
    const row = db.get("SELECT promptTokens, completionTokens, cost, tokens FROM usageHistory");
    expect(row).toMatchObject({ promptTokens: 100, completionTokens: 10 });
    expect(row.cost).toBeCloseTo(0.000262, 12);
    const stats = await usage.getUsageStats("all");
    expect(stats).toMatchObject({ totalRequests: 1, totalPromptTokens: 100, totalCompletionTokens: 10, totalCachedTokens: 20 });
  });

  it("retains approximate-counter provenance in durable tokens rather than pretending they were measured", async () => {
    const tokens = tracking.extractUsage({ usage: { prompt_tokens: 100, completion_tokens: 10, estimated: true } });
    await saveUsageStats({ provider, model, tokens, silent: true });
    expect(JSON.parse(db.get("SELECT tokens FROM usageHistory").tokens)).toMatchObject({ estimated: true });
  });

  it("retains approximate counters in flushed request details while redacting request bodies", async () => {
    vi.stubEnv("OBSERVABILITY_ENABLED", "true");
    const { buildRequestDetail } = await import("../../open-sse/handlers/chatCore/requestDetail.js");
    const details = await import("../../src/lib/db/repos/requestDetailsRepo.js");
    const tokens = tracking.canonicalizeUsage(tracking.extractUsage({ usage: {
      prompt_tokens: 100, completion_tokens: 10, estimated: true,
    } }));
    const accepted = await details.saveRequestDetail(buildRequestDetail({
      provider, model, tokens, request: { messages: [{ role: "user", content: "private fixture prompt" }] },
    }));
    expect(accepted).toEqual({ accepted: true });
    expect(await details.flushRequestDetails()).toMatchObject({ drained: true });
    const record = JSON.parse(db.get("SELECT data FROM requestDetails").data);
    expect(record.tokens).toMatchObject({ prompt_tokens: 100, completion_tokens: 10, estimated: true });
    expect(record.request).toEqual({ redacted: true });
    expect(JSON.stringify(record)).not.toContain("private fixture prompt");
  });
});
