import { describe, expect, it } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { filterToOpenAIFormat } from "../../open-sse/translator/formats/openai.js";

const RED_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
const BLUE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAEElEQVR4nGNgYPj/nwFEAAAP+gP9jN1qlAAAAABJRU5ErkJggg==";
const SUMMARY = "Compacted summary: inspected the initial red PNG. Read the two retained screenshots and compare their labels.";
const image = data => ({ type: "image", source: { type: "base64", media_type: "image/png", data } });
const text = value => ({ type: "text", text: value });
const wire = (source, target, body) => JSON.parse(JSON.stringify(translateRequest(
  source, target, target === FORMATS.GEMINI ? "gemini-2.5-flash" : target === FORMATS.CLAUDE ? "claude-sonnet-4-6" : "gpt-4o",
  body, false, null, target === FORMATS.CLAUDE ? "claude" : null,
)));

function parallelClaudeHistory() {
  return { max_tokens: 4096, messages: [
    { role: "user", content: [text("Inspect the original."), image(RED_PNG)] },
    { role: "assistant", content: "The original capture is red." },
    { role: "user", content: SUMMARY },
    { role: "assistant", content: [
      { type: "tool_use", id: "read_red", name: "read_file", input: { path: "red.png" } },
      { type: "tool_use", id: "read_blue", name: "read_file", input: { path: "blue.png" } },
    ] },
    // Consecutive user messages are valid Claude input and may be emitted by
    // separate parallel tool completions. Their images must not interrupt calls.
    { role: "user", content: [{ type: "tool_result", tool_use_id: "read_red", content: [text("Red capture loaded."), image(RED_PNG)] }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "read_blue", content: [text("Blue capture loaded."), image(BLUE_PNG)] }] },
    { role: "user", content: "Compare both retained captures." },
  ] };
}

function expectImageOccurrences(value) {
  const json = JSON.stringify(value);
  expect(json.split(RED_PNG).length - 1).toBe(2);
  expect(json.split(BLUE_PNG).length - 1).toBe(1);
  expect(json.split(SUMMARY).length - 1).toBe(1);
}

