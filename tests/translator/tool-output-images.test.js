import { describe, it, expect } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { TOOL_ERROR_PREFIX } from "../../open-sse/translator/schema/index.js";
import { convertResponsesApiFormat } from "../../open-sse/translator/formats/responsesApi.js";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.js";
import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.js";

const data = "iVBORw0KGgoAAAANSUhEUg==";
const url = `data:image/png;base64,${data}`;
const output = [
  { type: "input_text", text: "Screenshot captured\nexactly" },
  { type: "input_image", image_url: url },
  { type: "input_image", image_url: { url: "https://example.com/screenshot.png" } },
];
const body = (result = output) => ({ input: [
  { type: "function_call", call_id: "call_screenshot", name: "screenshot", arguments: "{}" },
  { type: "function_call_output", call_id: "call_screenshot", output: result, is_error: true },
] });
const translate = (target, input) => translateRequest(FORMATS.OPENAI_RESPONSES, target, "claude-sonnet-4", input, false, null, "claude");

describe("Responses screenshot tool output (#4517)", () => {
  for (const [name, convert] of [
    ["translator intermediate", (input) => openaiResponsesToOpenAIRequest("claude-sonnet-4", input, false)],
    ["worker helper", convertResponsesApiFormat],
  ]) {
    it(`${name} preserves normalized multimodal output and pairing`, () => {
      const tool = convert(body()).messages.find((msg) => msg.role === "tool");
      expect(tool).toEqual({ role: "tool", tool_call_id: "call_screenshot", is_error: true, content: [
        { type: "text", text: output[0].text },
        { type: "image_url", image_url: { url, detail: "auto" } },
        { type: "image_url", image_url: { url: output[2].image_url.url, detail: "auto" } },
      ] });
    });
    it(`${name} leaves plain text output unchanged`, () => {
      expect(convert(body("plain\nresult")).messages.find((msg) => msg.role === "tool").content).toBe("plain\nresult");
    });
  }
  it("preserves image bytes, text, call id and error flag through Claude", () => {
    const result = translate(FORMATS.CLAUDE, body());
    const blocks = result.messages.flatMap((msg) => msg.content);
    expect(blocks.find((block) => block.type === "tool_use").id).toBe("call_screenshot");
    expect(blocks.find((block) => block.type === "tool_result")).toMatchObject({
      type: "tool_result", tool_use_id: "call_screenshot", is_error: true, content: [
        { type: "text", text: output[0].text },
        { type: "image", source: { type: "base64", media_type: "image/png", data } },
        { type: "image", source: { type: "url", url: output[2].image_url.url } },
      ],
    });
  });
  it("repairs missing output call ids without flattening multimodal content", () => {
    const input = body();
    delete input.input[1].call_id;
    for (const result of [openaiResponsesToOpenAIRequest("claude-sonnet-4", input, false), convertResponsesApiFormat(input)]) {
      const tool = result.messages.find((msg) => msg.role === "tool");
      expect(tool.tool_call_id).toBe("call_screenshot");
      expect(tool.content[1]).toEqual({ type: "image_url", image_url: { url, detail: "auto" } });
    }
  });
  it("retains already normalized text and image blocks", () => {
    const content = [{ type: "text", text: "normalized" }, { type: "image_url", image_url: { url } }];
    expect(convertResponsesApiFormat(body(content)).messages.find((msg) => msg.role === "tool").content).toEqual(content);
  });
  it("lowers screenshots to valid final Chat tool text and a following user image turn", () => {
    const result = translate(FORMATS.OPENAI, body());
    const toolIndex = result.messages.findIndex((msg) => msg.role === "tool");
    expect(result.messages[toolIndex]).toEqual({ role: "tool", tool_call_id: "call_screenshot", content: `${TOOL_ERROR_PREFIX}${output[0].text}` });
    expect(result.messages[toolIndex + 1]).toEqual({ role: "user", content: [
      { type: "image_url", image_url: { url, detail: "auto" } },
      { type: "image_url", image_url: { url: output[2].image_url.url, detail: "auto" } },
    ] });
    expect(result.messages[toolIndex - 1].tool_calls[0].id).toBe("call_screenshot");
  });
  it("keeps parallel tool results adjacent before the image turn", () => {
    const input = body();
    input.input.splice(1, 0, { type: "function_call", call_id: "other", name: "other", arguments: "{}" });
    input.input.push({ type: "function_call_output", call_id: "other", output: [{ type: "input_image", image_url: url }] });
    const result = translate(FORMATS.OPENAI, input);
    expect(result.messages.map((msg) => msg.role)).toEqual(["assistant", "tool", "tool", "user"]);
    expect(result.messages[2]).toEqual({ role: "tool", tool_call_id: "other", content: "" });
    expect(result.messages[3].content[2]).toEqual({ type: "image_url", image_url: { url, detail: "auto" } });
  });
  it("preserves native tool_result documents and newer native blocks", () => {
    const native = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "cGRm" } },
      { type: "search_result", source: "https://example.com", title: "Result", content: [{ type: "text", text: "citation" }] },
      { type: "tool_reference", tool_name: "screenshot" },
    ];
    const result = openaiToClaudeRequest("claude-sonnet-4", { messages: [{ role: "user", content: [
      { type: "tool_result", tool_use_id: "native", is_error: false, content: native },
    ] }] }, false);
    expect(result.messages.flatMap((msg) => msg.content).find((block) => block.type === "tool_result").content).toEqual(native);
  });
  it("preserves opaque file references and embedded PDFs through paired Claude outputs", () => {
    const output = [
      { type: "input_text", text: "File references and PDF" },
      { type: "input_image", file_id: "file_screenshot" },
      { type: "input_file", file_id: "file_document" },
      { type: "input_file", filename: "capture.pdf", file_data: "data:application/pdf;base64,cGRm" },
    ];
    const result = translate(FORMATS.CLAUDE, body(output));
    const tool = result.messages.flatMap((msg) => msg.content).find((block) => block.type === "tool_result");
    expect(tool.tool_use_id).toBe("call_screenshot");
    expect(tool.content).toEqual([
      { type: "text", text: output[0].text },
      { type: "text", text: JSON.stringify(output[1]) },
      { type: "text", text: JSON.stringify(output[2]) },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "cGRm" } },
    ]);
    const chat = translate(FORMATS.OPENAI, body(output));
    const chatTool = chat.messages.find((msg) => msg.role === "tool");
    expect(chatTool.tool_call_id).toBe("call_screenshot");
    expect(chatTool.content).toContain("file_screenshot");
    expect(chatTool.content).toContain("file_document");
    expect(chatTool.content).not.toContain("cGRm");
    const files = chat.messages.flatMap((msg) => Array.isArray(msg.content) ? msg.content : [])
      .filter((part) => part.type === "file");
    expect(files).toEqual([{ type: "file", file: { filename: "capture.pdf", file_data: "data:application/pdf;base64,cGRm" } }]);
  });
  it("normalizes nested OpenAI tool_result content without changing strings", () => {
    const result = openaiToClaudeRequest("claude-sonnet-4", { messages: [
      { role: "user", content: [{ type: "tool_result", tool_use_id: "nested", is_error: false, content: [
        { type: "text", text: "nested screenshot" }, { type: "image_url", image_url: { url } },
      ] }] },
      { role: "tool", tool_call_id: "plain", content: "plain result" },
    ] }, false);
    const tools = result.messages.flatMap((msg) => msg.content).filter((block) => block.type === "tool_result");
    expect(tools[0].content).toEqual([{ type: "text", text: "nested screenshot" }, { type: "image", source: { type: "base64", media_type: "image/png", data } }]);
    expect(tools[1].content).toBe("plain result");
  });
});
