// Expose bugs caused by OpenAI being the intermediate format: data lost/wrong on source → openai → target.
// Each test describes the EXPECTED-correct behavior. A FAIL is evidence of the bug (with source file:line).
import { describe, it, expect } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const T = (src, tgt, body, provider = null) =>
  translateRequest(src, tgt, "m", body, true, null, provider);

describe("bug: Claude → OpenAI bridge data loss", () => {
  // claude-to-openai.js:187-203 — image source.type==="url" handled
  it("image with source.type=url is preserved (NOT dropped)", () => {
    const out = T(FORMATS.CLAUDE, FORMATS.OPENAI, {
      messages: [{ role: "user", content: [
        { type: "text", text: "look" },
        { type: "image", source: { type: "url", url: "https://x.com/a.png" } },
      ] }],
    });
    const json = JSON.stringify(out);
    expect(json, "remote image url silently dropped").toContain("a.png");
  });

  it.each([
    ["answer", [{ type: "text", text: "answer" }], "answer"],
    ["thinking-only", [], ""],
  ])("preserves ordered thinking separately from %s content", (_name, visible, content) => {
    const out = T(FORMATS.CLAUDE, FORMATS.OPENAI, {
      messages: [{ role: "assistant", content: [
        { type: "thinking", thinking: "First.", signature: "sig-a" },
        { type: "redacted_thinking", data: "opaque-not-portable" },
        { type: "thinking", thinking: "Second.", signature: "sig-b" },
        ...visible,
      ] }, { role: "user", content: "go" }],
    });
    expect(out.messages[0]).toEqual({ role: "assistant", content, reasoning_content: "First.Second." });
  });

  it("preserves ordered thinking with paired parallel tool calls", () => {
    const out = T(FORMATS.CLAUDE, FORMATS.OPENAI, {
      messages: [{ role: "assistant", content: [
        { type: "thinking", thinking: "First." },
        { type: "thinking", thinking: "Second." },
        { type: "tool_use", id: "call_1", name: "first", input: { value: 1 } },
        { type: "tool_use", id: "call_2", name: "second", input: { value: 2 } },
      ] }, { role: "user", content: [
        { type: "tool_result", tool_use_id: "call_1", content: "one" },
        { type: "tool_result", tool_use_id: "call_2", content: "two" },
      ] }],
    });
    expect(out.messages).toEqual([
      { role: "assistant", reasoning_content: "First.Second.", tool_calls: [
        { id: "call_1", type: "function", function: { name: "first", arguments: '{"value":1}' } },
        { id: "call_2", type: "function", function: { name: "second", arguments: '{"value":2}' } },
      ] },
      { role: "tool", tool_call_id: "call_1", content: "one" },
      { role: "tool", tool_call_id: "call_2", content: "two" },
    ]);
  });

  // claude-to-openai.js:229-269 — tool_result with image block preserved
  it("tool_result with image block is not turned into raw JSON / dropped", () => {
    const out = T(FORMATS.CLAUDE, FORMATS.OPENAI, {
      messages: [
        { role: "assistant", content: [
          { type: "tool_use", id: "call_1", name: "shot", input: {} },
        ] },
        { role: "user", content: [
          { type: "tool_result", tool_use_id: "call_1", content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "ZZZ" } },
          ] },
        ] },
      ],
    });
    const toolMsg = out.messages.find((m) => m.role === "tool");
    // Should keep the image; currently stringifies the whole array into raw JSON
    expect(toolMsg?.content, "image in tool_result lost").not.toMatch(/^\[/);
  });

  // FIXED (was claude-to-openai.js:260-265): OpenAI Chat Completions has no
  // `is_error` field on tool messages — a strict upstream ignores or rejects it,
  // and the receiving model then cannot tell the tool failed. The flag is now
  // carried as an explicit `[tool_error]` marker in the content the model reads.
  it("tool_result is_error flag is preserved as a content marker", () => {
    const out = T(FORMATS.CLAUDE, FORMATS.OPENAI, {
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "f", input: {} }] },
        { role: "user", content: [
          { type: "tool_result", tool_use_id: "call_1", is_error: true, content: "boom" },
        ] },
      ],
    });
    const toolMsg = out.messages.find((m) => m.role === "tool");
    // The failure must be visible to the model.
    expect(toolMsg?.content, "is_error dropped → model can't see tool failure").toMatch(/\[tool_error\]/);
    expect(toolMsg?.content).toContain("boom");
    // ...and must not be a non-standard field the upstream would reject.
    expect(toolMsg?.is_error).toBeUndefined();
  });

  it("does not mark a successful tool_result", () => {
    const out = T(FORMATS.CLAUDE, FORMATS.OPENAI, {
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "call_2", name: "f", input: {} }] },
        { role: "user", content: [
          { type: "tool_result", tool_use_id: "call_2", content: "all good" },
        ] },
      ],
    });
    const toolMsg = out.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).not.toMatch(/tool_error/);
    expect(toolMsg?.content).toContain("all good");
  });

  // claude-to-openai.js:24-27 — system array only takes .text, drops cache_control/non-text
  it("system array non-text parts are not silently dropped", () => {
    const out = T(FORMATS.CLAUDE, FORMATS.OPENAI, {
      system: [
        { type: "text", text: "rule1", cache_control: { type: "ephemeral" } },
        { type: "text", text: "rule2" },
      ],
      messages: [{ role: "user", content: "hi" }],
    });
    const sys = out.messages.find((m) => m.role === "system");
    expect(sys?.content).toContain("rule1");
    expect(sys?.content).toContain("rule2");
  });
});

describe("bug: tool_call id stability across bridge", () => {
  // toolCallHelper.js:29-31 — sanitize changes tc.id but tool_call_id in another message may drift
  it("sanitized tool id stays matched between call and result", () => {
    const out = T(FORMATS.OPENAI, FORMATS.OPENAI, {
      messages: [
        { role: "assistant", tool_calls: [
          { id: "call/with:bad*chars", type: "function", function: { name: "f", arguments: "{}" } },
        ] },
        { role: "tool", tool_call_id: "call/with:bad*chars", content: "ok" },
      ],
    });
    const asst = out.messages.find((m) => m.role === "assistant");
    const tool = out.messages.find((m) => m.role === "tool");
    expect(tool.tool_call_id, "id mismatch after sanitize").toBe(asst.tool_calls[0].id);
  });
});

describe("bug: empty content message handling", () => {
  // openaiHelper.js:49-51,66-71 — empty content → {text:""} then filtered out
  it("assistant message with only tool_calls is not dropped", () => {
    const out = T(FORMATS.OPENAI, FORMATS.OPENAI, {
      messages: [
        { role: "user", content: "do it" },
        { role: "assistant", content: "", tool_calls: [
          { id: "call_1", type: "function", function: { name: "f", arguments: "{}" } },
        ] },
        { role: "tool", tool_call_id: "call_1", content: "done" },
      ],
    });
    const asst = out.messages.find((m) => m.role === "assistant" && m.tool_calls);
    expect(asst, "assistant tool_calls message dropped").toBeTruthy();
  });
});
