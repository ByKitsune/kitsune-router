import { describe, expect, it } from "vitest";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("applyThinking respects the selected OpenAI model's effort enum", () => {
  it("maps Claude max to the original GPT-5 highest supported effort", () => {
    const body = { output_config: { effort: "max" } };
    const out = applyThinking(FORMATS.OPENAI, "gpt-5", body, "openai");
    expect(out.reasoning_effort).toBe("high");
  });

  it.each(["max", "xhigh"])("rejects native GPT-5 effort %s", effort => {
    expect(() => applyThinking(FORMATS.OPENAI, "gpt-5", { reasoning_effort: effort }, "openai"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "reasoning_effort" }));
  });

  it.each(["xhigh", "max"])("preserves native GPT-6.2 Sol effort %s", effort => {
    const out = applyThinking(FORMATS.OPENAI_RESPONSES, "gpt-6.2-sol", { reasoning: { effort } }, "openai");
    expect(out.reasoning.effort).toBe(effort);
  });

  it("\"high\" passes through unchanged", () => {
    const body = { reasoning_effort: "high" };
    const out = applyThinking(FORMATS.OPENAI, "gpt-5", body, "openai");
    expect(out.reasoning_effort).toBe("high");
  });

  it("maps a Claude thinking budget to the original GPT-5 highest supported effort", () => {
    const body = { thinking: { type: "enabled", budget_tokens: 128000 } };
    const out = applyThinking(FORMATS.OPENAI, "gpt-5", body, "openai");
    expect(out.reasoning_effort).toBe("high");
  });
});
