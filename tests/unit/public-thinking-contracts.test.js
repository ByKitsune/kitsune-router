import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import { validateSupportedParams } from "../../open-sse/translator/concerns/paramSupport.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { reconcileClaudeThinkingBudget } from "../../open-sse/translator/concerns/thinking.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";

const chat = extra => ({ messages: [{ role: "user", content: "Reply briefly." }], ...extra });
const toClaude = extra => translateRequest("openai", "claude", "claude-sonnet-4.5", chat(extra), false, null, "claude");
const nativeGoogle = config => ({ request: { contents: [{ role: "user", parts: [{ text: "Reply briefly." }] }], generationConfig: config } });

describe("selected Claude thinking budget is a request contract", () => {
  it.each([1024, 2048])("explains the selected %i-token budget rather than a generic minimum", budget => {
    const body = { max_tokens: budget, thinking: { type: "enabled", budget_tokens: budget } };
    expect(() => reconcileClaudeThinkingBudget(body)).toThrow(expect.objectContaining({
      code: "invalid_thinking_budget", param: "max_tokens",
      message: expect.stringContaining(`selected thinking budget of ${budget}`),
    }));
    expect(() => reconcileClaudeThinkingBudget(body)).toThrow(/thinking\.type.*disabled/);
    expect(body).toEqual({ max_tokens: budget, thinking: { type: "enabled", budget_tokens: budget } });
  });

  it("keeps the selected 1024 budget and the client's 2048 output cap", () => {
    const out = toClaude({ max_completion_tokens: 2048, thinking: { type: "enabled", budget_tokens: 1024 } });
    expect(out.max_tokens).toBe(2048);
    expect(out.thinking.budget_tokens).toBe(1024);
  });

  it("keeps the original cap parameter in a translated local error", () => {
    expect(() => toClaude({ max_completion_tokens: 1024, thinking: { type: "enabled", budget_tokens: 2048 } }))
      .toThrow(expect.objectContaining({ code: "invalid_thinking_budget", param: "max_completion_tokens", message: expect.stringContaining("2048") }));
  });

  it("does not reserve any thinking budget for a disabled 16-token request", () => {
    const out = toClaude({ max_tokens: 16, thinking: { type: "disabled" } });
    expect(out.max_tokens).toBe(16);
    expect(out.thinking).toEqual({ type: "disabled" });
  });

  it("does not silently shrink an explicit Antigravity native budget", () => {
    const body = nativeGoogle({ maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 2048, includeThoughts: false } });
    const before = structuredClone(body);
    expect(() => new AntigravityExecutor().transformRequest("claude-sonnet-4-6", body, false, {}))
      .toThrow(expect.objectContaining({ code: "invalid_thinking_budget", param: "request.generationConfig.maxOutputTokens", message: expect.stringContaining("2048") }));
    expect(body).toEqual(before);
  });

  it("preserves disabled Antigravity thinking and the 16-token cap", () => {
    const out = new AntigravityExecutor().transformRequest("claude-sonnet-4-6", nativeGoogle({
      maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
    }), false, {});
    expect(out.request.generationConfig).toEqual({ maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0, includeThoughts: false } });
  });

  it("preserves the supported reasoning_effort none workaround with a 16-token cap", () => {
    const out = translateRequest("openai", "antigravity", "claude-sonnet-4-6", chat({ max_tokens: 16, reasoning_effort: "none" }), false, null, "antigravity");
    expect(out.request.generationConfig).toMatchObject({ maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } });
  });


  it("preserves a frozen native request and its explicit thinking controls", () => {
    const body = Object.freeze(nativeGoogle({ maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 1024, includeThoughts: false } }));
    const before = structuredClone(body);
    const out = new AntigravityExecutor().transformRequest("claude-sonnet-4-6", body, false, {});
    expect(out.request.generationConfig).toEqual(before.request.generationConfig);
    expect(body).toEqual(before);
  });
});

