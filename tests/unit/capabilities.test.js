import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

describe("getCapabilitiesForModel", () => {
  const claudeSonnet5Expected = {
    contextWindow: 1000000,
    maxOutput: 128000,
    thinkingFormat: "claude-adaptive",
    reasoning: true,
    vision: true,
    search: true,
    pdf: true,
    tools: true,
  };

  const kiroGpt56Expected = {
    contextWindow: 1000000,
    maxOutput: null,
    maxInput: null,
    thinkingFormat: "openai",
    reasoning: true,
    vision: true,
    search: true,
  };

  it("reports Kiro Claude Opus 5 variants as 1M adaptive-thinking models", () => {
    for (const model of [
      "claude-opus-5",
      "anthropic/claude-opus-5",
      "claude-opus-5-thinking",
      "claude-opus-5-agentic",
      "claude-opus-5-thinking-agentic",
    ]) {
      expect(getCapabilitiesForModel("kiro", model)).toMatchObject(claudeSonnet5Expected);
    }
  });

  it("reports Claude Opus 5.5 variants as permanent adaptive-thinking 1M models", () => {
    for (const model of [
      "claude-opus-5-5",
      "anthropic/claude-opus-5-5",
      "claude-opus-5.5",
      "claude-opus-5-5-thinking",
      "claude-opus-5-5-agentic",
      "claude-opus-5-5-thinking-agentic",
    ]) {
      expect(getCapabilitiesForModel("claude", model)).toMatchObject({
        ...claudeSonnet5Expected,
        thinkingCanDisable: false,
      });
    }
  });

  it("reports Claude Fable 5.1 as a permanent adaptive-thinking model", () => {
    expect(getCapabilitiesForModel("claude", "claude-fable-5-1")).toMatchObject({
      ...claudeSonnet5Expected,
      thinkingCanDisable: false,
    });
  });

  it("reports Kiro Claude Opus 4.8 as a 1M context model", () => {
    expect(getCapabilitiesForModel("kiro", "claude-opus-4.8").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "anthropic/claude-opus-4.8").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "claude-opus-4-8").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "claude-opus-4.8-thinking").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "claude-opus-4-8-thinking").contextWindow).toBe(1000000);
  });

  it("reports Kiro Claude Sonnet 5 as a 1M adaptive-thinking model", () => {
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "anthropic/claude-sonnet-5")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5-thinking")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5-agentic")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5-thinking-agentic")).toMatchObject(claudeSonnet5Expected);
  });

  it("reports Kiro's documented experimental GPT 5.6 window without inventing independent input/output caps", () => {
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-sol")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-terra-thinking")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-luna-agentic")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-sol-thinking-agentic")).toMatchObject(kiroGpt56Expected);
    expect(getReviewedModelMetadata("kiro", "gpt-5.6-sol").billing.longContextThreshold).toBe(272000);
    expect(getReviewedModelMetadata("kiro", "openai/gpt-5.6-sol")).toBeNull();
  });

  it("reports the GPT-6 / GPT-5.6 API limits for both the API and Codex routes", () => {
    for (const model of ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "gpt-6.1-sol", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
      expect(getCapabilitiesForModel("openai", model)).toMatchObject({
        contextWindow: 1050000, maxInput: 922000, maxOutput: 128000,
        thinkingFormat: "openai", reasoning: true, vision: true, search: true,
      });
      // The Codex route reports the same API limits. It used to publish the CLI
      // configuration ceiling (cliMaxContext 872000 / the 272000 CLI default),
      // which under-reported the real window — a live probe served 902,486 input
      // tokens for a model advertised at 872,000 and 402,486 for one advertised
      // at 272,000, with the true ceiling at apiMaxInput (922,000).
      expect(getCapabilitiesForModel("codex", model)).toMatchObject({
        contextWindow: 1050000, maxInput: 922000, maxOutput: 128000,
        thinkingFormat: "openai", reasoning: true, vision: true, search: true,
      });
      const metadata = getReviewedModelMetadata("codex", model);
      expect(metadata.limits).toMatchObject({
        scope: "public-api-specification", authenticatedRouteVerified: false,
        // CLI ceilings stay recorded as a client-scoped concept, not a backend cap.
        cliDefaultContext: 272000, cliMaxContext: 872000,
        apiContextWindow: 1050000, apiMaxInput: 922000, apiMaxOutput: 128000,
        unverifiedCapabilityFields: [],
      });
      expect(metadata.sources).toContain(
        "https://raw.githubusercontent.com/openai/codex/rust-v0.163.0/codex-rs/models-manager/models.json",
      );
    }
  });

  it("keeps the [1m] marker from reporting a smaller window than its base id", () => {
    // `[1m]` means "1M-context beta toggled on", so it can never be smaller than
    // the base id. It resolved to 872000 while the base reported 1050000 after
    // the limits correction.
    for (const base of ["gpt-6-luna", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-6-astra"]) {
      const baseCtx = getCapabilitiesForModel("codex", base).contextWindow;
      const extCtx = getCapabilitiesForModel("codex", `${base}[1m]`).contextWindow;
      expect(extCtx, `${base}[1m] must not be smaller than ${base}`).toBeGreaterThanOrEqual(baseCtx);
    }
  });

  it("resolves a namespaced Codex id to the same limits as its bare id", () => {
    // Regression guard: removing the stale provider-level numeric override must
    // not let a namespaced id fall through to the 200k/64k DEFAULT_CAPABILITIES.
    for (const [namespaced, bare] of [["openai/gpt-6-astra", "gpt-6-astra"], ["openai/gpt-5.6-luna", "gpt-5.6-luna"]]) {
      const ns = getCapabilitiesForModel("codex", namespaced);
      const plain = getCapabilitiesForModel("codex", bare);
      expect(ns.contextWindow).toBe(plain.contextWindow);
      expect(ns.maxOutput).toBe(plain.maxOutput);
      expect(ns.contextWindow).not.toBe(200000);
    }
  });

  it("does not claim reviewed Codex provenance for an undeclared namespaced model ID", () => {
    // Legacy family fallback is not an exact, reviewed Codex route.
    expect(getReviewedModelMetadata("codex", "openai/gpt-6-astra")).toBeNull();
    expect(getCapabilitiesForModel("codex", "openai/gpt-6-astra")).toMatchObject({
      contextWindow: 1050000, maxOutput: 128000,
      thinkingFormat: "openai", reasoning: true, vision: true, search: true,
    });
  });

  it("reports Qwen 3.8 Max and Flash with multimodal reasoning capabilities", () => {
    const maxCaps = getCapabilitiesForModel("qwen", "qwen3.8-max");
    expect(maxCaps.contextWindow).toBe(1000000);
    expect(maxCaps.reasoning).toBe(true);
    expect(maxCaps.thinkingCanDisable).toBe(false);

    const flashCaps = getCapabilitiesForModel("qwen", "qwen3.8-flash");
    expect(flashCaps.contextWindow).toBe(1000000);
    expect(flashCaps.vision).toBe(true);
    expect(flashCaps.videoInput).toBe(true);
    expect(flashCaps.reasoning).toBe(true);
  });

  it("reports DeepSeek V4.1 Flash with 1M context and vision", () => {
    const caps = getCapabilitiesForModel("deepseek", "deepseek-v4.1-flash");
    expect(caps.contextWindow).toBe(1000000);
    // The legacy ID resolves to the reviewed direct-DeepSeek endpoint, whose
    // documented 384K limit is 393216 tokens rather than decimal 384000.
    expect(caps.maxOutput).toBe(393216);
    expect(caps.vision).toBe(true);
    expect(caps.reasoning).toBe(true);
  });
});
