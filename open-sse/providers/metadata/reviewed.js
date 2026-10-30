// Reviewed provider-scoped facts. No registry, filesystem or network imports:
// capabilities and pricing are consumed by both the server and dashboard.
import vendorModels from "./vendorModels.js";
import coreModels from "./coreModels.js";
import gatewayModels from "./gatewayModels.js";
import mediaModels from "./mediaModels.js";
import antigravityModels from "./antigravityModels.js";
import oauthModels from "./oauthModels.js";
import codebuddyModels from "./codebuddyModels.js";
import opencodeRefreshModels from "./opencodeRefreshModels.js";
import { canonicalizeProviderId, getDeclaredUpstreamModelId } from "../identity.js";
import { applyExactCatalogCapabilities, getCapabilityVerification, getPublicCapabilityCatalogReference } from "./modelsDevCapabilityResolution.js";

export const REVIEWED_MODEL_METADATA = {};
for (const shard of [vendorModels, coreModels, gatewayModels, mediaModels, antigravityModels, oauthModels, codebuddyModels, opencodeRefreshModels]) {
  for (const [provider, models] of Object.entries(shard)) {
    const target = REVIEWED_MODEL_METADATA[provider] ||= {};
    for (const [model, record] of Object.entries(models)) {
      if (Object.hasOwn(target, model)) throw new Error(`Conflicting reviewed metadata: ${provider}/${model}`);
      target[model] = record;
    }
  }
}

// A later tariff review may add pricing URLs to `sources` without revisiting
// the capability facts. Refresh records explicitly tagged as catalog imports
// here as well as in the resolver: discovery reapplies reviewed metadata after
// merging registry declarations and must not resurrect an older catalog row.
for (const [provider, models] of Object.entries(REVIEWED_MODEL_METADATA)) {
  for (const [model, record] of Object.entries(models)) {
    if (record.limits?.scope !== "exact-route-modelsdev-catalog") continue;
    models[model] = {
      ...record,
      capabilities: applyExactCatalogCapabilities(record.capabilities || {}, provider, model, record),
    };
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

// Ordinary discovery is not an audit export. Full records remain available to
// the authenticated dashboard; omit capture/build internals even inside nested
// reference quotes and source URLs containing a pinned content hash.
const AUDIT_METADATA_KEY = /provenance|evidence|bundle|capture|hash|sha256|commit|revision|observation/i;
const PRIVATE_METADATA_VALUE = /(?:\/(?:tmp|root|home|opt|var)\/|\b[a-f0-9]{32,64}\b)/i;

function publicMetadataValue(value) {
  if (typeof value === "string") return PRIVATE_METADATA_VALUE.test(value) ? undefined : value;
  if (Array.isArray(value)) return value.map(publicMetadataValue).filter(item => item !== undefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !AUDIT_METADATA_KEY.test(key))
    .map(([key, item]) => [key, publicMetadataValue(item)])
    .filter(([, item]) => item !== undefined));
}

export function getPublicModelMetadata(provider, model, capabilities, declaredCapabilities) {
  const record = getReviewedModelMetadata(provider, model);
  const capabilityCatalog = getPublicCapabilityCatalogReference(provider, model);
  if (!record && !capabilityCatalog && !capabilities) return null;
  const result = publicMetadataValue(record || {});
  if (capabilityCatalog) result.capabilityCatalog = capabilityCatalog;
  if (capabilities) result.capabilities = publicMetadataValue(capabilities);
  if (capabilities) result.capabilityVerification = getCapabilityVerification(provider, model, capabilities, record, declaredCapabilities);
  if (!Number.isFinite((capabilities || record?.capabilities)?.maxInput)) {
    result.limits = {
      ...result.limits,
      maxInputStatus: result.limits?.maxInputStatus || result.limits?.contextWindowStatus
        || "Independent maximum input is unknown or not separately verified; contextWindow is not an input allowance and must not be reduced by a guessed output budget.",
    };
  }
  return result;
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
