import { describe, expect, it } from "vitest";
import { translateRequest, translateResponse, initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// PR #4612 at d41355f573372e9814451e51685252c80b023def. Synthetic
// definition shape, not a claim of native Kimi acceptance or entitlement.
const addition = (name, extra = {}) => ({ type: "tool_addition", tool: { type: "tool_definition", definition: {
  name, description: "Deferred MCP tool", input_schema: { type: "object", properties: { path: { type: "string" } } }, ...extra,
} } });
const translate = (body, provider = "kimi", source = FORMATS.CLAUDE) => translateRequest(source, FORMATS.CLAUDE, "k3", body, false, null, provider);

describe("Kimi Claude-wire deferred tool lowering", () => {
  it("hoists valid definitions, deduplicates with existing tools winning, and removes only addition blocks", () => {
    const existing = { name: "existing", description: "Keep this definition", input_schema: { type: "object", properties: { original: { type: "boolean" } } } };
    const body = { max_tokens: 128, tools: [existing], messages: [
      { role: "system", content: [addition("new_tool"), addition("new_tool"), addition("existing")] },
      { role: "user", content: [{ type: "text", text: "Run it." }, addition("other_tool")] },
    ] };
    const before = structuredClone(body);
    const out = translate(body);
    expect(out.tools.map(tool => tool.name)).toEqual(["existing", "new_tool", "other_tool"]);
    expect(out.tools[0]).toMatchObject(existing);
    expect(out.messages).toEqual([{ role: "user", content: [{ type: "text", text: "Run it." }] }]);
    expect(out.max_tokens).toBe(128);
    expect(body).toEqual(before);
    expect(translate(body)).toEqual(out);
  });

  it("preserves typed tool media and adjacent parallel results while lowering a mixed turn", () => {
    const body = { max_tokens: 37, messages: [
      { role: "user", content: [{ type: "text", text: "Compacted context." }] },
      { role: "assistant", content: [{ type: "tool_use", id: "a", name: "capture", input: {} }, { type: "tool_use", id: "b", name: "capture", input: {} }] },
      { role: "user", content: [
        { type: "tool_result", tool_use_id: "a", content: [{ type: "text", text: "first" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } }] },
        { type: "tool_result", tool_use_id: "b", content: "second" }, addition("capture"),
      ] },
    ] };
    const before = structuredClone(body);
    const out = translate(body);
    expect(out.tools.map(tool => tool.name)).toEqual(["capture"]);
    const user = out.messages.at(-1);
    expect(user.content.filter(block => block.type === "tool_result").map(block => ({ id: block.tool_use_id, content: block.content }))).toEqual([
      { id: "a", content: [{ type: "text", text: "first" }] }, { id: "b", content: "second" },
    ]);
    expect(user.content.filter(block => block.type === "image").map(block => block.source)).toEqual([{ type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" }]);
    const prose = user.content.filter(block => block.type === "text");
    expect(JSON.stringify(prose)).not.toContain("iVBORw0KGgo=");
    expect(out.max_tokens).toBe(37);
    expect(body).toEqual(before);
  });

  it("joins long added definitions to normal reversible tool-name compression before preparation", () => {
    const name = `mcp_${"long_".repeat(20)}`;
    const body = { max_tokens: 128, messages: [
      { role: "user", content: [addition(name), { type: "text", text: "Run it." }] },
      { role: "assistant", content: [{ type: "tool_use", id: "a", name, input: { path: "x" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "ok" }] },
    ], tool_choice: { type: "tool", name } };
    const before = structuredClone(body);
    const out = translate(body);
    const wireName = out.tools[0].name;
    expect(wireName.length).toBeLessThanOrEqual(64);
    expect(wireName).not.toBe(name);
    expect(out.messages.find(turn => turn.role === "assistant").content.find(block => block.type === "tool_use").name).toBe(wireName);
    expect(out.tool_choice.name).toBe(wireName);
    expect(out._toolNameMap.get(wireName)).toBe(name);
    const restored = translateResponse(FORMATS.CLAUDE, FORMATS.CLAUDE, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "b", name: wireName, input: {} } }, { ...initState(FORMATS.CLAUDE), toolNameMap: out._toolNameMap });
    expect(restored[0].content_block.name).toBe(name);
    expect(body).toEqual(before);
  });

  it.each([
    { type: "tool_addition", tool: { type: "not_a_definition", definition: { name: "bad", input_schema: { type: "object" } } } },
    addition(""), addition("bad", { input_schema: [] }), addition("bad", { input_schema: { type: "string" } }),
    addition("bad", { type: "web_search_20250305" }),
    { type: "tool_addition", tool: {} },
  ])("rejects malformed definitions without erasing the caller block: %j", block => {
    const body = { messages: [{ role: "user", content: [block, { type: "text", text: "Run." }] }] };
    const before = structuredClone(body);
    expect(() => translate(body)).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "messages.0.content.0" }));
    expect(body).toEqual(before);
  });

  it("does not lower native Claude additions or reinterpret examples nested inside tool arguments", () => {
    const native = { max_tokens: 37, messages: [{ role: "user", content: [addition("native"), { type: "text", text: "hi" }] }] };
    expect(translate(native, "claude").messages[0].content).toContainEqual(addition("native"));
    const example = addition("literal-example");
    const out = translate({ max_tokens: 37, messages: [{ role: "assistant", content: [{ type: "tool_use", id: "a", name: "echo", input: { example } }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "ok" }] }] });
    expect(out.tools).toBeUndefined();
    expect(out.messages[0].content.find(block => block.type === "tool_use").input.example).toEqual(example);
  });

  it("restores a user turn after a trailing addition-only turn without inventing an assistant prefill", () => {
    const out = translate({ max_tokens: 37, messages: [
      { role: "user", content: [{ type: "text", text: "Start." }] },
      { role: "assistant", content: [{ type: "text", text: "Ready." }] },
      { role: "user", content: [addition("new_tool")] },
    ] });
    expect(out.messages.at(-1)).toMatchObject({ role: "user", content: [{ type: "text", text: "Continue from the assistant response above without repeating it." }] });
    expect(out.tools[0].name).toBe("new_tool");
    expect(out.max_tokens).toBe(37);
  });

  it("does not discard a malformed existing tools collection while adding a definition", () => {
    const body = { max_tokens: 37, tools: { unexpected: true }, messages: [{ role: "user", content: [addition("new_tool"), { type: "text", text: "hi" }] }] };
    const before = structuredClone(body);
    expect(() => translate(body)).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "tools" }));
    expect(body).toEqual(before);
  });
});
