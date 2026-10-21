import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";

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

describe("native media tariffs on provider-owned wire kinds", () => {
  it.each([
    ["xai", "grok-imagine-image", "image", { rate: 0.02 }],
    ["xai", "grok-imagine-image-quality", "image", { rate: 0.05 }],
    ["xai", "grok-imagine-image-2.0", "image", { rate: 0.04 }],
    ["xai", "grok-imagine-video", "output_second", { rate: 0.05 }],
    ["xai", "grok-imagine-video-1.5", "output_second", { rate: 0.08 }],
    ["xai", "grok-imagine-video-1.5-lite", "output_second", { rate: 0.02 }],
    ["groq", "whisper-large-v3", "audio_hour", { rate: 0.111 }],
    ["groq", "whisper-large-v3-turbo", "audio_hour", { rate: 0.04 }],
    ["openai", "whisper-1", "audio_minute", { rate: 0.006 }],
    ["openai", "gpt-transcribe", "audio_minute", { rate: 0.0045 }],
    ["openai", "tts-1", "million_characters", { rate: 15 }],
    ["openai", "tts-1-hd", "million_characters", { rate: 30 }],
    ["minimax", "speech-2.8-hd", "million_characters", { rate: 100 }],
    ["minimax", "speech-2.8-turbo", "million_characters", { rate: 60 }],
  ])("exposes %s/%s's native %s quote but does not estimate it from chat counters", (provider, id, unit, rates) => {
    expect(getReviewedModelMetadata(provider, id)).toMatchObject({ billing: { currency: "USD", unit, rates, tokenPricingSupported: false } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100 }, getPricingForModel(provider, id))).toBeNull();
  });

  it("retains Groq's ten-second minimum instead of converting audio hours into token rates", () => {
    expect(getReviewedModelMetadata("groq", "whisper-large-v3-turbo")).toMatchObject({ billing: {
      qualifiers: { minimumBilledSeconds: 10, rounding: "unverified" },
    } });
    expect(getCapabilitiesForModel("groq", "whisper-large-v3-turbo")).toMatchObject({ audioInput: true, maxOutput: null, contextWindow: null });
  });

  it.each([
    ["gpt-image-1", { text_input: 5, image_input: 10, image_output: 40 }],
    ["gpt-image-2", { text_input: 5, image_input: 8, image_output: 30 }],
    ["gpt-image-2.5-flare", { text_input: 5, image_input: 8, image_output: 30 }],
  ])("keeps %s's modality prices out of the ordinary flat token tariff", async (id, rates) => {
    const row = (await buildModelsList(["image"])).find(model => model.id === `openai/${id}`);
    expect(row).toMatchObject({ metadata: { billing: { rates, tokenPricingSupported: false } }, capabilities: { imageOutput: true, vision: false } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1 }, getPricingForModel("openai", id))).toBeNull();
  });

  it("does not apply Responses-only GPT Image 2 cache pricing to images/generations", () => {
    expect(getReviewedModelMetadata("openai", "gpt-image-2")).toMatchObject({ billing: { qualifiers: {
      cachedInputScope: "Responses API only", cachedInputAppliesToGatewayRoute: false,
    } } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cached_tokens: 1000 }, getPricingForModel("openai", "gpt-image-2"))).toBeNull();
  });

  it("refreshes Gemini Flash-Lite TTS's known native rates without hiding the dated promotion", async () => {
    const row = (await buildModelsList(["tts"])).find(model => model.id === "gemini/gemini-3.8-flash-lite-tts");
    expect(row).toMatchObject({ metadata: { billing: {
      unit: "million_tokens_by_modality", rates: {
        text_input: 0.5, audio_output: 6, valid_through: "2026-12-31",
        from_2027_01_01: { text_input: 1, audio_output: 12 },
      }, tokenPricingSupported: false,
    } } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, getPricingForModel("gemini", "gemini-3.8-flash-lite-tts"))).toBeNull();
  });

  it("does not expose multimodal embedding input prices as one text-token tariff", () => {
    expect(getReviewedModelMetadata("gemini", "gemini-embedding-2")).toMatchObject({ billing: { rates: {
      text_input: 0.2, image_input: 0.45, audio_input: 6.5, video_input: 12,
    } } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, getPricingForModel("gemini", "gemini-embedding-2"))).toBeCloseTo(0.2, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1 }, getPricingForModel("gemini", "gemini-embedding-2"))).toBeNull();
  });

  it("does not round Mistral Embed's native 8k label into an exact input ceiling", async () => {
    const row = (await buildModelsList(["embedding"])).find(model => model.id === "mistral/mistral-embed");
    expect(row).toMatchObject({ capabilities: { maxInput: null, maxOutput: null, contextWindow: null }, metadata: { limits: { providerContextLabel: "8k" } } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, getPricingForModel("mistral", "mistral-embed"))).toBeCloseTo(0.1, 12);
  });

  it("distinguishes MiniMax billable characters and first-use voice charges from audio milliseconds", () => {
    expect(getReviewedModelMetadata("minimax", "speech-2.8-hd")).toMatchObject({ billing: { qualifiers: {
      nativeUsageFields: { characters: "extra_info.usage_characters", firstUseVoices: "extra_info.usage_voice_count" },
      audioDurationFieldIsBillingMeter: false,
    } } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, getPricingForModel("minimax", "speech-2.8-hd"))).toBeNull();
  });
});
