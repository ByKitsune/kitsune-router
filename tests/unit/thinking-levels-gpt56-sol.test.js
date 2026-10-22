import { describe, it, expect } from "vitest";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";

describe("getThinkingLevels", () => {
  it.each([
    ["gpt-6-astra", ["low", "medium", "high", "xhigh", "max"]],
    ["gpt-6-sol", ["none", "low", "medium", "high", "xhigh", "max"]],
    ["gpt-6.1-sol", ["low", "medium", "high", "xhigh", "max"]],
    ["gpt-6-luna", ["none", "low", "medium", "high", "xhigh", "max"]],
    ["gpt-6-luna-review", ["none", "low", "medium", "high", "xhigh", "max"]],
    ["gpt-5.6-sol", ["none", "low", "medium", "high", "xhigh", "max"]],
    ["gpt-5.6-terra", ["none", "low", "medium", "high", "xhigh", "max"]],
    ["gpt-5.6-luna", ["none", "low", "medium", "high", "xhigh", "max"]],
    ["gpt-5.6-sol-review", ["none", "low", "medium", "high", "xhigh", "max"]],
    ["gpt-5.6-terra-review", ["none", "low", "medium", "high", "xhigh", "max"]],
    ["gpt-5.6-luna-review", ["none", "low", "medium", "high", "xhigh", "max"]],
  ])("returns Codex levels for %s", (model, expected) => {
    expect(getThinkingLevels("codex", model)).toEqual(expected);
  });

  it("does not expose Codex-only GPT-5.6 overrides on Kiro", () => {
    expect(getThinkingLevels("kiro", "gpt-5.6-sol")).toEqual([
      "none", "minimal", "low", "medium", "high", "xhigh",
    ]);
  });

  it("does not add max for other codex models", () => {
    const levels = getThinkingLevels("codex", "gpt-5.3-codex");
    expect(levels).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("does not add max for other Codex models", () => {
    const levels = getThinkingLevels("codex", "gpt-5.5");
    expect(levels || []).not.toContain("max");
  });
});
