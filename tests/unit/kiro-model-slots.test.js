import { describe, expect, it } from "vitest";
import { PROVIDER_MODELS, getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { MITM_TOOLS } from "../../src/shared/constants/cliTools.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { openaiToKiroRequest } from "../../open-sse/translator/request/openai-to-kiro.js";

// Guards Kiro model ids that still need mappable defaultModels slots. Without
// a slot, getMappedModel (src/mitm/server.js) returns null and the request is
// passed through to AWS instead of being routed to the user's chosen provider.
describe("Kiro MITM model slots", () => {
  const kiro = MITM_TOOLS.kiro;

  it("exposes the kiro mitm tool", () => {
    expect(kiro).toBeTruthy();
    expect(kiro.configType).toBe("mitm");
    expect(Array.isArray(kiro.defaultModels)).toBe(true);
  });

  it("offers a mappable slot for the agent default model id 'auto'", () => {
    // اسلات auto برای vibe mode لازمه — وگرنه درخواست میره AWS
    const auto = kiro.defaultModels.find((m) => m.id === "auto");
    expect(auto).toBeTruthy();
    expect(auto.alias).toBe("auto");
  });

  it("offers a mappable slot for Claude Sonnet 5", () => {
    const sonnet5 = kiro.defaultModels.find((m) => m.id === "claude-sonnet-5");
    expect(sonnet5).toBeTruthy();
    expect(sonnet5.alias).toBe("claude-sonnet-5");
  });

  it("offers a mappable slot for the background sub-task model id 'simple-task'", () => {
    const simpleTask = kiro.defaultModels.find((m) => m.id === "simple-task");
    expect(simpleTask).toBeTruthy();
    expect(simpleTask.alias).toBe("simple-task");
  });

  it("keeps the legacy GPT-5.6 MITM aliases mappable independently of refreshed provider metadata", () => {
    const models = new Map(kiro.defaultModels.map((m) => [m.id, m]));
    expect(models.get("gpt-5.6-sol")).toMatchObject({ alias: "gpt-5.6-sol", contextLength: 272000, rateMultiplier: 2.4 });
    expect(models.get("gpt-5.6-terra")).toMatchObject({ alias: "gpt-5.6-terra", contextLength: 272000, rateMultiplier: 1.2 });
    expect(models.get("gpt-5.6-luna")).toMatchObject({ alias: "gpt-5.6-luna", contextLength: 272000, rateMultiplier: 0.6 });
  });
});

describe("Kiro static provider models", () => {
  it("includes Claude Sonnet 5 and its synthetic Kiro variants", () => {
    const ids = (PROVIDER_MODELS.kr || []).map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining([
      "claude-sonnet-5",
      "claude-sonnet-5-thinking",
      "claude-sonnet-5-agentic",
      "claude-sonnet-5-thinking-agentic",
    ]));
  });

  it("routes the refreshed GPT-5.6 variants to the same IDE wire IDs and keeps experimental credits separate", () => {
    const models = new Map((PROVIDER_MODELS.kr || []).map((model) => [model.id, model]));
    const ids = [...models.keys()];
    expect(ids).toEqual(expect.arrayContaining([
      "gpt-5.6-sol",
      "gpt-5.6-sol-thinking",
      "gpt-5.6-sol-agentic",
      "gpt-5.6-sol-thinking-agentic",
      "gpt-5.6-terra",
      "gpt-5.6-terra-thinking",
      "gpt-5.6-terra-agentic",
      "gpt-5.6-terra-thinking-agentic",
      "gpt-5.6-luna",
      "gpt-5.6-luna-thinking",
      "gpt-5.6-luna-agentic",
      "gpt-5.6-luna-thinking-agentic",
    ]));

    for (const [id, rateMultiplier] of [
      ["gpt-5.6-sol", 4.4],
      ["gpt-5.6-sol-thinking", 4.4],
      ["gpt-5.6-sol-agentic", 4.4],
      ["gpt-5.6-sol-thinking-agentic", 4.4],
      ["gpt-5.6-terra", 2.2],
      ["gpt-5.6-terra-thinking", 2.2],
      ["gpt-5.6-terra-agentic", 2.2],
      ["gpt-5.6-terra-thinking-agentic", 2.2],
      ["gpt-5.6-luna", 0.6],
      ["gpt-5.6-luna-thinking", 0.6],
      ["gpt-5.6-luna-agentic", 0.6],
      ["gpt-5.6-luna-thinking-agentic", 0.6],
    ]) {
      const model = models.get(id);
      const upstreamModelId = id.replace(/-(thinking-agentic|thinking|agentic)$/, "");
      expect(model).toMatchObject({
        contextLength: 1000000,
        rateMultiplier,
        upstreamModelId,
      });
      const wireModel = getModelUpstreamId("kr", id);
      const request = openaiToKiroRequest(wireModel, {
        messages: [{ role: "user", content: "fixture" }],
        max_completion_tokens: 37,
        reasoning_effort: "high",
      }, true, {});
      expect(request.conversationState.currentMessage.userInputMessage.modelId).toBe(upstreamModelId);
      expect(request.inferenceConfig.maxTokens).toBe(37);
      expect(request.additionalModelRequestFields).toEqual({ reasoning: { effort: "high" } });
      expect(getCapabilitiesForModel("kr", id).contextWindow).toBe(1000000);
      expect(getReviewedModelMetadata("kr", id)).toMatchObject({
        limits: { authenticatedRouteVerified: false },
        billing: { kind: "subscription-credits", creditMultiplier: rateMultiplier, longContextThreshold: 272000 },
      });
    }
  });
});
