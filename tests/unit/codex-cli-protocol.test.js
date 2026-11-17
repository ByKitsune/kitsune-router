import { describe, expect, it } from "vitest";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import codex from "../../open-sse/providers/registry/codex.js";
import { CODEX_CLI_VERSION } from "../../open-sse/config/clientVersions.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";

describe("Codex CLI protocol and registry alignment", () => {
  it("builds compliant headers with session-id, version, and originator", () => {
    const ex = new CodexExecutor();
    const headers = ex.buildHeaders({
      connectionId: "conn_1",
      providerSpecificData: { chatgptAccountId: "acct_456" },
    }, true, null, null, { prompt_cache_key: "ses_test_123" });

    expect(headers["session-id"]).toBe("ses_test_123");
    expect(headers["version"]).toBe(CODEX_CLI_VERSION);
    expect(headers["originator"]).toBe("codex_cli_rs");
    expect(headers["ChatGPT-Account-ID"]).toBe("acct_456");
  });

  it("includes flagship GPT-6 models in Codex registry", () => {
    const ids = codex.models.map((m) => m.id);
    expect(ids).toContain("gpt-6-astra");
    expect(ids).toContain("gpt-6.1-sol");
    expect(ids).toContain("gpt-6-sol");
    expect(ids).toContain("gpt-6-luna");
    expect(ids).toContain("gpt-image-2");
  });

  it("supports full reasoning effort options including minimal, xhigh, max, and ultra", () => {
    expect(codex.thinkingConfig.options).toEqual(
      expect.arrayContaining(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"])
    );
  });

  it.each([
    ["gpt-6.2-sol", 500000, { input: 50, cached: 2.5, output: 250 }],
    ["gpt-6.2-astra", 272000, { input: 200, cached: 10, output: 1000 }],
  ])("routes %s through Responses with the Codex effort and credit contract", (model, cliDefaultContext, credits) => {
    const executor = new CodexExecutor();
    const efforts = ["low", "medium", "high", "xhigh", "max"];
    expect(codex.models).toContainEqual(expect.objectContaining({ id: model }));
    expect(executor.buildUrl(model, true)).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(getCapabilitiesForModel("cx", model)).toMatchObject({
      contextWindow: cliDefaultContext, maxInput: null, maxOutput: null, vision: true, pdf: false,
      thinkingEfforts: efforts, thinkingCanDisable: false,
    });
    const metadata = getReviewedModelMetadata("cx", model);
    expect(metadata.limits).toMatchObject({ cliDefaultContext, cliMaxContext: 872000, cliMinimumVersion: "0.166.0", cliDefaultReasoningEffort: "low", authenticatedRouteVerified: false });
    expect(metadata.limits).toMatchObject({ apiContextWindow: 1050000, apiMaxInput: 922000, apiMaxOutput: 128000, unverifiedCapabilityFields: ["maxInput", "maxOutput"] });
    expect(metadata.billing.planPricing).toMatchObject({ ...credits, currency: "credits", separateCacheWriteCharge: false });
    expect(getPricingForModel("cx", model)).toMatchObject({ input: null, output: null, cached: null });

    const wire = executor.transformRequest(model, {
      model, input: "Reply briefly.", prompt_cache_key: "caller-cache-key", prompt_cache_options: { ttl: "30m" },
    }, true, {});
    expect(wire).toMatchObject({
      model, stream: true, store: false, prompt_cache_key: "caller-cache-key", prompt_cache_options: { ttl: "30m" },
      reasoning: { effort: "low" }, include: ["reasoning.encrypted_content"],
    });
    expect(wire.reasoning).not.toHaveProperty("summary");
    expect(executor.transformRequest(model, {
      model, input: "Reply.", reasoning: { effort: "max", summary: "detailed", context: "all_turns" },
    }, true, {}).reasoning).toEqual({ effort: "max", summary: "detailed", context: "all_turns" });
    for (const effort of ["none", "minimal", "ultra"]) {
      expect(() => executor.transformRequest(model, { model, input: "Reply.", reasoning: { effort } }, true, {})).toThrow();
    }
  });
});
