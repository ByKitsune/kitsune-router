import { describe, expect, it } from "vitest";
import "../translator/registerAll.js";
import { openaiToOpenAIResponsesRequest, openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.js";
import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.js";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.js";
import { claudeToKiroRequest } from "../../open-sse/translator/request/claude-to-kiro.js";
import { openaiToKiroRequest } from "../../open-sse/translator/request/openai-to-kiro.js";
import { filterToOpenAIFormat } from "../../open-sse/translator/formats/openai.js";
import { GithubExecutor } from "../../open-sse/executors/github.js";

const png = "iVBORw0KGgoAAAANSUhEUgAACHwAAALU" + "QUJD".repeat(16384);
const png2 = "iVBORw0KGgoAAAANSUhEUgAACH0AAALU" + "REVG".repeat(16384);
const image = (data = png) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${data}` } });
const claudeImage = (data = png) => ({ type: "image", source: { type: "base64", media_type: "image/png", data } });
const toolCall = (id) => ({ id, type: "function", function: { name: "read_png", arguments: "{}" } });
const textLeaves = (value, output = []) => {
  if (!value || typeof value !== "object") return output;
  if (typeof value.text === "string") output.push(value.text);
  if (typeof value.output === "string") output.push(value.output);
  if (value.role === "tool" && typeof value.content === "string") output.push(value.content);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      if (Array.isArray(child)) for (const item of child) textLeaves(item, output);
      else textLeaves(child, output);
    }
  }
  return output;
};
const responseImages = (body) => body.input.flatMap((item) => Array.isArray(item.content) ? item.content : []).filter((part) => part.type === "input_image");

function chatHistory() {
  return {
    messages: [
      { role: "system", content: "Compacted context: the previous analysis used 133592 tokens." },
      { role: "assistant", content: null, tool_calls: [toolCall("read_a"), toolCall("read_b")] },
      { role: "tool", tool_call_id: "read_a", content: [{ type: "text", text: "PNG 2172x724" }, image()] },
      { role: "tool", tool_call_id: "read_b", content: [image(png2)] },
      { role: "user", content: "Compare both images after compaction." },
    ],
  };
}

function expectNoBinaryText(body) {
  const text = textLeaves(body).join("\n");
  expect(text).not.toContain(png);
  expect(text).not.toContain(png2);
  expect(text).not.toContain("data:image/png;base64,");
}

describe("vision tool output protocol boundaries", () => {
  it("keeps parallel tool outputs paired and moves each image once into a Responses vision message", () => {
    const source = chatHistory();
    const before = structuredClone(source);
    const wire = openaiToOpenAIResponsesRequest("gpt-6.1-sol", source, true);
    const outputs = wire.input.filter((item) => item.type === "function_call_output");
    expect(outputs).toEqual([
      { type: "function_call_output", call_id: "read_a", output: "PNG 2172x724" },
      { type: "function_call_output", call_id: "read_b", output: "" },
    ]);
    expect(responseImages(wire).map((part) => part.image_url)).toEqual([image().image_url.url, image(png2).image_url.url]);
    const a = wire.input.findIndex((item) => item.call_id === "read_a" && item.type === "function_call_output");
    const b = wire.input.findIndex((item) => item.call_id === "read_b" && item.type === "function_call_output");
    expect(b).toBe(a + 1);
    expectNoBinaryText(wire);
    expect(source).toEqual(before);
  });

  it("does not grow image occurrences over repeated Chat/Responses history conversions", () => {
    let body = chatHistory();
    for (let turn = 0; turn < 3; turn++) {
      const wire = openaiToOpenAIResponsesRequest("gpt-6.1-sol", body, true);
      expect(responseImages(wire).map((part) => part.image_url)).toEqual([image().image_url.url, image(png2).image_url.url]);
      expectNoBinaryText(wire);
      body = openaiResponsesToOpenAIRequest("gpt-6.1-sol", wire, true);
      body.messages.push({ role: "assistant", content: `Analysis ${turn}` }, { role: "user", content: "Continue." });
    }
  });

  it.each([
    ["Claude", claudeImage(), `data:image/png;base64,${png}`],
    ["Gemini camel case", { inlineData: { mimeType: "image/png", data: png } }, `data:image/png;base64,${png}`],
    ["Gemini snake case MIME", { inline_data: { mime_type: "IMAGE/PNG", data: png } }, `data:IMAGE/PNG;base64,${png}`],
    ["Gemini file URI", { fileData: { mimeType: "image/png", fileUri: "https://example.com/capture.png" } }, "https://example.com/capture.png"],
  ])("normalizes %s images in a Chat tool output before Responses serialization", (_name, part, url) => {
    const body = { messages: [
      { role: "assistant", content: null, tool_calls: [toolCall("read_a")] },
      { role: "tool", tool_call_id: "read_a", content: [part] },
    ] };
    const wire = openaiToOpenAIResponsesRequest("gpt-6.1-sol", body, true);
    expect(responseImages(wire).map((part) => part.image_url === url)).toEqual([true]);
    expectNoBinaryText(wire);
  });

  it("preserves images in hybrid Claude tool results without JSON-encoding binary into tool text", () => {
    const source = { messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "read_a", name: "read_png", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "read_a", content: [image(), image(png2)] }] },
    ] };
    const wire = claudeToOpenAIRequest("gpt-6.1-sol", source, true);
    const images = wire.messages.flatMap((msg) => Array.isArray(msg.content) ? msg.content : []).filter((part) => part.type === "image_url");
    expect(images.map((part) => part.image_url.url)).toEqual([image().image_url.url, image(png2).image_url.url]);
    expectNoBinaryText(wire);
  });

  it("lifts native image blocks from OpenAI tool content instead of losing their vision payload", () => {
    const wire = filterToOpenAIFormat({ messages: [
      { role: "assistant", content: null, tool_calls: [toolCall("read_a")] },
      { role: "tool", tool_call_id: "read_a", content: [claudeImage(), { type: "text", text: "Image ready" }] },
    ] });
    expect(wire.messages.find((msg) => msg.role === "tool").content).toBe("Image ready");
    const images = wire.messages.flatMap((msg) => Array.isArray(msg.content) ? msg.content : []).filter((part) => part.type === "image_url");
    expect(images.map((part) => part.image_url.url)).toEqual([image().image_url.url]);
    expectNoBinaryText(wire);
  });

  it("forwards image-only Claude tool results to Kiro as images, not base64 text", () => {
    const wire = claudeToKiroRequest("claude-sonnet-4-6", {
      tools: [{ name: "read_png", input_schema: { type: "object", properties: {} } }],
      messages: [
      { role: "user", content: "Read both PNG files." },
      { role: "assistant", content: [{ type: "tool_use", id: "read_a", name: "read_png", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "read_a", content: [claudeImage(), claudeImage(png2)] }] },
    ] }, true, { projectId: "vision-fixture" });
    const current = wire.conversationState.currentMessage.userInputMessage;
    expect(current.images.map((part) => part.source.bytes)).toEqual([png, png2]);
    expect(current.userInputMessageContext.toolResults[0].toolUseId).toBe("read_a");
    expectNoBinaryText(wire);
  });

  it("does not flatten a native image block to JSON text in the Copilot final serializer", () => {
    const wire = new GithubExecutor().sanitizeMessagesForChatCompletions({ messages: [
      { role: "user", content: [{ type: "text", text: "Inspect PNG" }, claudeImage()] },
    ] });
    expect(wire.messages[0].content).toEqual([{ type: "text", text: "Inspect PNG" }, image()]);
    expectNoBinaryText(wire);
  });
  it("preserves a PNG supplied as a file block inside a Claude-bound tool result", () => {
    const wire = openaiToClaudeRequest("claude-sonnet-4-6", { messages: [
      { role: "assistant", content: null, tool_calls: [toolCall("read_a")] },
      { role: "tool", tool_call_id: "read_a", content: [{ type: "file", file: { file_data: image().image_url.url } }] },
    ] }, false);
    const result = wire.messages.flatMap(msg => msg.content).find(part => part.type === "tool_result");
    expect(result.content.map(part => part.type)).toEqual(["image"]);
    expect(result.content[0].source.data === png).toBe(true);
    expectNoBinaryText(wire);
  });

  it("retains orphan Responses tool images as a user vision turn rather than JSON text", () => {
    const wire = openaiResponsesToOpenAIRequest("gpt-6.1-sol", { input: [
      { type: "message", role: "tool", content: [{ type: "input_image", image_url: image().image_url.url }] },
    ] }, false);
    expect(wire.messages[0].role).toBe("user");
    expect(wire.messages[0].content.some(part => part.type === "image_url" && part.image_url.url === image().image_url.url)).toBe(true);
    expectNoBinaryText(wire);
  });

  it("keeps nested tool-result images typed in the Copilot serializer", () => {
    const wire = new GithubExecutor().sanitizeMessagesForChatCompletions({ messages: [
      { role: "user", content: [{ type: "tool_result", tool_use_id: "read_a", content: [{ type: "text", text: "PNG ready" }, claudeImage()] }] },
    ] });
    expect(wire.messages[0].content.some(part => part.type === "image_url" && part.image_url.url === image().image_url.url)).toBe(true);
    expectNoBinaryText(wire);
  });
  it.each(["tool", "hybrid"])("preserves both image bytes and textual results in Kiro %s history", (shape) => {
    const content = [{ type: "text", text: "PNG ready" }, image()];
    const result = shape === "tool"
      ? { role: "tool", tool_call_id: "read_a", content }
      : { role: "user", content: [{ type: "tool_result", tool_use_id: "read_a", content }] };
    const wire = openaiToKiroRequest("claude-sonnet-4-6", {
      tools: [{ type: "function", function: { name: "read_png", parameters: { type: "object", properties: {} } } }],
      messages: [{ role: "user", content: "Read PNG" }, { role: "assistant", content: null, tool_calls: [toolCall("read_a")] }, result],
    }, false, {});
    const current = wire.conversationState.currentMessage.userInputMessage;
    expect(current.images?.map(part => part.source.bytes === png)).toEqual([true]);
    expect(current.userInputMessageContext.toolResults[0].content).toEqual([{ text: "PNG ready" }]);
    expectNoBinaryText(wire);
  });
});
