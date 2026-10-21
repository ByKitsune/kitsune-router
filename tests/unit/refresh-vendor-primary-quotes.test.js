import { describe, expect, it } from "vitest";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

// Literal expectations are independently transcribed from the captured primary
// pages, not models.dev normalized dollar guesses or the production metadata.
describe("2026-10-21 vendor-native quote consumers", () => {
  it.each(["command-a-03-2025", "command-r-08-2024", "command-r7b-12-2024"])("does not turn uncaptured Cohere %s pricing claims into production dollars", model => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1000000 }, getPricingForModel("cohere", model))).toBeNull();
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 1000000 }, getPricingForModel("cohere", model))).toBeNull();
  });

  it("bills Perplexity Sonnet 5.5 cache reads at 0.10, not Sonnet 5's rate", () => {
    const price = getPricingForModel("perplexity-agent", "anthropic/claude-sonnet-5-5");
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 1000000 }, price)).toBe(0.1);
    // The Agent table publishes one rate at every context length. Crossing
    // 200K or272K must not import another host's long-context/cache tariff.
    const usage = { cached_tokens: 100000, completion_tokens: 1000, reasoning_tokens: 400 };
    expect(calculateCostFromTokens({ ...usage, prompt_tokens: 199999 }, price)).toBeCloseTo(0.219998, 12);
    expect(calculateCostFromTokens({ ...usage, prompt_tokens: 200000 }, price)).toBeCloseTo(0.22, 12);
    expect(calculateCostFromTokens({ ...usage, prompt_tokens: 200001 }, price)).toBeCloseTo(0.220002, 12);
    expect(calculateCostFromTokens({ ...usage, prompt_tokens: 272000 }, price)).toBeCloseTo(0.364, 12);
    expect(calculateCostFromTokens({ ...usage, prompt_tokens: 272001 }, price)).toBeCloseTo(0.364002, 12);
  });

  it("bills GPT-5.5 Agent long-context cached input at 10% of that tier's input", () => {
    const price = getPricingForModel("perplexity-agent", "openai/gpt-5.5");
    expect(calculateCostFromTokens({ prompt_tokens: 272000, cached_tokens: 272000 }, price)).toBeCloseTo(0.136, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 272001, cached_tokens: 272001 }, price)).toBeCloseTo(0.272001, 12);
  });

  it("keeps MiniMax M3 priority as a complete delivered-tier quote", () => {
    const price = getPricingForModel("minimax", "MiniMax-M3");
    const tokens = { cached_tokens: 100000, completion_tokens: 1000, reasoning_tokens: 400, actualServiceTier: "priority" };
    expect(calculateCostFromTokens({ ...tokens, prompt_tokens: 512000 }, price)).toBeCloseTo(0.1962, 12);
    expect(calculateCostFromTokens({ ...tokens, prompt_tokens: 512001 }, price)).toBeCloseTo(0.3924009, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cache_creation_input_tokens: 1000, actualServiceTier: "priority" }, price)).toBeNull();
  });

  it.each([
    ["ministral-14b-2512", 0.2], ["ministral-8b-2512", 0.15],
    ["ministral-3b-2512", 0.1], ["mistral-large-latest", 0.5],
    ["mistral-medium-latest", 1.5], ["mistral-small-latest", 0.15],
    ["codestral-latest", 0.3],
  ])("does not infer Mistral's %s cache discount from its ordinary input price", (model, input) => {
    const price = getPricingForModel("mistral", model);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, price)).toBe(input);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 1000000 }, price)).toBeNull();
  });

  it.each(["ministral-3b-2512", "mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"])("does not equate %s's shared context with an independently unverified output maximum", model => {
    expect(getCapabilitiesForModel("mistral", model).maxOutput).toBeNull();
  });

  it("retains Mistral-hosted GLM's independently documented 128K output instead of clearing it with the other Mistral limits", () => {
    expect(getCapabilitiesForModel("mistral", "zai-glm-5-3")).toMatchObject({
      contextWindow: 1048576, maxOutput: 131072, vision: false, reasoning: true,
    });
  });

  it("retains MiMo's documented temporary free cache writes only for the PAYG route", () => {
    const usage = { prompt_tokens: 1000000, cache_creation_input_tokens: 1000000 };
    expect(calculateCostFromTokens(usage, getPricingForModel("xiaomi-mimo", "mimo-v2.6-flash"))).toBe(0);
    expect(calculateCostFromTokens(usage, getPricingForModel("xiaomi-tokenplan", "mimo-v2.6-flash"))).toBeNull();
  });
});
