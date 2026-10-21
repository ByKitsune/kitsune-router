// Reviewed provider-scoped facts. No registry, filesystem or network imports:
// capabilities and pricing are consumed by both the server and dashboard.
import vendorModels from "./vendorModels.js";
import coreModels from "./coreModels.js";
import gatewayModels from "./gatewayModels.js";
import mediaModels from "./mediaModels.js";
import antigravityModels from "./antigravityModels.js";
import oauthModels from "./oauthModels.js";
import { canonicalizeProviderId, getDeclaredUpstreamModelId } from "../identity.js";

export const REVIEWED_MODEL_METADATA = {};
for (const shard of [vendorModels, coreModels, gatewayModels, mediaModels, antigravityModels, oauthModels]) {
  for (const [provider, models] of Object.entries(shard)) {
    const target = REVIEWED_MODEL_METADATA[provider] ||= {};
    for (const [model, record] of Object.entries(models)) {
      if (Object.hasOwn(target, model)) throw new Error(`Conflicting reviewed metadata: ${provider}/${model}`);
      target[model] = record;
    }
  }
}

export function getReviewedModelMetadata(provider, model) {
  if (!provider || typeof model !== "string" || !model) return null;
  const table = REVIEWED_MODEL_METADATA[canonicalizeProviderId(provider)];
  if (!table) return null;
  if (Object.hasOwn(table, model)) return table[model];
  const upstream = getDeclaredUpstreamModelId(provider, model);
  if (upstream !== model && Object.hasOwn(table, upstream)) return table[upstream];
  // Existing metadata accepts dot/dash version spellings. Keep full namespaces
  // and qualifiers, use only an unambiguous match, and never rewrite wire IDs.
  const spelling = value => value.toLowerCase().replace(/(\d)-(\d)/g, "$1.$2");
  const key = spelling(model);
  const matches = Object.keys(table).filter(id => spelling(id) === key);
  return matches.length === 1 ? table[matches[0]] : null;
}

// Missing facts leave legacy fallback behavior intact; callers can display
// billing/limits/source provenance separately instead of claiming verification.
export function applyReviewedCapabilities(base, provider, model) {
  const record = getReviewedModelMetadata(provider, model);
  if (!record) return base;
  const mediaKind = record.limits?.kind;
  const mediaFloor = ["image", "tts", "stt", "embedding"].includes(mediaKind)
    ? { reasoning: false, tools: false, search: false } : {};
  const result = { ...base, ...mediaFloor, ...record.capabilities };
  for (const key of record.limits?.unverifiedCapabilityFields || []) {
    if (["contextWindow", "maxInput", "maxOutput"].includes(key)) result[key] = null;
  }
  return result;
}

export function getReviewedPricing(provider, model) {
  const pricing = getReviewedModelMetadata(provider, model)?.pricing;
  if (!pricing || !Object.keys(pricing).length) return null;
  // A documented output-token rate applies to reasoning tokens unless a
  // separate reasoning rate is explicitly supplied. Do not inherit guessed
  // legacy cache-write multipliers or unrelated long-context tiers.
  return { reasoning: pricing.output, ...pricing };
}
