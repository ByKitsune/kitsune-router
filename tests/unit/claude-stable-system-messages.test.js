import { describe, expect, it } from "vitest";
import { normalizeClaudePassthrough, prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const stable = ["claude-fable-5-2", "claude-mythos-5-2", "claude-fable-5-1", "claude-mythos-5-1", "claude-fable-5", "claude-mythos-5", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-4-8"];
const bodyFor = model => ({ model, max_tokens: 1024, messages: [
  { role: "user", content: [{ type: "text", text: "Start." }] },
  { role: "assistant", content: [{ type: "text", text: "Prior output." }] },
  { role: "system", content: [{ type: "text", text: "Apply this new constraint." }] },
  { role: "user", content: [{ type: "text", text: "Continue." }] },
] });
const preparations = [
  (body, provider) => normalizeClaudePassthrough(body, body.model, null, provider),
  (body, provider) => prepareClaudeRequest(body, provider),
  (body, provider) => translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, body.model, body, false, { apiKey: "synthetic-key" }, provider),
];

describe("documented stable canonical Claude system-message support", () => {
  it.each(stable)("keeps ordinary %s system messages native without inventing an opt-in", model => {
    for (const provider of ["claude", "anthropic"]) {
      for (const prepare of preparations) {
        const source = bodyFor(model);
        const before = structuredClone(source);
        const wire = prepare(source, provider);
        expect(wire.messages.map(message => message.role)).toEqual(["user", "assistant", "system", "user"]);
        expect(wire.messages[2]).toEqual(before.messages[2]);
        expect(wire.messages[2]).not.toHaveProperty("output_config");
        expect(wire.messages[2]).not.toHaveProperty("clear_at");
      }
      const body = bodyFor(model);
      const headers = new Headers(new DefaultExecutor("anthropic").buildHeaders({ apiKey: "synthetic-key" }, false, model, body));
      for (const feature of ["mid-conversation-output-config-2026-07-01", "mid-conversation-system-clear-at-2026-08-21", "mid-conversation-tool-changes-2026-07-01", "thinking-binding-controls-2026-08-01", "inline-tools-2026-09-15"]) {
        expect(headers.get("anthropic-beta") || "").not.toContain(feature);
      }
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
    }
  });

  it.each(["claude-sonnet-5", "claude-sonnet-4-6", "claude-opus-5-5-preview", "claude-mythos-preview"])("does not infer stable support for unverified %s aliases", model => {
    const wire = normalizeClaudePassthrough(bodyFor(model), model, null, "claude");
    expect(wire.messages.some(message => message.role === "system")).toBe(false);
  });

  it.each(["openrouter", "anthropic-compatible-fixture", null])("does not infer a %s endpoint's capability from the canonical model label", provider => {
    const wire = normalizeClaudePassthrough(bodyFor("claude-opus-5-5"), "claude-opus-5-5", null, provider);
    expect(wire.messages.some(message => message.role === "system")).toBe(false);
  });
});