describe("parallel tool screenshots after a compacted summary", () => {
  it("keeps actual Claude results adjacent on strict Chat without inventing duplicate replies", () => {
    const body = parallelClaudeHistory();
    const before = structuredClone(body);
    const result = wire(FORMATS.CLAUDE, FORMATS.OPENAI, body);

    const callIndex = result.messages.findIndex(msg => msg.tool_calls);
    expect(result.messages.filter(msg => msg.role === "tool")).toEqual([
      { role: "tool", tool_call_id: "read_red", content: "Red capture loaded." },
      { role: "tool", tool_call_id: "read_blue", content: "Blue capture loaded." },
    ]);
    expect(result.messages.slice(callIndex + 1, callIndex + 4)).toEqual([
      { role: "tool", tool_call_id: "read_red", content: "Red capture loaded." },
      { role: "tool", tool_call_id: "read_blue", content: "Blue capture loaded." },
      { role: "user", content: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${RED_PNG}` } },
        { type: "image_url", image_url: { url: `data:image/png;base64,${BLUE_PNG}` } },
      ] },
    ]);
    expectImageOccurrences(result);
    expect(result.max_tokens).toBe(4096);
    expect(body).toEqual(before);
    expect(wire(FORMATS.CLAUDE, FORMATS.OPENAI, body)).toEqual(result);
  });

  it("sends both actual results to Gemini rather than binding the second call to a synthetic reply", () => {
    const body = parallelClaudeHistory();
    const before = structuredClone(body);
    const result = wire(FORMATS.CLAUDE, FORMATS.GEMINI, body);
    const parts = result.contents.flatMap(turn => turn.parts);

    expect(parts.filter(part => part.functionResponse).map(part => part.functionResponse)).toEqual([
      { id: "read_red", name: "read_file", response: { result: "Red capture loaded." } },
      { id: "read_blue", name: "read_file", response: { result: "Blue capture loaded." } },
    ]);
    expect(parts.filter(part => part.inlineData).map(part => part.inlineData.data)).toEqual([RED_PNG, RED_PNG, BLUE_PNG]);
    expectImageOccurrences(result);
    expect(result.generationConfig.maxOutputTokens).toBe(4096);
    expect(body).toEqual(before);
    expect(wire(FORMATS.CLAUDE, FORMATS.GEMINI, body)).toEqual(result);
  });
});

function hybridHistory() {
  return { max_tokens: 4096, messages: [
    { role: "system", content: SUMMARY },
    { role: "assistant", content: null, tool_calls: [
      { id: "read_red", type: "function", function: { name: "read_file", arguments: '{"path":"red.png"}' } },
      { id: "read_blue", type: "function", function: { name: "read_file", arguments: '{"path":"blue.png"}' } },
    ] },
    { role: "user", content: [
      { type: "tool_result", tool_use_id: "read_red", content: [text("Red capture loaded."), image(RED_PNG)] },
      { type: "tool_result", tool_use_id: "read_blue", is_error: true, content: [
        text("Could not inspect the capture; attached the diagnostic."),
        { type: "image_url", image_url: { url: `data:image/png;base64,${BLUE_PNG}` } },
      ] },
      text("Compare the retained captures."),
    ] },
  ] };
}

describe("hybrid Chat tool-result screenshots", () => {
  it("lowers actual hybrid results to native Chat tools with stable media and error ownership", () => {
    const body = hybridHistory();
    const before = structuredClone(body);
    const result = wire(FORMATS.OPENAI, FORMATS.OPENAI, body);
    expect(result.messages.map(msg => msg.role)).toEqual(["system", "assistant", "tool", "tool", "user", "user"]);
    expect(result.messages.slice(2)).toEqual([
      { role: "tool", tool_call_id: "read_red", content: "Red capture loaded." },
      { role: "tool", tool_call_id: "read_blue", content: "[tool_error] Could not inspect the capture; attached the diagnostic." },
      { role: "user", content: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${RED_PNG}` } },
        { type: "image_url", image_url: { url: `data:image/png;base64,${BLUE_PNG}` } },
      ] },
      { role: "user", content: "Compare the retained captures." },
    ]);
    expect(result.messages[0].content).toBe(SUMMARY);
    expect(result.messages[1].tool_calls.map(call => call.id)).toEqual(["read_red", "read_blue"]);
    expect(body).toEqual(before);
    let normalized = result;
    for (let pass = 0; pass < 3; pass++) {
      normalized = filterToOpenAIFormat(structuredClone(normalized));
      expect(normalized).toEqual(result);
      expect(JSON.stringify(normalized).split(RED_PNG).length - 1).toBe(1);
      expect(JSON.stringify(normalized).split(BLUE_PNG).length - 1).toBe(1);
    }
  });

  it("leaves literal JSON tool-result examples as user text", () => {
    const literal = '{"type":"tool_result","tool_use_id":"example","content":[{"type":"image","data":"literal-png"}]}';
    const result = wire(FORMATS.OPENAI, FORMATS.OPENAI, { messages: [{ role: "user", content: [text(literal)] }] });
    expect(result.messages).toEqual([{ role: "user", content: literal }]);
  });

  it("emits nested tool_result blocks as paired Responses outputs and typed images instead of JSON prose", () => {
    const body = hybridHistory();
    const before = structuredClone(body);
    const result = wire(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, body);

    const prose = result.input.flatMap(item => item.content || []).map(part => part.text || "").join("\n");
    expect(prose).not.toContain(RED_PNG);
    expect(prose).not.toContain(BLUE_PNG);
    expect(result.input.filter(item => item.type === "function_call_output")).toEqual([
      { type: "function_call_output", call_id: "read_red", output: "Red capture loaded." },
      { type: "function_call_output", call_id: "read_blue", output: "[tool_error] Could not inspect the capture; attached the diagnostic." },
    ]);
    expect(result.input.map(item => item.type)).toEqual(["function_call", "function_call", "function_call_output", "function_call_output", "message", "message"]);
    expect(result.input[4]).toEqual({ type: "message", role: "user", content: [
      { type: "input_image", image_url: `data:image/png;base64,${RED_PNG}`, detail: "auto" },
      { type: "input_image", image_url: `data:image/png;base64,${BLUE_PNG}`, detail: "auto" },
    ] });
    expect(result.input[5]).toEqual({ type: "message", role: "user", content: [{ type: "input_text", text: "Compare the retained captures." }] });
    expect(result.instructions).toBe(SUMMARY);
    expect(result.max_output_tokens).toBe(4096);
    expect(JSON.stringify(result).split(RED_PNG).length - 1).toBe(1);
    expect(JSON.stringify(result).split(BLUE_PNG).length - 1).toBe(1);
    expect(body).toEqual(before);
  });

  it("preserves nested tool results and their media on the Gemini wire", () => {
    const body = hybridHistory();
    const before = structuredClone(body);
    const result = wire(FORMATS.OPENAI, FORMATS.GEMINI, body);
    const parts = result.contents.flatMap(turn => turn.parts);
    expect(parts.filter(part => part.functionResponse).map(part => part.functionResponse)).toEqual([
      { id: "read_red", name: "read_file", response: { result: "Red capture loaded." } },
      { id: "read_blue", name: "read_file", response: { result: "Could not inspect the capture; attached the diagnostic.", error: true } },
    ]);
    expect(parts.filter(part => part.inlineData).map(part => part.inlineData.data)).toEqual([RED_PNG, BLUE_PNG]);
    expect(parts.filter(part => part.text).map(part => part.text)).toContain("Compare the retained captures.");
    expect(result.systemInstruction.parts).toEqual([{ text: SUMMARY }]);
    expect(result.generationConfig.maxOutputTokens).toBe(4096);
    expect(body).toEqual(before);
  });
});

