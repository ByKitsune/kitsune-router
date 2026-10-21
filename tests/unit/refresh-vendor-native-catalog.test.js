import { describe, expect, it } from "vitest";
import { isValidModel, getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

describe("new documented native text routes", () => {
  it.each(["minimax", "minimax-cn"])("admits MiniMax-M3.1-Flash with its exact wire ID on %s", provider => {
    expect(isValidModel(provider, "MiniMax-M3.1-Flash")).toBe(true);
    expect(getModelUpstreamId(provider, "MiniMax-M3.1-Flash")).toBe("MiniMax-M3.1-Flash");
    expect(getCapabilitiesForModel(provider, "MiniMax-M3.1-Flash")).toMatchObject({
      contextWindow: 1000000, maxOutput: null, vision: true, videoInput: true,
      tools: true, reasoning: true, thinkingCanDisable: false,
    });
  });

  it("uses MiniMax's dollar quote, not the CN catalog's FX-normalized rate", () => {
    const usage = { prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000, reasoning_tokens: 50000 };
    expect(calculateCostFromTokens(usage, getPricingForModel("minimax", "MiniMax-M3.1-Flash"))).toBeCloseTo(0.183, 12);
    expect(calculateCostFromTokens(usage, getPricingForModel("minimax-cn", "MiniMax-M3.1-Flash"))).toBeNull();
  });

  it("admits Mistral Large 4 without relabeling the still-documented Large 3 latest alias", () => {
    expect(isValidModel("mistral", "mistral-large-4")).toBe(true);
    expect(getModelUpstreamId("mistral", "mistral-large-latest")).toBe("mistral-large-latest");
    expect(getCapabilitiesForModel("mistral", "mistral-large-4")).toMatchObject({ vision: true, tools: true, reasoning: true, maxOutput: null });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 }, getPricingForModel("mistral", "mistral-large-4"))).toBeCloseTo(1.534, 12);
  });

  it("preserves Baidu's exact native Flash snapshot output range", () => {
    expect(isValidModel("qianfan", "deepseek-v4.1-flash-1017")).toBe(true);
    expect(getCapabilitiesForModel("baidu", "deepseek-v4.1-flash-1017").maxOutput).toBe(393216);
  });

  it("does not borrow Baidu's output cap for Alibaba Token Plan's same-named snapshot", () => {
    expect(isValidModel("alitp-intl", "deepseek-v4.1-flash-1017")).toBe(true);
    expect(getCapabilitiesForModel("alitp-intl", "deepseek-v4.1-flash-1017")).toMatchObject({ vision: true, reasoning: true, maxOutput: null });
  });

  it("admits the explicitly documented Agent Nemotron route with independent limits", () => {
    const model = "perplexity/nemotron-3.5-super-120b-a12b";
    expect(isValidModel("perplexity-agent", model)).toBe(true);
    expect(getCapabilitiesForModel("perplexity-agent", model)).toMatchObject({ contextWindow: 1048576, maxOutput: 131072, vision: false, reasoning: true });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000, reasoning_tokens: 50000 }, getPricingForModel("perplexity-agent", model))).toBeCloseTo(0.218, 12);
  });

  it("builds Cohere's published OpenAI compatibility URL with the existing adapter", () => {
    expect(new DefaultExecutor("cohere").buildUrl("command-a-plus-05-2026", true)).toBe("https://api.cohere.ai/compatibility/v1/chat/completions");
  });

  it("admits MiMo's exact PAYG ultraspeed ID without extending Token Plan entitlement", () => {
    const model = "mimo-v2.6-pro-ultraspeed";
    expect(isValidModel("xiaomi-mimo", model)).toBe(true);
    expect(isValidModel("xiaomi-tokenplan", model)).toBe(false);
    expect(getCapabilitiesForModel("xiaomi-mimo", model)).toMatchObject({ vision: true, audioInput: true, videoInput: true, tools: true });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 }, getPricingForModel("xiaomi-mimo", model))).toBeCloseTo(4.3572, 12);
  });

  it("uses MiniMax's documented CN text endpoint without changing its international route", () => {
    expect(new DefaultExecutor("minimax-cn").buildUrl("MiniMax-M3.1-Flash", true)).toBe("https://api.minimax.cn/anthropic/v1/messages?beta=true");
    expect(new DefaultExecutor("minimax").buildUrl("MiniMax-M3.1-Flash", true)).toBe("https://api.minimax.io/anthropic/v1/messages?beta=true");
  });
});
