import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { calculateCostBreakdown, getPricingForModel } from "../../open-sse/providers/pricing.js";
import {
  BUNDLED_MODELS_DEV_PRICING_OBSERVATIONS, createModelsDevPricingObservation,
  getModelsDevPricingEstimate, getModelsDevPricingReference, getModelsDevPricingStatus,
  setModelsDevPricingObservationSource, validateModelsDevPricingObservation,
} from "../../open-sse/providers/metadata/modelsDevPricing.js";
import current from "../../open-sse/providers/metadata/modelsDevPricingCurrent.js";

const model = "nvidia/nemotron-3-super-120b-a12b";
const before = { timestamp: "2026-10-29T06:00:00Z" };
const after = { timestamp: "2026-10-29T07:00:00Z" };
const source = (suffix = "a", at = "2026-10-29T08:00:00Z") => ({
  url: "https://models.dev/api.json", verifiedAtUtc: at,
  sha256: suffix.repeat(64), snapshotDate: "2026-10-29",
});
const textModel = (id, cost = { input: 3, output: 6, cache_read: 0.5 }) => ({ id, cost, modalities: { input: ["text"], output: ["text"] } });
const catalog = (models) => ({ openrouter: { models } });
const importer = fileURLToPath(new URL("../../scripts/import-modelsdev-pricing.mjs", import.meta.url));

afterEach(() => setModelsDevPricingObservationSource(null));

