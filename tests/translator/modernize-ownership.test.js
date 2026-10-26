import { describe, expect, it, vi } from "vitest";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest, translateResponse, initState } from "../../open-sse/translator/index.js";
import { filterToOpenAIFormat } from "../../open-sse/translator/formats/openai.js";
import { normalizeChatReasoningAliases } from "../../open-sse/translator/concerns/reasoningAliases.js";
import { fixMissingToolResponses } from "../../open-sse/translator/concerns/toolCall.js";
import { getThinkingContext, setThinkingContext, reconcileClaudeThinkingBudget } from "../../open-sse/translator/concerns/thinking.js";
import { lowerKimiDeferredTools } from "../../open-sse/translator/concerns/deferredTools.js";

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const call = (id, name = "lookup") => ({ id, type: "function", function: { name, arguments: "{}" } });
const canonical = () => ({ model: "gpt-4o", stream: true, vendor: { opaque: ["retain"] }, messages: [
  { role: "system", content: "system" },
  { role: "user", content: "question" },
  { role: "assistant", content: null, reasoning_content: "plan", tool_calls: [call("a"), call("b")] },
  { role: "tool", tool_call_id: "a", content: "first" },
  { role: "tool", tool_call_id: "b", content: "second" },
  { role: "user", content: "continue" },
], tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: {} } } }] });
const translate = (body, context) => translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "gpt-4o", body, true, null, "openai", null, [], null, null, { reasoning: false }, context);

