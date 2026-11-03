import { describe, expect, it } from "vitest";
import { hasClaudeSignaturePrefix, isValidClaudeSignature } from "../../open-sse/utils/claudeSignature.js";
import { normalizeClaudePassthrough, prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";

const signature = Buffer.from([0x12, 0x0a, 0x00, 0xff, 0x01]).toString("base64");
const wrapped = Buffer.from(signature).toString("base64");
const model = "claude-opus-4-6";

describe("Claude thinking signature structure", () => {
  it.each([signature, signature.replace(/=+$/, ""), wrapped, `cache-key#${signature}`])("accepts the retained E/R and cache-prefixed forms: %s", value => {
    expect(isValidClaudeSignature(value)).toBe(true);
    expect(hasClaudeSignaturePrefix(value)).toBe(true);
  });

  it.each([null, undefined, 0, 1, true, {}, [], { trim: () => signature }])("treats non-string signatures as invalid without invoking object methods: %j", value => {
    expect(isValidClaudeSignature(value)).toBe(false);
    expect(hasClaudeSignaturePrefix(value)).toBe(false);
  });

  it.each([
    "Eg=", "Eg===", "Eg==!", "E g==", "Eg==\n!", "Eh==",
    Buffer.from("Eg==!").toString("base64"),
    Buffer.from("Eg=").toString("base64"),
    Buffer.from("Eh==").toString("base64"),
    Buffer.from("not-a-Claude-signature").toString("base64"),
  ])("rejects malformed or noncanonical base64 in either layer: %s", value => {
    expect(isValidClaudeSignature(value)).toBe(false);
  });

  it.each([
    ["native passthrough", body => normalizeClaudePassthrough(body, model, null, "claude")],
    ["prepared request", body => prepareClaudeRequest(body, "claude")],
  ])("drops malformed blocks and preserves accepted opaque content in %s", (_label, prepare) => {
    const result = prepare({
      model, max_tokens: 1024,
      messages: [
        { role: "assistant", content: [
          { type: "thinking", thinking: "Keep original bytes", signature },
          { type: "thinking", thinking: "Keep wrapped bytes", signature: wrapped },
          { type: "thinking", thinking: "Malformed bytes", signature: "Eg==!" },
          { type: "thinking", thinking: "Wrong type", signature: {} },
          { type: "redacted_thinking", data: "opaque-redacted-content" },
          { type: "text", text: "Answer" },
        ] },
        { role: "user", content: "Continue" },
      ],
    });
    const blocks = result.messages.find(message => message.role === "assistant").content;
    expect(blocks.filter(block => block.type === "thinking")).toEqual([
      { type: "thinking", thinking: "Keep original bytes", signature },
      { type: "thinking", thinking: "Keep wrapped bytes", signature: wrapped },
    ]);
    expect(blocks).toContainEqual({ type: "redacted_thinking", data: "opaque-redacted-content" });
  });
});
