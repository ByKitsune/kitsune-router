import { describe, expect, it } from "vitest";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

describe("TokenRouter native billing units do not become flat chat prices", () => {
  it.each([
    ["kling-v3", "second"],
    ["kling-v3-omni", "second"],
    ["MiniMax-Hailuo-2.3", "video"],
    ["bytedance-seed/seedream-4.5", "image"],
    ["bytedance-seed/seedream-5.0-pro", "image"],
    ["openai/gpt-5-image", "modality_specific_tokens"],
    ["qwen3.5-omni-plus", "modality_specific_tokens"],
    ["openai/gpt-audio", "modality_specific_tokens"],
    ["openai/gpt-audio-mini", "modality_specific_tokens"],
  ])("keeps %s's %s quote out of untyped text-token totals", (model, unit) => {
    const record = getReviewedModelMetadata("tokenrouter", model);
    expect(record?.billing.unit).toBe(unit);
    expect(record?.billing.tokenPricingSupported).toBe(false);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 100000 }, getPricingForModel("tokenrouter", model))).toBeNull();
  });
});
