import { describe, expect, it } from "vitest";
import { calculateCostBreakdown, getPricingForModel, resolveEffectivePricing, ZERO_PRICING } from "../../open-sse/providers/pricing.js";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { MODELS_DEV_REGISTRY_PRICING_REFERENCES } from "../../open-sse/providers/metadata/modelsDevPricingRegistry.js";
import {
  getModelsDevPricingReference as readModelsDevPricingReference,
  getModelsDevPricingEstimate,
  MODELS_DEV_PRICING_PRODUCTS,
  MODELS_DEV_PRICING_ESTIMATE_MODELS,
  MODELS_DEV_PRICING_SOURCE,
  MODELS_DEV_PRICING_REFERENCES,
} from "../../open-sse/providers/metadata/modelsDevPricing.js";

const model = "nvidia/nemotron-3-super-120b-a12b";
// Historical extraction contract: events before the next observed source retain
// the original capture. Current/versioned semantics have dedicated regressions.
const snapshotTime = { timestamp: "2026-10-29T00:00:00Z" };
const getModelsDevPricingReference = (provider, id) => readModelsDevPricingReference(provider, id, snapshotTime);

describe("models.dev exact-product pricing references", () => {
  it("keeps the same literal model separate across OpenRouter and Vercel", () => {
    expect(getPricingForModel("openrouter", model, snapshotTime)).toMatchObject({ input: 0.3, output: 2.4 });
    expect(getPricingForModel("vercel", model, snapshotTime)).toMatchObject({ input: 0.15, output: 0.65 });
    expect(getModelsDevPricingReference("vercel", model)).toMatchObject({ product: "vercel", model, cost: { input: 0.15, output: 0.65 } });
    expect(getModelsDevPricingReference("openrouter", model)).toMatchObject({ product: "openrouter", model, cost: { input: 0.3, output: 2.4 } });
  });

  it("exposes the pinned source separately and never changes its immutable records", () => {
    const first = getModelsDevPricingReference("openrouter", model);
    expect(first).toMatchObject({ url: "https://models.dev/api.json", snapshotDate: "2026-10-29", sha256: MODELS_DEV_PRICING_SOURCE.sha256 });
    first.cost.input = 100;
    expect(getModelsDevPricingReference("openrouter", model).cost.input).toBe(0.3);
    expect(Object.isFrozen(MODELS_DEV_PRICING_REFERENCES.openrouter[model])).toBe(true);
  });

  it("tracks the exact registry pairs as immutable reference-only records", () => {
    const pair = (provider, id) => JSON.stringify([provider, id]);
    const registryPairs = new Set(REGISTRY.flatMap(provider => (provider.models || []).map(entry => pair(provider.id, entry.id))));
    const extracted = new Set();
    for (const [provider, id, cost] of MODELS_DEV_REGISTRY_PRICING_REFERENCES) {
      const key = pair(provider, id);
      expect(registryPairs.has(key), key).toBe(true);
      expect(extracted.has(key), key).toBe(false);
      extracted.add(key);
      expect(getModelsDevPricingReference(provider, id), key).toMatchObject({ product: MODELS_DEV_PRICING_PRODUCTS[provider], model: id, cost });
      expect(getModelsDevPricingEstimate(provider, id, snapshotTime), key).toBeNull();
      expect(getPricingForModel(provider, id, snapshotTime)?.provenance?.kind, key).not.toBe("models-dev-catalog-estimate");
    }
    expect(extracted.size).toBe(123);
    expect(Object.values(MODELS_DEV_PRICING_ESTIMATE_MODELS).flat()).toHaveLength(16);
    expect(Object.values(MODELS_DEV_PRICING_REFERENCES).reduce((count, models) => count + Object.keys(models).length, 0)).toBe(163);

    // This checks the extraction against the current registry, not whether an
    // omitted snapshot row exists; the full-payload verifier checks that.
    const covered = REGISTRY.flatMap(provider => (provider.models || []).filter(entry => Object.hasOwn(MODELS_DEV_PRICING_REFERENCES[provider.id] || {}, entry.id))
      .map(entry => pair(provider.id, entry.id)));
    expect(covered).toHaveLength(149);
    expect(new Set(covered).size).toBe(146);
    expect(Object.isFrozen(MODELS_DEV_REGISTRY_PRICING_REFERENCES)).toBe(true);
    const tiered = MODELS_DEV_REGISTRY_PRICING_REFERENCES.find(([provider, id]) => provider === "github" && id === "gpt-5.6-luna");
    expect(Object.isFrozen(tiered)).toBe(true);
    expect(Object.isFrozen(tiered[2].tiers[0].tier)).toBe(true);
    const clone = getModelsDevPricingReference("github", "gpt-5.6-luna");
    clone.cost.tiers[0].tier.size = 1;
    expect(getModelsDevPricingReference("github", "gpt-5.6-luna").cost.tiers[0].tier.size).toBe(200000);
  });

  it("distinguishes products, modality-specific units, tiers, and catalog zero from token billing", () => {
    const tts = "gemini-2.5-flash-preview-tts";
    const embedding = "gemini-embedding-001";
    expect(getModelsDevPricingReference("gemini", tts)).toMatchObject({ product: "google", cost: { input: 0.5, output: 10 } });
    expect(getReviewedModelMetadata("gemini", tts).billing.unit).toBe("million_text_input_audio_output_tokens");
    expect(getPricingForModel("gemini", tts, snapshotTime)).toMatchObject({ input: 0.5, output: null });
    expect(getModelsDevPricingReference("gemini", embedding).cost).toEqual({ input: 0.15, output: 0 });
    expect(getPricingForModel("gemini", embedding, snapshotTime)).toMatchObject({ input: 0.15, output: null });
    expect(getModelsDevPricingReference("glm", "glm-5.2")).toMatchObject({ product: "zai-coding-plan", cost: { input: 0, output: 0 } });
    expect(getPricingForModel("glm", "glm-5.2", snapshotTime)).toMatchObject({ input: null, output: null });
    expect(getModelsDevPricingReference("nvidia", "nvidia/nemotron-3-ultra-550b-a55b").cost.input).toBe(0);
    expect(getPricingForModel("nvidia", "nvidia/nemotron-3-ultra-550b-a55b", snapshotTime)).toMatchObject({ input: null, output: null });
    expect(getModelsDevPricingReference("github", "gpt-5.6-luna").cost.tiers[0].tier.size).toBe(200000);
    expect(getModelsDevPricingReference("openai", "gpt-5.6-luna").cost.tiers[0].tier.size).toBe(272000);
    expect(getReviewedModelMetadata("github", "claude-opus-5").billing.kind).toBe("subscription-credits");
    expect(getModelsDevPricingReference("anthropic", "claude-opus-5")).toBeNull();
  });

  it.each([
    ["unknown-host", model], ["groq", model], ["openrouter", "other/nemotron-3-super-120b-a12b"],
    ["openrouter", "NVIDIA/NEMOTRON-3-SUPER-120B-A12B"], ["openrouter", "__proto__"],
  ])("does not borrow another host or spelling for %s/%s", (provider, id) => {
    expect(getModelsDevPricingReference(provider, id)).toBeNull();
    expect(getPricingForModel(provider, id, snapshotTime)).toBeNull();
  });

  it("does not backdate or extrapolate the catalog estimate beyond its bounded reference window", () => {
    expect(getPricingForModel("openrouter", model)).toBeNull();
    expect(getPricingForModel("openrouter", model, { timestamp: "2026-10-28T18:11:32.421Z" })).toBeNull();
    expect(getPricingForModel("openrouter", model, { timestamp: "2026-10-28T18:11:32.422Z" })).toMatchObject({ input: 0.3 });
    expect(getPricingForModel("openrouter", model, { timestamp: "2026-10-29T18:11:32.421Z" })).toMatchObject({ input: 0.3 });
    expect(getPricingForModel("openrouter", model, { timestamp: "2026-10-29T18:11:32.422Z" }).provenance.sha256).not.toBe(MODELS_DEV_PRICING_SOURCE.sha256);
    expect(getPricingForModel("openrouter", model, { timestamp: "2026-10-29T12:00:00" })).toBeNull();
    expect(getPricingForModel("openrouter", model, { timestamp: "2026-10-29T15:00:00+03:00" })).toMatchObject({ input: 0.3 });
    expect(getModelsDevPricingReference("openrouter", model)).not.toBeNull();
  });

  it("does not infer a cache or reasoning tariff from the input/output reference", () => {
    const quote = getPricingForModel("openrouter", model, snapshotTime);
    expect(quote).toMatchObject({ input: 0.3, output: 2.4, cached: null, reasoning: null, cache_creation: null, cache_creation_1h: null });
    expect(calculateCostBreakdown({ prompt_tokens: 1000000, completion_tokens: 1000000 }, quote).totalCost).toBeCloseTo(2.7, 12);
    expect(calculateCostBreakdown({ prompt_tokens: 1000000, cached_tokens: 100000, completion_tokens: 1000 }, quote).totalCost).toBeNull();
    expect(calculateCostBreakdown({ prompt_tokens: 1, completion_tokens: 10, reasoning_tokens: 5 }, quote).totalCost).toBeNull();
    expect(calculateCostBreakdown({ prompt_tokens: 1, completion_tokens: 1, actualServiceTier: "fast" }, quote).totalCost).toBeNull();
  });

  it("does not replace reviewed primary quotes or explicit unknown blockers", () => {
    expect(getModelsDevPricingReference("groq", "llama-3.3-70b-versatile").cost).toEqual({ input: 0.59, output: 0.79 });
    expect(getPricingForModel("groq", "llama-3.3-70b-versatile", snapshotTime)).toMatchObject({ input: null, output: null });
    expect(getPricingForModel("cohere", "command-r-08-2024", snapshotTime)).toMatchObject({ input: null, output: null });
    expect(getModelsDevPricingReference("together", "Qwen/Qwen3.7-Max").cost).toMatchObject({ input: 2.5, output: 7.5 });
    expect(getPricingForModel("together", "Qwen/Qwen3.7-Max", snapshotTime)).toMatchObject({ input: 1.5, output: 4.5, cached: 0.3 });
    expect(getPricingForModel("gemini", "gemini-3.1-flash-image", snapshotTime)).toMatchObject({ input: 0.5, output: null });
    expect(getModelsDevPricingReference("cloudflare-ai", "@cf/qwen/qwen3.8-27b").cost.cache_read).toBe(0.05);
    expect(getPricingForModel("cloudflare-ai", "@cf/qwen/qwen3.8-27b", snapshotTime).cached).toBeUndefined();
    expect(getModelsDevPricingReference("openrouter", "minimax/minimax-m3.1-flash").cost).toMatchObject({ input: 0.15, output: 0.6 });
    expect(getPricingForModel("openrouter", "minimax/minimax-m3.1-flash", snapshotTime)).toBeNull();
  });

  it("retains reviewed context and service tiers rather than flattening a catalog tier", () => {
    const reference = getModelsDevPricingReference("github", "gpt-5.5");
    expect(reference.cost.tiers[0].tier.size).toBe(272000);
    expect(getPricingForModel("github", "gpt-5.5", snapshotTime)).toMatchObject({ input: null, output: null });
    const native = getPricingForModel("openai", "gpt-5.5", snapshotTime);
    expect(native.tier.threshold).toBe(272000);
    expect(resolveEffectivePricing(native, 272000).input).toBe(5);
    expect(resolveEffectivePricing(native, 272001).input).toBe(10);
    expect(native.service_tiers.fast).toBeDefined();
  });

  it("does not mistake a plan's zero catalog numbers for free token billing", () => {
    expect(getModelsDevPricingReference("glm", "glm-5.3").cost).toMatchObject({ input: 0, output: 0 });
    expect(getPricingForModel("glm", "glm-5.3", snapshotTime)).toMatchObject({ input: null, output: null });
    expect(getPricingForModel("tokenharbor", "mimo-v2.6-flash:free", snapshotTime)).toEqual(ZERO_PRICING);
  });

  it("does not leak global family or free-namespace guesses to other providers", () => {
    expect(getPricingForModel("unknown-host", "gpt-5.4")).toBeNull();
    expect(getPricingForModel("groq", "other-vendor/gpt-5.4")).toBeNull();
    expect(getPricingForModel("unknown-host", "cline-free/deepseek-v4.1-flash")).toBeNull();
    expect(getPricingForModel("openrouter", "cline-free/deepseek-v4.1-flash")).toBeNull();
    expect(getPricingForModel("cline", "cline-free/deepseek-v4.1-flash")).toEqual(ZERO_PRICING);
  });
});
