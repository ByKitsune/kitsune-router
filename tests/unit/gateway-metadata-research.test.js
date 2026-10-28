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
    ["opencode-go", "grok-4.7", 0.26, true],
    ["clinepass", "cline-pass/glm-5.3", 0.184, false],
  ])("labels %s/%s as subscription quota rather than a cash token tariff", async (provider, id, expected, unknownCash) => {
    // https://opencode.ai/v2/docs/console/go/ and
    // https://docs.cline.bot/getting-started/clinepass
    const row = (await buildModelsList(["llm"])).find(model => model.id === `${provider}/${id}`);
    expect(row).toMatchObject({ metadata: { billing: {
      currency: "USD", unit: "per_1000000_tokens", kind: "subscription-reference",
      referenceUnit: "USD_quota_reference_per_1000000_tokens", invoiceVerified: false,
      estimateBasis: "primary-product-token-reference",
    } } });
    // References can estimate quota usage. Go's reference must not flow into
    // the cash calculator; the unchanged ClinePass behavior is outside scope.
    const tokens = { prompt_tokens: 100000, completion_tokens: 10000 };
    expect(calculateCostFromTokens(tokens, row.metadata.billing.referencePricing)).toBeCloseTo(expected, 12);
    const cash = calculateCostFromTokens(tokens, getPricingForModel(provider, id));
    if (unknownCash) expect(cash).toBeNull();
    else expect(cash).toBeCloseTo(expected, 12);
  });

  it.each([
    ["morph-kimik3", 500000, 2.0915],
    ["morph-glm53-744b", 500000, 0.576],
    ["morph-glm53flash", 500000, 0.491],
    ["morph-dsv41flash", 0, 0.266],
    ["morph-dsv4flash", 500000, 0.0851],
  ])("uses %s's hosted tariff for cache-inclusive usage and output-billed reasoning", (id, cached, expected) => {
    // Primary https://www.morphllm.com/api/models/json captured 2026-10-21.
    // cost_usd is explicitly per token. Half cached input + 100K total output
    // (including 60K reasoning); no extra reasoning charge or guessed cache fee.
    const tokens = { prompt_tokens: 1000000, cached_tokens: cached, completion_tokens: 100000, reasoning_tokens: 60000 };
    expect(calculateCostFromTokens(tokens, getPricingForModel("morph", id))).toBeCloseTo(expected, 12);
  });
});
