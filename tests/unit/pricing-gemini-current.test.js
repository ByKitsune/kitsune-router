import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { setCatalogSource } from "../../open-sse/providers/capabilities.js";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [],
  getCombos: async () => [],
  getCustomModels: async () => [],
  getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
const { buildModelsList } = await import("@/app/api/v1/models/route.js");

beforeEach(() => {
  setCatalogSource(null);
  vi.stubGlobal("fetch", () => { throw new Error("Unexpected network request"); });
});
afterEach(() => { setCatalogSource(null); vi.unstubAllGlobals(); });

// Paid API reference tariffs: https://ai.google.dev/gemini-api/docs/pricing
describe("Gemini current pricing", () => {
  it("prices gemini-2.5-pro at 1.25/10 (not stale 2/12)", () => {
    expect(getPricingForModel("gemini", "gemini-2.5-pro")).toMatchObject({ input: 1.25, output: 10 });
  });
  it("prices gemini-2.5-flash-lite at 0.10/0.40 after the cut", () => {
    expect(getPricingForModel("gemini", "gemini-2.5-flash-lite")).toMatchObject({ input: 0.1, output: 0.4 });
  });
  it("prices gemini-3.5-flash at 1.50/9.00 and 3.1-flash-lite at 0.25/1.50", () => {
    expect(getPricingForModel("gemini", "gemini-3.5-flash")).toMatchObject({ input: 1.5, output: 9 });
    expect(getPricingForModel("gemini", "gemini-3.1-flash-lite")).toMatchObject({ input: 0.25, output: 1.5 });
  });
  it("bills embedding input without requiring unused output or cache tariffs", () => {
    // https://ai.google.dev/gemini-api/docs/pricing
    const tokens = { prompt_tokens: 1000000, completion_tokens: 0 };
    expect(calculateCostFromTokens(tokens, getPricingForModel("gemini", "gemini-embedding-001"))).toBeCloseTo(0.15, 12);
  });
});

describe("Gemini consumer limit semantics", () => {
  it("publishes an image input allowance without inventing a total context window", async () => {
    // https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image
    // Input/output allowances are independent; the reviewed route leaves context unknown.
    const row = (await buildModelsList(["image"])).find(model => model.id === "gemini/gemini-3.1-flash-image");
    expect(row).toMatchObject({
      capabilities: { imageOutput: true, maxInput: 131072, maxOutput: 32768, contextWindow: null },
    });
    expect(row).not.toHaveProperty("context_length");
  });

  it("advertises Gemma's exact binary-token window rather than a rounded decimal label", async () => {
    // https://models.dev/api.json: google/gemma-4-31b-it, captured 2026-10-17.
    const row = (await buildModelsList(["llm"])).find(model => model.id === "gemini/gemma-4-31b-it");
    expect(row).toMatchObject({ context_length: 262144, max_completion_tokens: 32768 });
  });
});