describe("request ownership and canonical preparation", () => {
  it("retains the owned canonical body, messages, tools and nested schemas without structuredClone", () => {
    const body = canonical();
    const messages = body.messages;
    const tools = body.tools;
    const schema = tools[0].function.parameters;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(normalizeChatReasoningAliases(body)).toBe(body);
      expect(fixMissingToolResponses(body)).toBe(body);
      expect(filterToOpenAIFormat(body, { preserveDeveloperRole: true })).toBe(body);
      const out = translate(body, { ownership: "owned" });
      expect(out).toBe(body);
      expect(out.messages).toBe(messages);
      expect(out.tools).toBe(tools);
      expect(out.tools[0].function.parameters).toBe(schema);
      expect(clone).not.toHaveBeenCalled();
    } finally { clone.mockRestore(); }
  });

  it.each([
    [FORMATS.CLAUDE, "claude-sonnet-4.5", { max_tokens: 2048, opaque: { keep: true }, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] }],
    [FORMATS.OPENAI_RESPONSES, "gpt-4o", { input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }], opaque: { keep: true } }],
    [FORMATS.GEMINI, "gemini-2.5-flash", { contents: [{ role: "user", parts: [{ text: "hi" }] }], opaque: { keep: true } }],
  ])("does not whole-body clone an owned %s attempt", (format, model, source) => {
    const body = structuredClone(source);
    const opaque = body.opaque;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      const out = translateRequest(format, format, model, body, true, null, "offline-ownership", null, [], null, null, null, { ownership: "owned" });
      expect(out.opaque).toBe(opaque);
      expect(out.opaque).toEqual({ keep: true });
      expect(clone).not.toHaveBeenCalled();
    } finally { clone.mockRestore(); }
  });

  it("defaults to borrowed input and isolates arbitrary final-body hook mutations across attempts", () => {
    const body = freeze(canonical());
    const before = JSON.stringify(body);
    const first = translate(body);
    first.messages[0].content = "hook";
    first.tools[0].function.parameters.properties.hook = { type: "string" };
    first.vendor.opaque.push("hook");
    const second = translate(body, { ownership: "borrowed" });
    expect(second.messages[0].content).toBe("system");
    expect(second.tools[0].function.parameters.properties).toEqual({});
    expect(second.vendor.opaque).toEqual(["retain"]);
    expect(JSON.stringify(body)).toBe(before);
    expect(() => translate(body, { ownership: "unsafe" })).toThrow(TypeError);
  });

  it("isolates schema branch normalization from the borrowed properties map", () => {
    const source = canonical();
    source.tools[0].function.parameters = { type: "object", properties: {}, anyOf: [{ type: "object", properties: { key: { type: "string" } } }] };
    freeze(source);
    const out = translateRequest(FORMATS.OPENAI, FORMATS.CLAUDE, "claude-sonnet-4.5", source, true, null, "offline-ownership");
    expect(out.tools[0].input_schema.properties).toEqual({ key: { type: "string" } });
    expect(source.tools[0].function.parameters.properties).toEqual({});
  });

  it("does not share standard Gemini schemas or safety defaults between hook attempts", () => {
    const source = freeze(canonical());
    const run = () => translateRequest(FORMATS.OPENAI, FORMATS.GEMINI, "gemini-2.5-flash", source, true);
    const first = run();
    first.tools[0].functionDeclarations[0].parametersJsonSchema.properties.hook = { type: "boolean" };
    first.safetySettings[0].threshold = "HOOK";
    const second = run();
    expect(second.tools[0].functionDeclarations[0].parametersJsonSchema.properties).toEqual({});
    expect(second.safetySettings[0].threshold).toBe("OFF");
    expect(source.tools[0].function.parameters.properties).toEqual({});
  });

  it("reconciles partial parallel results without replacing or duplicating supplied replies", () => {
    const body = canonical();
    body.messages.splice(4, 1);
    const first = body.messages[3];
    fixMissingToolResponses(body);
    expect(body.messages.filter(message => message.role === "tool")).toEqual([
      first, { role: "tool", tool_call_id: "b", content: "" },
    ]);
    const messages = body.messages;
    fixMissingToolResponses(body);
    expect(body.messages).toBe(messages);
    expect(body.messages.at(-1).content).toBe("continue");
  });

  it("keeps partial native parallel results before the adjacent user text", () => {
    const first = { type: "tool_result", tool_use_id: "a", content: "first" };
    const text = { type: "text", text: "continue" };
    const body = { messages: [
      { role: "assistant", content: ["a", "b"].map(id => ({ type: "tool_use", id, name: "lookup", input: {} })) },
      { role: "user", content: [first, text] },
    ] };
    fixMissingToolResponses(body);
    expect(body.messages[1].content).toEqual([first, { type: "tool_result", tool_use_id: "b", content: "" }, text]);
    expect(body.messages[1].content[0]).toBe(first);
    expect(body.messages).toHaveLength(2);
    const messages = body.messages;
    fixMissingToolResponses(body);
    expect(body.messages).toBe(messages);
  });

  it("preserves private generated thinking provenance through deferred-tools ownership", () => {
    const body = { max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 8192 }, messages: [
      { role: "user", content: [{ type: "tool_addition", tool: { type: "tool_definition", definition: {
        name: "lookup", input_schema: { type: "object", properties: {} },
      } } }, { type: "text", text: "run" }] },
    ] };
    setThinkingContext(body, { providerDefault: true, explicitBudget: false, requestedModel: "test-model", outputParam: "max_tokens" });
    freeze(body);
    const out = lowerKimiDeferredTools(body);
    expect(getThinkingContext(out)).toEqual(getThinkingContext(body));
    reconcileClaudeThinkingBudget(out);
    expect(out.max_tokens).toBe(4096);
    expect(out.thinking.budget_tokens).toBeLessThan(4096);
    expect(getThinkingContext(out).explicitBudget).toBe(false);
    expect(JSON.stringify(out)).not.toContain("providerDefault");
    expect(body.messages[0].content[0].type).toBe("tool_addition");
    const attempt = structuredClone(body);
    setThinkingContext(attempt, getThinkingContext(body));
    expect(lowerKimiDeferredTools(attempt, { ownership: "owned" })).toBe(attempt);
    const full = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, "k3", body, false, null, "kimi");
    expect(getThinkingContext(full)).toMatchObject({ providerDefault: true, explicitBudget: false, requestedModel: "test-model" });
    expect(full.tools[0].name).toBe("lookup");
    expect(full.messages[0].content).toEqual([{ type: "text", text: "run" }]);
  });
});

it.each([FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES, FORMATS.GEMINI])("native %s errors never swallow a later opaque terminal", format => {
  const state = { ...initState(format), responseErrorSent: true };
  const terminal = format === FORMATS.CLAUDE ? { type: "message_stop", opaque: { trace: "native" } }
    : format === FORMATS.OPENAI_RESPONSES ? { event: "response.failed", data: { type: "response.failed", response: { status: "failed", opaque: "native" } } }
      : format === FORMATS.GEMINI ? { candidates: [{ finishReason: "OTHER" }], opaque: { trace: "native" } }
        : { choices: [{ delta: {}, finish_reason: "stop" }], opaque: { trace: "native" } };
  expect(translateResponse(format, format, terminal, state)).toEqual([terminal]);
  expect(translateResponse(format, format, terminal, state)[0]).toBe(terminal);
});
