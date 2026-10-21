import { describe, it, expect } from "vitest";
import { MODEL_PRICING, calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import kimiRegistry from "../../open-sse/providers/registry/kimi.js";
import minimaxRegistry from "../../open-sse/providers/registry/minimax.js";
import glmRegistry from "../../open-sse/providers/registry/glm.js";

// Primary product guides reviewed2026-10-21: Kimi Code, MiniMax SDK/PAYG,
// and GLM Coding Plan. Identical weights on a PAYG API are a different product.
describe("Kimi current lineup", () => {
  const ids = kimiRegistry.models.map((m) => m.id);
  it("dropped discontinued k2.5/thinking/latest IDs", () => {
    for (const id of ["kimi-k2.5", "kimi-k2.5-thinking", "kimi-latest", "kimi-k2", "kimi-k2-thinking"]) {
      expect(ids).not.toContain(id);
      expect(MODEL_PRICING[id]).toBeUndefined();
    }
  });
  it("does not borrow Moonshot PAYG prices for Kimi Code's compatibility ID", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 500000, completion_tokens: 1000000 }, getPricingForModel("kimi", "kimi-k2.6"))).toBeNull();
  });
});

describe("MiniMax current pricing", () => {
  it("does not turn removed M2.x pricing rows into verified current invoices", () => {
    // Current native SDK/price tables list M3/M3.1; preserve older IDs without
    // inventing a retirement or inheriting the historical0.30/1.20 quote.
    for (const model of ["MiniMax-M2.7", "MiniMax-M2.5", "MiniMax-M2.1"]) {
      expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 500000, completion_tokens: 1000000 }, getPricingForModel("minimax", model))).toBeNull();
    }
  });
  it("lists base M2 plus highspeed variants", () => {
    const ids = minimaxRegistry.models.map((m) => m.id);
    for (const id of ["MiniMax-M2", "MiniMax-M2.7-highspeed", "MiniMax-M2.5-highspeed", "MiniMax-M2.1-highspeed"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("GLM current pricing", () => {
  it("keeps GLM5.x Coding Plan points separate from PAYG API dollars", () => {
    for (const model of ["glm-5.3", "glm-5.3-flash", "glm-5.2", "glm-5.1", "glm-5"]) {
      expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1000000 }, getPricingForModel("glm", model))).toBeNull();
    }
  });
  it("does not call subscription Flash models free or manufacture legacy cache invoices", () => {
    for (const model of ["glm-4.7", "glm-4.6v", "glm-4.5-air", "glm-5.3-flashx", "glm-4.7-flash"]) {
      expect(calculateCostFromTokens({ prompt_tokens: 1000000, cached_tokens: 500000, cache_creation_input_tokens: 500000, completion_tokens: 1000000 }, getPricingForModel("glm", model))).toBeNull();
    }
  });
  it("lists the new variants in the registry", () => {
    const ids = glmRegistry.models.map((m) => m.id);
    for (const id of ["glm-5.3-flashx", "glm-5-turbo", "glm-4.7-flash", "glm-4.7-flashx", "glm-4.5", "glm-4.5v", "glm-4.6v-flashx"]) {
      expect(ids).toContain(id);
    }
  });
});
