// 9router #4614: resync the codebuddy-cn catalog with the server's 2026-09-30
// product-config snapshot — add kimi-k2.8-preview and deepseek-v4.1-flash,
// correct maxOutput values, and fix the thinking-level glob shadowing that
// stopped provider-qualified deepseek entries from firing for dotted ids.
import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { getModelsByProviderId } from "../../open-sse/config/providerModels.js";

describe("codebuddy-cn catalog sync (#4614)", () => {
  it("exposes kimi-k2.8-preview and deepseek-v4.1-flash", () => {
    const ids = getModelsByProviderId("codebuddy-cn").map((m) => m.id);
    expect(ids).toContain("kimi-k2.8-preview");
    expect(ids).toContain("deepseek-v4.1-flash");
  });

  it("keeps models dropped from the server list resolvable but deprecated", () => {
    const models = getModelsByProviderId("codebuddy-cn");
    for (const id of ["glm-5v-turbo", "kimi-k2.7", "kimi-k2.6"]) {
      const entry = models.find((m) => m.id === id);
      expect(entry, `${id} still registered`).toBeTruthy();
      expect(entry.deprecated, `${id} marked deprecated`).toBe(true);
      // Capabilities must still resolve so old combos route instead of 404ing.
      expect(getCapabilitiesForModel("codebuddy-cn", id).reasoning).toBe(true);
    }
  });

  it("kimi-k2.8-preview advertises the opt-in-gated 300k window and 131072 output", () => {
    const caps = getCapabilitiesForModel("codebuddy-cn", "kimi-k2.8-preview");
    expect(caps.contextWindow).toBe(300000);
    expect(caps.maxOutput).toBe(131072);
    expect(caps.vision).toBe(true);
    expect(caps.reasoning).toBe(true);
    expect(caps.thinkingCanDisable).toBe(true);
  });

  it("applies the snapshot maxOutput corrections", () => {
    const expected = {
      "glm-5.2": 131072,
      "glm-5.3": 131072,
      "glm-5.3-flash": 131072,
      "minimax-m3": 524288,
      "kimi-k3-1": 1048576,
      "deepseek-v4-pro": 393216,
      "deepseek-v4.1-flash": 393216,
    };
    for (const [model, maxOutput] of Object.entries(expected)) {
      expect(getCapabilitiesForModel("codebuddy-cn", model).maxOutput, model).toBe(maxOutput);
    }
  });

  it("publishes the per-model thinking level sets", () => {
    expect(getThinkingLevels("codebuddy-cn", "kimi-k2.8-preview")).toEqual(["low", "medium", "high"]);
    expect(getThinkingLevels("codebuddy-cn", "deepseek-v4-pro")).toEqual(["low", "high", "xhigh"]);
    expect(getThinkingLevels("codebuddy-cn", "glm-5.3")).toEqual(["low", "high", "max"]);
    expect(getThinkingLevels("codebuddy-cn", "glm-5.3-flash")).toEqual(["low", "high", "max"]);
    expect(getThinkingLevels("codebuddy-cn", "hy3")).toEqual(["low", "high"]);
    expect(getThinkingLevels("codebuddy-cn", "hy4-preview")).toEqual(["high"]);
  });

  it("does not let the unqualified deepseek glob shadow the provider entry", () => {
    // deepseek-v4.1-flash matches the *deepseek-v4.* glob, which would otherwise
    // win and offer low/medium/high/xhigh/max instead of the published set.
    const levels = getThinkingLevels("codebuddy-cn", "deepseek-v4.1-flash");
    expect(levels).toEqual(["low", "high", "max"]);
    expect(levels).not.toContain("xhigh");
    expect(levels).not.toContain("none");
  });

  it("keeps the deepseek glob working for models without an exact entry", () => {
    // A reseller deepseek-v4 id with no codebuddy entry keeps the generic set.
    const levels = getThinkingLevels("openrouter", "deepseek-v4.2-anything");
    expect(levels).toContain("xhigh");
  });
});
