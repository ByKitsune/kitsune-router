// Compact extraction integrity is not full-payload authentication. This is
// the SHA-256 of the canonical JSON produced below, not of models.dev/api.json.
// Refresh it only after auditing the extraction against the separately pinned
// full snapshot. No upstream commit is implied.
import {
  MODELS_DEV_PRICING_SOURCE, MODELS_DEV_PRICING_PRODUCTS,
  MODELS_DEV_PRICING_REFERENCES, MODELS_DEV_PRICING_ESTIMATE_MODELS,
} from "../open-sse/providers/metadata/modelsDevPricing.js";
import { MODELS_DEV_REGISTRY_PRICING_REFERENCES } from "../open-sse/providers/metadata/modelsDevPricingRegistry.js";

export const EXPECTED_MODELS_DEV_EXTRACTION_SHA256 = "baa4740627150696ee73c489b4fb396206f17991f618b94f483a3b4a906348a5";

// Version 1 recursively sorts object keys by JS's default code-unit order,
// preserves nested array order, and sorts provider/model tuples lexicographically.
// JSON.stringify supplies UTF-8-compatible JSON with no whitespace or newline.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function pairOrder(a, b) {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
}

export function serializeModelsDevExtraction({
  source = MODELS_DEV_PRICING_SOURCE,
  products = MODELS_DEV_PRICING_PRODUCTS,
  references = MODELS_DEV_PRICING_REFERENCES,
  registryReferences = MODELS_DEV_REGISTRY_PRICING_REFERENCES,
  estimates = MODELS_DEV_PRICING_ESTIMATE_MODELS,
} = {}) {
  const tuples = Object.entries(references).flatMap(([provider, models]) => Object.entries(models).map(([model, cost]) => [provider, model, cost])).sort(pairOrder);
  const registryPairs = registryReferences.map(([provider, model]) => [provider, model]).sort(pairOrder);
  const estimatePairs = Object.entries(estimates).flatMap(([provider, models]) => models.map(model => [provider, model])).sort(pairOrder);
  return JSON.stringify(canonical({ format: "kitsune-modelsdev-pricing-extraction-v1", source, products, references: tuples, registryPairs, estimatePairs }));
}
