import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const ids = ["call:1", "call/1", "call1"];
function chatHistory() {
  return { max_tokens: 512, tools: [{ type: "function", function: { name: "read", parameters: { type: "object", properties: { slot: { type: "number" } } } } }], messages: [
    { role: "user", content: "Read the three slots." },
    { role: "assistant", content: null, tool_calls: ids.map((id, index) => ({ id, type: "function", function: { name: "read", arguments: JSON.stringify({ slot: index + 1 }) } })) },
    ...ids.map((id, index) => ({ role: "tool", tool_call_id: id, content: `result for slot ${index + 1}` })),
  ] };
}
function geminiHistory() {
  return { generationConfig: { maxOutputTokens: 512 }, tools: [{ functionDeclarations: [{ name: "read", parametersJsonSchema: { type: "object", properties: { slot: { type: "number" } } } }] }], contents: [
    { role: "user", parts: [{ text: "Read the three slots." }] },
    { role: "model", parts: ids.map((id, index) => ({ functionCall: { id, name: "read", args: { slot: index + 1 } } })) },
    { role: "user", parts: ids.map((id, index) => ({ functionResponse: { id, name: "read", response: { result: `result for slot ${index + 1}` } } })) },
  ] };
}

describe("Messages tool IDs keep execution ownership across format conversion", () => {
  it.each([[FORMATS.OPENAI, chatHistory], [FORMATS.GEMINI, geminiHistory]])("keeps distinct %s call/result pairs after applying the Messages ID alphabet", (source, makeBody) => {
    const wire = translateRequest(source, FORMATS.CLAUDE, "claude-sonnet-4-6", makeBody(), false, { apiKey: "offline-fixture" }, "anthropic");
    const blocks = wire.messages.flatMap(message => Array.isArray(message.content) ? message.content : []);
    const calls = blocks.filter(block => block.type === "tool_use");
    const results = blocks.filter(block => block.type === "tool_result");
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map(call => call.id)).size).toBe(3);
    expect(calls.every(call => /^[a-zA-Z0-9_-]+$/.test(call.id))).toBe(true);
    expect(results).toHaveLength(3);
    for (const call of calls) {
      const result = results.find(result => result.tool_use_id === call.id);
      const text = typeof result?.content === "string" ? result.content : JSON.stringify(result?.content);
      expect(text).toContain(`result for slot ${call.input.slot}`);
      for (const other of calls.filter(other => other !== call)) expect(text).not.toContain(`result for slot ${other.input.slot}`);
    }
  });
});
