import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";

const marker = { type: "ephemeral" };
function cacheRequest() {
  return {
    max_tokens: 128,
    system: [
      { type: "text", text: "First system part", cache_control: { ...marker } },
      { type: "text", text: "Second system part" },
    ],
    messages: [
      { role: "user", content: [{ type: "text", text: "First user", cache_control: { ...marker } }] },
      { role: "assistant", content: [{ type: "text", text: "Retained answer", cache_control: { ...marker } }] },
      { role: "user", content: "Continue" },
    ],
  };
}

describe("Caller cache markers across the actual Claude-to-Chat route (#2069)", () => {
  it.each(["alicode", "alicode-intl", "alims-intl", "alitp-intl"])("preserves explicit system/text markers only for declared opt-in %s", provider => {
    const body = cacheRequest();
    const original = structuredClone(body);
    const output = translateRequest(F.CLAUDE, F.OPENAI, "qwen3.7-plus", body, true, null, provider);
    expect(output.messages[0]).toEqual({ role: "system", content: [
      { type: "text", text: "First system part", cache_control: marker },
      { type: "text", text: "Second system part" },
    ] });
    expect(output.messages[1].content).toEqual([{ type: "text", text: "First user", cache_control: marker }]);
    expect(output.messages[2].content).toEqual([{ type: "text", text: "Retained answer", cache_control: marker }]);
    expect(output.messages[3]).toEqual({ role: "user", content: "Continue" });
    expect(body).toEqual(original);
  });

  it("retains the ordinary string-safe shape on a provider that did not opt in", () => {
    const output = translateRequest(F.CLAUDE, F.OPENAI, "gpt-4o", cacheRequest(), true, null, "openai");
    expect(output.messages[0]).toEqual({ role: "system", content: "First system part\nSecond system part" });
    expect(output.messages[1]).toEqual({ role: "user", content: "First user" });
    expect(output.messages[2]).toEqual({ role: "assistant", content: "Retained answer" });
    expect(JSON.stringify(output)).not.toContain("cache_control");
  });

  it("does not generate cache markers where the caller supplied none", () => {
    const body = cacheRequest();
    for (const part of body.system) delete part.cache_control;
    for (const message of body.messages) if (Array.isArray(message.content)) for (const part of message.content) delete part.cache_control;
    const output = translateRequest(F.CLAUDE, F.OPENAI, "qwen3.7-plus", body, true, null, "alicode");
    expect(JSON.stringify(output)).not.toContain("cache_control");
    expect(output.messages[0].content).toBe("First system part\nSecond system part");
  });
});

describe.each([F.CLAUDE, F.OPENAI_RESPONSES])("Output-cap wire selection for %s to Chat", source => {
  it.each(["o1", "o3", "o4", "openai/o3", "OPENAI/O4", "o1-mini", "o3-mini", "o4-mini", "gpt-5-mini", "gpt-6"])("retains the exact cap in max_completion_tokens for %s", model => {
    const body = source === F.CLAUDE ? { messages: [{ role: "user", content: "Hello" }], max_tokens: 137 }
      : { input: "Hello", max_output_tokens: 137 };
    const original = structuredClone(body);
    const output = translateRequest(source, F.OPENAI, model, body, true, null, "openai");
    expect(output.max_completion_tokens).toBe(137);
    expect(output).not.toHaveProperty("max_tokens");
    expect(body).toEqual(original);
  });

  it("retains the legacy cap field for a declared older Chat model", () => {
    const body = source === F.CLAUDE ? { messages: [{ role: "user", content: "Hello" }], max_tokens: 137 }
      : { input: "Hello", max_output_tokens: 137 };
    const output = translateRequest(source, F.OPENAI, "gpt-4o", body, true, null, "openai");
    expect(output.max_tokens).toBe(137);
    expect(output).not.toHaveProperty("max_completion_tokens");
  });
});
