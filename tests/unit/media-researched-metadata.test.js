import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { calculateCostBreakdown, calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [],
  getCombos: async () => [],
  getCustomModels: async () => [],
  getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
const { buildModelsList } = await import("@/app/api/v1/models/route.js");

beforeEach(() => {
  setCatalogSource(null);
  vi.stubGlobal("fetch", () => { throw new Error("Unexpected network request"); });
});
afterEach(() => { setCatalogSource(null); vi.unstubAllGlobals(); });

describe("media billing units and independent limits", () => {
  // Compatible input-only quotes from the providers' pricing pages:
  // https://ai.google.dev/gemini-api/docs/pricing
  // https://docs.voyageai.com/docs/pricing.md
  // https://docs.mistral.ai/models/codestral-embed-25-05
  // https://docs.fireworks.ai/serverless/pricing.md
  it.each([
    ["gemini", "gemini-embedding-2", 0.2],
    ["voyage-ai", "voyage-code-4", 0.12],
    ["mistral", "codestral-embed-2505", 0.15],
    ["fireworks", "fireworks/qwen3-embedding-8b", 0.1],
  ])("bills %s/%s input without turning an absent output tariff into free output", (provider, id, expected) => {
    const pricing = getPricingForModel(provider, id);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 0 }, pricing)).toBeCloseTo(expected, 12);
    const cost = calculateCostBreakdown({ prompt_tokens: 1000000, completion_tokens: 1 }, pricing);
    expect(cost.inputCost).toBeCloseTo(expected, 12);
    expect(cost.outputCost).toBeNull();
    expect(cost.totalCost).toBeNull();
  });

  it.each([
    ["recraft", "recraftv4_1", "image"],
    ["inworld", "inworld-tts-2", "million_characters"],
    ["el", "eleven_v4", "subscription_credits_per_character"],
    ["jina", "jina-embeddings-v5-text-small", "unverified"],
  ])("does not convert %s/%s's %s meter into a token estimate", (provider, id, unit) => {
    expect(getReviewedModelMetadata(provider, id).billing.unit).toBe(unit);
    const pricing = getPricingForModel(provider, id);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1000 }, pricing)).toBeNull();
  });
  it.each([
    ["recraft/recraftv4_1_flash", "image", 0.007],
    ["recraft/recraftv4_1", "image", 0.035],
    ["recraft/recraftv4_1_vector", "image", 0.08],
    ["recraft/recraftv4_1_pro", "image", 0.21],
    ["recraft/recraftv4_1_pro_vector", "image", 0.3],
    ["inworld/inworld-tts-2", "million_characters", 25],
    ["inworld/inworld-tts-2-flash", "million_characters", 15],
  ])("exposes %s's native tariff without relabelling its unit", async (id, unit, rate) => {
    // https://www.recraft.ai/docs/api-reference/pricing and https://inworld.ai/pricing
    const row = (await buildModelsList(["image", "tts"])).find(model => model.id === id);
    expect(row).toMatchObject({ metadata: { billing: { currency: "USD", unit, rates: { rate } } } });
  });

  it.each([
    ["mistral", "codestral-embed-2505", "8k"],
    ["fireworks", "fireworks/qwen3-embedding-8b", "40k"],
  ])("does not round %s/%s's %s input label into an exact token ceiling", async (provider, id, label) => {
    const row = (await buildModelsList(["embedding"])).find(model => model.id === `${provider}/${id}`);
    expect(row).toMatchObject({
      metadata: { limits: { providerContextLabel: label } },
      capabilities: { maxInput: null, contextWindow: null, maxOutput: null },
    });
  });

  it.each([
    ["voyage-ai/voyage-code-4", 32000, { default: 1024 }],
    ["jina-ai/jina-embeddings-v5-text-small", 32768, 1024],
    ["jina-ai/jina-embeddings-v5-text-nano", 8192, 768],
  ])("keeps %s's vector dimensions separate from input and completion limits", async (id, maxInput, dimensions) => {
    // https://docs.voyageai.com/docs/embeddings.md and https://jina.ai/embeddings
    const row = (await buildModelsList(["embedding"])).find(model => model.id === id);
    expect(row).toMatchObject({
      capabilities: { maxInput, contextWindow: null, maxOutput: null },
      metadata: { limits: { dimensions } },
    });
  });

  it("does not treat character or UTF-16 limits as token input ceilings", async () => {
    // https://elevenlabs.io/docs/overview/models.md
    // https://docs.inworld.ai/tts/tts-models
    const rows = await buildModelsList(["tts"]);
    for (const [id, limits] of [
      ["elevenlabs/eleven_v4", { characters: 10000 }],
      ["inworld/inworld-tts-2", { utf16CodeUnits: 2000 }],
    ]) {
      expect(rows.find(model => model.id === id)).toMatchObject({
        capabilities: { maxInput: null, contextWindow: null, maxOutput: null },
        metadata: { limits },
      });
    }
  });

  it("preserves the speech promotion's expiry and later native rates without inventing a generic output price", async () => {
    // https://ai.google.dev/gemini-api/docs/pricing
    const row = (await buildModelsList(["tts"])).find(model => model.id === "gemini/gemini-3.8-flash-tts");
    expect(row).toMatchObject({ metadata: { billing: {
      unit: "million_tokens_by_modality",
      rates: {
        text_input: 0.5, audio_output: 9, cached_input: 0.125,
        valid_through: "2026-12-31",
        from_2027_01_01: { text_input: 1, audio_output: 18, cached_input: 0.25 },
      },
    } } });
    const pricing = getPricingForModel("gemini", "gemini-3.8-flash-tts");
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, pricing)).toBeNull();
  });
});
