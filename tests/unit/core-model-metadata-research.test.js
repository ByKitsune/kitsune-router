import { describe, it, expect } from "vitest";
import core from "../../open-sse/providers/metadata/coreModels.js";

describe("provider-scoped primary-evidence core metadata shard", () => {
  it("reports the API limits on the Codex route while keeping CLI ceilings separate", () => {
    expect(core.openai?.["gpt-6.1-sol"]?.capabilities).toMatchObject({
      contextWindow: 1050000, maxInput: 922000, maxOutput: 128000, thinkingCanDisable: false,
    });
    // The Codex route publishes the API window, not the CLI configuration
    // ceiling. It used to report 872000 for GPT-6 and 272000 for GPT-5.6, which
    // under-advertised the real capability (live probe: 902,486 input tokens
    // accepted for a model advertised at 872,000).
    expect(core.codex?.["gpt-6.1-sol"]?.capabilities.contextWindow).toBe(1050000);
    expect(core.codex?.["gpt-6.1-sol"]?.limits).toMatchObject({
      cliDefaultContext: 272000, cliMaxContext: 872000,
      apiContextWindow: 1050000, apiMaxInput: 922000, apiMaxOutput: 128000,
      effectiveContextPercent: 95, autoCompactionFraction: 0.9,
    });
    expect(core.codex?.["gpt-5.6-sol"]?.capabilities.contextWindow).toBe(1050000);
    // `[1m]` means "1M-context beta toggled on", so it can never be smaller than
    // the base id it extends.
    expect(core.codex?.["gpt-5.6-sol[1m]"]?.capabilities.contextWindow).toBe(1050000);
  });

  it("keeps Sol generations' long-context cached input distinct", () => {
    expect(core.openai?.["gpt-6-sol"]?.pricing.tier).toMatchObject({ threshold: 272000, inclusive: false, cached: 0.4 });
    expect(core.openai?.["gpt-6.1-sol"]?.pricing.tier.cached).toBe(0.2);
    expect(core.openai?.["gpt-6.1-sol"]?.limits.toolCallingRequiresResponses).toBe(true);
  });

  it("retains Claude cache TTL, batch output and CLI compaction separately", () => {
    expect(core.anthropic?.["claude-opus-5-5"]?.pricing).toMatchObject({ input: 4, output: 20, cached: 0.2, cache_creation: 5 });
    expect(core.anthropic?.["claude-opus-5-5"]?.billing.cacheWrite1h).toBe(8);
    expect(core.anthropic?.["claude-opus-5-5"]?.limits.batchMaxOutput).toBe(300000);
    expect(core.claude?.["claude-opus-5-5"]?.limits.cliCompactionApproxTokens).toBe(967000);
  });

  it("publishes the verified Google window while keeping input budgets and cache storage distinct", () => {
    const flash = core.gemini?.["gemini-3.5-flash-lite"];
    expect(flash?.capabilities).toMatchObject({ maxInput: 1048576, maxOutput: 65536 });
    // models.dev's official google entry reports 1,048,576 for this id, and the
    // route is served (verified live with HTTP 200). The window is therefore
    // published rather than withheld — a null removed `context_length` from the
    // client catalog, which is worse than a slightly conservative number.
    expect(flash?.capabilities).toMatchObject({ contextWindow: 1048576 });
    expect(flash?.limits?.unverifiedCapabilityFields).not.toContain("contextWindow");
    expect(flash?.pricing).toMatchObject({ input: 0.3, output: 2.5, reasoning: 2.5, cached: 0.03 });
    expect(flash?.pricing).not.toHaveProperty("cache_creation");
    expect(flash?.billing.cacheStorage).toEqual({ currency: "USD", unit: "1M token-hours", price: 1 });
    expect(core.gemini?.["gemini-3.8-flash"]?.billing.validThrough).toBe("2026-12-31");
  });

  it("records inclusive xAI tiers and unknown output maxima without fabricating caps", () => {
    for (const id of ["grok-4.7", "grok-4.6", "grok-4.5", "grok-4.3", "grok-build-0.1"]) {
      expect(core.xai?.[id]?.pricing.tier).toMatchObject({ threshold: 200000, inclusive: true });
      expect(core.xai?.[id]?.capabilities).not.toHaveProperty("maxOutput");
      expect(core.xai?.[id]?.limits.maxOutputStatus).toBeTruthy();
      expect(core.xai?.[id]?.pricing).not.toHaveProperty("cache_creation");
    }
    expect(core["grok-cli"]?.["grok-build"]?.limits.routeContextWindow).toBeNull();
    expect(core["grok-cli"]?.["grok-build"]?.pricing).toEqual({});
  });

  it("marks reference pricing and unverified compatibility IDs explicitly", () => {
    expect(core.codex?.["gpt-6.1-sol"]?.billing.kind).toBe("api-reference");
    expect(core["gemini-cli"]?.["gemini-3.5-flash-lite"]?.billing.kind).toBe("api-reference");
    expect(core.claude?.["claude-opus-5-5-20260922"]?.limits.nativeIdVerified).toBe(false);
    expect(core.gemini?.["gemini-4-argon"]?.capabilities).toMatchObject({ contextWindow: 1048576, maxOutput: 32768 });
    expect(core["gemini-cli"]?.["gemini-4-argon"]).toBeUndefined();
    expect(core.claude?.["claude-haiku-5-5"]).toBeUndefined();
    expect(core.xai?.["grok-4.7-fast"]).toBeUndefined();
    expect(core.antigravity).toBeUndefined();
  });

  it("is a standalone finite factual shard with explicit sources on every record", () => {
    expect(Object.keys(core).sort()).toEqual(["anthropic", "claude", "codex", "gemini", "gemini-cli", "grok-cli", "openai", "xai"]);
    for (const [provider, records] of Object.entries(core)) {
      for (const [model, record] of Object.entries(records)) {
        expect(record.sources.length).toBeGreaterThan(0);
        if (record.sources.includes("https://models.dev/api.json")) {
          // Check imported factual records, not JSON parsed out of JavaScript
          // source text. Derived aliases may retain the underlying snapshot's
          // date, while the cross-check itself is pinned independently.
          if (provider === "openai" && model === "gpt-6.1-terra") {
            expect(record.provenance.catalogCrosscheck).toMatchObject({
              url: "https://models.dev/api.json", snapshotDate: "2026-10-29",
              sha256: "bb81b8bddd68fe7cba6504ce9a8cb217fdafb8cf1fd29b56232138b0860bb82f",
            });
            expect(record.provenance.modelPage).toMatchObject({
              url: "https://developers.openai.com/api/docs/models/gpt-6.1-terra.md",
              capturedAtUtc: "2026-10-28T18:02:00Z",
              sha256: "cd34faa8904d85961ab5fe270f079b8be45a9c876af6c809b38b2c069f687a7a",
            });
            expect(record.provenance.primaryPricing).toMatchObject({
              url: "https://developers.openai.com/api/docs/pricing.md",
              capturedAtUtc: "2026-10-28T18:02:28Z",
              sha256: "93d302a9b7a384877533bc3ab5bb48eebf4b56bd6add0f194095054b2a13f952",
            });
            expect(record.limits).toMatchObject({ catalogProvider: "openai", catalogModelId: model, catalogAsOf: "2026-10-29" });
          } else {
            expect(record.provenance.catalogCrosscheck).toMatchObject({
              commit: "020f86d1b0970fe421c5dd7baec94478879d9756",
              sha256: "079175d89430bbf5ee2a0e271ced1ad4b4d1cf529fdbd0a5db50bb2e857e90a8",
            });
            if (record.limits.catalogModelId) expect(record.limits.catalogAsOf).toBe("2026-10-21");
          }
        }
        expect(record.billing).toHaveProperty("kind");
        const check = value => {
          if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
          else if (value && typeof value === "object") Object.values(value).forEach(check);
        };
        check(record);
      }
    }
  });
});
