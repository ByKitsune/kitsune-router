import { describe, expect, it } from "vitest";
import { anchorClaudeCache, normalizeClaudePassthrough, prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const model = "claude-opus-5-5";
const beta = "mid-conversation-output-config-2026-07-01";
const makeBody = () => ({
  model, max_tokens: 2048,
  system: [{ type: "text", text: "Original system instructions." }],
  messages: [
    { role: "user", content: "Solve the task." },
    { role: "system", content: [{ type: "text", text: "Use the new constraint." }], clear_at: "never" },
    { role: "system", content: [], output_config: { effort: "high" } },
  ],
});
const preparations = [
  ["native passthrough", (body, headers) => normalizeClaudePassthrough(body, body.model, headers, "claude")],
  ["prepared Messages", (body, headers) => prepareClaudeRequest(body, "claude", null, null, headers)],
  ["public same-format translation", (body, headers) => translateRequest(
    FORMATS.CLAUDE, FORMATS.CLAUDE, body.model, body, false, { apiKey: "fixture-key", rawHeaders: headers }, "claude",
  )],
];
const headerShapes = [
  { "AnThRoPiC-BeTa": `unrelated-fixture, ${beta}` },
  new Headers({ "anthropic-beta": `unrelated-fixture, ${beta}` }),
  { "anthropic-beta": ["unrelated-fixture", beta] },
];

describe.each(preparations)("opted-in native system messages through %s", (_label, prepare) => {
  it.each(headerShapes)("preserves system positions, separate entries and empty effort updates with %j", headers => {
    const body = makeBody();
    const expected = structuredClone(body.messages);
    const sent = prepare(body, headers);
    expect(sent.messages.map(message => message.role)).toEqual(expected.map(message => message.role));
    expect(sent.messages.slice(1)).toEqual(expected.slice(1));
    expect(sent.system[0].text).toBe("Original system instructions.");
  });

  it.each([
    "mid-conversation-system-clear-at-2026-08-21",
    "mid-conversation-tool-changes-2026-07-01",
    "inline-tools-2026-09-15",
    "thinking-binding-controls-2026-08-01",
  ])("keeps system instructions native with the exact %s opt-in", flag => {
    const body = makeBody();
    body.messages.pop();
    const expected = structuredClone(body.messages);
    const sent = prepare(body, { "anthropic-beta": flag });
    expect(sent.messages.map(message => message.role)).toEqual(expected.map(message => message.role));
    expect(sent.messages[1]).toEqual(expected[1]);
  });
});

describe("native system replay boundaries", () => {
  it("preserves explicit system updates on the canonical Anthropic API-key route", () => {
    const source = makeBody();
    const original = structuredClone(source);
    const sent = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, model, source, false,
      { apiKey: "fixture-key", rawHeaders: new Headers({ "anthropic-beta": beta }) }, "anthropic");
    expect(sent.messages.map(message => message.role)).toEqual(original.messages.map(message => message.role));
    expect(sent.messages.slice(1)).toEqual(original.messages.slice(1));
    expect(source).toEqual(original);
  });

  it("keeps the legacy native fold without a recognized explicit opt-in", () => {
    for (const value of [undefined, `${beta}-extra`, `prefix-${beta}`]) {
      const body = makeBody();
      // Sonnet 4.6 remains outside the documented stable model set. Opus 5.5
      // now retains ordinary system entries without a beta on canonical routes.
      body.model = "claude-sonnet-4-6";
      const sent = normalizeClaudePassthrough(body, body.model, { "anthropic-beta": value }, "claude");
      expect(sent.messages.map(message => message.role)).toEqual(["user"]);
      expect(sent.messages[0].content.map(block => block.text)).toEqual(["Solve the task.", "Use the new constraint."]);
    }
  });

  it("does not infer a compatible vendor's support from a Claude capability header", () => {
    const sent = normalizeClaudePassthrough(makeBody(), model, { "anthropic-beta": beta }, "anthropic-compatible-fixture");
    expect(sent.messages.map(message => message.role)).toEqual(["user"]);
  });

  it.each(preparations)("does not add a cache breakpoint to a turn-scoped message through %s", (_label, prepare) => {
    const body = makeBody();
    body.messages = [body.messages[0], { role: "system", clear_at: "next_user_message", content: [
      { type: "text", text: "Reminder for this turn only." },
    ] }];
    const expected = structuredClone(body.messages[1]);
    const sent = anchorClaudeCache(prepare(body, { "anthropic-beta": "mid-conversation-system-clear-at-2026-08-21" }));
    expect(sent.messages[1]).toEqual(expected);
    expect(JSON.stringify(sent.messages[0].content)).toContain("Solve the task.");
  });
});

describe.each(preparations)("tool continuity through a trailing system message — %s", (_label, prepare) => {
  const toolTurn = thinking => ({
    model, max_tokens: 2048, thinking: { type: "adaptive" },
    messages: [
      { role: "assistant", content: [...thinking, { type: "tool_use", id: "toolu_fixture", name: "lookup", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_fixture", content: "result" }] },
      { role: "system", content: [{ type: "text", text: "Continue with the result." }] },
    ],
  });
  const headers = { "anthropic-beta": "thinking-binding-controls-2026-08-01" };

  it.each([
    [{ type: "thinking", thinking: "original", signature: "" }, "signature"],
    [{ type: "thinking", thinking: "original", signature: null }, "signature"],
    [{ type: "redacted_thinking", data: "" }, "data"],
  ])("rejects missing original signed data without dropping it: %j", (block, field) => {
    const body = toolTurn([block]);
    const original = structuredClone(body);
    expect(() => prepare(body, headers)).toThrow(expect.objectContaining({
      code: "invalid_thought_signature", param: `messages.0.content.0.${field}`,
    }));
    expect(body).toEqual(original);
  });

  it("requires the original initial manual thinking before a tool result and system tail", () => {
    const body = toolTurn([]);
    body.model = "claude-sonnet-4-6";
    body.thinking = { type: "enabled", budget_tokens: 1024 };
    expect(() => prepare(body, headers)).toThrow(expect.objectContaining({ code: "missing_thought_signature" }));
  });

  it("keeps an adaptive tool turn with no invented thinking", () => {
    const sent = prepare(toolTurn([]), headers);
    expect(sent.messages[0].content.map(block => block.type)).toEqual(["tool_use"]);
    expect(sent.messages.at(-1).role).toBe("system");
  });
});
