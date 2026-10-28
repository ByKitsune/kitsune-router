import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { REVIEWED_MODEL_METADATA, getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { PRICING_RATE_FIELDS } from "../../open-sse/config/pricingConfig.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";

// V2 documents Go plan-allowance references, not a per-request cash invoice:
// https://opencode.ai/v2/docs/console/go/#usage-limits
// Independently captured provider catalog: https://models.dev/api.json,
// 2026-10-29 sha256 a0af14e6709252ef4da167c43df2de1926e6116b0204859fe3c9e865dea5a38a.
const usage = { prompt_tokens: 1000000, cached_tokens: 200000, completion_tokens: 100000 };
const referenceCases = [
  ["kimi-k3", { input: 3, output: 15, cached: 0.3 }],
  ["kimi-k3.1-pro", { input: 2, output: 10, cached: 0.2, cache_creation: 2 }],
  ["glm-5.3", { input: 1.4, output: 4.4, cached: 0.26 }],
  ["glm-5.3-flash", { input: 0.15, output: 0.5, cached: 0.03 }],
  ["glm-5.2", { input: 1.4, output: 4.4, cached: 0.26 }],
  ["deepseek-v4-pro", { input: 1.32, output: 3.96, cached: 0.044 }],
  ["deepseek-v4.1-flash", { input: 0.3, output: 1.2, cached: 0.006 }],
  ["gpt-6-luna", { input: 0.1, output: 0.5, cached: 0.01, cache_creation: 0.125,
    tier: { threshold: 272000, input: 0.2, output: 0.75, cached: 0.02, cache_creation: 0.25 } }],
];

describe("OpenCode Go subscription references are not cash tariffs", () => {
  it.each(referenceCases)("keeps the exact %s reference while cash pricing stays unknown", (model, reference) => {
    const record = getReviewedModelMetadata("opencode-go", model);
    expect(record.billing).toMatchObject({
      kind: "subscription-reference", referenceUnit: "USD_quota_reference_per_1000000_tokens",
      invoiceVerified: false, referencePricing: reference,
    });
    expect(record.sources).toContain("https://opencode.ai/v2/docs/console/go/");
    for (const provider of ["opencode-go", "ocg"]) {
      const price = getPricingForModel(provider, model);
      for (const field of PRICING_RATE_FIELDS) expect(price[field], `${model}.${field}`).toBeNull();
      expect(price).not.toHaveProperty("tier");
      expect(calculateCostFromTokens(usage, price)).toBeNull();
    }
  });

  it("covers every unverified Go subscription record, including models not in the sample", () => {
    const rows = Object.entries(REVIEWED_MODEL_METADATA["opencode-go"])
      .filter(([, record]) => record.billing?.kind === "subscription-reference" && record.billing.invoiceVerified !== true);
    expect(rows.length).toBeGreaterThanOrEqual(28);
    for (const [model, record] of rows) {
      for (const field of PRICING_RATE_FIELDS) {
        expect(record.pricing[field], `${model}.${field}`).toBeNull();
        expect(record.billing.unverifiedPriceFields, `${model}.${field}`).toContain(field);
      }
      expect(record.pricing).not.toHaveProperty("tier");
      expect(calculateCostFromTokens(usage, getPricingForModel("opencode-go", model)), model).toBeNull();
    }
  });

  it("does not turn unverified free-suffixed Go rows into verified zero tariffs", () => {
    for (const model of ["longcat-2.5-preview-free", "space-bunny-free"]) {
      const price = getPricingForModel("ocg", model);
      expect(price).toMatchObject({ input: null, output: null, cached: null });
      expect(calculateCostFromTokens(usage, price)).toBeNull();
      expect(calculateCostFromTokens({ prompt_tokens: 0, completion_tokens: 0 }, price)).toBe(0);
    }
  });

  it("preserves synthetic verified cash quotes through both quota-generation stages", () => {
    // Run the actual pure metadata generator with fixture records injected
    // before its quota pass. No real invoice, account, storage or network is used.
    const source = readFileSync(new URL("../../open-sse/providers/metadata/gatewayModels.js", import.meta.url), "utf8");
    const loop = "for (const [provider, review] of Object.entries(gatewayQuotaReview)) {";
    const end = "export default gatewayModels;";
    expect(source.split(loop)).toHaveLength(2);
    expect(source.split(end)).toHaveLength(2);
    const inject = `
      for (const model of ["kimi-k3", "glm-5.3", "kimi-k3.1-pro"]) {
        gatewayModels["opencode-go"][model] = {
          ...gatewayModels["opencode-go"][model],
          pricing: { input: 0, output: 4.5, cached: 0, tier: { threshold: 200000, input: 3, output: 8 } },
          billing: { invoiceVerified: true, invoiceEvidence: "synthetic-only" },
          provenance: { cashQuote: { reviewedAt: "2026-10-01", evidence: "synthetic-only" } },
        };
      }
      gatewayModels["opencode-go"]["mimo-v2.5"] = {
        ...gatewayModels["opencode-go"]["mimo-v2.5"], pricing: undefined,
        billing: { invoiceVerified: true },
      };
      gatewayModels["opencode-go"]["minimax-m3"] = {
        ...gatewayModels["opencode-go"]["minimax-m3"], pricing: { input: 0, output: 0 },
        billing: { invoiceVerified: false },
      };
    `;
    const generated = runInNewContext(source.replace(loop, `${inject}\n${loop}`).replace(end, "gatewayModels;"), {}, { timeout: 5000 });
    for (const model of ["kimi-k3", "glm-5.3", "kimi-k3.1-pro"]) {
      const row = generated["opencode-go"][model];
      expect(row.pricing).toEqual({ input: 0, output: 4.5, cached: 0, tier: { threshold: 200000, input: 3, output: 8 } });
      expect(row.billing).toMatchObject({ kind: "subscription-reference", invoiceVerified: true, invoiceEvidence: "synthetic-only" });
      expect(row.billing.referencePricing.input).toBeGreaterThan(0);
      expect(row.billing).not.toHaveProperty("unverifiedPriceFields");
      expect(row.provenance.cashQuote).toEqual({ reviewedAt: "2026-10-01", evidence: "synthetic-only" });
    }
    for (const model of ["mimo-v2.5", "minimax-m3"]) {
      const row = generated["opencode-go"][model];
      expect(row.billing.invoiceVerified).toBe(false);
      expect(row.pricing).toMatchObject({ input: null, output: null, cached: null });
    }
  });

  it("leaves other provider quotes and confirmed zero promotions alone", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 10000 }, getPricingForModel("ollama", "kimi-k3"))).toBeCloseTo(3.15, 12);
    expect(calculateCostFromTokens(usage, getPricingForModel("opencode", "deepseek-v4.1-flash-free"))).toBe(0);
    expect(getReviewedModelMetadata("clinepass", "cline-pass/glm-5.3").billing.referencePricing).toEqual({ input: 1.4, output: 4.4, cached: 0.26 });
  });
});
