import { describe, expect, it } from "vitest";
import { getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { calculateCostFromTokens, getPricingForModel, resolveEffectivePricing } from "../../open-sse/providers/pricing.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";

const id = "gpt-6.1-terra";
const apiEfforts = ["none", "low", "medium", "high", "xhigh", "max"];
const cliEfforts = ["low", "medium", "high", "xhigh", "max"];

describe("GPT-6.1 Terra provider-specific facts", () => {
  it("registers the exact model on OpenAI and the pinned Codex catalog", () => {
    expect(getModelsByProviderId("openai").some(model => model.id === id)).toBe(true);
    expect(getModelsByProviderId("codex").some(model => model.id === id)).toBe(true);
    expect(getModelsByProviderId("codex").some(model => model.id === `${id}-review`)).toBe(false);
  });

  it("publishes separate API input, output and context ceilings, formats and reasoning choices", () => {
    const caps = getCapabilitiesForModel("openai", id);
    expect(caps).toMatchObject({ contextWindow: 1050000, maxInput: 922000, maxOutput: 128000,
      vision: true, pdf: true, audioInput: false, videoInput: false, imageOutput: false,
      tools: true, structuredOutput: true, reasoning: true, thinkingCanDisable: true });
    expect(getThinkingLevels("openai", id)).toEqual(apiEfforts);
    expect(getThinkingLevels("openai", `${id}(max)`)).toEqual(apiEfforts);
    expect(getReviewedModelMetadata("openai", id).limits).toMatchObject({
      supportedApiFormats: ["openai", "openai-responses"], toolCallingRequiresResponses: true,
      apiDefaultReasoningEffort: "medium",
    });
  });

  it("prices the entire request at the exclusive 272K boundary, including cache lifetimes", () => {
    const quote = getPricingForModel("openai", id);
    expect(resolveEffectivePricing(quote, 272000)).toMatchObject({ input: 1, cached: 0.05, output: 5, cache_write_30m: 1.25, cache_write_12h: 2.5 });
    expect(resolveEffectivePricing(quote, 272001)).toMatchObject({ input: 2, cached: 0.1, output: 7.5, cache_write_30m: 2.5, cache_write_12h: 5 });
    expect(calculateCostFromTokens({ prompt_tokens: 272000, completion_tokens: 1000 }, quote)).toBeCloseTo(0.277, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 272001, completion_tokens: 1000 }, quote)).toBeCloseTo(0.551502, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 100000, cached_tokens: 20000, completion_tokens: 1000,
      cache_write_tokens: 30000, cache_write_30m_tokens: 10000, cache_write_12h_tokens: 20000 }, quote)).toBeCloseTo(0.1185, 12);
    expect(calculateCostFromTokens({ prompt_tokens: 1000, cache_write_tokens: 1000 }, quote)).toBeNull();
  });

  it("pins later first-party and exact models.dev evidence independently from the earlier catalog", () => {
    const record = getReviewedModelMetadata("openai", id);
    expect(record.provenance.modelPage.sha256).toBe("cd34faa8904d85961ab5fe270f079b8be45a9c876af6c809b38b2c069f687a7a");
    expect(record.provenance.catalogCrosscheck).toMatchObject({ snapshotDate: "2026-10-29", sha256: "bb81b8bddd68fe7cba6504ce9a8cb217fdafb8cf1fd29b56232138b0860bb82f" });
  });

  it("keeps Codex CLI settings distinct from unknown account route limits and prices", () => {
    const record = getReviewedModelMetadata("codex", id);
    expect(record.limits).toMatchObject({ cliDefaultContext: 500000, cliMaxContext: 872000,
      cliDefaultReasoningEffort: "low", authenticatedRouteVerified: false,
      cliReasoningEfforts: [...cliEfforts, "ultra"], routeContextWindow: null, routeMaxInput: null, routeMaxOutput: null });
    expect(record.provenance.cliBundle).toMatchObject({ commit: "126a0ee92ed2c5e73cd8a8f7e37563e8527552d7", sha256: "1384625c0b6b3e67d3c60da29becea2b017f2c283fc1e2d05b8edafb4698eb10" });
    expect(record.billing.kind).toBe("plan");
    for (const model of [id, `${id}(high)`]) {
      expect(getCapabilitiesForModel("cx", model)).toMatchObject({ contextWindow: null, maxInput: null, maxOutput: null, pdf: false });
      expect(getThinkingLevels("cx", model)).toEqual(cliEfforts);
    }
    expect(calculateCostFromTokens({ prompt_tokens: 1000, completion_tokens: 100 }, getPricingForModel("codex", id))).toBeNull();
  });

  it("preserves a supported Codex effort and rejects unverified Ultra without an upstream call", () => {
    const executor = new CodexExecutor();
    const body = executor.transformRequest(id, { model: id, input: "fixture", reasoning: { effort: "max" } }, true, {});
    expect(body).toMatchObject({ model: id, stream: true, store: false, reasoning: { effort: "max" } });
    expect(() => executor.transformRequest(id, { model: id, input: "fixture", reasoning: { effort: "ultra" } }, true, {}))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "reasoning.effort" }));
  });
});
