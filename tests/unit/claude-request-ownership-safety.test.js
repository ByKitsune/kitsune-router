import { describe, expect, it } from "vitest";
import { normalizeClaudePassthrough, prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const model = "claude-opus-4-6";
const signature = Buffer.from([0x12, 0x0a, 0x00, 0xff, 0x01]).toString("base64");
const tool = { type: "tool_use", id: "toolu_fixture", name: "lookup", input: { query: "fixture" } };
const result = { type: "tool_result", tool_use_id: tool.id, content: "fixture-result" };
const history = (thinking, mode = "enabled") => ({
  model, max_tokens: 2048, thinking: { type: mode, ...(mode === "enabled" ? { budget_tokens: 1024 } : {}) },
  messages: [{ role: "assistant", content: [...thinking, structuredClone(tool)] }, { role: "user", content: [structuredClone(result)] }],
});

const preparations = [
  ["native passthrough", body => normalizeClaudePassthrough(body, model, null, "claude")],
  ["prepared Messages", body => prepareClaudeRequest(body, "claude")],
];

describe("Claude signed thinking ownership", () => {
  it.each(preparations)("preserves original signed/omitted/redacted blocks in order through %s", (_name, prepare) => {
    const thinking = [
      { type: "thinking", thinking: "", signature },
      { type: "redacted_thinking", data: "opaque-original-data/+=" },
      { type: "thinking", thinking: "original text", signature: Buffer.from(signature).toString("base64") },
    ];
    const sent = prepare(history(thinking));
    expect(sent.messages[0].content.slice(0, 3)).toEqual(thinking);
    expect(sent.messages[1].content[0]).toMatchObject(result);
  });

  it.each(preparations)("rejects missing manual tool-loop thinking instead of inventing a signature through %s", (_name, prepare) => {
    expect(() => prepare(history([]))).toThrow(expect.objectContaining({
      code: "missing_thought_signature", param: "messages.0.content.0", message: expect.stringContaining("original, complete thinking"),
    }));
  });

  it.each(preparations)("rejects malformed thinking within an active tool loop without partially removing it through %s", (_name, prepare) => {
    const body = history([{ type: "thinking", thinking: "valid", signature }, { type: "thinking", thinking: "broken", signature: {} }]);
    const original = structuredClone(body);
    expect(() => prepare(body)).toThrow(expect.objectContaining({ code: "invalid_thought_signature", param: "messages.0.content.1.signature" }));
    expect(body).toEqual(original);
  });

  it.each(preparations)("does not require invented thinking for an adaptive tool turn through %s", (_name, prepare) => {
    const sent = prepare(history([], "adaptive"));
    expect(sent.messages[0].content.map(block => block.type)).toEqual(["tool_use"]);
  });

  it.each(preparations)("keeps a multi-round manual tool turn without inventing thinking for later calls through %s", (_name, prepare) => {
    const body = history([{ type: "thinking", thinking: "original", signature }]);
    body.messages.push({ role: "assistant", content: [{ ...tool, id: "toolu_second" }] },
      { role: "user", content: [{ ...result, tool_use_id: "toolu_second" }] });
    const sent = prepare(body);
    expect(sent.messages[0].content[0]).toEqual({ type: "thinking", thinking: "original", signature });
    expect(sent.messages[2].content.map(block => block.type)).toEqual(["tool_use"]);
  });

  it.each(preparations)("does not drop malformed earlier thinking from an ongoing multi-round turn through %s", (_name, prepare) => {
    const body = history([{ type: "thinking", thinking: "broken", signature: "" }]);
    body.messages.push({ role: "assistant", content: [{ ...tool, id: "toolu_second" }] },
      { role: "user", content: [{ ...result, tool_use_id: "toolu_second" }] });
    expect(() => prepare(body)).toThrow(expect.objectContaining({ code: "invalid_thought_signature", param: "messages.0.content.0.signature" }));
  });

  it("validates native bare-object tool results before normalizing the content shape", () => {
    const body = history([{ type: "thinking", thinking: "broken", signature: "" }]);
    body.messages[1].content = result;
    expect(() => normalizeClaudePassthrough(body, model, null, "claude")).toThrow(expect.objectContaining({ code: "invalid_thought_signature" }));
  });

  it.each(["claude-haiku-4-5", "claude-haiku-4-5-20251001"])("validates missing tool continuity after %s adaptive mode becomes manual", id => {
    const body = { ...history([], "adaptive"), model: id, max_tokens: 20000 };
    expect(() => normalizeClaudePassthrough(body, id, null, "claude")).toThrow(expect.objectContaining({
      code: "missing_thought_signature", param: "messages.0.content.0",
    }));
  });

  it("allows an initial Haiku request after the same adaptive-to-manual normalization", () => {
    const id = "claude-haiku-4-5-20251001";
    const body = { model: id, max_tokens: 20000, thinking: { type: "adaptive" }, messages: [{ role: "user", content: "Start a new turn" }] };
    const sent = normalizeClaudePassthrough(body, id, null, "claude");
    expect(sent.thinking).toEqual({ type: "enabled", budget_tokens: 10000 });
    expect(sent.messages).toEqual([{ role: "user", content: "Start a new turn" }]);
  });

  it("preserves a valid Haiku signed tool continuation when adaptive mode becomes manual", () => {
    const id = "claude-haiku-4-5-20251001";
    const thinking = { type: "thinking", thinking: "original provider thinking", signature };
    const body = { ...history([thinking], "adaptive"), model: id, max_tokens: 20000 };
    const sent = normalizeClaudePassthrough(body, id, null, "claude");
    expect(sent.thinking).toEqual({ type: "enabled", budget_tokens: 10000 });
    expect(sent.messages[0].content[0]).toEqual(thinking);
    expect(sent.messages[1].content[0]).toMatchObject(result);
  });

  it("does not replace a compatible vendor's opaque thinking or add a signature to redacted data", () => {
    const thinking = [{ type: "thinking", thinking: "vendor-original", signature: "vendor-owned-signature" }, { type: "redacted_thinking", data: "vendor-owned-redaction" }];
    expect(prepareClaudeRequest(history(thinking), "anthropic-compatible-fixture").messages[0].content.slice(0, 2)).toEqual(thinking);
  });

  it("does not sign unsigned source reasoning with a captured signature", () => {
    const sent = openaiToClaudeRequest(model, { messages: [{ role: "assistant", reasoning_content: "unsigned-source-reasoning", content: "answer" }, { role: "user", content: "Continue" }] }, false);
    expect(sent.messages[0].content[0]).toEqual({ type: "thinking", thinking: "unsigned-source-reasoning" });
  });
});

describe("Claude optional metadata belongs to the caller", () => {
  it.each(["claude", "anthropic"])("does not prepend application identity instructions to the %s transport", provider => {
    const sent = translateRequest(FORMATS.OPENAI, FORMATS.CLAUDE, model, { max_tokens: 128, messages: [
      { role: "system", content: "Keep exactly this instruction." }, { role: "user", content: "fixture" },
    ] }, false, { apiKey: "fixture-key" }, provider);
    expect(sent.system.map(block => block.text)).toEqual(["Keep exactly this instruction."]);
  });

  it("does not construct secret-derived account IDs, fake billing claims or unavailable tools", () => {
    const source = { messages: [{ role: "user", content: "fixture" }], tools: [{ name: "lookup", input_schema: { type: "object", properties: {} } }], max_tokens: 128 };
    const original = structuredClone(source);
    const first = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, model, source, false, { accessToken: "sk-ant-oat-first" }, "claude");
    const second = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, model, source, false, { accessToken: "sk-ant-oat-second" }, "claude");
    for (const sent of [first, second]) {
      expect(sent.metadata).toBeUndefined();
      expect(sent.system).toBeUndefined();
      expect(sent.tools).toHaveLength(1);
      expect(JSON.stringify(sent)).not.toContain("sk-ant-oat");
    }
    expect(first.tools).toEqual(second.tools);
    expect(source).toEqual(original);
  });

  it("retains caller-authored metadata and billing-looking system text unchanged", () => {
    const source = { messages: [{ role: "user", content: "fixture" }], max_tokens: 128,
      metadata: { user_id: '{"account_uuid":"caller-original","session_id":"caller-session"}' },
      system: [{ type: "text", text: "x-anthropic-billing-header: caller-original" }],
    };
    const sent = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, model, source, false, { accessToken: "sk-ant-oat-fixture" }, "claude");
    expect(sent.metadata).toEqual(source.metadata);
    expect(sent.system[0].text).toBe(source.system[0].text);
  });

  it("uses the actual API-key profile when a stale OAuth token is also present", () => {
    const sent = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, model,
      { messages: [{ role: "user", content: "fixture" }], max_tokens: 128, tools: [{ name: "lookup", input_schema: { type: "object", properties: {} } }] },
      false, { apiKey: "fixture-api-key", accessToken: "sk-ant-oat-unused" }, "claude");
    expect(sent.tools.map(tool => tool.name)).toEqual(["lookup"]);
    expect(sent._toolNameMap).toBeUndefined();
  });
});
