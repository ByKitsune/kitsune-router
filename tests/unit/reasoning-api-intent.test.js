import { describe, expect, it } from "vitest";
import "../translator/registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

function geminiFromChat(control) {
  return translateRequest(FORMATS.OPENAI, FORMATS.GEMINI, "gemini-2.5-flash", {
    messages: [{ role: "user", content: "Explain the result." }], max_tokens: 8192, ...control,
  }, false, null, "gemini");
}

describe("API reasoning controls at the target wire boundary", () => {
  it.each([
    ["thinking boolean on", { thinking: true }, -1],
    ["thinking boolean off", { thinking: false }, 0],
    ["thinking string off", { thinking: "off" }, 0],
    ["thinking string effort", { thinking: "low" }, 1024],
    ["reasoning boolean on", { reasoning: true }, -1],
    ["reasoning boolean off", { reasoning: false }, 0],
    ["reasoning enabled on", { reasoning: { enabled: true } }, -1],
    ["reasoning enabled off", { reasoning: { enabled: false } }, 0],
    ["reasoning numeric budget", { reasoning: { max_tokens: 4096 } }, 4096],
    ["standalone numeric budget", { budget_tokens: 4096 }, 4096],
    ["standalone zero budget", { budget_tokens: 0 }, 0],
    ["blank primary effort with nested choice", { reasoning_effort: " ", reasoning: { effort: "low" } }, 1024],
  ])("maps %s without forwarding foreign fields or raising the caller's cap", (_name, control, budget) => {
    const wire = geminiFromChat(control);
    expect(wire.generationConfig.thinkingConfig?.thinkingBudget).toBe(budget);
    expect(wire.generationConfig.maxOutputTokens).toBe(8192);
    for (const key of ["thinking", "reasoning", "reasoning_effort", "budget_tokens"]) expect(wire).not.toHaveProperty(key);
  });

  it("keeps a disabled thinking choice on a tool-result turn", () => {
    const wire = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "gpt-5.4", {
      thinking: { type: "disabled" }, max_completion_tokens: 512,
      messages: [
        { role: "assistant", content: null, tool_calls: [{ id: "call_read", type: "function", function: { name: "read", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "call_read", content: "Read complete." },
      ],
    }, false, null, "openai");
    expect(wire.reasoning_effort).toBe("none");
    expect(wire.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_read", content: "Read complete." });
  });

  it("retains numeric thinking intent when translating an assistant continuation", () => {
    const wire = translateRequest(FORMATS.CLAUDE, FORMATS.GEMINI, "gemini-2.5-flash", {
      max_tokens: 8192, thinking: { type: "enabled", budget_tokens: 4096 },
      messages: [{ role: "user", content: "Consider the evidence." }, { role: "assistant", content: "The first observation is" }],
    }, false, null, "gemini");
    expect(wire.generationConfig.thinkingConfig?.thinkingBudget).toBe(4096);
    expect(wire.generationConfig.maxOutputTokens).toBe(8192);
  });
});

describe("reasoning visibility is independent from effort", () => {
  it.each([
    ["gemini-2.5-flash", { thinkingBudget: 4096, includeThoughts: false }, { thinkingBudget: 4096, includeThoughts: false }],
    ["gemini-3.8-flash", { thinkingLevel: "high", includeThoughts: false }, { thinkingLevel: "high", includeThoughts: false }],
    ["gemini-3-flash-preview", { thinkingLevel: "minimal", includeThoughts: true }, { thinkingLevel: "minimal", includeThoughts: true }],
  ])("preserves the native visibility choice for %s", (model, thinkingConfig, expected) => {
    const wire = translateRequest(FORMATS.GEMINI, FORMATS.GEMINI, model, {
      contents: [{ role: "user", parts: [{ text: "Explain the result." }] }],
      generationConfig: { maxOutputTokens: 8192, thinkingConfig },
    }, false, null, "gemini");
    expect(wire.generationConfig.thinkingConfig).toEqual(expected);
    expect(wire.generationConfig.maxOutputTokens).toBe(8192);
  });

  it("does not expose Gemini thoughts when the Claude client requested omitted thinking", () => {
    const wire = translateRequest(FORMATS.CLAUDE, FORMATS.GEMINI, "gemini-2.5-flash", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 8192,
      thinking: { type: "enabled", budget_tokens: 4096, display: "omitted" },
    }, false, null, "gemini");
    expect(wire.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 4096, includeThoughts: false });
  });

  it("keeps omitted Gemini thought visibility on the Claude wire", () => {
    const wire = translateRequest(FORMATS.GEMINI, FORMATS.CLAUDE, "claude-sonnet-4.5", {
      contents: [{ role: "user", parts: [{ text: "Explain the result." }] }],
      generationConfig: { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 4096, includeThoughts: false } },
    }, false, null, "claude");
    expect(wire.thinking).toMatchObject({ type: "enabled", budget_tokens: 4096, display: "omitted" });
  });

  it("requests a Responses summary when the Claude client explicitly requested summarized thinking", () => {
    const wire = translateRequest(FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES, "gpt-5.4", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 8192,
      thinking: { type: "enabled", budget_tokens: 4096, display: "summarized" },
    }, false, null, "openai");
    expect(wire.reasoning).toMatchObject({ effort: "low", summary: "auto" });
  });

  it("does not lose structured output while normalizing native Claude effort", () => {
    const format = { type: "json_schema", schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } };
    const wire = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, "claude-opus-4.7", {
      messages: [{ role: "user", content: "Return the result." }], max_tokens: 8192,
      thinking: { type: "adaptive" }, output_config: { effort: "high", format },
    }, false, null, "claude");
    expect(wire.output_config).toEqual({ effort: "high", format });
  });
});

