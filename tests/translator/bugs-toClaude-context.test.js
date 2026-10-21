// OpenAI-format CLI → Claude provider. Context pollution + lossy mapping on the openai→claude leg.
import { describe, it, expect } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";

// anthropic-compatible provider so prepareClaudeRequest runs the openai→claude path
const T = (body) =>
  translateRequest(FORMATS.OPENAI, FORMATS.CLAUDE, "m", body, true, null, "anthropic-compatible-x");

describe("OpenAI → Claude context mapping", () => {
  it("does not inject Claude Code system prompt for compatible providers", () => {
    const out = T({ messages: [{ role: "user", content: "hi" }] });
    expect(out.system).toBeUndefined();
  });

  it("retains caller-authored Claude Code text without filtering identity-looking content", () => {
    const out = T({ messages: [
      { role: "system", content: "Explain what 'You are Claude Code' means; do not impersonate it." },
      { role: "user", content: "hi" },
    ] });
    expect(out.system.map(block => block.text)).toEqual(["Explain what 'You are Claude Code' means; do not impersonate it."]);
  });

  it("assistant reasoning_content becomes a thinking block", () => {
    const out = T({
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: "a", reasoning_content: "my hidden reasoning" },
        { role: "user", content: "next" },
      ],
    });
    expect(JSON.stringify(out), "reasoning_content lost").toContain("my hidden reasoning");
    const assistant = out.messages.find((m) => m.role === "assistant");
    expect(assistant.content[0]).toEqual(expect.objectContaining({
      type: "thinking",
      thinking: "my hidden reasoning",
    }));
  });

  // openai-to-claude.js: tool_choice "none" mapped to {type:"none"} (#4171)
  it("tool_choice=none is not turned into auto", () => {
    const out = T({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "f", parameters: { type: "object", properties: {} } } }],
      tool_choice: "none",
    });
    expect(out.tool_choice?.type).toBe("none");
  });

  // Messages has no input_audio block. Reject instead of inventing a wire field
  // or dropping bytes while claiming this request was translated successfully.
  it("rejects input_audio explicitly on the Claude route", () => {
    expect(() => T({
      messages: [{ role: "user", content: [
        { type: "text", text: "transcribe" },
        { type: "input_audio", input_audio: { data: "AUDIO_B64", format: "wav" } },
      ] }],
    })).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "messages.0.content.1.input_audio" }));
  });

  // openai-to-claude.js:235-251 — remote http image_url is kept (regression guard)
  it("remote http image_url is preserved", () => {
    const out = T({
      messages: [{ role: "user", content: [
        { type: "text", text: "see" },
        { type: "image_url", image_url: { url: "https://x.com/pic.png" } },
      ] }],
    });
    expect(JSON.stringify(out), "remote image dropped").toContain("pic.png");
  });

  // claude.js hasValidContent() — a user message whose content is only an
  // image (no text block) was filtered out by prepareClaudeRequest's
  // "drop empty messages" pass, so an image-only turn (e.g. a vision
  // describe request with no accompanying prompt text in the user message)
  // produced an empty `messages` array and Anthropic rejected the request
  // with "messages: at least one message is required".
  it("user message with only an image is not dropped as empty", () => {
    const out = T({
      messages: [
        { role: "system", content: "Describe the image." },
        { role: "user", content: [
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        ] },
      ],
    });
    expect(out.messages.length, "image-only user message was dropped").toBeGreaterThan(0);
    expect(out.messages[0].content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "image" })])
    );
  });

  describe("explicit Claude output caps", () => {
    const translate = (extra, model = "claude-sonnet-4.5", source = FORMATS.OPENAI) =>
      translateRequest(source, FORMATS.CLAUDE, model, {
        model,
        messages: [{ role: "user", content: "q" }],
        ...extra,
      }, false, null, "claude");
    const tools = [{ type: "function", function: { name: "f", parameters: { type: "object", properties: {} } } }];

    it.each(["max_completion_tokens", "max_tokens"])("honors a one-token %s cap even with tools", (field) => {
      expect(translate({ tools, [field]: 1 }).max_tokens).toBe(1);
    });

    it("uses max_completion_tokens over the legacy cap", () => {
      expect(translate({ tools, max_completion_tokens: 1, max_tokens: 500 }).max_tokens).toBe(1);
    });

    it("retains an uncapped request's default and clamps caps to model output limits", () => {
      expect(translate({ tools }).max_tokens).toBe(64000);
      expect(translate({ max_tokens: 120000 }).max_tokens).toBe(64000);
      expect(translate({ max_completion_tokens: 128000 }, "claude-opus-4.8").max_tokens).toBe(128000);
      expect(translate({ max_tokens: 200000 }, "claude-opus-4.8").max_tokens).toBe(128000);
    });

    it.each([FORMATS.OPENAI, FORMATS.CLAUDE])("shrinks conflicting thinking inside the %s client's cap", (source) => {
      const out = translate({ max_tokens: 16000, thinking: { type: "enabled", budget_tokens: 32768 } }, "claude-sonnet-4.5", source);
      expect(out.max_tokens).toBe(16000);
      expect(out.thinking).toMatchObject({ type: "enabled", budget_tokens: 14976 });
    });

    it("keeps a valid thinking budget unchanged", () => {
      const out = translate({ max_tokens: 64000, thinking: { type: "enabled", budget_tokens: 24576 } });
      expect(out.max_tokens).toBe(64000);
      expect(out.thinking.budget_tokens).toBe(24576);
    });

    it("fits minimum thinking plus one answer token without raising the cap", () => {
      const out = translate({ max_completion_tokens: 1025, reasoning_effort: "high" });
      expect(out.max_tokens).toBe(1025);
      expect(out.thinking.budget_tokens).toBe(1024);
    });

    it("fits an uncapped max-effort budget below the model ceiling", () => {
      const out = translate({ reasoning_effort: "max" });
      expect(out.max_tokens).toBe(64000);
      expect(out.thinking.budget_tokens).toBe(62976);
    });

    it.each([1, 1024])("rejects enabled thinking when cap %i cannot fit its minimum budget", (cap) => {
      expect(() => translate({ max_tokens: cap, thinking: { type: "enabled", budget_tokens: 2048 } })).toThrow(RangeError);
    });

    it("does not reserve a budget for disabled thinking", () => {
      const out = translate({ max_tokens: 1, thinking: { type: "disabled", budget_tokens: 2048 } });
      expect(out.max_tokens).toBe(1);
      expect(out.thinking).toEqual({ type: "disabled" });
    });

    it("keeps small caps for adaptive thinking without a numeric budget", () => {
      const out = translate({ max_completion_tokens: 1, thinking: { type: "adaptive" } }, "claude-opus-4.8");
      expect(out.max_tokens).toBe(1);
      expect(out.thinking.type).toBe("adaptive");
    });

    it("keeps an explicit Claude-to-OpenAI cap even when tools are present", () => {
      const out = translateRequest(FORMATS.CLAUDE, FORMATS.OPENAI, "gpt-4o", {
        messages: [{ role: "user", content: "q" }],
        tools: [{ name: "f", input_schema: { type: "object", properties: {} } }],
        max_tokens: 4096,
      }, false, null, "openai");
      expect(out.max_tokens).toBe(4096);
    });
  });

  it("DeepSeek Claude transport adds a thinking placeholder before tool_use in thinking mode", () => {
    const out = prepareClaudeRequest({
      model: "deepseek-v4-pro",
      thinking: { type: "enabled" },
      messages: [
        { role: "user", content: [{ type: "text", text: "q" }] },
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "x" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] },
        { role: "user", content: [{ type: "text", text: "continue" }] },
      ],
    }, "deepseek");

    const assistant = out.messages.find((m) => m.role === "assistant");
    expect(assistant.content[0]).toEqual({ type: "thinking", thinking: "." });
    expect(assistant.content[1]).toEqual(expect.objectContaining({ type: "tool_use", id: "toolu_1" }));
    expect(assistant.content[0].signature).toBeUndefined();
  });
});
