// OpenAI → Kiro (AWS CodeWhisperer) request translation.
import { describe, it, expect } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const O2K = (body) => translateRequest(FORMATS.OPENAI, FORMATS.KIRO, "m", body, true, null, "kiro");
const R2K = (model, body) => translateRequest(
  FORMATS.OPENAI_RESPONSES,
  FORMATS.KIRO,
  model,
  body,
  true,
  null,
  "kiro"
);

describe("OpenAI → Kiro", () => {
  it.each([
    ["high", "gpt-5.6-sol"],
    ["medium", "gpt-5.6-terra"],
    ["low", "gpt-5.6-luna"],
  ])("preserves Responses reasoning.effort %s through the full Kiro route", (effort, model) => {
    const out = R2K(model, {
      input: "Use the requested effort",
      reasoning: { effort },
    });

    expect(out.additionalModelRequestFields).toEqual({
      reasoning: { effort },
    });
    expect(out.systemPrompt || "").not.toContain("<thinking_mode>");
    expect(out.systemPrompt || "").not.toContain("<max_thinking_length>");
  });

  // openai-to-kiro.js — safeJSONParse guards bad tool-call JSON (fixed in PR #1582)
  it("malformed tool arguments do not throw the whole request", () => {
    expect(() =>
      O2K({
        messages: [
          { role: "user", content: "go" },
          { role: "assistant", content: "", tool_calls: [
            { id: "c1", type: "function", function: { name: "f", arguments: "{not json" } },
          ] },
          { role: "tool", tool_call_id: "c1", content: "r" },
        ],
      })
    ).not.toThrow();
  });

  // Explicit caps now survive the Kiro translator instead of using its default.
  it("respects client max_tokens", () => {
    const out = O2K({ max_tokens: 100, messages: [{ role: "user", content: "hi" }] });
    expect(out.inferenceConfig?.maxTokens, "client max_tokens ignored").toBe(100);
  });

  // Synchronous codecs cannot fetch URLs. Core prefetches them securely first;
  // unresolved URLs must fail locally rather than masquerade as typed media.
  it("rejects a remote image that has not been fetched instead of flattening it to text", () => {
    expect(() => O2K({
      messages: [{ role: "user", content: [
        { type: "text", text: "see" },
        { type: "image_url", image_url: { url: "https://x.com/p.png" } },
      ] }],
    })).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "messages.0.content.1.image_url" }));
  });
});
