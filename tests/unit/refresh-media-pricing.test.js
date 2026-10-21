import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCatalogSource, getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { calculateCostBreakdown, calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

// Only persistence is replaced: exercise the real public catalog builder,
// provider identity/kind registration, capability overlay and pricing resolver.
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

describe("October media native billing reaches public consumers without token conversion", () => {
  // Literals below are from captured provider rate cards, not models.dev zeros.
  it.each([
    ["assemblyai/universal-3-5-pro", "audio_hour", { rate: 0.21 }],
    ["assemblyai/universal-2", "audio_hour", { rate: 0.15 }],
    ["deepgram/nova-3", "audio_minute", { monolingual: 0.0043, multilingual: 0.0052 }],
    ["deepgram/whisper-large", "audio_minute", { rate: 0.0048 }],
    ["fish-audio/s2.1-pro", "million_utf8_bytes", { rate: 15 }],
    ["fish-audio/s2.1-pro-free", "million_utf8_bytes", { rate: 0 }],
    ["stability-ai/stable-image-ultra", "image", { rate: 0.08 }],
    ["stability-ai/sd3.5-large", "image", { rate: 0.065 }],
    ["recraft/recraftv4_pro", "image", { rate: 0.25 }],
    ["runwayml/gen4_image", "image_by_resolution", { "720p": 0.05, "1080p": 0.08 }],
    ["runwayml/gen4_image_turbo", "image", { rate: 0.02 }],
    ["fal-ai/fal-ai/flux/schnell", "output_megapixel", { rate: 0.003 }],
    ["fal-ai/fal-ai/flux/dev", "output_megapixel", { rate: 0.025 }],
    ["fal-ai/fal-ai/flux-2", "output_megapixel", { rate: 0.012 }],
    ["fal-ai/fal-ai/ideogram/v3", "image_by_quality", { TURBO: 0.03, BALANCED: 0.06, QUALITY: 0.09 }],
  ])("publishes %s in its quoted %s unit, never as USD/token", async (id, unit, rates) => {
    const row = (await buildModelsList(["image", "tts", "stt"])).find(model => model.id === id);
    expect(row).toMatchObject({ metadata: { billing: { currency: "USD", unit, rates, tokenPricingSupported: false } } });
    const slash = id.indexOf("/");
    const pricing = getPricingForModel(id.slice(0, slash), id.slice(slash + 1));
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1 }, pricing)).toBeNull();
    expect(row.capabilities).toMatchObject({ tools: false, reasoning: false, contextWindow: null, maxInput: null, maxOutput: null });
  });

  it("keeps BFL's first/subsequent megapixels and reference billing instead of a flat image price", async () => {
    const row = (await buildModelsList(["image"])).find(model => model.id === "black-forest-labs/flux-2-pro");
    expect(row).toMatchObject({ metadata: { billing: {
      currency: "USD", unit: "megapixel", tokenPricingSupported: false,
      rates: { first_output_megapixel: 0.03, additional_output_megapixel: 0.015, reference_megapixel: 0.015 },
      qualifiers: { pixelsPerMegapixel: 1048576, rounding: "ceil_per_image", referenceImageCapMegapixels: 4, multipleReferencesMegapixelsEach: 1 },
    } } });
    expect(calculateCostFromTokens({ completion_tokens: 1 }, getPricingForModel("black-forest-labs", "flux-2-pro"))).toBeNull();
  });

  it("retains subscription accounting alongside the separately published ElevenAPI character quote", async () => {
    const row = (await buildModelsList(["tts"])).find(model => model.id === "elevenlabs/eleven_v4");
    expect(row).toMatchObject({ metadata: { billing: {
      kind: "subscription", unit: "subscription_credits_per_character", rates: {},
      apiReference: { currency: "USD", unit: "thousand_characters", rates: { rate: 0.08 } },
      tokenPricingSupported: false,
    } } });
    expect(calculateCostFromTokens({ completion_tokens: 1 }, getPricingForModel("el", "eleven_v4"))).toBeNull();
  });

  it.each([
    ["voyage-4-large", 0.12, 32000], ["voyage-4", 0.06, 32000], ["voyage-4-lite", 0.02, 32000],
    ["voyage-3-large", 0.18, 32000], ["voyage-3.5", 0.06, 32000], ["voyage-3.5-lite", 0.02, 32000],
    ["voyage-code-4", 0.12, 32000], ["voyage-code-3", 0.18, 32000],
    ["voyage-finance-2", 0.12, 32000], ["voyage-law-2", 0.12, 16000], ["voyage-multilingual-2", 0.12, 32000],
  ])("bills %s input tokens, not embedding dimensions or assumed free completions", async (id, rate, maxInput) => {
    const pricing = getPricingForModel("voyage", id);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, pricing)).toBeCloseTo(rate, 12);
    expect(calculateCostBreakdown({ prompt_tokens: 1000000, completion_tokens: 1 }, pricing)).toMatchObject({ inputCost: rate, outputCost: null, totalCost: null });
    const row = (await buildModelsList(["embedding"])).find(model => model.id === `voyage-ai/${id}`);
    expect(row).toMatchObject({ capabilities: { maxInput, contextWindow: null, maxOutput: null }, metadata: { billing: { unit: "million_input_tokens" } } });
  });

  it("preserves native zero bytes as a scoped fair-use quote, not a blanket free voice/token namespace", () => {
    const free = getReviewedModelMetadata("fish", "s2.1-pro-free");
    expect(free).toMatchObject({ billing: { rates: { rate: 0 }, qualifiers: { fairUse: true, productionGuarantees: false } } });
    expect(calculateCostFromTokens({ completion_tokens: 1 }, getPricingForModel("fish", "s2.1-pro-free"))).toBeNull();
    expect(getReviewedModelMetadata("fish", "s2.1-pro")).toMatchObject({ billing: { rates: { rate: 15 } } });
    expect(getReviewedModelMetadata("fish", "some-voice-id")).toBeNull();
  });

  it("labels Polly engine quotes as adapter-unsupported and keeps GovCloud prices distinct", () => {
    expect(getReviewedModelMetadata("polly", "neural")).toMatchObject({ billing: {
      currency: "USD", unit: "million_characters", rates: { rate: 16 },
      qualifiers: { govCloud: { currency: "USD", rate: 19.2 } },
    }, limits: { routeSupported: false, billedCharacters: 3000, totalCharacters: 6000 } });
    expect(calculateCostFromTokens({ completion_tokens: 1 }, getPricingForModel("polly", "neural"))).toBeNull();
  });

  it("keeps Inworld's paid-plan character prices separate from the on-demand tariff", async () => {
    const row = (await buildModelsList(["tts"])).find(model => model.id === "inworld/inworld-tts-2-flash");
    expect(row).toMatchObject({ metadata: { billing: {
      currency: "USD", unit: "million_characters", rates: { rate: 15 }, tokenPricingSupported: false,
      qualifiers: { paidPlanRates: { Creator: 10, Builder: 9, Developer: 8, Growth: 7 }, overage: "same_as_plan_rate" },
    } } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, getPricingForModel("inworld", "inworld-tts-2-flash"))).toBeNull();
  });

  it("identifies the exact Inworld native usage counter and its UTF-16 billing unit", async () => {
    const row = (await buildModelsList(["tts"])).find(model => model.id === "inworld/inworld-tts-2");
    expect(row).toMatchObject({ metadata: { billing: { qualifiers: {
      billingCharacterUnit: "utf16_code_units",
      nativeUsageFields: { characters: "usage.processedCharactersCount", model: "usage.modelId" },
      streamingCharacterCount: "sum_messages",
    } } } });
  });

  it.each([
    ["jina-embeddings-v4", 32768, 2048], ["jina-embeddings-v3", 8192, 1024],
    ["jina-embeddings-v2-base-en", 8192, 768], ["jina-embeddings-v2-base-code", 8192, 768],
  ])("does not bill Jina's %s raw public-catalog numbers as verified USD/token", (id, maxInput, dimensions) => {
    expect(getReviewedModelMetadata("jina", id)).toMatchObject({
      billing: { currency: null, unit: "unverified", tokenPricingSupported: false },
      limits: { dimensions },
    });
    expect(getCapabilitiesForModel("jina", id)).toMatchObject({ maxInput, maxOutput: null, contextWindow: null });
    expect(calculateCostFromTokens({ completion_tokens: 1 }, getPricingForModel("jina", id))).toBeNull();
  });

  it.each([
    ["comfyui", "flux-dev", "operator-managed"], ["sdwebui", "sdxl-base-1.0", "operator-managed"],
    ["coqui", "tts_models/en/ljspeech/tacotron2-DDC", "operator-managed"], ["tortoise", "tortoise-v2", "operator-managed"],
    ["selfhosted-stt", "whisper-1", "operator-managed"], ["selfhosted-tts", "kokoro", "operator-managed"],
    ["selfhosted-embedding", "embedding", "operator-managed"], ["local-device", "default", "device-managed"],
    ["google-tts", "en", "unofficial-service"], ["edge-tts", "en-US-AriaNeural", "unofficial-service"],
    ["huggingface", "black-forest-labs/FLUX.1-schnell", "compute-reference"], ["playht", "PlayDialog", "unverified-pricing"],
  ])("does not call %s/%s free just because there is no token quote", (provider, id, kind) => {
    expect(getReviewedModelMetadata(provider, id)).toMatchObject({ billing: { kind, tokenPricingSupported: false } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 100 }, getPricingForModel(provider, id))).toBeNull();
    expect(getCapabilitiesForModel(provider, id)).toMatchObject({ contextWindow: null, maxOutput: null });
  });

  it.each(["km", "mk"])("keeps Google Translate %s language selectors distinct from a free Cloud TTS model", async id => {
    const row = (await buildModelsList(["tts"])).find(model => model.id === `google-tts/${id}`);
    expect(row).toMatchObject({ metadata: { billing: { kind: "unofficial-service", tokenPricingSupported: false } } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000 }, getPricingForModel("google-tts", id))).toBeNull();
  });
});
