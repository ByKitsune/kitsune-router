import { describe, expect, it } from "vitest";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest } from "../../open-sse/translator/index.js";

const formats = [FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES, FORMATS.GEMINI];
const png = "iVBORw0KGgo=";
const image = `data:image/png;base64,${png}`;
const schema = () => ({ type: "object", properties: { key: { type: "string" } }, required: ["key"] });
const fixtures = {
  [FORMATS.OPENAI]: () => ({ max_tokens: 4096, reasoning_effort: "low", messages: [
    { role: "system", content: "System matrix" },
    { role: "user", content: [{ type: "text", text: "Inspect" }, { type: "image_url", image_url: { url: image } }] },
    { role: "assistant", content: null, reasoning_content: "Plan matrix", tool_calls: [{ id: "call_matrix", type: "function", function: { name: "lookup", arguments: '{"key":"value"}' } }] },
    { role: "tool", tool_call_id: "call_matrix", content: "Result matrix" },
    { role: "user", content: "Continue matrix" },
  ], tools: [{ type: "function", function: { name: "lookup", parameters: schema() } }], tool_choice: { type: "function", function: { name: "lookup" } } }),
  [FORMATS.CLAUDE]: () => ({ max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 1024 }, system: "System matrix", messages: [
    { role: "user", content: [{ type: "text", text: "Inspect" }, { type: "image", source: { type: "base64", media_type: "image/png", data: png } }] },
    { role: "assistant", content: [{ type: "thinking", thinking: "Plan matrix", signature: "opaque-signature" }, { type: "tool_use", id: "call_matrix", name: "lookup", input: { key: "value" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "call_matrix", content: "Result matrix" }, { type: "text", text: "Continue matrix" }] },
  ], tools: [{ name: "lookup", input_schema: schema() }], tool_choice: { type: "tool", name: "lookup" } }),
  [FORMATS.OPENAI_RESPONSES]: () => ({ max_output_tokens: 4096, reasoning: { effort: "low", summary: "auto" }, instructions: "System matrix", input: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "Inspect" }, { type: "input_image", image_url: image }] },
    { type: "reasoning", summary: [{ type: "summary_text", text: "Plan matrix" }] },
    { type: "function_call", call_id: "call_matrix", name: "lookup", arguments: '{"key":"value"}' },
    { type: "function_call_output", call_id: "call_matrix", output: "Result matrix" },
    { type: "message", role: "user", content: [{ type: "input_text", text: "Continue matrix" }] },
  ], tools: [{ type: "function", name: "lookup", parameters: schema() }], tool_choice: { type: "function", name: "lookup" } }),
  [FORMATS.GEMINI]: () => ({ generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 1024, includeThoughts: true } },
    systemInstruction: { parts: [{ text: "System matrix" }] }, contents: [
      { role: "user", parts: [{ text: "Inspect" }, { inlineData: { mimeType: "image/png", data: png } }] },
      { role: "model", parts: [{ thought: true, text: "Plan matrix" }, { functionCall: { id: "call_matrix", name: "lookup", args: { key: "value" } } }] },
      { role: "user", parts: [{ functionResponse: { id: "call_matrix", name: "lookup", response: { result: "Result matrix" } } }, { text: "Continue matrix" }] },
    ], tools: [{ functionDeclarations: [{ name: "lookup", parametersJsonSchema: schema() }] }], toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["lookup"] } } }),
};
const models = { [FORMATS.OPENAI]: "gpt-4o", [FORMATS.CLAUDE]: "claude-sonnet-4.5", [FORMATS.OPENAI_RESPONSES]: "gpt-4o", [FORMATS.GEMINI]: "gemini-2.5-flash" };
const caps = { reasoning: true, thinkingCanDisable: true, thinkingRange: { min: 0, max: 32768 }, maxOutput: 64000 };

