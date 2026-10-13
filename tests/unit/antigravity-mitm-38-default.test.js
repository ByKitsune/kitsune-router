// 9router commit 24034f69: the Antigravity catalog moved to the 3.8 generation,
// but the MITM synonym/pattern map still routed the agent's "Default" model and
// every 3.5-era request to the old 3.5 slots. The synonyms now fold the 3.5
// generation onto 3.8, so a request the IDE labels with an older tier lands on
// the model the catalog actually serves.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { MODEL_SYNONYMS, MODEL_PATTERNS } = require("../../src/mitm/config.js");

const match = (raw) => MODEL_PATTERNS.antigravity.find((p) => p.match.test(raw))?.alias;

describe("Antigravity MITM 3.8 catalog alignment (24034f69)", () => {
  it("maps the Default slot to 3.8 medium, not 3.5", () => {
    expect(MODEL_SYNONYMS.antigravity["gemini-default"]).toBe("gemini-3.8-flash-medium");
  });

  it("folds every 3.5 tier onto its 3.8 counterpart", () => {
    const synonyms = MODEL_SYNONYMS.antigravity;
    expect(synonyms["gemini-3.5-flash-high"]).toBe("gemini-3.8-flash-high");
    expect(synonyms["gemini-3.5-flash-medium"]).toBe("gemini-3.8-flash-medium");
    expect(synonyms["gemini-3.5-flash-low"]).toBe("gemini-3.8-flash-low");
    expect(synonyms["gemini-3.5-flash-extra-low"]).toBe("gemini-3.8-flash-low");
  });

  it("keeps the 3.6 tier addressable", () => {
    const synonyms = MODEL_SYNONYMS.antigravity;
    expect(synonyms["gemini-3.6-flash-high"]).toBe("gemini-3.6-flash-high");
    expect(synonyms["gemini-3.6-flash-medium"]).toBe("gemini-3.6-flash-medium");
    expect(synonyms["gemini-3.6-flash-low"]).toBe("gemini-3.6-flash-low");
  });

  it("routes unmatched flash variants to the 3.8 generation", () => {
    expect(match("gemini-3.5-flash-low")).toBe("gemini-3.8-flash-low");
    expect(match("flash-lite-something-else")).toBe("gemini-3.8-flash-high");
    expect(match("gemini-4-flash-whatever")).toBe("gemini-3.8-flash-high");
  });

  it("keeps pro and Claude routing unchanged", () => {
    expect(match("gemini-3-pro-low")).toBe("gemini-3.1-pro-low");
    expect(match("gemini-3-pro-high")).toBe("gemini-pro-agent");
    expect(match("claude-opus-5.5")).toBe("claude-opus-5-5");
    expect(match("claude-sonnet-4.6")).toBe("claude-sonnet-4-6");
  });
});