describe("native OpenAI and OpenRouter reasoning schemas", () => {
  it.each([{ thinking: true }, { reasoning_effort: "auto" }])("uses OpenAI's model default instead of an invalid auto enum: %j", (control) => {
    const wire = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "gpt-5.4", {
      messages: [{ role: "user", content: "Explain the result." }], ...control,
    }, false, null, "openai");
    expect(wire).not.toHaveProperty("reasoning_effort");
    expect(wire).not.toHaveProperty("thinking");
  });

  it("normalizes a native Responses reasoning string without leaking string-index keys", () => {
    const wire = translateRequest(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES, "gpt-5.4", {
      input: "Explain the result.", reasoning: "low",
    }, false, null, "openai");
    expect(wire.reasoning).toEqual({ effort: "low" });
  });

  it.each([
    [{ max_tokens: 4096, exclude: true }, { max_tokens: 4096, exclude: true }],
    [{ enabled: true, exclude: false }, { enabled: true, exclude: false }],
    [{ effort: "max", exclude: true }, { effort: "max", exclude: true }],
  ])("preserves OpenRouter's documented native controls: %j", (reasoning, expected) => {
    const wire = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "anthropic/claude-sonnet-4.6", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 8192, reasoning,
    }, false, null, "openrouter");
    expect(wire.reasoning).toEqual(expected);
    expect(wire).not.toHaveProperty("reasoning_effort");
    expect(wire.max_tokens).toBe(8192);
  });

  it("maps a Claude numeric budget and omitted display to OpenRouter without losing either choice", () => {
    const wire = translateRequest(FORMATS.CLAUDE, FORMATS.OPENAI, "anthropic/claude-sonnet-4.6", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 8192,
      thinking: { type: "enabled", budget_tokens: 4096, display: "omitted" },
    }, false, null, "openrouter");
    expect(wire.reasoning).toEqual({ max_tokens: 4096, exclude: true });
    expect(wire).not.toHaveProperty("thinking");
  });
});

describe("complete reasoning control handoff", () => {
  it("honors the thinking on/off picker suffix above a disabled request default", () => {
    const wire = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "glm-4.7(thinking)", {
      messages: [{ role: "user", content: "Explain the result." }], reasoning_effort: "none",
    }, false, null, "glm");
    expect(wire.thinking).toEqual({ type: "enabled" });
    expect(wire.enable_thinking).not.toBe(false);
  });

  it("consumes foreign budget/enabled/exclude aliases before emitting native Responses reasoning", () => {
    const wire = translateRequest(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES, "gpt-5.4", {
      input: "Explain the result.", max_output_tokens: 8192,
      reasoning: { max_tokens: 4096, enabled: true, exclude: true },
    }, false, null, "openai");
    expect(wire.reasoning).toEqual({ effort: "low", summary: null });
    expect(wire.max_output_tokens).toBe(8192);
  });
});

describe("thinking controls follow the actual upstream wire format", () => {
  it.each(["low", "none"])("rejects %s when a Claude-on-Antigravity route fixes effort to high", effort => {
    expect(() => translateRequest(FORMATS.OPENAI, FORMATS.ANTIGRAVITY, "claude-opus-5-5", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 6000, reasoning_effort: effort,
    }, false, { projectId: "synthetic-reasoning-fixture" }, "antigravity"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "reasoning_effort" }));
  });

  it("preserves the supported disabled control on the budgeted Claude bridge", () => {
    const wire = translateRequest(FORMATS.OPENAI, FORMATS.ANTIGRAVITY, "claude-sonnet-4-6", {
      messages: [{ role: "user", content: "Explain the result." }], max_tokens: 16, reasoning_effort: "none",
    }, false, { projectId: "synthetic-reasoning-fixture" }, "antigravity");
    expect(wire.request.generationConfig).toMatchObject({ maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0, includeThoughts: false } });
    expect(wire).not.toHaveProperty("thinking");
    expect(wire).not.toHaveProperty("output_config");
  });
});