function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function assertRequestWire(out, target) {
  if (target === FORMATS.OPENAI) {
    expect(out.messages.find(message => message.role === "system").content).toBe("System matrix");
    const call = out.messages.find(message => message.tool_calls).tool_calls[0];
    expect(call).toMatchObject({ id: "call_matrix", function: { name: "lookup", arguments: '{"key":"value"}' } });
    const result = out.messages.find(message => message.role === "tool");
    expect(result.tool_call_id).toBe("call_matrix");
    expect(result.content.startsWith("{") ? JSON.parse(result.content) : { result: result.content }).toEqual({ result: "Result matrix" });
    expect(out.messages.find(message => message.reasoning_content).reasoning_content).toBe("Plan matrix");
    expect(out.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).find(part => part.type === "image_url").image_url.url).toBe(image);
    expect(out.tools[0].function.parameters).toEqual(schema());
    expect(out.tool_choice).toEqual({ type: "function", function: { name: "lookup" } });
    expect(out.reasoning_effort).toBe("low");
    expect(out.max_tokens).toBe(4096);
  } else if (target === FORMATS.CLAUDE) {
    expect(typeof out.system === "string" ? out.system : out.system.map(part => part.text).join("\n")).toBe("System matrix");
    const blocks = out.messages.flatMap(message => message.content);
    expect(blocks.find(part => part.type === "tool_use")).toMatchObject({ id: "call_matrix", name: "lookup", input: { key: "value" } });
    const result = blocks.find(part => part.type === "tool_result");
    expect(result.tool_use_id).toBe("call_matrix");
    expect(result.content.startsWith("{") ? JSON.parse(result.content) : { result: result.content }).toEqual({ result: "Result matrix" });
    expect(blocks.find(part => part.type === "image").source).toEqual({ type: "base64", media_type: "image/png", data: png });
    expect(blocks.find(part => part.type === "thinking").thinking).toBe("Plan matrix");
    expect(out.tools[0].input_schema).toMatchObject(schema());
    expect(out.tool_choice).toMatchObject({ type: "tool", name: "lookup" });
    expect(out.thinking.type).toBe("enabled");
    expect(out.max_tokens).toBe(4096);
  } else if (target === FORMATS.OPENAI_RESPONSES) {
    expect(out.instructions).toBe("System matrix");
    expect(out.input.find(item => item.type === "function_call")).toMatchObject({ call_id: "call_matrix", name: "lookup", arguments: '{"key":"value"}' });
    const result = out.input.find(item => item.type === "function_call_output");
    expect(result.call_id).toBe("call_matrix");
    expect(result.output.startsWith("{") ? JSON.parse(result.output) : { result: result.output }).toEqual({ result: "Result matrix" });
    expect(out.input.find(item => item.type === "reasoning").summary).toEqual([{ type: "summary_text", text: "Plan matrix" }]);
    expect(out.input.flatMap(item => item.content || []).find(part => part.type === "input_image").image_url).toBe(image);
    expect(out.tools[0].parameters).toMatchObject(schema());
    expect(out.tool_choice).toEqual({ type: "function", name: "lookup" });
    expect(out.reasoning).toMatchObject({ effort: "low" });
    expect(out.max_output_tokens).toBe(4096);
  } else {
    expect(out.systemInstruction.parts.map(part => part.text).join("")).toBe("System matrix");
    const parts = out.contents.flatMap(content => content.parts);
    expect(parts.find(part => part.functionCall).functionCall).toMatchObject({ id: "call_matrix", name: "lookup", args: { key: "value" } });
    expect(parts.find(part => part.functionResponse).functionResponse).toMatchObject({ id: "call_matrix", name: "lookup", response: { result: "Result matrix" } });
    expect(parts.filter(part => part.thought).map(part => part.text).join("")).toBe("Plan matrix");
    const media = parts.find(part => part.inlineData).inlineData;
    expect(media.mimeType || media.mime_type).toBe("image/png");
    expect(media.data).toBe(png);
    expect(out.tools[0].functionDeclarations[0].parametersJsonSchema).toEqual(schema());
    expect(out.toolConfig.functionCallingConfig).toEqual({ mode: "ANY", allowedFunctionNames: ["lookup"] });
    expect(out.generationConfig.thinkingConfig.includeThoughts).toBe(true);
    expect(out.generationConfig.maxOutputTokens).toBe(4096);
  }
}

describe.each(formats)("%s request protocol matrix", source => {
  it.each(formats)("serializes complete history to %s with immutable borrowed input", target => {
    const body = freeze(fixtures[source]());
    const before = JSON.stringify(body);
    const out = translateRequest(source, target, models[target], body, true, null, "offline-matrix", null, [], null, null, caps);
    assertRequestWire(out, target);
    expect(JSON.stringify(body)).toBe(before);
    expect(out).not.toBe(body);
    expect(JSON.stringify(out)).not.toContain("unsupported");
  });
});

it("maps colliding long Responses call IDs deterministically without changing short native IDs", () => {
  const prefix = "call_" + "x".repeat(70);
  const ids = [prefix + "first", prefix + "second", "short_native"];
  const body = { messages: [
    { role: "assistant", content: null, tool_calls: ids.map((id, index) => ({ id, type: "function", function: { name: "lookup", arguments: JSON.stringify({ index }) } })) },
    ...ids.map((id, index) => ({ role: "tool", tool_call_id: id, content: `result-${index}` })),
  ] };
  const run = () => translateRequest(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, "gpt-4o", body, true);
  const out = run();
  const calls = out.input.filter(item => item.type === "function_call");
  const results = out.input.filter(item => item.type === "function_call_output");
  expect(new Set(calls.map(call => call.call_id)).size).toBe(3);
  expect(calls.every(call => call.call_id.length <= 64)).toBe(true);
  expect(calls[2].call_id).toBe("short_native");
  expect(results.map(result => result.call_id)).toEqual(calls.map(call => call.call_id));
  expect(results.map(result => result.output)).toEqual(["result-0", "result-1", "result-2"]);
  expect(run().input).toEqual(out.input);
});

it.each(["audio/wav", "application/pdf", "video/mp4"])("rejects unsupported native Gemini %s cross-format input instead of dropping or stringifying bytes", mimeType => {
  const body = { contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: "opaque-bytes" } }] }] };
  expect(() => translateRequest(FORMATS.GEMINI, FORMATS.OPENAI, "gpt-4o", body)).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "contents.0.parts.0" }));
  expect(translateRequest(FORMATS.GEMINI, FORMATS.GEMINI, "gemini-2.5-flash", body).contents).toEqual(body.contents);
});
