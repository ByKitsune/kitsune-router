import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";

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

  it("prices Qwen models at official Model Studio Singapore USD schedule", () => {
    expect(getPricingForModel("alitp-intl", "qwen3.7-max")).toMatchObject({
      input: 2.5,
      output: 7.5,
    });
    expect(getPricingForModel("alitp-intl", "qwen3.5-flash")).toMatchObject({
      input: 0.1,
      output: 0.4,
    });
  });

  it("resolves Mistral Medium and Small latest with 256k context and reasoning", () => {
    const med = getCapabilitiesForModel("mistral", "mistral-medium-latest");
    expect(med).toMatchObject({
      contextWindow: 262144,
      maxOutput: 262144,
      vision: true,
      reasoning: true,
    });
    const sm = getCapabilitiesForModel("mistral", "mistral-small-latest");
    expect(sm).toMatchObject({
      contextWindow: 262144,
      maxOutput: 256000,
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