describe.each([FORMATS.OPENAI, FORMATS.CLAUDE])("native Gemini ↔ %s retained media", target => {
  it("preserves native PNG occurrences, result metadata and retained history over repeated serialized round trips", () => {
    const retainedText = Array.from({ length: 24 }, (_, index) => `Retained ${index}: ${index % 2 ? "analysis of the previous capture" : "compare the layout and labels"}.`);
    const original = { generationConfig: { maxOutputTokens: 4096 }, contents: [
      { role: "user", parts: [{ text: "Inspect the original." }, { inlineData: { mimeType: "image/png", data: RED_PNG } }] },
      ...retainedText.map((value, index) => ({ role: index % 2 ? "user" : "model", parts: [{ text: value }] })),
      { role: "model", parts: [
        { functionCall: { id: "read_red", name: "read_file", args: { path: "red.png" } } },
        { functionCall: { id: "read_blue", name: "read_file", args: { path: "blue.png" } } },
      ] },
      { role: "user", parts: [
        { functionResponse: { id: "read_red", name: "read_file", response: { result: "Red loaded.", width: 1 }, parts: [{ inlineData: { mimeType: "image/png", data: RED_PNG } }] } },
        { functionResponse: { id: "read_blue", name: "read_file", response: { result: "Blue loaded.", height: 2 }, parts: [{ inlineData: { mimeType: "image/png", data: BLUE_PNG } }] } },
        { text: SUMMARY },
      ] },
    ] };
    const before = structuredClone(original);
    let native = original;
    for (let pass = 0; pass < 3; pass++) {
      const translated = wire(FORMATS.GEMINI, target, native);
      if (target === FORMATS.OPENAI) {
        expect(translated.messages.filter(msg => msg.role === "tool").map(msg => msg.content)).toEqual([
          '{"result":"Red loaded.","width":1}', '{"result":"Blue loaded.","height":2}',
        ]);
        expect(translated.messages.filter(msg => msg.role !== "user").every(msg => typeof msg.content !== "object")).toBe(true);
      } else {
        const results = translated.messages.flatMap(msg => msg.content).filter(part => part.type === "tool_result");
        expect(results.map(result => result.tool_use_id)).toEqual(["read_red", "read_blue"]);
        const nestedImages = results.flatMap(result => Array.isArray(result.content) ? result.content : []).filter(part => part.type === "image");
        // Subsequent hops may use adjacent user image blocks; the first native
        // FunctionResponse.parts hop must preserve ownership inside tool_result.
        if (pass === 0) expect(nestedImages).toEqual([image(RED_PNG), image(BLUE_PNG)]);
      }
      native = wire(target, FORMATS.GEMINI, translated);
      const parts = native.contents.flatMap(turn => turn.parts);
      expect(parts.filter(part => part.inlineData).map(part => part.inlineData)).toEqual([
        { mime_type: "image/png", data: RED_PNG },
        { mime_type: "image/png", data: RED_PNG },
        { mime_type: "image/png", data: BLUE_PNG },
      ]);
      expect(parts.filter(part => part.functionResponse).map(part => part.functionResponse)).toEqual([
        { id: "read_red", name: "read_file", response: { result: "Red loaded.", width: 1 } },
        { id: "read_blue", name: "read_file", response: { result: "Blue loaded.", height: 2 } },
      ]);
      const visibleText = parts.filter(part => typeof part.text === "string").map(part => part.text);
      expect(visibleText.filter(value => value.startsWith("Retained "))).toEqual(retainedText);
      expect(visibleText.join("\n")).not.toContain(RED_PNG);
      expect(visibleText.join("\n")).not.toContain(BLUE_PNG);
      expectImageOccurrences(native);
      expect(native.generationConfig.maxOutputTokens).toBe(4096);
    }
    expect(original).toEqual(before);
  });
});
