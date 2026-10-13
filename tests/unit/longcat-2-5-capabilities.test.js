// 9router #4514: Meituan LongCat 2.5 (seen via OpenCode free tier) reasons but
// matched no capability pattern, landing on DEFAULT_CAPABILITIES (~32k ctx).
// ~650k context verified live. The qwen3.8 half of the same upstream PR is
// already present in Zen.
import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel, DEFAULT_CAPABILITIES } from "../../open-sse/providers/capabilities.js";

describe("longcat-2.5 capability pattern (#4514)", () => {
  it("resolves the 650k window and reasoning for the bare id", () => {
    const caps = getCapabilitiesForModel("opencode", "longcat-2.5");
    expect(caps.reasoning).toBe(true);
    expect(caps.contextWindow).toBe(650000);
    // No longer the default floor.
    expect(caps.contextWindow).not.toBe(DEFAULT_CAPABILITIES.contextWindow);
  });

  it("matches vendor-prefixed and suffixed variants", () => {
    for (const id of ["longcat-2.5-128k", "meituan/longcat-2.5-instruct", "LongCat-2.5"]) {
      expect(getCapabilitiesForModel("opencode", id).contextWindow, id).toBe(650000);
    }
  });

  it("does not affect neighbouring families", () => {
    expect(getCapabilitiesForModel("opencode", "qwen3.8-27b").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("opencode", "qwen3.5-397b").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("opencode", "kimi-k2.7").contextWindow).toBe(262144);
  });
});
