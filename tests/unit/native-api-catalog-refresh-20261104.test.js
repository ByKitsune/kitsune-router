import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterAdvertisedModels, getDefaultModel, getModelsByProviderId, getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [], getCombos: async () => [],
  getCustomModels: async () => [], getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
const { buildModelsList } = await import("@/app/api/v1/models/route.js");

beforeEach(() => {
  setCatalogSource(null);
  vi.stubGlobal("fetch", () => { throw new Error("Unexpected network request"); });
});
afterEach(() => { setCatalogSource(null); vi.unstubAllGlobals(); });

const documentedIds = {
  chutes: ["deepseek-ai/DeepSeek-V4.1-Flash-1017", "deepseek-ai/DeepSeek-V4-Pro-0813", "zai-org/GLM-5.3", "zai-org/GLM-5.2-Fast", "moonshotai/Kimi-K2.7-Code", "Qwen/Qwen3.8-Max-0902", "Qwen/Qwen3.8-2.4T-A95B"],
  ollama: ["mimo-v2.6-flash", "mimo-v2.6-pro", "deepseek-v4-pro:0813", "mistral-large-3:675b", "nemotron-3-nano:30b", "nemotron-3-ultra", "mistral-large-4", "muse-spark-open", "beam", "gpt-oss:20b", "gemma4:31b", "nemotron-3-super"],
  morph: ["morph-glm52-744b", "morph-dsv4flash-0731", "morph-kimik3-fast"],
  "perplexity-agent": ["anthropic/claude-haiku-5-5", "openai/gpt-6-astra", "google/gemini-4-argon", "perplexity/deepseek-v4-pro-0813"],
  mistral: ["mistral-large-4-0", "zai-glm-5-3-flash"],
};

describe("provider-owned November catalog refresh", () => {
  it.each(Object.entries(documentedIds))("publishes %s's exact new native IDs with scoped provenance", async (provider, ids) => {
    const published = await buildModelsList(["llm"]);
    const registry = getModelsByProviderId(provider);
    for (const id of ids) {
      expect(registry.some(model => model.id === id)).toBe(true);
      expect(getModelUpstreamId(provider, id)).toBe(id);
      expect(published.some(model => model.id === `${provider}/${id}`)).toBe(true);
      expect(getReviewedModelMetadata(provider, id)).toMatchObject({
        billing: { reviewedAt: "2026-11-04", invoiceVerified: false },
        limits: { authenticatedRouteVerified: false },
      });
    }
  });

  it("does not assign TEE guarantees, token ceilings or native-vendor prices to new Chutes IDs", () => {
    const id = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
    expect(getReviewedModelMetadata("chutes", id).limits.confidentialCompute).toBe(false);
    expect(getCapabilitiesForModel("chutes", id)).toMatchObject({ contextWindow: null, maxInput: null, maxOutput: null });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 100 }, getPricingForModel("chutes", id))).toBeNull();
  });

  it("does not expose decision-only or unready models as ordinary chat", async () => {
    const published = await buildModelsList(["llm"]);
    for (const id of ["ollama/clef:27b", "morph/reflex"]) expect(published.some(model => model.id === id)).toBe(false);
    expect(getModelsByProviderId("ollama").some(model => model.id === "clef:27b")).toBe(false);
  });

  it("takes Ollama's declared completion capabilities without copying vendor ceilings", () => {
    expect(getCapabilitiesForModel("ollama", "mimo-v2.6-pro")).toMatchObject({
      vision: true, tools: true, reasoning: true, contextWindow: null, maxInput: null, maxOutput: null,
    });
    expect(getCapabilitiesForModel("ollama", "beam").vision).toBe(false);
  });

  it("uses Morph's independently named schema fields and explicit zero cache writes", () => {
    const id = "morph-glm52-744b";
    expect(getCapabilitiesForModel("morph", id)).toMatchObject({ contextWindow: 1048576, maxInput: null, maxOutput: 1048576, vision: false, tools: true });
    expect(getPricingForModel("morph", id).cache_creation).toBe(0);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 }, getPricingForModel("morph", id))).toBeCloseTo(0.2234, 12);
  });

  it("keeps Perplexity Agent's exact tiers separate from direct vendor tariffs", () => {
    const price = getPricingForModel("perplexity-agent", "anthropic/claude-haiku-5-5");
    expect(calculateCostFromTokens({ prompt_tokens: 100000, completion_tokens: 1000 }, price)).toBeCloseTo(0.0105, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 100001, completion_tokens: 1000 }, price)).toBeCloseTo(0.0525005, 12);
    expect(getPricingForModel("perplexity-agent", "openai/gpt-6-astra")).toMatchObject({
      input: 10, output: 50, tier: { threshold: 272000, input: 20, output: 75 },
      service_tiers: { flex: { input: 5 }, priority: { input: 20 } },
    });
    expect(getCapabilitiesForModel("perplexity-agent", "google/gemini-4-argon")).toMatchObject({ contextWindow: null, maxInput: null, maxOutput: null });
  });

  it("retains Mistral's abbreviated limits instead of inventing exact token counts", () => {
    expect(getReviewedModelMetadata("mistral", "zai-glm-5-3-flash")).toMatchObject({
      capabilities: { contextWindow: null, maxInput: null, maxOutput: null, vision: true, tools: true },
      limits: { providerContextLabel: "1M", providerMaxOutputLabel: "128k" },
      pricing: { input: 0.15, output: 0.5, cached: 0.03 },
    });
  });
});

describe("documented lifecycle advertisements", () => {
  it.each([
    ["xiaomi-mimo", ["mimo-v2.5-pro", "mimo-v2.5"], "llm"],
    ["groq", ["distil-whisper-large-v3-en"], "stt"],
    ["assemblyai", ["best", "nano"], "stt"],
  ])("removes %s's retired or deprecated suggestions while retaining explicit history", async (provider, ids, kind) => {
    const raw = getModelsByProviderId(provider);
    const suggestions = filterAdvertisedModels(provider, raw);
    const published = await buildModelsList([kind]);
    for (const id of ids) {
      expect(raw.find(model => model.id === id)?.deprecated).toBe(true);
      expect(suggestions.some(model => model.id === id)).toBe(false);
      expect(published.some(model => model.id === `${provider}/${id}`)).toBe(false);
      expect(getModelUpstreamId(provider, id)).toBe(id);
      expect(filterAdvertisedModels(provider, [{ id, isCustom: true }])).toEqual([{ id, isCustom: true }]);
    }
  });

  it("keeps enterprise-eligible Groq routes without selecting them as the general default", () => {
    expect(getDefaultModel("groq")).toBe("openai/gpt-oss-120b");
    for (const id of ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]) {
      expect(getModelsByProviderId("groq").find(model => model.id === id)?.deprecated).not.toBe(true);
      expect(getModelUpstreamId("groq", id)).toBe(id);
    }
  });
});
