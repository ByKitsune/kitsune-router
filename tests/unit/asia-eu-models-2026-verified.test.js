import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";

beforeEach(() => setCatalogSource(null));
afterEach(() => setCatalogSource(null));

describe("verified specs for flagship 2026 Asia & EU models", () => {
  it("resolves GLM 5.2 as 1M context model with forced thinking on 5.3", () => {
    const glm52 = getCapabilitiesForModel("glm", "glm-5.2");
    expect(glm52.contextWindow).toBe(1000000);
    const glm53 = getCapabilitiesForModel("glm", "glm-5.3");
    expect(glm53.thinkingCanDisable).toBe(false);
  });

  it("retains Qwen Omni's audio and video inputs on its exact route", () => {
    const caps = getCapabilitiesForModel("alitp-intl", "qwen3.8-omni-flash");
    expect(caps).toMatchObject({
      vision: true,
      audioInput: true,
      videoInput: true,
      contextWindow: 1000000,
      maxOutput: 131072,
    });
  });

  it("does not mistake Alibaba Token Plan Credits for the Singapore PAYG invoice", () => {
    // Token Plan Personal overview: dynamic Credits, Singapore Global only.
    // Model Studio model-pricing: separate International real-time dollar quote.
    const usage = { prompt_tokens: 1000000, completion_tokens: 100000 };
    expect(calculateCostFromTokens(usage, getPricingForModel("alitp-intl", "qwen3.8-max"))).toBeNull();
    expect(calculateCostFromTokens(usage, getPricingForModel("alims-intl", "qwen3.8-max"))).toBeCloseTo(2.6, 12);
  });

  it("resolves Mistral Medium and Small latest with 256k context and reasoning", () => {
    const med = getCapabilitiesForModel("mistral", "mistral-medium-latest");
    expect(med).toMatchObject({
      contextWindow: 262144,
      maxOutput: null,
      vision: true,
      reasoning: true,
    });
    const sm = getCapabilitiesForModel("mistral", "mistral-small-latest");
    expect(sm).toMatchObject({
      contextWindow: 262144,
      maxOutput: null,
      reasoning: true,
    });
  });

  it("resolves Xiaomi MiMo V2.6 models with reasoning and 1M context", () => {
    const flash = getCapabilitiesForModel("xiaomi-mimo", "mimo-v2.6-flash");
    expect(flash).toMatchObject({
      contextWindow: 1048576,
      reasoning: true,
    });
    const pro = getCapabilitiesForModel("xiaomi-mimo", "mimo-v2.6-pro");
    expect(pro).toMatchObject({
      contextWindow: 1048576,
      vision: true,
      reasoning: true,
    });
  });
});