describe("Antigravity effort is supported native intent or a local error", () => {
  it.each(["low", "medium", "high"])("preserves Argon %s without inventing a numeric budget", effort => {
    const out = translateRequest("openai", "antigravity", "gemini-4-argon", chat({ max_tokens: 2048, reasoning_effort: effort }), false, null, "antigravity");
    expect(out.request.generationConfig).toMatchObject({ maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: effort, includeThoughts: true } });
    expect(out.request.generationConfig.thinkingConfig).not.toHaveProperty("thinkingBudget");
  });

  it.each(["none", "minimal", "max", "ultra", "unrecognized"])("rejects unsupported Argon effort %s", effort => {
    expect(() => validateSupportedParams("antigravity", "gemini-4-argon", { reasoning_effort: effort }, "antigravity"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "reasoning_effort" }));
  });

  it.each([
    ["claude-sonnet-4-6", "low"], ["gpt-oss-120b-medium", "high"],
    ["gemini-3.8-flash-high(high)", "low"], ["gemini-4-argon-low(low)", "high"],
    ["claude-sonnet-5-5-high(high)", "low"],
  ])("rejects ignored or fixed-tier conflicting %s effort", (model, effort) => {
    expect(() => validateSupportedParams("ag", model, { reasoning_effort: effort }, "antigravity"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "reasoning_effort" }));
  });

  it("does not let a preset or another effort field hide an unsupported value", () => {
    expect(() => validateSupportedParams("antigravity", "gemini-3.8-flash-high(high)", { output_config: { effort: "high" }, reasoning_effort: "minimal" }, "antigravity", "gemini-3.8-flash"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "reasoning_effort" }));
  });

  it("preserves a supported native level and explicit include control", () => {
    const out = new AntigravityExecutor().transformRequest("gemini-4-argon", nativeGoogle({
      maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low", includeThoughts: false },
    }), false, {});
    expect(out.request.generationConfig).toEqual({ maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low", includeThoughts: false } });
  });

  it("does not ignore a conflicting compatibility effort beside native thinking", () => {
    const body = { ...nativeGoogle({ thinkingConfig: { thinkingLevel: "high" } }), reasoning_effort: "low" };
    expect(() => new AntigravityExecutor().transformRequest("gemini-4-argon", body, false, {}))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "reasoning_effort" }));
  });

  it("rejects a native fixed-tier level conflict before dispatch", () => {
    expect(() => new AntigravityExecutor().transformRequest("gemini-3.8-flash-high", nativeGoogle({ thinkingConfig: { thinkingLevel: "low" } }), false, {}))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "request.generationConfig.thinkingConfig.thinkingLevel" }));
  });
});

describe("Codex uses the resolved model's strict effort set on every path", () => {
  it.each(["none", "minimal", "ultra"])("rejects GPT-6.1 Sol %s without clamping or omission", effort => {
    const error = expect.objectContaining({ code: "unsupported_parameter", param: "reasoning.effort" });
    expect(() => validateSupportedParams("cx", "gpt-6.1-sol", { reasoning: { effort } }, "openai-responses")).toThrow(error);
    expect(() => applyThinking("openai-responses", "gpt-6.1-sol", { reasoning: { effort } }, "codex")).toThrow(error);
    expect(() => new CodexExecutor().transformRequest("gpt-6.1-sol", { model: "gpt-6.1-sol", input: "Reply.", reasoning: { effort } }, true, {})).toThrow(error);
  });

  it.each(["none", "minimal", "ultra"])("rejects unsupported suffix %s before applying defaults", effort => {
    expect(() => validateSupportedParams("codex", `gpt-6.1-sol(${effort})`, {}, "openai-responses"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "model" }));
  });

  it.each(["low", "medium", "high", "xhigh", "max"])("preserves supported native %s and summary intent", effort => {
    const out = new CodexExecutor().transformRequest("gpt-6.1-sol", { model: "gpt-6.1-sol", input: "Reply.", reasoning: { effort, summary: "detailed" } }, true, {});
    expect(out.reasoning).toEqual({ effort, summary: "detailed" });
  });
});
