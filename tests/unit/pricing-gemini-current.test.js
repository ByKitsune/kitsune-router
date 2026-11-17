import { afterEach, describe, expect, it, vi } from "vitest";
import { getGeminiApiCacheStorage } from "../../open-sse/config/geminiApiPricing.js";
import { getDefaultModel, getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPublicModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { calculateCostFromTokens, getDefaultPricing, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [], getCombos: async () => [],
  getCustomModels: async () => [], getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
const { buildModelsList } = await import("@/app/api/v1/models/route.js");

const current = { timestamp: "2026-11-17T12:00:00Z" };
const allComponents = { prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 10000, reasoning_tokens: 6000 };

afterEach(() => vi.restoreAllMocks());

describe("current public Gemini Developer API rates", () => {
  it.each(["gemini-4-argon", "gemini-4-carbon"])("rates %s by its documented civil dates", model => {
    const intro = getPricingForModel("gemini", model, current);
    expect(intro).toMatchObject({ input: 2, output: 10, cached: 0.1, cache_creation: null });
    expect(intro.service_tiers).toMatchObject({ batch: { input: 1 }, flex: { output: 5 }, priority: { cached: 0.18 } });
    expect(calculateCostFromTokens(allComponents, intro)).toBeCloseTo(0.262, 12);
    expect(calculateCostFromTokens({ ...allComponents, actualServiceTier: "priority" }, intro)).toBeCloseTo(0.4716, 12);
    expect(calculateCostFromTokens({ ...allComponents, cache_creation_tokens: 1 }, intro)).toBeNull();

    const transition = getPricingForModel("gemini", model, { timestamp: "2026-12-01T07:59:59Z" });
    expect(calculateCostFromTokens(allComponents, transition)).toBeNull();
    const next = getPricingForModel("gemini", model, { timestamp: "2026-12-01T08:00:00Z" });
    expect(next).toMatchObject({ input: 4, output: 20, cached: 0.2, cache_creation: null });
    expect(next.service_tiers).toMatchObject({ batch: { cached: 0.1 }, flex: { input: 2 }, priority: { output: 36 } });
  });

  it("charges the literal Hydrogen Developer API route at launch rates only", () => {
    const model = "gemini-4-hydrogen";
    const native = getPricingForModel("gemini", model, current);
    expect(native).toMatchObject({ input: 1.5, output: 7.5, cached: 0.075, reasoning: 7.5, cache_creation: null });
    expect(native.service_tiers).toMatchObject({ batch: { cached: 0.0375 }, flex: { input: 0.75 }, priority: { output: 13.5 } });
    expect(calculateCostFromTokens(allComponents, getPricingForModel("gemini", model, { timestamp: "2026-11-02T12:00:00Z" }))).toBeNull();
    expect(calculateCostFromTokens(allComponents, getPricingForModel("gc", model, current))).toBeNull();
    expect(calculateCostFromTokens(allComponents, getPricingForModel("vertex", model, current))).toBeNull();
  });

  it.each(["gemini-3.6-flash", "gemini-3.8-flash"])("keeps %s cache storage in token-hours outside the billing calculator", model => {
    const after = { timestamp: "2027-01-01T08:00:00Z" };
    const price = getPricingForModel("gemini", model, after);
    expect(getPricingForModel("gemini", model, current)).toMatchObject({ input: 0.75, output: 3.75, cached: 0.075 });
    expect(price).toMatchObject({ input: 1.5, output: 7.5, cached: 0.15, cache_creation: null,
      service_tiers: { batch: { input: 0.75, output: 3.75, cached: 0.075 }, flex: { cached: 0.075 }, priority: { cached: 0.27 } } });
    expect(getGeminiApiCacheStorage(model, current)).toMatchObject({ unit: "1M token-hours", price: 0.5 });
    expect(getGeminiApiCacheStorage(model, { timestamp: "2026-08-31T12:00:00Z" })).toBeNull();
    expect(getGeminiApiCacheStorage(model, { timestamp: "2027-01-01T04:00:00Z" })).toBeNull();
    expect(getGeminiApiCacheStorage(model, after)).toMatchObject({ unit: "1M token-hours", price: 1 });
    expect(calculateCostFromTokens({ ...allComponents, cache_creation_tokens: 1 }, price)).toBeNull();
  });

  it("uses the explicitly billed 2.5 redirects and exact Flex cache rate", () => {
    const legacy = getPricingForModel("gemini", "gemini-2.5-flash", current);
    expect(legacy).toMatchObject({ input: 0.3, output: 2.5, cached: 0.03 });
    const after = { timestamp: "2026-12-01T08:00:00Z" };
    const redirected = getPricingForModel("gemini", "gemini-2.5-flash", after);
    expect(redirected).toEqual(getPricingForModel("gemini", "gemini-3.5-flash-lite", after));
    expect(redirected.service_tiers).toMatchObject({ batch: { cached: 0.015 }, flex: { cached: 0.02 }, priority: { cached: 0.05 } });
    expect(getPricingForModel("gemini", "gemini-2.5-pro", current)).toMatchObject({ input: 1.25, output: 10 });
    expect(getPricingForModel("gemini", "gemini-2.5-pro", after)).toEqual(getPricingForModel("gemini", "gemini-3.8-flash", after));
    const next = { timestamp: "2027-01-01T08:00:00Z" };
    expect(getPricingForModel("gemini", "gemini-2.5-pro", next)).toMatchObject({ input: 1.5, output: 7.5, cached: 0.15 });
    expect(getGeminiApiCacheStorage("gemini-2.5-pro", next)).toMatchObject({ price: 1 });
    for (const activeRedirect of ["gemini-3.5-flash", "gemini-3.7-flash"]) {
      expect(calculateCostFromTokens(allComponents, getPricingForModel("gemini", activeRedirect, after))).toBeNull();
      expect(getModelUpstreamId("gemini", activeRedirect)).toBe(activeRedirect);
    }
  });

  it.each(["gemini-3.1-pro-preview", "gemini-3.1-pro-preview-customtools"])("uses exact %s long-context and delivered rate boundaries", model => {
    const price = getPricingForModel("gemini", model, current);
    const tokens = { prompt_tokens: 200000, cached_tokens: 100000, completion_tokens: 10000, reasoning_tokens: 6000, actualServiceTier: "flex" };
    expect(calculateCostFromTokens(tokens, price)).toBeCloseTo(0.18, 12);
    expect(calculateCostFromTokens({ ...tokens, prompt_tokens: 200001 }, price)).toBeCloseTo(0.330002, 12);
    expect(price.service_tiers.priority.tier).toMatchObject({ input: 7.2, output: 32.4, cached: 0.72 });
    expect(getGeminiApiCacheStorage(model, current)).toMatchObject({ unit: "1M token-hours", price: 4.5, service_tiers: { priority: 8.1 } });
  });

  it("publishes dated prices in discovery and the editor alongside unscheduled prices", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-02T00:00:00Z"));
    const published = await buildModelsList(["llm"]);
    expect(published.find(model => model.id === "gemini/gemini-4-hydrogen")).toMatchObject({
      metadata: { pricing: { input: 1.5, output: 7.5 }, limits: { nonStreamMaxOutput: 65536, streamMaxOutput: 65536 } },
    });
    expect(published.find(model => model.id === "gemini/gemini-4-carbon")).toMatchObject({
      metadata: { pricing: { input: 4, output: 20 }, limits: { nonStreamMaxOutput: 32768, streamMaxOutput: 65536 } },
    });
    expect(getPublicModelMetadata("gemini", "gemini-3.8-flash")).toMatchObject({ pricing: { input: 1.5 }, billing: { cacheStorage: { price: 1 } } });
    expect(getDefaultPricing().gemini).toMatchObject({
      "gemini-4-argon": { input: 4, output: 20 }, "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
    });
    expect(getDefaultModel("gemini")).toBe("gemini-3.8-flash");
  });

  it("passes xhigh on the declared Hydrogen thinking shape only", () => {
    const hydrogen = getCapabilitiesForModel("gemini", "gemini-4-hydrogen");
    expect(hydrogen).toMatchObject({ maxInput: null, thinkingEfforts: ["low", "medium", "high", "xhigh"] });
    const body = applyThinking("gemini", "gemini-4-hydrogen(xhigh)", {}, "gemini");
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("xhigh");
    const carbon = applyThinking("gemini", "gemini-4-carbon(xhigh)", {}, "gemini");
    expect(carbon.generationConfig.thinkingConfig.thinkingLevel).toBe("high");
  });
});
