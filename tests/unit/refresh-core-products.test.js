import { describe, expect, it } from "vitest";
import { getModelSupportedFormats, getModelTargetFormat, getModelType, getProviderModels } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { resolveTransport } from "../../open-sse/services/provider.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";

describe("primary-evidence model product boundaries", () => {
  it.each(["gpt-5.5-pro", "gpt-5.4-pro", "gpt-5.2-pro", "o3-pro", "o1-pro"])("routes %s through Responses instead of unsupported Chat passthrough", model => {
    expect(getModelSupportedFormats("openai", model)).toEqual(["openai-responses"]);
    expect(getModelTargetFormat("openai", model)).toBe("openai-responses");
    const transport = resolveTransport("openai", getModelTargetFormat("openai", model));
    expect(new DefaultExecutor("openai").buildUrl(model, false, 0, { runtimeTransport: transport })).toBe("https://api.openai.com/v1/responses");
    expect(getCapabilitiesForModel("openai", model).audioOutput).toBe(false);
  });

  it.each(["gpt-daybreak-blue-latest", "gpt-daybreak-red-latest"])("keeps approval-required hidden %s out of the universal API and Codex suggestions", model => {
    expect(getProviderModels("openai").some(row => row.id === model)).toBe(false);
    expect(getProviderModels("cx").some(row => row.id === model)).toBe(false);
  });

  it.each(["claude-mythos-5-1", "claude-mythos-5"])("retains verification-only %s tariff facts without promising account eligibility in default suggestions", model => {
    expect(getProviderModels("anthropic").some(row => row.id === model)).toBe(false);
    expect(getProviderModels("cc").some(row => row.id === model)).toBe(false);
  });

  it("keeps native Haiku 5.5 facts separate from unverified Claude Code OAuth availability", () => {
    expect(getProviderModels("cc").some(model => model.id === "claude-haiku-5-5")).toBe(false);
    expect(getCapabilitiesForModel("anthropic", "claude-haiku-5-5")).toMatchObject({ contextWindow: 1000000, maxInput: null, maxOutput: 128000 });
    expect(getReviewedModelMetadata("cc", "claude-haiku-5-5")).toBeNull();
    expect(getProviderModels("cc").some(model => model.id === "claude-mythos-5-1")).toBe(false);
  });

  it("retains exact Haiku 4.5 API aliases and their non-free tariff", () => {
    expect(getProviderModels("anthropic").some(model => model.id === "claude-haiku-4-5")).toBe(true);
    expect(getCapabilitiesForModel("anthropic", "claude-haiku-4-5")).toMatchObject({ contextWindow: 200000, maxOutput: 64000 });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, getPricingForModel("anthropic", "claude-haiku-4-5"))).toBe(1);
  });

  it("includes the stable Gemini CLI custom-tools endpoint without conflating Code Assist with native API access", () => {
    expect(getProviderModels("gc").some(model => model.id === "gemini-3.1-pro-preview-customtools")).toBe(true);
    expect(getCapabilitiesForModel("gc", "gemini-3.1-pro-preview-customtools")).toMatchObject({ contextWindow: 1048576, maxOutput: 65536, audioOutput: false });
    expect(getReviewedModelMetadata("gc", "gemini-3.1-pro-preview-customtools").billing.kind).toBe("api-reference");
    expect(new DefaultExecutor("gemini").buildUrl("gemini-3.8-flash", false)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  });

  it("retains Code Assist's literal legacy Flash wire ID without guessing a paid API model behind it", () => {
    expect(getProviderModels("gc").some(model => model.id === "gemini-3-flash")).toBe(true);
    expect(calculateCostFromTokens({ prompt_tokens: 1000000 }, getPricingForModel("gc", "gemini-3-flash"))).toBeNull();
    expect(getCapabilitiesForModel("gc", "gemini-3-flash").contextWindow).toBeNull();
  });

  it("keeps restricted Gemini 2.5 Flash live without claiming the OAuth product shares project eligibility", () => {
    expect(getProviderModels("gemini").some(model => model.id === "gemini-2.5-flash")).toBe(true);
    expect(getReviewedModelMetadata("gemini", "gemini-2.5-flash").limits).toMatchObject({ lifecycleStatus: "active-restricted", accountEligibility: "prior-use-required", shutdownDate: null });
    expect(getReviewedModelMetadata("gc", "gemini-2.5-flash").limits).not.toHaveProperty("accountEligibility");
  });

  it("registers Nano Banana 2.1 as image generation, never chat, with modality-specific unknown totals", () => {
    expect(getModelType("gemini", "gemini-nano-banana-2.1")).toBe("image");
    expect(getCapabilitiesForModel("gemini", "gemini-nano-banana-2.1")).toMatchObject({ imageOutput: true, tools: false, audioOutput: false, contextWindow: null, maxInput: 131072, maxOutput: 32768 });
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 1000 }, getPricingForModel("gemini", "gemini-nano-banana-2.1"))).toBeNull();
  });

  it.each(["grok-4.20-multi-agent", "grok-4.20-multi-agent-0309"])("sends %s research requests to xAI Responses, not a Chat URL carrying a Responses body", model => {
    expect(getModelSupportedFormats("xai", model)).toEqual(["openai-responses"]);
    const transport = resolveTransport("xai", getModelTargetFormat("xai", model));
    expect(new DefaultExecutor("xai").buildUrl(model, true, 0, { runtimeTransport: transport })).toBe("https://api.x.ai/v1/responses");
  });

  it.each(["gpt-6-sol", "gpt-6-luna"])("accepts %s's documented native API effort range independently of the Codex CLI range", model => {
    expect(getCapabilitiesForModel("openai", model).thinkingEfforts).toEqual(["none", "low", "medium", "high", "xhigh", "max"]);
    expect(getCapabilitiesForModel("cx", model).thinkingEfforts).not.toContain("none");
  });

  it.each(["grok-4.7", "grok-4.6", "grok-4.5"])("does not claim that %s reasoning can be disabled", model => {
    expect(getCapabilitiesForModel("xai", model).thinkingCanDisable).toBe(false);
    expect(getCapabilitiesForModel("gcli", model).thinkingCanDisable).toBe(false);
    expect(getCapabilitiesForModel("xai", model).maxOutput).toBeNull();
  });

  it("makes the primary-documented Gemma 4 MoE route discoverable without inventing independent input tokens", () => {
    expect(getProviderModels("gemini").some(row => row.id === "gemma-4-26b-a4b-it")).toBe(true);
    expect(getCapabilitiesForModel("gemini", "gemma-4-26b-a4b-it")).toMatchObject({ contextWindow: 262144, maxInput: null, maxOutput: 32768, vision: true, imageOutput: false });
  });
});
