import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";

beforeEach(() => setCatalogSource(null));
afterEach(() => setCatalogSource(null));

describe("xAI route pricing and limits", () => {
  it("prices current Grok models off exact entries", () => {
    expect(getPricingForModel("xai", "grok-4.6")).toMatchObject({ input: 2, output: 6 });
    expect(getPricingForModel("xai", "grok-4.3")).toMatchObject({ input: 1.25, output: 2.5 });
  });
  it("does not invent an output ceiling when resolving Grok 4.6", () => {
    // https://docs.x.ai/developers/models/grok-4.6
    expect(getCapabilitiesForModel("xai", "grok-4.6")).toMatchObject({ contextWindow: 500000, maxOutput: null });
  });
});

describe("DeepSeek reference pricing", () => {
  it("prices flash/pro at the official off-peak schedule", () => {
    expect(getPricingForModel("deepseek", "deepseek-flash")).toMatchObject({ input: 0.15, output: 0.6 });
    expect(getPricingForModel("deepseek", "deepseek-v4-pro")).toMatchObject({ input: 0.66, output: 1.98 });
  });
});

describe("Mistral exact and legacy model identities", () => {
  it("prices the -latest slugs", () => {
    expect(getPricingForModel("mistral", "mistral-large-latest")).toMatchObject({ input: 0.5, output: 1.5 });
    expect(getPricingForModel("mistral", "mistral-small-latest")).toMatchObject({ input: 0.15, output: 0.6 });
    expect(getPricingForModel("mistral", "codestral-latest")).toMatchObject({ input: 0.3, output: 0.9 });
  });
  it("uses the primary Codestral2508 page's128K window rather than a secondary256K claim", () => {
    // https://docs.mistral.ai/models/codestral-25-08.md: API names include
    // codestral-latest; context128k. No independent output-token cap is given.
    expect(getCapabilitiesForModel("mistral", "codestral-latest")).toMatchObject({ contextWindow: 128000, maxOutput: null });
    // The versioned legacy build keeps its own smaller window.
    expect(getCapabilitiesForModel("mistral", "codestral-2405").contextWindow).toBe(128000);
  });
});
