import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

describe("media and hosted facts reach runtime metadata", () => {
  it("preserves free host tariffs without charging a vendor fallback", () => {
    for (const id of ["fledge-alpha-free", "ling-3.1-flash-free", "longcat-2.5-preview-free", "space-bunny-free", "mimo-v2.6-flash-free"]) {
      expect(getPricingForModel("oc", id)).toMatchObject({ input: 0, output: 0, cached: 0 });
      expect(getReviewedModelMetadata("oc", id).billing.kind).toBe("free-promotion");
    }
  });
  it("does not substitute embedding dimensions or chat defaults for generation limits", () => {
    expect(getCapabilitiesForModel("gemini", "gemini-embedding-2")).toMatchObject({
      tools: false, vision: false, reasoning: false, maxInput: 8192, contextWindow: null, maxOutput: null,
    });
    expect(getReviewedModelMetadata("gemini", "gemini-embedding-2").limits.dimensions.max).toBe(3072);
    expect(getPricingForModel("gemini", "gemini-embedding-2").input).toBe(0.2);
  });
  it("keeps per-image and modality prices outside flat text-token tariffs", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 100 }, getPricingForModel("openai", "gpt-image-2.5-flare"))).toBeNull();
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 100 }, getPricingForModel("gemini", "gemini-3.1-flash-lite-image"))).toBeNull();
    expect(getReviewedModelMetadata("openai", "gpt-image-2.5-flare").billing.rates.image_output).toBe(30);
    expect(getCapabilitiesForModel("gemini", "gemini-3.1-flash-lite-image")).toMatchObject({ imageOutput: true, vision: false, maxInput: 65536 });
  });
  it("exposes new Gemini audio model metadata, not generic chat tools and vision", () => {
    expect(getCapabilitiesForModel("gemini", "gemini-3.8-flash-tts")).toMatchObject({
      audioOutput: true, tools: false, vision: false, maxInput: 8192, maxOutput: 16384,
    });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 100 }, getPricingForModel("gemini", "gemini-3.8-flash-tts"))).toBeNull();
  });
});
