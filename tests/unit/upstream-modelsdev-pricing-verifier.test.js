import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  MODELS_DEV_PRICING_SOURCE, MODELS_DEV_PRICING_PRODUCTS, MODELS_DEV_PRICING_REFERENCES, MODELS_DEV_PRICING_ESTIMATE_MODELS,
} from "../../open-sse/providers/metadata/modelsDevPricing.js";
import { MODELS_DEV_REGISTRY_PRICING_REFERENCES } from "../../open-sse/providers/metadata/modelsDevPricingRegistry.js";
import { EXPECTED_MODELS_DEV_EXTRACTION_SHA256, serializeModelsDevExtraction } from "../../scripts/modelsdev-pricing-extraction-digest.mjs";

const verifier = fileURLToPath(new URL("../../scripts/verify-modelsdev-pricing.mjs", import.meta.url));
const hash = value => createHash("sha256").update(value, "utf8").digest("hex");
const reverseObject = obj => Object.fromEntries(Object.entries(obj).reverse());

describe("offline models.dev extraction verification", () => {
  it("canonicalizes entry order but detects changes to costs, products, membership, whitelist, or source", () => {
    const baseline = hash(serializeModelsDevExtraction());
    expect(baseline).toBe(EXPECTED_MODELS_DEV_EXTRACTION_SHA256);
    const references = reverseObject(Object.fromEntries(Object.entries(MODELS_DEV_PRICING_REFERENCES).map(([provider, models]) => [provider, reverseObject(models)])));
    const estimates = reverseObject(Object.fromEntries(Object.entries(MODELS_DEV_PRICING_ESTIMATE_MODELS).map(([provider, models]) => [provider, [...models].reverse()])));
    expect(hash(serializeModelsDevExtraction({ source: reverseObject(MODELS_DEV_PRICING_SOURCE), products: reverseObject(MODELS_DEV_PRICING_PRODUCTS),
      references, registryReferences: [...MODELS_DEV_REGISTRY_PRICING_REFERENCES].reverse(), estimates }))).toBe(baseline);

    const modified = structuredClone(MODELS_DEV_PRICING_REFERENCES);
    modified.github["gpt-5.6-luna"].tiers[0].tier.size = 1;
    expect(hash(serializeModelsDevExtraction({ references: modified }))).not.toBe(baseline);
    expect(hash(serializeModelsDevExtraction({ products: { ...MODELS_DEV_PRICING_PRODUCTS, github: "openai" } }))).not.toBe(baseline);
    expect(hash(serializeModelsDevExtraction({ registryReferences: MODELS_DEV_REGISTRY_PRICING_REFERENCES.slice(1) }))).not.toBe(baseline);
    expect(hash(serializeModelsDevExtraction({ estimates: {} }))).not.toBe(baseline);
    expect(hash(serializeModelsDevExtraction({ source: { ...MODELS_DEV_PRICING_SOURCE, verifiedAtUtc: "2026-10-29T00:00:00Z" } }))).not.toBe(baseline);
  });

  it("reports compact extraction integrity without claiming full snapshot or completeness verification", () => {
    const result = spawnSync(process.execPath, [verifier, "--extraction-only"], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: "extraction-only", extractionSha256: EXPECTED_MODELS_DEV_EXTRACTION_SHA256,
      expectedSnapshotSha256: MODELS_DEV_PRICING_SOURCE.sha256,
      upstreamProvenance: "not independently established by either hash",
      snapshotVerification: "unavailable without the original full snapshot",
      snapshotRegistryCompleteness: "not independently verified without the original full snapshot",
      snapshotEstimateEligibility: "modalities not independently verified without the original full snapshot",
      referencedRegistryRows: 149, referencedRegistryPairs: 146, extractedRegistryPairs: 123, references: 163, estimates: 16,
    });
    expect(JSON.parse(result.stdout)).not.toHaveProperty("verifiedSnapshotSha256");
  });

  it("rejects a full payload whose bytes do not match the pinned SHA-256", () => {
    const dir = mkdtempSync(join(process.env.TMPDIR || "/tmp/opencode", "modelsdev-verifier-"));
    try {
      const fixture = join(dir, "wrong.json");
      writeFileSync(fixture, "{}\n");
      const result = spawnSync(process.execPath, [verifier, fixture], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Unexpected snapshot SHA-256");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
