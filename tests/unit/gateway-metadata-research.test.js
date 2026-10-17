import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";

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

describe("hosted billing contracts", () => {
  it.each([
    ["opencode-go", "grok-4.7"],
    ["clinepass", "cline-pass/glm-5.3"],
  ])("labels %s/%s as subscription quota rather than a cash token tariff", async (provider, id) => {
    // https://opencode.ai/docs/go/ and
    // https://docs.cline.bot/getting-started/clinepass
    const row = (await buildModelsList(["llm"])).find(model => model.id === `${provider}/${id}`);
    expect(row).toMatchObject({ metadata: { billing: { unit: "month", kind: "subscription-quota-reference" } } });
  });

  it.each([
    ["morph-kimik3", 500000, 2.795],
    ["morph-glm53-744b", 500000, 1.06675],
    ["morph-glm53flash", 500000, 0.19],
    ["morph-dsv41flash", 0, 0.21],
    ["morph-dsv4flash", 500000, 0.1289078125],
  ])("uses %s's hosted tariff for cache-inclusive usage and output-billed reasoning", (id, cached, expected) => {
    // https://docs.morphllm.com/sdk/components/fast-models
    const tokens = { prompt_tokens: 1000000, cached_tokens: cached, completion_tokens: 100000, reasoning_tokens: 60000 };
    expect(calculateCostFromTokens(tokens, getPricingForModel("morph", id))).toBeCloseTo(expected, 12);
  });
});
