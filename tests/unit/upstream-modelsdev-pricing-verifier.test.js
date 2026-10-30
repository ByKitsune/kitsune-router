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
import { verifyModelsDevRegistryMembership } from "../../scripts/modelsdev-pricing-registry-membership.mjs";

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
      referencedRegistryRows: 142, referencedRegistryPairs: 139, historicalRetiredRegistryPairs: 5,
      extractedRegistryPairs: 123, references: 163, estimates: 16,
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

  it("verifies an approved retired reference without requiring current advertisement", () => {
    const provider = "github", model = "claude-opus-4.7";
    const key = JSON.stringify([provider, model]);
    const cost = MODELS_DEV_PRICING_REFERENCES[provider][model];
    const input = { rows: [[provider, model, structuredClone(cost)]], references: MODELS_DEV_PRICING_REFERENCES,
      currentPairs: new Set(), verifiedSnapshotPairs: new Set([key]) };
    expect(verifyModelsDevRegistryMembership(input)).toEqual({ extractedPairs: new Set([key]), retiredPairs: new Set([key]) });
    // A retirement is never an exemption from literal full-snapshot evidence.
    expect(() => verifyModelsDevRegistryMembership({ ...input, verifiedSnapshotPairs: new Set() })).toThrow("Not a unique exact registry pair");
  });

  it.each([
    ["github", "unreviewed-missing-model"], ["github", "gpt-5.6-luna"],
    ["openai", "gpt-5.5"], ["gh", "gpt-5.5"], ["github", "GPT-5.5"],
  ])("does not allow an unreviewed missing current pair %s/%s", (provider, model) => {
    const cost = { input: 1, output: 2 };
    expect(() => verifyModelsDevRegistryMembership({ rows: [[provider, model, cost]],
      references: { [provider]: { [model]: cost } }, currentPairs: new Set() })).toThrow("Not a unique exact registry pair");
  });

  it("rejects duplicated, altered or unsupported costs even for an approved retired model", () => {
    const provider = "github", model = "gpt-5.5";
    const cost = structuredClone(MODELS_DEV_PRICING_REFERENCES[provider][model]);
    const row = [provider, model, cost];
    const input = { rows: [row], references: MODELS_DEV_PRICING_REFERENCES, currentPairs: new Set() };
    expect(() => verifyModelsDevRegistryMembership({ ...input, rows: [row, structuredClone(row)] })).toThrow("Not a unique exact registry pair");
    expect(() => verifyModelsDevRegistryMembership({ ...input, rows: [[provider, model, { ...cost, input: 999 }]] })).toThrow("Not a unique exact registry pair");
    expect(() => verifyModelsDevRegistryMembership({ ...input, references: {} })).toThrow("Not a unique exact registry pair");
  });
});