describe("versioned models.dev pricing observations", () => {
  it("retains old event quotes while exposing the verified reconstructed current source", () => {
    const old = getModelsDevPricingEstimate("openrouter", model, before);
    const now = getModelsDevPricingEstimate("openrouter", model, after);
    expect(old).toMatchObject({ input: 0.3, output: 2.4, cached: null });
    expect(old.provenance.sha256).toBe("bb81b8bddd68fe7cba6504ce9a8cb217fdafb8cf1fd29b56232138b0860bb82f");
    expect(now).toMatchObject({ input: 0.3, output: 2.4, cached: 0.15, reasoning: null });
    expect(now.provenance).toMatchObject({ sha256: current.source.sha256, repositoryCommit: "91395aca0144ed1a54cdd527dc9d7eb682e1e4cd" });
    expect(getModelsDevPricingReference("openrouter", model).retrieval).toContain("not an HTTP API capture");
    expect(getModelsDevPricingReference("openrouter", model, before).sha256).toBe(old.provenance.sha256);
  });

  it("covers dynamic exact-product IDs without borrowing another host's quote", () => {
    expect(Object.values(current.references).reduce((sum, rows) => sum + Object.keys(rows).length, 0)).toBe(1411);
    expect(Object.values(current.estimates).flat()).toHaveLength(359);
    expect(getPricingForModel("mistral", "devstral-2512", after)).toMatchObject({ input: 0.4, output: 2 });
    expect(getPricingForModel("unknown-host", "devstral-2512", after)).toBeNull();
    expect(getPricingForModel("openrouter", model, after).input).toBe(0.3);
    expect(getPricingForModel("vercel", model, after).input).toBe(0.15);
    expect(getPricingForModel("openrouter", model.toUpperCase(), after)).toBeNull();
  });

  it("uses a current explicit cached rate but does not invent reasoning or speed tariffs", () => {
    const quote = getPricingForModel("openrouter", model, after);
    expect(calculateCostBreakdown({ prompt_tokens: 1000000, cached_tokens: 100000, completion_tokens: 1000000 }, quote).totalCost).toBeCloseTo(2.685);
    expect(calculateCostBreakdown({ prompt_tokens: 100, completion_tokens: 100, reasoning_tokens: 10 }, quote).totalCost).toBeNull();
    expect(calculateCostBreakdown({ prompt_tokens: 100, completion_tokens: 100, actualServiceTier: "fast" }, quote).totalCost).toBeNull();
  });

  it("requires a recorded timestamp and expires exactly24h after a real observation", () => {
    const start = Date.parse(current.source.verifiedAtUtc);
    expect(getModelsDevPricingEstimate("openrouter", model)).toBeNull();
    expect(getModelsDevPricingStatus("openrouter", model).status).toBe("timestamp-required");
    expect(getModelsDevPricingEstimate("openrouter", model, { timestamp: start + 86400000 - 1 })).not.toBeNull();
    expect(getModelsDevPricingEstimate("openrouter", model, { timestamp: start + 86400000 })).toBeNull();
    expect(getModelsDevPricingStatus("openrouter", model, { timestamp: start + 86400000 })).toMatchObject({ status: "expired", eligible: true });
    expect(getModelsDevPricingStatus("openrouter", model, { timestamp: "2026-10-29T07:00:00" }).status).toBe("timestamp-required");
  });

  it("treats every new observation as a whole replacement and preserves in-flight older instants", () => {
    const empty = createModelsDevPricingObservation(catalog({}), source());
    setModelsDevPricingObservationSource(() => [empty]);
    expect(getModelsDevPricingEstimate("openrouter", model, after)).not.toBeNull();
    expect(getModelsDevPricingEstimate("openrouter", model, { timestamp: "2026-10-29T08:00:00Z" })).toBeNull();
    expect(getModelsDevPricingStatus("openrouter", model, { timestamp: "2026-10-29T08:00:00Z" }).status).toBe("unmapped");
  });

  it("selects rates by instant across refreshed, changed and removed observations", () => {
    const changed = createModelsDevPricingObservation(catalog({ [model]: textModel(model) }), source());
    const removed = createModelsDevPricingObservation(catalog({}), source("b", "2026-10-29T09:00:00Z"));
    setModelsDevPricingObservationSource(() => [removed, changed]);
    expect(getModelsDevPricingEstimate("openrouter", model, after).input).toBe(0.3);
    expect(getModelsDevPricingEstimate("openrouter", model, { timestamp: "2026-10-29T08:30:00Z" }).input).toBe(3);
    expect(getModelsDevPricingEstimate("openrouter", model, { timestamp: "2026-10-29T09:00:00Z" })).toBeNull();
  });

  it("fails closed when a persisted reader is unavailable or capture times conflict", () => {
    setModelsDevPricingObservationSource(() => { throw new Error("Corrupt observation"); });
    expect(getModelsDevPricingStatus("openrouter", model, after).status).toBe("source-unavailable");
    expect(getModelsDevPricingEstimate("openrouter", model, after)).toBeNull();
    const a = createModelsDevPricingObservation(catalog({ [model]: textModel(model) }), source("a"));
    const b = createModelsDevPricingObservation(catalog({ [model]: textModel(model) }), source("b"));
    setModelsDevPricingObservationSource(() => [a, b]);
    expect(getModelsDevPricingEstimate("openrouter", model, { timestamp: "2026-10-29T08:01:00Z" })).toBeNull();
    expect(getModelsDevPricingEstimate("openrouter", model, before)).not.toBeNull();
  });

  it("keeps media, tiers, zero and subscription references from becoming USD token estimates", () => {
    for (const row of [
      { ...textModel("m"), modalities: { input: ["text", "audio"], output: ["text"] } },
      textModel("m", { input: 0, output: 0 }),
      textModel("m", { input: 1, output: 2, tiers: [{ input: 3, tier: { type: "context", size: 200000 } }] }),
      textModel("m", { input: 1, output: 2, cache_read: -1 }),
    ]) {
      const observation = createModelsDevPricingObservation(catalog({ m: row }), source());
      expect(observation.references.openrouter.m).toBeDefined();
      expect(observation.estimates.openrouter).toBeUndefined();
    }
    const plan = createModelsDevPricingObservation({ "zai-coding-plan": { models: { m: textModel("m") } } }, source());
    expect(plan.references.glm.m).toBeDefined();
    expect(plan.estimates.glm).toBeUndefined();
    expect(getPricingForModel("glm", "glm-5.3", after)).toMatchObject({ input: null, output: null });
    expect(getPricingForModel("groq", "llama-3.3-70b-versatile", after)).toMatchObject({ input: null, output: null });
  });

  it("validates persisted eligibility rather than trusting a supplied estimate whitelist", () => {
    const observation = structuredClone(createModelsDevPricingObservation(catalog({ m: textModel("m") }), source()));
    expect(validateModelsDevPricingObservation(observation)).toBe(observation);
    const forged = structuredClone(observation);
    forged.references.openrouter.m.cost.input = 0;
    expect(() => validateModelsDevPricingObservation(forged)).toThrow(/eligibility/);
    const plan = structuredClone(createModelsDevPricingObservation({ "zai-coding-plan": { models: { m: textModel("m") } } }, source()));
    plan.estimates.glm = ["m"];
    expect(() => validateModelsDevPricingObservation(plan)).toThrow(/eligibility/);
    expect(Object.isFrozen(observation.references.openrouter.m.cost)).toBe(true);
    const wrongProduct = structuredClone(observation);
    wrongProduct.products.openrouter = "openai";
    expect(() => validateModelsDevPricingObservation(wrongProduct)).toThrow(/product/);
    expect(() => createModelsDevPricingObservation(catalog({ m: textModel("m") }), source(), { openrouter: "openai" })).toThrow(/approved route/);
  });

  it("keeps current generated source and importer check mode offline and deterministic", () => {
    expect(BUNDLED_MODELS_DEV_PRICING_OBSERVATIONS[1]).toBe(current);
    const directory = mkdtempSync(join(tmpdir(), "pricing-source-check-"));
    try {
      const snapshot = join(directory, "snapshot.json"), evidence = join(directory, "evidence.json");
      writeFileSync(snapshot, "{}\n");
      writeFileSync(evidence, JSON.stringify({ ...source(), sourceUrl: "https://models.dev/api.json", retrieval: "synthetic test fixture" }));
      const target = fileURLToPath(new URL("../../open-sse/providers/metadata/modelsDevPricingCurrent.js", import.meta.url));
      const unchanged = readFileSync(target, "utf8");
      const rejected = spawnSync(process.execPath, [importer, snapshot, evidence], { encoding: "utf8" });
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain("SHA-256 differs");
      expect(readFileSync(target, "utf8")).toBe(unchanged);
    } finally { rmSync(directory, { recursive: true, force: true }); }
    const result = spawnSync(process.execPath, [importer], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Usage:");
    expect(result.stdout).toBe("");
  });
});
