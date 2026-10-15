// P10-A regression gate — protocol translation must not silently drop parameters.
//
// The audit called this the most dangerous bug class: "succeeds but behaves
// differently". There is no error, just different behaviour, so nothing
// surfaces in monitoring.
//
// Reproduced by calling translateRequest() directly before the fix:
//   openai → claude : top_p, stop, seed, user, presence_penalty, frequency_penalty lost
//   claude → openai : top_p, stop_sequences, metadata lost
//   openai → gemini : stop, seed, user lost
//
// Real impact: a client setting `stop: ["</end>"]` for deterministic truncation
// silently received untruncated output whenever the gateway routed to Claude —
// including when a combo failed over to another provider mid-request. `seed`
// requested for reproducibility was ignored.
//
// The tests assert FIELD BY FIELD, not merely "no error".
import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import "./registerAll.js";

const OPENAI_BODY = {
  model: "gpt-6-luna",
  messages: [{ role: "user", content: "hi" }],
  max_tokens: 100,
  temperature: 0.5,
  top_p: 0.9,
  stop: ["</end>"],
  seed: 42,
  user: "user-123",
  presence_penalty: 0.3,
  frequency_penalty: 0.2,
};

const CLAUDE_BODY = {
  model: "claude-sonnet-5",
  messages: [{ role: "user", content: "hi" }],
  max_tokens: 100,
  temperature: 0.5,
  top_p: 0.9,
  stop_sequences: ["</end>"],
  metadata: { user_id: "user-123" },
};

describe("openai → claude keeps the sampling parameters", () => {
  const out = () => translateRequest("openai", "claude", "claude-sonnet-5", OPENAI_BODY, true);

  it("maps temperature and top_p", () => {
    expect(out().temperature).toBe(0.5);
    expect(out().top_p).toBe(0.9);
  });

  it("maps stop (array) to stop_sequences", () => {
    expect(out().stop_sequences).toEqual(["</end>"]);
  });

  it("maps a string stop to a single-element stop_sequences", () => {
    const result = translateRequest("openai", "claude", "claude-sonnet-5", { ...OPENAI_BODY, stop: "</end>" }, true);
    expect(result.stop_sequences).toEqual(["</end>"]);
  });

  it("maps user to metadata.user_id (Anthropic's attribution field)", () => {
    expect(out().metadata).toMatchObject({ user_id: "user-123" });
  });

  it("does not invent an unsupported penalty", () => {
    // Anthropic has no presence/frequency penalty; dropping them is documented
    // behavior rather than a silent, unverifiable substitute.
    const result = out();
    expect(result.presence_penalty).toBeUndefined();
    expect(result.frequency_penalty).toBeUndefined();
  });

  it("omits stop_sequences when the client sent none", () => {
    const { stop, ...noStop } = OPENAI_BODY;
    expect(translateRequest("openai", "claude", "claude-sonnet-5", noStop, true).stop_sequences).toBeUndefined();
  });

  it("ignores an empty stop array instead of sending an empty list", () => {
    const result = translateRequest("openai", "claude", "claude-sonnet-5", { ...OPENAI_BODY, stop: [] }, true);
    expect(result.stop_sequences).toBeUndefined();
  });
});

describe("claude → openai keeps the sampling parameters", () => {
  const out = () => translateRequest("claude", "openai", "gpt-6-luna", CLAUDE_BODY, true);

  it("maps temperature and top_p", () => {
    expect(out().temperature).toBe(0.5);
    expect(out().top_p).toBe(0.9);
  });

  it("maps stop_sequences to stop", () => {
    expect(out().stop).toEqual(["</end>"]);
  });

  it("maps metadata.user_id to user", () => {
    expect(out().user).toBe("user-123");
  });

  it("omits stop when the client sent no stop_sequences", () => {
    const { stop_sequences, ...noStop } = CLAUDE_BODY;
    expect(translateRequest("claude", "openai", "gpt-6-luna", noStop, true).stop).toBeUndefined();
  });
});

describe("openai → gemini keeps the sampling parameters", () => {
  const out = () => translateRequest("openai", "gemini", "gemini-3.8-flash", OPENAI_BODY, true);

  it("maps temperature, topP and the stop list", () => {
    const cfg = out().generationConfig;
    expect(cfg.temperature).toBe(0.5);
    expect(cfg.topP).toBe(0.9);
    expect(cfg.stopSequences).toEqual(["</end>"]);
  });

  it("maps seed for reproducible sampling", () => {
    expect(out().generationConfig.seed).toBe(42);
  });

  it("caps stopSequences at Gemini's documented maximum of 5", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"];
    const cfg = translateRequest("openai", "gemini", "gemini-3.8-flash", { ...OPENAI_BODY, stop: many }, true).generationConfig;
    expect(cfg.stopSequences).toHaveLength(5);
  });

  it("omits stopSequences when the client sent none", () => {
    const { stop, ...noStop } = OPENAI_BODY;
    const cfg = translateRequest("openai", "gemini", "gemini-3.8-flash", noStop, true).generationConfig;
    expect(cfg.stopSequences).toBeUndefined();
  });
});

describe("a tool error survives the claude → openai hop", () => {
  const body = {
    model: "gpt-6-luna",
    messages: [
      { role: "user", content: "read the file" },
      { role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "read", input: {} }] },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tu_1", is_error: true, content: [{ type: "text", text: "ENOENT: no such file" }] },
          { type: "tool_result", tool_use_id: "tu_2", content: [{ type: "text", text: "file contents ok" }] },
        ],
      },
    ],
    max_tokens: 100,
  };

  it("marks the failed result in the content instead of a non-standard field", () => {
    const out = translateRequest("claude", "openai", "gpt-6-luna", body, true);
    const toolMsgs = (out.messages || []).filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(2);
    // OpenAI has no is_error field: a strict upstream would ignore or reject it,
    // and the receiving model could then conclude the tool SUCCEEDED.
    for (const m of toolMsgs) expect(m.is_error).toBeUndefined();
    expect(toolMsgs[0].content).toMatch(/^\[tool_error\] /);
    expect(toolMsgs[0].content).toContain("ENOENT");
  });

  it("leaves a successful result unmarked", () => {
    const out = translateRequest("claude", "openai", "gpt-6-luna", body, true);
    const ok = (out.messages || []).filter((m) => m.role === "tool")[1];
    expect(ok.content).not.toMatch(/tool_error/);
    expect(ok.content).toContain("file contents ok");
  });

  it("does not mark a result whose is_error is explicitly false", () => {
    const withFalse = {
      ...body,
      messages: [
        body.messages[0],
        body.messages[1],
        { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", is_error: false, content: [{ type: "text", text: "fine" }] }] },
      ],
    };
    const out = translateRequest("claude", "openai", "gpt-6-luna", withFalse, true);
    const tool = (out.messages || []).find((m) => m.role === "tool");
    expect(tool.content).not.toMatch(/tool_error/);
  });
});
