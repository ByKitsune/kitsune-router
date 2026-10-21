import { describe, it, expect } from "vitest";

import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.js";
import { filterToOpenAIFormat } from "../../open-sse/translator/formats/openai.js";
import { parseSSELine } from "../../open-sse/utils/streamHelpers.js";

describe("request normalization", () => {
  it.each([
    ["answer", [{ type: "text", text: "Answer" }], "Answer"],
    ["thinking-only", [], ""],
  ])("preserves hybrid assistant thinking separately from %s content", (_name, visible, content) => {
    const result = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "gpt-4o", {
      messages: [{ role: "assistant", content: [
        { type: "thinking", thinking: "First.", signature: "native-only" },
        { type: "redacted_thinking", data: "opaque-native-only" },
        { type: "thinking", thinking: "Second." },
        ...visible,
      ] }, { role: "user", content: "Next" }],
    });
    expect(result.messages[0]).toEqual({ role: "assistant", content, reasoning_content: "First.Second." });
  });

  it.each(["Authoritative reasoning", ""])("does not duplicate or replace an existing reasoning_content field: %j", (reasoning) => {
    const result = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "gpt-4o", {
      messages: [{ role: "assistant", reasoning_content: reasoning, content: [
        { type: "thinking", thinking: "Fallback must not be appended" },
        { type: "text", text: "Answer" },
      ] }, { role: "user", content: "Next" }],
    });
    expect(result.messages[0]).toEqual({ role: "assistant", reasoning_content: reasoning, content: "Answer" });
  });

  it("cleans hybrid native blocks without losing assistant tool calls or their replies", () => {
    const tools = [{ id: "call_1", type: "function", function: { name: "lookup", arguments: "{}" } }];
    const result = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "gpt-4o", {
      messages: [{ role: "assistant", tool_calls: tools, content: [
        { type: "thinking", thinking: "First." },
        { type: "redacted_thinking", data: "opaque" },
        { type: "thinking", thinking: "Second." },
      ] }, { role: "tool", tool_call_id: "call_1", content: "done" }],
    });
    expect(result.messages).toEqual([
      { role: "assistant", content: "", tool_calls: tools, reasoning_content: "First.Second." },
      { role: "tool", tool_call_id: "call_1", content: "done" },
    ]);
  });

  it.each([
    [{ reasoning: "First.Second." }, { reasoning_content: "First.Second." }],
    [{ reasoning_details: [{ text: "First." }, { content: "Second." }] }, { reasoning_details: [{ text: "First." }, { content: "Second." }] }],
  ])("retains readable reasoning-only assistant history without colliding Chat aliases: %j", (reasoning, wireReasoning) => {
    const result = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "gpt-4o", {
      messages: [{ role: "assistant", content: "", ...reasoning }, { role: "user", content: "Next" }],
    });
    expect(result.messages).toEqual([
      { role: "assistant", content: "", ...wireReasoning }, { role: "user", content: "Next" },
    ]);
  });

  it("does not reinterpret user native thinking as assistant reasoning", () => {
    const result = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI, "gpt-4o", {
      messages: [{ role: "user", content: [
        { type: "thinking", thinking: "Not assistant reasoning" },
        { type: "text", text: "Question" },
      ] }],
    });
    expect(result.messages).toEqual([{ role: "user", content: "Question" }]);
  });

  it("claudeToOpenAIRequest flattens text-only content arrays into string", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "hi" },
            { type: "text", text: "there" },
          ],
        },
      ],
    };

    const result = claudeToOpenAIRequest("gpt-oss:120b", body, true);
    expect(result.messages[0].content).toBe("hi\nthere");
  });

  it("claudeToOpenAIRequest preserves multimodal arrays", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "ZmFrZQ==",
              },
            },
          ],
        },
      ],
    };

    const result = claudeToOpenAIRequest("gpt-4o", body, true);
    expect(Array.isArray(result.messages[0].content)).toBe(true);
  });

  it("filterToOpenAIFormat flattens text-only arrays to string", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" },
          ],
        },
      ],
    };

    const result = filterToOpenAIFormat(JSON.parse(JSON.stringify(body)));
    expect(result.messages[0].content).toBe("a\nb");
  });

  it("translateRequest keeps /v1/messages Claude->OpenAI text payloads string-safe", () => {
    const body = {
      model: "ollama/gpt-oss:120b",
      system: [{ type: "text", text: "You are helpful." }],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "text", text: "world" },
          ],
        },
      ],
      stream: true,
    };

    const result = translateRequest(
      FORMATS.CLAUDE,
      FORMATS.OPENAI,
      "gpt-oss:120b",
      JSON.parse(JSON.stringify(body)),
      true,
      null,
      "ollama",
    );

    const userMessage = result.messages.find((m) => m.role === "user");
    expect(typeof userMessage.content).toBe("string");
    expect(userMessage.content).toBe("hello\nworld");
  });

  it("translateRequest strips unsupported Anthropic effort-only output_config for MiniMax Claude-compatible endpoints", () => {
    const body = {
      model: "MiniMax-M2.7",
      system: [{ type: "text", text: "You are helpful." }],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "continue" }],
        },
      ],
      max_tokens: 1024,
      output_config: {
        effort: "medium",
      },
    };

    const result = translateRequest(
      FORMATS.CLAUDE,
      FORMATS.CLAUDE,
      "MiniMax-M2.7",
      JSON.parse(JSON.stringify(body)),
      true,
      null,
      "minimax",
    );

    expect(result.output_config).toBeUndefined();
    expect(result.messages[0].content[0].text).toBe("continue");
  });

  it("translateRequest preserves output_config for Anthropic Claude", () => {
    const body = {
      model: "claude-sonnet-4.5",
      system: [{ type: "text", text: "You are helpful." }],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "continue" }],
        },
      ],
      max_tokens: 1024,
      output_config: {
        format: { type: "json_schema", schema: { type: "object" } },
      },
    };

    const result = translateRequest(
      FORMATS.CLAUDE,
      FORMATS.CLAUDE,
      "claude-sonnet-4.5",
      JSON.parse(JSON.stringify(body)),
      true,
      null,
      "claude",
    );

    expect(result.output_config).toEqual(body.output_config);
  });

  it("parseSSELine supports provider raw NDJSON stream lines", () => {
    const raw = JSON.stringify({
      model: "gpt-oss:120b",
      message: { role: "assistant", content: "hello" },
      done: false,
    });

    const parsed = parseSSELine(raw);
    expect(parsed).toEqual({
      model: "gpt-oss:120b",
      message: { role: "assistant", content: "hello" },
      done: false,
    });
  });

  it("parseSSELine still supports SSE data lines", () => {
    const parsed = parseSSELine('data: {"choices":[{"delta":{"content":"hi"}}]}');
    expect(parsed.choices[0].delta.content).toBe("hi");
  });
});
