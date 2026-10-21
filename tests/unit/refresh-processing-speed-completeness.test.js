import { describe, expect, it } from "vitest";
import * as quotes from "../../open-sse/config/processingSpeedPricing.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getServiceTierAvailability } from "../../open-sse/providers/serviceTiers.js";

// Independent literals from the 2026-10-21 public API pricing capture:
// SHA-256 129d6019819379a6f30edc0811d4631ddb085dcd4b3b1d0012a945cd1af1bfbf.
// These tests consume quotes through the real cost calculator; the parent owns
// the getPricingForModel integration loop and its separate all-Fast test file.
describe("complete native OpenAI Standard and speed quote contracts", () => {
  it("prices dated May GPT-4o Standard at 5/15 rather than the changing GPT-4o alias", () => {
    const quote = quotes.OPENAI_STANDARD_TOKEN_PRICING?.["gpt-4o-2024-05-13"];
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, quote)).toBeCloseTo(0.02, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cached_tokens: 1000 }, quote)).toBeNull();
  });

  it("delivers the dated Standard quote to the actual provider resolver", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, getPricingForModel("openai", "gpt-4o-2024-05-13"))).toBeCloseTo(0.02, 12);
  });

  it("uses dated GPT-4o's literal Fast tariff without inventing its missing cache price", () => {
    const quote = quotes.OPENAI_PROCESSING_SPEED_PRICING["gpt-4o-2024-05-13"]?.fast;
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, quote)).toBeCloseTo(0.035, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cached_tokens: 1000 }, quote)).toBeNull();
  });

  it.each([
    ["gpt-5.4", 0.013],
    ["o4-mini", 0.0138],
  ])("preserves the published rounded Flex cache rate for %s", (model, expected) => {
    const quote = quotes.OPENAI_PROCESSING_SPEED_PRICING[model]?.flex;
    expect(calculateCostFromTokens({ prompt_tokens: 100000, cached_tokens: 100000 }, quote)).toBeCloseTo(expected, 12);
  });

  it.each(["gpt-5.5", "gpt-5.4"])("keeps %s Fast long-context cells unknown at the strict 272K boundary", model => {
    const quote = quotes.OPENAI_PROCESSING_SPEED_PRICING[model]?.fast;
    expect(calculateCostFromTokens({ prompt_tokens: 272000, completion_tokens: 1 }, quote)).not.toBeNull();
    expect(calculateCostFromTokens({ prompt_tokens: 272001, completion_tokens: 1 }, quote)).toBeNull();
  });

  it("distinguishes native 30m/12h Sol writes from unknown legacy cache-creation counters", () => {
    const quote = quotes.OPENAI_STANDARD_TOKEN_PRICING?.["gpt-6-sol"];
    expect(calculateCostFromTokens({ prompt_tokens: 2000, cache_write_30m_tokens: 1000, cache_write_12h_tokens: 1000 }, quote)).toBeCloseTo(0.0075, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cache_creation_input_tokens: 1000 }, quote)).toBeNull();
  });

  it("uses the separate native API Codex Fast capability without asserting a subscription entitlement", () => {
    expect(getServiceTierAvailability("openai", "gpt-5.3-codex", "fast").status).toBe("supported");
    expect(getServiceTierAvailability("codex", "gpt-5.3-codex", "fast").status).toBe("unknown");
  });

  it("does not manufacture native Luna Ultrafast or contract-specific Scale prices", () => {
    const quote = getPricingForModel("openai", "gpt-6-luna");
    expect(calculateCostFromTokens({ prompt_tokens: 1000, actualServiceTier: "ultrafast" }, quote)).toBeNull();
    expect(calculateCostFromTokens({ prompt_tokens: 1000, actualServiceTier: "scale" }, quote)).toBeNull();
  });
});
