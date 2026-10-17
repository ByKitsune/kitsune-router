import { describe, expect, it } from "vitest";
import { estimateUsage } from "../../open-sse/utils/usageTracking.js";

const text = "x".repeat(4096);
const tiny = "iVBORw0KGgoAAAANSUhEUg==";
const large = tiny + "QUJD".repeat(16384);
const image = (data) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${data}` } });
const cases = [
  ["Chat image URL", data => ({ messages: [{ role: "user", content: [{ type: "text", text }, image(data)] }] })],
  ["Claude image tool result", data => ({ messages: [
    { role: "assistant", content: [{ type: "tool_use", id: "capture", name: "capture", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "capture", content: [{ type: "text", text }, { type: "image", source: { type: "base64", media_type: "image/png", data } }] }] },
  ] })],
  ["Responses image tool output", data => ({ input: [
    { type: "function_call", call_id: "capture", name: "capture", arguments: "{}" },
    { type: "function_call_output", call_id: "capture", output: [{ type: "input_text", text }, { type: "input_image", image_url: `data:image/png;base64,${data}` }] },
  ] })],
  ["Gemini inline data", data => ({ contents: [{ role: "user", parts: [{ text }, { inlineData: { mimeType: "image/png", data } }] }] })],
  ["Gemini native function response", data => ({ contents: [{ role: "user", parts: [{ functionResponse: { id: "capture", name: "capture", response: { result: text }, parts: [{ inlineData: { mimeType: "image/png", data } }] } }] }] })],
  ["Antigravity inline data", data => ({ request: { contents: [{ role: "user", parts: [{ text }, { inline_data: { mime_type: "image/png", data } }] }] } })],
  ["Kiro image bytes", data => ({ conversationState: { history: [], currentMessage: { userInputMessage: { content: text, images: [{ format: "png", source: { bytes: data } }] } } } })],
];

describe("binary media is not prompt text in fallback usage", () => {
  it.each(cases)("keeps %s estimates independent of encoded file size", (_name, make) => {
    const body = make(large);
    const original = JSON.stringify(body);
    const usage = estimateUsage(body, 8);
    expect(usage.estimated).toBe(true);
    expect(usage.prompt_tokens).toBeGreaterThanOrEqual(1024);
    expect(usage.prompt_tokens).toBeLessThan(4000);
    expect(usage.prompt_tokens).toBe(estimateUsage(make(tiny), 8).prompt_tokens);
    expect(usage.completion_tokens).toBe(2);
    expect(usage.total_tokens).toBe(usage.prompt_tokens + 2);
    expect(JSON.stringify(body)).toBe(original);
  });

  it("still estimates literal base64 prose as text rather than interpreting it as an attachment", () => {
    const literal = `Explain this literal data URI: data:image/png;base64,${large}`;
    const usage = estimateUsage({ messages: [{ role: "user", content: literal }] }, 8);
    expect(usage.prompt_tokens).toBeGreaterThanOrEqual(Math.ceil(literal.length / 4));
    expect(usage.estimated).toBe(true);
  });

  it("does not strip image-shaped examples or tool input objects that are real JSON context", () => {
    const value = { type: "image", data: large, mimeType: "image/png" };
    const body = {
      tools: [{ type: "function", function: { name: "inspect", parameters: { type: "object", examples: [value] } } }],
      messages: [{ role: "assistant", content: [{ type: "tool_use", id: "inspect", name: "inspect", input: value }] }],
    };
    expect(estimateUsage(body, 8).prompt_tokens).toBeGreaterThan(large.length / 2);
  });
});
