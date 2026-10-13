// 9router #4600/#4548/#4555: Claude Opus 5.5 and Sonnet 5.5 are available on
// the Antigravity2 catalog. They must be exposed through the provider registry
// with the real upstream ids, resolve capabilities/pricing, and be reachable
// from the MITM alias map.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import { getModelsByProviderId, getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { stripThinkingSuffix } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";
import { MITM_TOOLS } from "../../src/shared/constants/cliTools.js";

const require = createRequire(import.meta.url);
const { MODEL_SYNONYMS, MODEL_PATTERNS } = require("../../src/mitm/config.js");

const TIERED_IDS = [
  "claude-sonnet-5-5-high", "claude-sonnet-5-5-medium", "claude-sonnet-5-5-low",
  "claude-opus-5-5-high", "claude-opus-5-5-medium", "claude-opus-5-5-low",
];

describe("Antigravity Claude 5.5 models (#4600/#4548)", () => {
  it("includes Claude 5.5 models in the Antigravity provider registry", () => {
    const ids = getModelsByProviderId("ag").map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([
      ...TIERED_IDS,
      "claude-sonnet-5-5",
      "claude-opus-5-5",
    ]));
    // The upstream catalog exposes tiers, not "-thinking" aliases.
    expect(ids).not.toContain("claude-sonnet-5-5-thinking");
    expect(ids).not.toContain("claude-opus-5-5-thinking");

    const sonnet = getModelsByProviderId("ag").find((m) => m.id === "claude-sonnet-5-5");
    expect(sonnet?.upstreamModelId).toBe("claude-sonnet-5-5-high(high)");
    const opus = getModelsByProviderId("ag").find((m) => m.id === "claude-opus-5-5");
    expect(opus?.upstreamModelId).toBe("claude-opus-5-5-high(high)");
  });

  it("resolves the upstream model id with the thinking suffix stripped", () => {
    expect(getModelUpstreamId("ag", "claude-sonnet-5-5")).toBe("claude-sonnet-5-5-high(high)");
    expect(stripThinkingSuffix(getModelUpstreamId("ag", "claude-sonnet-5-5"))).toBe("claude-sonnet-5-5-high");
    expect(getModelUpstreamId("ag", "claude-opus-5-5")).toBe("claude-opus-5-5-high(high)");
    expect(stripThinkingSuffix(getModelUpstreamId("ag", "claude-opus-5-5"))).toBe("claude-opus-5-5-high");
    expect(getModelUpstreamId("ag", "claude-sonnet-5-5-high")).toBe("claude-sonnet-5-5-high(high)");
  });

  it("resolves capabilities for every Claude 5.5 id", () => {
    for (const id of [...TIERED_IDS, "claude-sonnet-5-5", "claude-opus-5-5"]) {
      const caps = getCapabilitiesForModel("ag", id);
      expect(caps.vision, id).toBe(true);
      expect(caps.reasoning, id).toBe(true);
      expect(caps.contextWindow, id).toBe(1000000);
      expect(caps.maxOutput, id).toBe(128000);
      expect(caps.thinkingFormat, id).toBe("claude-adaptive");
    }
  });

  it("resolves pricing for the tiered ids at the base model rates", () => {
    for (const id of ["claude-sonnet-5-5", ...TIERED_IDS.filter((i) => i.startsWith("claude-sonnet"))]) {
      expect(getPricingForModel("ag", id), id).toMatchObject({ input: 2.0, output: 10.0, cached: 0.2 });
    }
    for (const id of ["claude-opus-5-5", ...TIERED_IDS.filter((i) => i.startsWith("claude-opus"))]) {
      expect(getPricingForModel("ag", id), id).toMatchObject({ input: 4.0, output: 20.0, cached: 0.2, cache_creation: 5.0 });
    }
  });

  it("exposes the Claude 5.5 aliases in the Antigravity MITM tool config", () => {
    const ag = MITM_TOOLS.antigravity;
    for (const id of ["claude-sonnet-5-5", "claude-opus-5-5", ...TIERED_IDS]) {
      expect(ag.modelAliases, id).toContain(id);
      expect(ag.defaultModels.find((m) => m.id === id), id).toBeTruthy();
    }
    expect(ag.modelAliases).not.toContain("claude-opus-5-5-thinking");
  });

  it("normalizes dotted and dashed Claude 5.5 names via MITM synonyms", () => {
    const synonyms = MODEL_SYNONYMS.antigravity;
    expect(synonyms["claude-sonnet-5.5"]).toBe("claude-sonnet-5-5");
    expect(synonyms["claude-opus-5.5"]).toBe("claude-opus-5-5");
    expect(synonyms["claude-opus-5.5-thinking"]).toBe("claude-opus-5-5");
    expect(synonyms["claude-sonnet-5-5-thinking"]).toBe("claude-sonnet-5-5");
    expect(synonyms["claude-opus-5.5-high"]).toBe("claude-opus-5-5-high");
  });

  it("matches Claude 5.5 through MITM patterns before the 4.6 fallback", () => {
    const match = (raw) => MODEL_PATTERNS.antigravity.find((p) => p.match.test(raw))?.alias;
    expect(match("claude-opus-5.5-high")).toBe("claude-opus-5-5-high");
    expect(match("claude-sonnet-5-5-medium")).toBe("claude-sonnet-5-5-medium");
    expect(match("claude-opus-5.5")).toBe("claude-opus-5-5");
    expect(match("claude-sonnet-5.5")).toBe("claude-sonnet-5-5");
    // Older generations keep their existing mapping.
    expect(match("claude-opus-4.6")).toBe("claude-opus-4-6-thinking");
    expect(match("claude-sonnet-4.6")).toBe("claude-sonnet-4-6");
  });
});
