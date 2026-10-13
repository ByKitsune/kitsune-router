import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";
import { CLAUDE_BETA_FLAGS_BASE } from "../../open-sse/config/clientVersions.js";
import { normalizeClaudePassthrough, prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import "../translator/registerAll.js";

setCatalogSource(null);

describe("Claude Sonnet 5.5 and verified Claude capabilities", () => {
  it("resolves claude-sonnet-5-5 as 1M adaptive thinking model that rejects disabled thinking", () => {
    for (const id of [
      "claude-sonnet-5-5",
      "claude-sonnet-5.5",
      "claude-sonnet-5-5-thinking",
      "claude-sonnet-5-5-agentic",
    ]) {
      const caps = getCapabilitiesForModel("claude", id);
      expect(caps).toMatchObject({
        contextWindow: 1000000,
        maxOutput: 128000,
        thinkingFormat: "claude-adaptive",
        thinkingCanDisable: false,
        vision: true,
        pdf: true,
        tools: true,
        search: true,
      });
    }
  });

  it("prices claude-sonnet-5-5 at $2/$10 with $0.20 cache read and $2.50 cache write", () => {
    const p = getPricingForModel("claude", "claude-sonnet-5-5");
    expect(p).toMatchObject({
      input: 2.0,
      output: 10.0,
      cached: 0.2,
      cache_creation: 2.5,
    });
  });

  it("prices claude-fable-5-1 cache read at $0.25 (0.025x input)", () => {
    const p = getPricingForModel("claude", "claude-fable-5-1");
    expect(p.cached).toBe(0.25);
  });

  it("marks claude-fable-5 as unable to disable thinking", () => {
    expect(getCapabilitiesForModel("claude", "claude-fable-5").thinkingCanDisable).toBe(false);
  });

  it("does not include the non-existent token-efficient-tools-2026-03-28 beta flag", () => {
    expect(CLAUDE_BETA_FLAGS_BASE).not.toContain("token-efficient-tools-2026-03-28");
  });
});

describe("Sonnet 5.5 request restrictions", () => {
  const model = "claude-sonnet-5-5";
  const nativeBody = (extra = {}) => ({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: "Use the run tool." }],
    tools: [{ name: "run", input_schema: { type: "object", properties: {} } }],
    ...extra,
  });

  it.each(["max", "xhigh"])("normalizes native disabled thinking with %s effort without mutating shared fields", (effort) => {
    const request = nativeBody({
      thinking: { type: "disabled" },
      output_config: { effort, format: { type: "json_schema", schema: { type: "object" } } },
      tool_choice: { type: "tool", name: "run", disable_parallel_tool_use: true },
    });
    const original = structuredClone(request);
    const out = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, model, { ...request }, true, null, "claude");
    expect(out.thinking).toEqual({ type: "between_tools" });
    expect(out.output_config).toEqual({ effort: "high", format: original.output_config.format });
    expect(out.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    expect(request).toEqual(original);
  });

  it.each(["required", { type: "function", function: { name: "run" } }])("normalizes OpenAI off intent and forced choice %j", (toolChoice) => {
    const request = {
      model,
      reasoning_effort: "none",
      tool_choice: toolChoice,
      tools: [{ type: "function", function: { name: "run", parameters: { type: "object", properties: {} } } }],
      messages: [{ role: "user", content: "Use the run tool." }],
    };
    const original = structuredClone(request);
    const out = translateRequest(FORMATS.OPENAI, FORMATS.CLAUDE, model, { ...request }, true, null, "claude");
    expect(out.thinking).toEqual({ type: "between_tools" });
    expect(out.tool_choice).toEqual({ type: "auto" });
    expect(request).toEqual(original);
  });

  it.each(["disabled", "between_tools"])("applies the same guards on native passthrough type %s", (type) => {
    const request = nativeBody({
      thinking: { type }, output_config: { effort: "max" },
      tool_choice: { type: "any", disable_parallel_tool_use: false },
    });
    const original = structuredClone(request);
    const out = normalizeClaudePassthrough({ ...request }, model);
    expect(out.thinking).toEqual({ type: "between_tools" });
    expect(out.output_config.effort).toBe("high");
    expect(out.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: false });
    expect(request).toEqual(original);
  });

  it.each(["claude-sonnet-5-5", "claude-sonnet-5.5", "anthropic/claude-sonnet-5-5-thinking", "claude-sonnet-5-5-20260930"])("guards final provider off bodies for %s", (id) => {
    const out = prepareClaudeRequest(nativeBody({ model: id, thinking: { type: "disabled" }, output_config: { effort: "max" }, tool_choice: { type: "any" } }), "claude");
    expect(out.thinking).toEqual({ type: "between_tools" });
    expect(out.output_config.effort).toBe("high");
    expect(out.tool_choice).toEqual({ type: "auto" });
  });

  it("preserves supported between-tools effort and unrestricted adaptive max effort", () => {
    const low = prepareClaudeRequest(nativeBody({ thinking: { type: "between_tools" }, output_config: { effort: "low" }, tool_choice: { type: "auto" } }), "claude");
    expect(low.output_config.effort).toBe("low");
    expect(low.tool_choice).toEqual({ type: "auto" });
    const adaptive = prepareClaudeRequest(nativeBody({ thinking: { type: "adaptive" }, output_config: { effort: "max" } }), "claude");
    expect(adaptive.thinking).toEqual({ type: "adaptive" });
    expect(adaptive.output_config.effort).toBe("max");
  });

  it.each(["claude-sonnet-5", "claude-sonnet-4.6", "claude-haiku-4-5", "claude-fable-5-1", "claude-opus-5-5"])("does not apply Sonnet restrictions to %s", (id) => {
    const out = normalizeClaudePassthrough(nativeBody({ model: id, thinking: { type: "disabled" }, tool_choice: { type: "any" } }), id);
    expect(out.thinking).toEqual({ type: "disabled" });
    expect(out.tool_choice).toEqual({ type: "any" });
  });

  it.each(["claude-fable-5-1", "claude-opus-5-5"])("retains mandatory thinking semantics for %s", (id) => {
    const out = translateRequest(FORMATS.OPENAI, FORMATS.CLAUDE, id, {
      model: id, reasoning_effort: "none", messages: [{ role: "user", content: "hi" }],
    }, true, null, "claude");
    expect(out.thinking).toBeUndefined();
    // The model cannot disable thinking, so "none" clamps to the lowest
    // available effort. The Anthropic wire has no "minimal" level (its
    // enum starts at "low"), so the clamped intent must go out as "low"
    // (9router #4600) — sending "minimal" is an invalid body upstream.
    expect(out.output_config.effort).toBe("low");
  });

  it.each(["claude-sonnet-5-5", "claude-opus-5-5"])("preserves explicitly requested thinking display for %s", (id) => {
    for (const display of ["summarized", "omitted"]) {
      const out = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, id, nativeBody({
        model: id, thinking: { type: "adaptive", display }, output_config: { effort: "high" },
      }), true, null, "claude");
      expect(out.thinking).toEqual({ type: "adaptive", display });
      expect(out.output_config.effort).toBe("high");
    }
    const openai = translateRequest(FORMATS.OPENAI, FORMATS.CLAUDE, id, {
      model: id, reasoning_effort: "high", messages: [{ role: "user", content: "hi" }],
    }, true, null, "claude");
    expect(openai.thinking).toEqual({ type: "adaptive", display: "summarized" });
  });
});
