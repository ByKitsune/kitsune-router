import { describe, expect, it } from "vitest";
import { normalizeClaudePassthrough, prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// These synthetic values prove transport fidelity, not provider authenticity.
const signatures = ["opaque-v2:signature/+==", "cache#opaque-signature", "  opaque signature\n", "Eh=="];
const model = "claude-opus-4-6";
const history = signature => ({
  model, max_tokens: 2048, thinking: { type: "enabled", budget_tokens: 1024 },
  metadata: { user_id: "caller-owned-session" },
  messages: [
    { role: "assistant", content: [
      { type: "thinking", thinking: "", signature },
      { type: "redacted_thinking", data: "opaque-redacted/+==" },
      { type: "tool_use", id: "toolu_original", name: "lookup", input: {} },
    ] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_original", content: "found" }] },
  ],
});

describe("Claude opaque signature replay contract", () => {
  it.each(signatures)("replays %j byte-for-byte through native and prepared tool continuations", signature => {
    for (const prepare of [body => normalizeClaudePassthrough(body, model, null, "claude"), body => prepareClaudeRequest(body, "claude")]) {
      const source = history(signature);
      const sent = prepare(structuredClone(source));
      expect(sent.messages[0].content.slice(0, 2)).toEqual(source.messages[0].content.slice(0, 2));
      expect(sent.metadata).toEqual(source.metadata);
    }
  });

  it("preserves opaque signed history and caller metadata across independent account translations", () => {
    const source = history(signatures[0]);
    const original = structuredClone(source);
    for (const accessToken of ["fixture-account-one", "fixture-account-two"]) {
      const sent = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, model, source, false, { accessToken }, "claude");
      expect(sent.messages[0].content.slice(0, 2)).toEqual(original.messages[0].content.slice(0, 2));
      expect(sent.metadata).toEqual(original.metadata);
      expect(JSON.stringify(sent)).not.toContain(accessToken);
    }
    expect(source).toEqual(original);
  });
});
