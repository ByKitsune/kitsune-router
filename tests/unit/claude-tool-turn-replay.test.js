import { describe, expect, it } from "vitest";
import { prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const model = "claude-opus-5-5";
const assistantContent = [
  { type: "thinking", thinking: "", signature: "original-opaque-signature" },
  { type: "text", text: "I will inspect the inputs." },
  { type: "tool_use", id: "toolu_first", name: "lookup", input: { key: "first" } },
  { type: "text", text: "I will also inspect the second input." },
  { type: "redacted_thinking", data: "original-encrypted-data" },
  { type: "thinking", thinking: "Progress update", signature: "second-opaque-signature" },
  { type: "tool_use", id: "toolu_second", name: "lookup", input: { key: "second" } },
  { type: "text", text: "Both lookups are requested." },
];
const makeBody = () => ({
  model, max_tokens: 2048, thinking: { type: "adaptive" },
  tools: [{ name: "lookup", input_schema: { type: "object", properties: { key: { type: "string" } } } }],
  messages: [
    { role: "user", content: "Inspect both inputs." },
    { role: "assistant", content: structuredClone(assistantContent) },
    { role: "user", content: [
      { type: "tool_result", tool_use_id: "toolu_first", content: "first result" },
      { type: "tool_result", tool_use_id: "toolu_second", content: "second result" },
    ] },
  ],
});
const preparations = [
  ["prepared Messages", body => prepareClaudeRequest(body, "claude")],
  ["public same-format translation", body => translateRequest(
    FORMATS.CLAUDE, FORMATS.CLAUDE, model, body, false, { apiKey: "fixture-key" }, "claude",
  )],
];

describe("original assistant tool-turn replay", () => {
  it.each(preparations)("preserves every block after tool_use in original order through %s", (_label, prepare) => {
    const sent = prepare(makeBody());
    const content = sent.messages[1].content.map(({ cache_control, ...block }) => block);
    expect(content).toEqual(assistantContent);
    expect(sent.messages[2].content.map(block => block.tool_use_id)).toEqual(["toolu_first", "toolu_second"]);
  });

  it("keeps borrowed caller history unchanged when preparing mixed tool blocks", () => {
    const source = makeBody();
    const original = structuredClone(source);
    preparations[1][1](source);
    expect(source).toEqual(original);
  });
});
