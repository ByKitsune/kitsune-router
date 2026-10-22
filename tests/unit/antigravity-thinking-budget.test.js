import { describe, it, expect } from "vitest";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";

describe("Antigravity thinkingConfig and maxOutputTokens adjustment (#3979)", () => {
  const executor = new AntigravityExecutor();

  it("rejects explicit thinking that cannot fit without changing either client budget", () => {
    const body = {
      thinking: { budget_tokens: 4096 },
      request: {
        contents: [{ role: "user", parts: [{ text: "solve this puzzle" }] }],
        generationConfig: {
          maxOutputTokens: 2048,
        },
      },
    };

    expect(() => executor.transformRequest("ag/claude-opus-4-6-thinking", body, false, {}))
      .toThrow(expect.objectContaining({ code: "invalid_thinking_budget", message: expect.stringContaining("4096") }));
    expect(body.request.generationConfig.maxOutputTokens).toBe(2048);
    expect(body.thinking.budget_tokens).toBe(4096);
  });

  it("preserves an explicit output cap when compatibility effort maps to a native thinking level", () => {
    const body = {
      reasoning_effort: "high",
      request: {
        contents: [{ role: "user", parts: [{ text: "deep thought" }] }],
        generationConfig: {
          maxOutputTokens: 1000,
        },
      },
    };

    const transformed = executor.transformRequest("ag/gemini-3.8-flash-high", body, false, {});
    const genConfig = transformed.request.generationConfig;

    expect(genConfig.thinkingConfig).toEqual({
      thinkingLevel: "high",
      includeThoughts: true,
    });
    expect(genConfig.maxOutputTokens).toBe(1000);
  });
});
