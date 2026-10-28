// Offline only; never downloads, writes a database, or modifies source files.
//   node scripts/verify-modelsdev-pricing.mjs SNAPSHOT.json
//   node scripts/verify-modelsdev-pricing.mjs --extraction-only
// The compact extraction cannot reconstruct the full-payload hash, establish
// upstream origin/capture time, or independently prove omitted rows/semantics.
// Fetching today's changing endpoint is not a substitute for the pinned file.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  MODELS_DEV_PRICING_SOURCE,
  MODELS_DEV_PRICING_PRODUCTS,
  MODELS_DEV_PRICING_REFERENCES,
  MODELS_DEV_PRICING_ESTIMATE_MODELS,
} from "../open-sse/providers/metadata/modelsDevPricing.js";
import { getReviewedModelMetadata } from "../open-sse/providers/metadata/reviewed.js";
import { MODELS_DEV_REGISTRY_PRICING_REFERENCES } from "../open-sse/providers/metadata/modelsDevPricingRegistry.js";
import registry from "../open-sse/providers/registry/index.js";
import { EXPECTED_MODELS_DEV_EXTRACTION_SHA256, serializeModelsDevExtraction } from "./modelsdev-pricing-extraction-digest.mjs";

if (process.argv.length !== 3) throw new Error("Pass the pinned snapshot path or --extraction-only");
const extractionOnly = process.argv[2] === "--extraction-only";
const extractionHash = createHash("sha256").update(serializeModelsDevExtraction(), "utf8").digest("hex");
if (extractionHash !== EXPECTED_MODELS_DEV_EXTRACTION_SHA256) throw new Error(`Unexpected extraction SHA-256: ${extractionHash}`);

let catalog = null, snapshotHash = null;
if (!extractionOnly) {
  const bytes = readFileSync(process.argv[2]);
  snapshotHash = createHash("sha256").update(bytes).digest("hex");
  if (snapshotHash !== MODELS_DEV_PRICING_SOURCE.sha256) throw new Error(`Unexpected snapshot SHA-256: ${snapshotHash}`);
  catalog = JSON.parse(bytes.toString("utf8"));
}

let references = 0, estimates = 0, registeredRows = 0, referencedRegistryRows = 0;
const registeredPairs = new Set(), referencedRegistryPairs = new Set(), currentRegistryPairs = new Set();
for (const [provider, models] of Object.entries(MODELS_DEV_PRICING_REFERENCES)) {
  const product = MODELS_DEV_PRICING_PRODUCTS[provider];
  if (!product || (catalog && !Object.hasOwn(catalog, product))) throw new Error(`No catalog product for ${provider}`);
  for (const [model, cost] of Object.entries(models)) {
    if (catalog) {
      const records = catalog[product]?.models;
      const record = records && Object.hasOwn(records, model) ? records[model] : null;
      if (!record || record.id !== model || !isDeepStrictEqual(record.cost, cost)) throw new Error(`Catalog mismatch: ${provider}/${model}`);
    }
    references++;
  }
}
// Match only a registry provider's explicit reviewed product and literal
// model.id. In particular, do not substitute upstreamModelId, a leaf or a
// same-named model from another product.
for (const provider of registry) {
  if (!Object.hasOwn(MODELS_DEV_PRICING_PRODUCTS, provider.id)) continue;
  const product = MODELS_DEV_PRICING_PRODUCTS[provider.id];
  for (const model of provider.models || []) {
    const id = model.id;
    if (typeof id !== "string") continue;
    const key = JSON.stringify([provider.id, id]);
    currentRegistryPairs.add(key);
    if (Object.hasOwn(MODELS_DEV_PRICING_REFERENCES[provider.id] || {}, id)) {
      referencedRegistryRows++;
      referencedRegistryPairs.add(key);
    }
    if (catalog) {
      const records = catalog[product]?.models;
      if (!records || !Object.hasOwn(records, id) || !records[id]?.cost) continue;
      if (records[id].id !== id) throw new Error(`Catalog model ID differs from registry literal: ${provider.id}/${id}`);
      registeredRows++;
      registeredPairs.add(key);
      if (!Object.hasOwn(MODELS_DEV_PRICING_REFERENCES[provider.id] || {}, id)
        || !isDeepStrictEqual(MODELS_DEV_PRICING_REFERENCES[provider.id][id], records[id].cost)) {
        throw new Error(`Missing exact registry catalog reference: ${provider.id}/${id}`);
      }
    }
  }
}
const extractedPairs = new Set();
for (const [provider, model, cost] of MODELS_DEV_REGISTRY_PRICING_REFERENCES) {
  const key = JSON.stringify([provider, model]);
  if (!currentRegistryPairs.has(key) || (catalog && !registeredPairs.has(key)) || extractedPairs.has(key)
    || !isDeepStrictEqual(MODELS_DEV_PRICING_REFERENCES[provider]?.[model], cost)) {
    throw new Error(`Not a unique exact registry pair: ${provider}/${model}`);
  }
  extractedPairs.add(key);
}
for (const [provider, models] of Object.entries(MODELS_DEV_PRICING_ESTIMATE_MODELS)) {
  if (new Set(models).size !== models.length) throw new Error(`Duplicate estimate for ${provider}`);
  for (const model of models) {
    const cost = MODELS_DEV_PRICING_REFERENCES[provider]?.[model];
    const record = catalog?.[MODELS_DEV_PRICING_PRODUCTS[provider]]?.models?.[model];
    if (!cost || getReviewedModelMetadata(provider, model)
      || (catalog && (!record || record.id !== model || !isDeepStrictEqual(record.modalities?.input, ["text"]) || !isDeepStrictEqual(record.modalities?.output, ["text"])))
      || !Number.isFinite(cost.input) || cost.input <= 0 || !Number.isFinite(cost.output) || cost.output <= 0
      || Object.keys(cost).some(field => !["input", "output", "cache_read"].includes(field))) {
      throw new Error(`Estimate is not an unreviewed, positive, untiered text-only row: ${provider}/${model}`);
    }
    estimates++;
  }
}
console.log(JSON.stringify({
  mode: extractionOnly ? "extraction-only" : "full-snapshot",
  snapshotDate: MODELS_DEV_PRICING_SOURCE.snapshotDate, verifiedAtUtc: MODELS_DEV_PRICING_SOURCE.verifiedAtUtc,
  expectedSnapshotSha256: MODELS_DEV_PRICING_SOURCE.sha256, extractionSha256: extractionHash,
  upstreamProvenance: "not independently established by either hash",
  snapshotVerification: extractionOnly ? "unavailable without the original full snapshot" : "verified against supplied full snapshot",
  snapshotRegistryCompleteness: extractionOnly ? "not independently verified without the original full snapshot" : "verified against supplied full snapshot",
  snapshotEstimateEligibility: extractionOnly ? "modalities not independently verified without the original full snapshot" : "verified against supplied full snapshot",
  ...(catalog ? { verifiedSnapshotSha256: snapshotHash, registeredRows, uniqueRegisteredPairs: registeredPairs.size } : {}),
  referencedRegistryRows, referencedRegistryPairs: referencedRegistryPairs.size, extractedRegistryPairs: extractedPairs.size, references, estimates,
}, null, 2));
