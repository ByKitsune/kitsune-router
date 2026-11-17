import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPublicModelMetadata, getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

const flagshipModels = [
  "gpt-6.2-astra", "gpt-6.2-sol", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna",
  "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna",
];

describe("reviewed OpenAI model facts", () => {
  it.each(flagshipModels)("retains %s full model limits and explicit Responses cache controls", model => {
    expect(getCapabilitiesForModel("openai", `${model}(high)`)).toMatchObject({
      contextWindow: 1050000, maxInput: 922000, maxOutput: 128000,
    });
    expect(getReviewedModelMetadata("openai", model).limits.apiPromptCaching).toMatchObject({
      minimumPrefixTokens: 1024, keyParameter: "prompt_cache_key", optionsParameter: "prompt_cache_options",
      breakpointParameter: "prompt_cache_breakpoint", defaultMode: "implicit",
      modes: ["implicit", "explicit"], responsesTtls: ["30m", "12h"], defaultTtl: "30m",
    });
  });

  it.each([
    ["gpt-5.4-mini", 400000, 272000, 128000], ["gpt-5.2", 400000, 272000, 128000],
    ["gpt-5-pro", 400000, 272000, 272000], ["gpt-4.1", 1047576, null, 32768],
    ["gpt-4o", 128000, null, 16384], ["gpt-4-turbo", 128000, null, 4096], ["o3", 200000, null, 100000],
  ])("keeps %s context, input and output ceilings independent", (model, contextWindow, maxInput, maxOutput) => {
    expect(getCapabilitiesForModel("openai", model)).toMatchObject({ contextWindow, maxInput, maxOutput });
  });

  it.each([
    ["gpt-6.1-sol", ["low", "medium", "high", "xhigh", "max"], "medium"],
    ["gpt-5.6-luna", ["none", "low", "medium", "high", "xhigh", "max"], "medium"],
    ["gpt-5.5-pro", ["medium", "high", "xhigh"], "high"],
    ["gpt-5.4-pro", ["medium", "high", "xhigh"], "medium"],
    ["gpt-5.4-mini", ["none", "low", "medium", "high", "xhigh"], "none"],
    ["gpt-5.2-pro", ["medium", "high", "xhigh"], undefined],
    ["gpt-5.1", ["none", "low", "medium", "high"], "none"],
    ["gpt-5", ["minimal", "low", "medium", "high"], "medium"],
    ["gpt-5-pro", ["high"], "high"],
  ])("preserves the documented %s reasoning set and default", (model, efforts, defaultEffort) => {
    const record = getReviewedModelMetadata("openai", model);
    expect(record.capabilities.thinkingEfforts).toEqual(efforts);
    expect(record.capabilities.thinkingCanDisable).toBe(efforts.includes("none"));
    expect(record.limits.apiReasoningEfforts).toEqual(efforts);
    expect(record.limits.apiDefaultReasoningEffort).toBe(defaultEffort);
  });

  it("retains model-card and exact catalog provenance at field level", () => {
    const caps = getCapabilitiesForModel("openai", "gpt-5.5");
    const record = getPublicModelMetadata("openai", "gpt-5.5", caps);
    expect(record.capabilityVerification).toMatchObject({
      contextWindow: { kind: "primary-field-reference" }, maxInput: { kind: "catalog-reference" },
      maxOutput: { kind: "primary-field-reference" },
    });
  });

  it("publishes old cache settings and Fast fallback only with model-specific evidence", () => {
    const older = getReviewedModelMetadata("openai", "gpt-5.5");
    expect(older.limits.apiPromptCaching).toMatchObject({
      retentionParameter: "prompt_cache_retention", retentionValues: ["24h"], explicitBreakpoints: false,
    });
    expect(older.limits.apiFastLongContextFallback).toBeUndefined();
    expect(getReviewedModelMetadata("openai", "gpt-5.4").limits.apiFastLongContextFallback).toMatchObject({
      inputThreshold: 272000, serviceTier: "default",
    });
    expect(getReviewedModelMetadata("cx", "gpt-6.2-sol").limits.apiPromptCaching).toBeUndefined();
    expect(getReviewedModelMetadata("cx", "gpt-6.1-sol").limits.apiPromptCaching).toBeUndefined();
  });
});
