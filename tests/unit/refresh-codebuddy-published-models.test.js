import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getDefaultModel, getModelUpstreamId, isValidModel } from "../../open-sse/config/providerModels.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

// Exact product.json entries in the integrity-verified 2.179.0 client bundle.
// Account-specific /v3/config can differ; these are published fallback routes.
const rows = [
  ["hy4-preview", 200000, 64000, false],
  ["hy3", 192000, 64000, false],
  ["kimi-k2.8-preview", 300000, 32000, true],
  ["gpt-5.6-sol", 1000000, 128000, true],
  ["gpt-5.6-terra", 1000000, 128000, true],
  ["gpt-5.6-luna", 1000000, 128000, true],
  ["gpt-5.5", 1000000, 128000, false],
  ["gpt-5.4", 272000, 72000, false],
  ["gemini-3.5-flash", 1000000, 65536, false],
  ["glm-5.3-flash", 300000, 32000, true],
  ["glm-5.3", 1000000, 48000, true],
];

describe("published CodeBuddy hosted-route metadata", () => {
  it("preserves the operator's existing default route while adding fallback models", () => {
    expect(getDefaultModel("cbai")).toBe("glm-5.2");
  });

  it.each(rows)("routes exact INTL %s with its selected budget and independent output ceiling", (model, contextWindow, maxOutput, thinkingCanDisable) => {
    expect(isValidModel("cbai", model)).toBe(true);
    expect(getModelUpstreamId("cbai", model)).toBe(model);
    expect(getCapabilitiesForModel("codebuddy-intl", model)).toMatchObject({
      contextWindow, maxInput: null, maxOutput, thinkingCanDisable,
      vision: true, tools: true, reasoning: true, thinkingFormat: "openai",
      pdf: false, audioInput: false, videoInput: false,
    });
    const metadata = getReviewedModelMetadata("codebuddy-intl", model);
    expect(metadata.limits).toMatchObject({ scope: "publisher-bundled-fallback-catalog", authenticatedRouteVerified: false });
    const executor = new DefaultExecutor("codebuddy-intl");
    expect(executor.buildUrl(model, true)).toBe("https://www.codebuddy.ai/v2/chat/completions");
    const quote = getPricingForModel("codebuddy-intl", model);
    expect(quote?.input ?? null).toBeNull();
    expect(quote?.output ?? null).toBeNull();
  });

  it("does not substitute CN output/window limits for similarly named INTL routes", () => {
    expect(getCapabilitiesForModel("codebuddy-intl", "glm-5.3-flash")).toMatchObject({ contextWindow: 300000, maxOutput: 32000 });
    expect(getCapabilitiesForModel("codebuddy-cn", "glm-5.3-flash")).toMatchObject({ contextWindow: 1000000, maxOutput: 131072 });
    expect(getCapabilitiesForModel("codebuddy-intl", "hy4-preview").contextWindow).toBe(200000);
    expect(getCapabilitiesForModel("codebuddy-cn", "hy4-preview").contextWindow).toBe(1000000);
  });

  it("retains the explicitly published hosted effort set instead of native-vendor guesses", () => {
    expect(getCapabilitiesForModel("codebuddy-intl", "glm-5.3-flash").thinkingEfforts).toEqual(["low", "high", "max"]);
    expect(getCapabilitiesForModel("codebuddy-intl", "gpt-5.5").thinkingEfforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(getCapabilitiesForModel("codebuddy-intl", "gemini-3.5-flash").thinkingEfforts).toBeNull();
  });
});
