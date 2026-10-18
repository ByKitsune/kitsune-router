import { describe, expect, it } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

function history(source, imageOnly) {
  return { max_tokens: 4096, messages: [
    source === "claude"
      ? { role: "assistant", content: [{ type: "tool_use", id: "capture", name: "read_image", input: {} }] }
      : { role: "assistant", content: null, tool_calls: [{ id: "capture", type: "function", function: { name: "read_image", arguments: "{}" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "capture", content: [
      ...(!imageOnly ? [{ type: "text", text: "Screenshot ready" }] : []),
      { type: "image", source: { type: "base64", media_type: "image/png", data: png } },
    ] }] },
    { role: "user", content: "Describe this screenshot." },
  ] };
}

describe.each(["claude", "openai"])("%s tool screenshots on secondary destinations", source => {
  it.each([false, true])("preserves typed Ollama image and real tool result (imageOnly=%s)", imageOnly => {
    const body = history(source, imageOnly);
    const before = structuredClone(body);
    const wire = translateRequest(source, "ollama", "kimi-k2.6", body, false, null, "ollama");
    expect(wire.messages.filter(message => message.role === "tool")).toEqual([
      { role: "tool", tool_name: "read_image", content: imageOnly ? "" : "Screenshot ready" },
    ]);
    expect(wire.messages.filter(message => message.images).flatMap(message => message.images)).toEqual([png]);
    expect(wire.messages.some(message => message.content === "Describe this screenshot.")).toBe(true);
    expect(wire.options.num_predict).toBe(4096);
    expect(body).toEqual(before);
  });

  it.each([false, true])("preserves typed CommandCode image and real tool result (imageOnly=%s)", imageOnly => {
    const body = history(source, imageOnly);
    const before = structuredClone(body);
    const wire = translateRequest(source, "commandcode", "moonshotai/Kimi-K2.6", body, false, null, "commandcode");
    const blocks = wire.params.messages.flatMap(message => message.content);
    expect(blocks.filter(block => block.type === "tool-result")).toEqual([
      { type: "tool-result", toolCallId: "capture", toolName: "", output: { type: "text", value: imageOnly ? "" : "Screenshot ready" } },
    ]);
    expect(blocks.filter(block => block.type === "image")).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: png } },
    ]);
    expect(blocks.some(block => block.text === "Describe this screenshot.")).toBe(true);
    expect(wire.params.max_tokens).toBe(4096);
    expect(body).toEqual(before);
  });
});

it("retains an image-only user turn on Ollama", () => {
  const wire = translateRequest("openai", "ollama", "kimi-k2.6", { messages: [{
    role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${png}` } }],
  }] }, false, null, "ollama");
  expect(wire.messages).toEqual([{ role: "user", content: "", images: [png] }]);
});
