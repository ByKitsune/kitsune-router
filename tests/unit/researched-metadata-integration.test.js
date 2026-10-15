import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel, withDeclaredCapabilities } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel, resolveEffectivePricing } from "../../open-sse/providers/pricing.js";

// Exact scope and sources are recorded in the reviewed metadata shards. These
// assert the runtime consumer, not merely that a disconnected data file exists.
describe("researched factual metadata reaches the real resolvers", () => {
  it("reports OpenAI total context, input and output on both the API and Codex routes", () => {
    expect(getCapabilitiesForModel("openai", "gpt-6.1-sol")).toMatchObject({
      contextWindow: 1050000, maxInput: 922000, maxOutput: 128000, thinkingCanDisable: false,
    });
    // The Codex route reports the same API limits. It used to publish the CLI
    // configuration ceiling (872000), which under-advertised the real window:
    // a live probe served 902,486 input tokens for that model.
    expect(getCapabilitiesForModel("cx", "gpt-6.1-sol")).toMatchObject({
      contextWindow: 1050000, maxInput: 922000, maxOutput: 128000,
    });
  });
  it("corrects Cohere output caps rather than inheriting a chat family guess", () => {
    expect(getCapabilitiesForModel("cohere", "command-a-03-2025").maxOutput).toBe(8000);
    expect(getCapabilitiesForModel("cohere", "command-r-08-2024").maxOutput).toBe(4000);
  });
  it("uses the Kimi Code highspeed limit, not the base coding model window", () => {
    expect(getCapabilitiesForModel("kimi", "kimi-for-coding-highspeed").contextWindow).toBe(262144);
    expect(getCapabilitiesForModel("kmc", "kimi-for-coding-highspeed").contextWindow).toBe(262144);
  });
  it("keeps non-disablable GLM Flash thinking and the DeepSeek Pro vision restriction", () => {
    expect(getCapabilitiesForModel("glm", "glm-5.3-flash").thinkingCanDisable).toBe(false);
    expect(getCapabilitiesForModel("deepseek", "deepseek-v4-pro").vision).toBe(false);
  });
  it("uses GPT6 Sol's distinct cached long-context rate", () => {
    const sol = resolveEffectivePricing(getPricingForModel("openai", "gpt-6-sol"), 300000);
    const next = resolveEffectivePricing(getPricingForModel("openai", "gpt-6.1-sol"), 300000);
    expect(sol.cached).toBe(0.4);
    expect(next.cached).toBe(0.2);
  });
  it("uses the documented Gemini Flash-Lite thinking price", () => {
    expect(getPricingForModel("gemini", "gemini-3.5-flash-lite").reasoning).toBe(2.5);
  });
  it("applies xAI's inclusive threshold without changing OpenAI's exclusive boundary", () => {
    expect(resolveEffectivePricing(getPricingForModel("xai", "grok-4.7"), 200000).output).toBe(12);
    expect(resolveEffectivePricing(getPricingForModel("openai", "gpt-6.1-sol"), 272000).output).toBe(10);
  });
  it("allows operator-declared maximum input separately from total context", () => {
    const base = getCapabilitiesForModel("openai", "gpt-6.1-sol");
    expect(withDeclaredCapabilities(base, { maxInput: 100000 }).maxInput).toBe(100000);
  });
  it("does not present undocumented output or combined-context maxima as facts", () => {
    // Still unknown, so still unset.
    expect(getCapabilitiesForModel("xai", "grok-4.7").maxOutput).toBeNull();
    expect(getCapabilitiesForModel("gemini", "gemini-3.5-flash-lite")).toMatchObject({
      contextWindow: null, maxInput: 1048576, maxOutput: 65536,
    });
    // Now documented: models.dev's official OpenAI entry, the live gateway and
    // 9router all state 128,000 output for this model, so it is published
    // instead of being withheld as unknown.
    expect(getCapabilitiesForModel("cx", "gpt-6.1-sol").maxOutput).toBe(128000);
  });
  it("does not apply direct-vendor facts to an unrelated restricted gateway", () => {
    expect(getCapabilitiesForModel("ag", "claude-sonnet-4-6")).toMatchObject({
      pdf: false, contextWindow: 250000, maxOutput: 64000,
    });
  });
});
