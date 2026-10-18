import { describe, expect, it } from "vitest";
import "../translator/registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";

const formats = ["openai", "openai-responses", "claude", "gemini"];
const targets = [
  ["openai", "gpt-5.4", "openai"],
  ["openai-responses", "gpt-5.4", "openai"],
  ["claude", "claude-opus-4.7", "claude"],
  ["gemini", "gemini-2.5-flash", "gemini"],
];

function request(format, effort) {
  if (format === "gemini") return {
    contents: [{ role: "user", parts: [{ text: "Explain the result." }] }],
    generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: effort } },
  };
  if (format === "openai-responses") return {
    input: "Explain the result.", max_output_tokens: 4096, reasoning: { effort },
  };
  return {
    messages: [{ role: "user", content: "Explain the result." }], max_tokens: 4096,
    ...(format === "claude" ? { output_config: { effort } } : { reasoning_effort: effort }),
  };
}

function expectDisabled(wire, format) {
  if (format === "gemini") expect(wire.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  else if (format === "claude") expect(wire.thinking).toEqual({ type: "disabled" });
  else if (format === "openai-responses") expect(wire.reasoning.effort).toBe("none");
  else expect(wire.reasoning_effort).toBe("none");
}

function expectOutputCap(wire, format) {
  if (format === "gemini") expect(wire.generationConfig.maxOutputTokens).toBe(4096);
  else if (format === "openai-responses") expect(wire.max_output_tokens).toBe(4096);
  else expect(wire.max_completion_tokens ?? wire.max_tokens).toBe(4096);
}

describe.each(formats)("zero-budget suffix from %s", source => {
  it.each(targets)("disables %s thinking ahead of a high body effort", (target, model, provider) => {
    const wire = translateRequest(source, target, `${model}(0)`, request(source, "high"), false, null, provider);
    expectDisabled(wire, target);
    expectOutputCap(wire, target);
  });
});

describe("declared effort sets at the actual translation boundary", () => {
  // The public API explicitly excludes minimal; Codex/reseller contracts are separate.
  // https://developers.openai.com/api/docs/models/gpt-6.1-sol.md
  it.each(formats)("maps normalized %s minimal intent to the lowest supported public OpenAI effort", source => {
    for (const target of ["openai", "openai-responses"]) {
      const wire = translateRequest(source, target, "gpt-6.1-sol", request(source, " MINIMAL "), false, null, "openai");
      expect(target === "openai" ? wire.reasoning_effort : wire.reasoning.effort).toBe("low");
      expectOutputCap(wire, target);
    }
  });

  // Ultra is a gateway input alias, not a supported Anthropic output_config enum.
  // https://platform.claude.com/docs/en/build-with-claude/effort
  it("maps an Ultra suffix to Claude's supported maximum effort", () => {
    const wire = translateRequest("openai", "claude", "claude-opus-4.7(ultra)", request("openai", "low"), false, null, "claude");
    expect(wire.output_config.effort).toBe("max");
    expectOutputCap(wire, "claude");
  });

  it.each([["codex", "ultra"], ["openai", "max"]])("uses %s's own declared maximum instead of an identity-wide effort override", (provider, expected) => {
    const wire = translateRequest("claude", "openai-responses", "gpt-6.1-sol", request("claude", "ultra"), false, null, provider);
    expect(wire.reasoning.effort).toBe(expected);
  });
});

describe("Claude's independent thinking and effort controls", () => {
  // Effort applies to visible output even when thinking is disabled.
  // https://platform.claude.com/docs/en/build-with-claude/effort#how-effort-works
  it.each(targets)("does not re-enable thinking on the %s wire when Messages effort is also set", (target, model, provider) => {
    const body = { ...request("claude", "high"), thinking: { type: "disabled" } };
    const wire = translateRequest("claude", target, model, body, false, null, provider);
    expectDisabled(wire, target);
    expectOutputCap(wire, target);
    if (target === "claude") expect(wire.output_config.effort).toBe("high");
  });
});
