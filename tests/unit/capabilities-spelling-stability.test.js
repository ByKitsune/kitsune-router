import { describe, expect, it } from "vitest";
import {
  getCapabilitiesForModel,
  setCatalogSource,
} from "../../open-sse/providers/capabilities.js";

// The synced catalog is installed by the server on real instances; tests must
// exercise the static tables, so detach any ambient source first.
setCatalogSource(null);

describe("capability resolution is spelling-stable (dot vs dash version separators)", () => {
  const sonnet46 = {
    contextWindow: 1000000,
    maxOutput: 128000,
    thinkingFormat: "claude-adaptive",
  };

  it("resolves claude-sonnet-4-6 and claude-sonnet-4.6 identically", () => {
    const dashed = getCapabilitiesForModel("claude", "claude-sonnet-4-6");
    const dotted = getCapabilitiesForModel("claude", "claude-sonnet-4.6");
    expect(dashed).toMatchObject(sonnet46);
    expect(dashed).toEqual(dotted);
  });

  it("resolves antigravity claude-sonnet-4-6 and claude-opus-4-6-thinking with dot/dash parity", () => {
    const dashed = getCapabilitiesForModel("antigravity", "claude-sonnet-4-6");
    const dotted = getCapabilitiesForModel("antigravity", "claude-sonnet-4.6");
    expect(dashed).toEqual(dotted);
    expect(dashed).toMatchObject({
      contextWindow: 250000,
      maxOutput: 64000,
      thinkingFormat: "gemini-budget",
    });
  });

  it("resolves kiro claude-opus-4.7-thinking/-agentic variants like their base ids", () => {
    for (const variant of ["claude-opus-4.7-thinking", "claude-opus-4.7-agentic"]) {
      const caps = getCapabilitiesForModel("kiro", variant);
      expect(caps).toEqual(getCapabilitiesForModel("kiro", variant.replace(/-(thinking|agentic)$/, "")));
      expect(caps).toMatchObject({ contextWindow: 1000000, thinkingFormat: "claude-adaptive" });
    }
  });

  it("keeps multimodal flags for dash-spelled vision models (glm-5.3-flash, qwen3.8)", () => {
    for (const [provider, model] of [
      ["glm", "glm-5-3-flash"],
      ["glm", "glm-5-3-flashx"],
      ["qwen", "qwen3-8-flash"],
      ["groq", "qwen/qwen3-8-27b"],
    ]) {
      expect(getCapabilitiesForModel(provider, model)).toMatchObject({ vision: true });
    }
  });

  it("keeps context limits for dash-spelled models (grok-4-5, gpt-5-4-mini)", () => {
    expect(getCapabilitiesForModel("grok-cli", "grok-4-5")).toEqual(
      getCapabilitiesForModel("grok-cli", "grok-4.5"),
    );
    expect(getCapabilitiesForModel("openai", "gpt-5-4-mini").contextWindow).toBe(
      getCapabilitiesForModel("openai", "gpt-5.4-mini").contextWindow,
    );
  });
});
