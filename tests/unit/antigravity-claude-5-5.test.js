import { describe, expect, it } from "vitest";
import { getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { stripThinkingSuffix } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";

const TIERED_IDS = [
  "claude-sonnet-5-5-high", "claude-sonnet-5-5-medium", "claude-sonnet-5-5-low",
  "claude-opus-5-5-high", "claude-opus-5-5-medium", "claude-opus-5-5-low",
];

describe("Antigravity effort-tier model identities", () => {
  it.each([
    ["claude-sonnet-5-5-medium", "claude-sonnet-5-5-medium(medium)"],
    ["claude-opus-5-5-low", "claude-opus-5-5-low(low)"],
  ])("preserves the explicit %s tier when separating the thinking suffix", (id, upstream) => {
    const resolved = getModelUpstreamId("ag", id);
    expect(resolved).toBe(upstream);
    expect(stripThinkingSuffix(resolved)).toBe(id);
  });

  it("keeps tier aliases on the same reference billing identity as their base model", () => {
    // https://platform.claude.com/docs/en/about-claude/pricing.md
    // These are reference estimates, not proof of an Antigravity account's bill.
    const tokens = { prompt_tokens: 100000, cached_tokens: 50000, cache_creation_input_tokens: 10000, completion_tokens: 10000, reasoning_tokens: 6000 };
    for (const [family, expected] of [["claude-sonnet-5-5", 0.21], ["claude-opus-5-5", 0.42]]) {
      expect(calculateCostFromTokens(tokens, getPricingForModel("ag", family))).toBeCloseTo(expected, 12);
      for (const id of TIERED_IDS.filter(id => id.startsWith(family))) {
        expect(calculateCostFromTokens(tokens, getPricingForModel("ag", id)), id).toBeCloseTo(expected, 12);
      }
    }
  });

});
