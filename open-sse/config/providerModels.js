import { PROVIDERS } from "./providers.js";
import REGISTRY from "../providers/registry/index.js";
// PROVIDER_MODELS now built from providers/registry (transport + models co-located)
import { PROVIDER_MODELS } from "../providers/index.js";
import { modelQuotaFamily, modelStrip, modelTargetFormat, modelSupportedFormats, normalizeModelId } from "../providers/models/schema.js";
import { CODEX_REVIEW_SUFFIX } from "../providers/models/helpers.js";
export { PROVIDER_MODELS };


// Helper functions
export function getProviderModels(aliasOrId) {
  return PROVIDER_MODELS[aliasOrId] || [];
}

export function getDefaultModel(aliasOrId) {
  const models = PROVIDER_MODELS[aliasOrId];
  return models?.[0]?.id || null;
}

// Providers whose registry uses dots in version numbers (e.g. "claude-sonnet-4.5").
// For these, we tolerate clients sending dashes ("claude-sonnet-4-5") by normalizing
// digit-hyphen-digit to digit-dot-digit before lookup. Other providers also tolerate
// dot/dash version interchange for Opus/Sonnet models.
const DOT_VERSION_PROVIDERS = new Set(["kr", "kiro", "cc", "claude", "tokenrouter"]);

// Find a registry entry by id. Tolerates dash/dot version separators
// ("claude-sonnet-4-5" ~= "claude-sonnet-4.5", "claude-opus-5.5" ~= "claude-opus-5-5")
// and strips optional thinking level suffixes ("model(max)").
function findModel(models, modelId, aliasOrId) {
  if (!models || !modelId) return undefined;
  const cleanId = typeof modelId === "string" ? modelId.replace(/\([^()]+\)\s*$/, "").trim() : modelId;
  const found = models.find(m => m.id === cleanId || m.id === modelId);
  if (found) return found;
  const normalized = normalizeModelId(cleanId);
  if (normalized !== cleanId) {
    const normFound = models.find(m => m.id === normalized);
    if (normFound) return normFound;
  }
  const dashed = cleanId.replace(/(\d)\.(\d)/g, "$1-$2");
  if (dashed !== cleanId) {
    const dashFound = models.find(m => m.id === dashed);
    if (dashFound) return dashFound;
  }
  return undefined;
}

export function isValidModel(aliasOrId, modelId, passthroughProviders = new Set()) {
  if (passthroughProviders.has(aliasOrId)) return true;
  const models = PROVIDER_MODELS[aliasOrId];
  if (!models) return false;
  return !!findModel(models, modelId, aliasOrId);
}

export function findModelName(aliasOrId, modelId) {
  const models = PROVIDER_MODELS[aliasOrId];
  if (!models) return modelId;
  const found = findModel(models, modelId, aliasOrId);
  return found?.name || modelId;
}

export function getModelTargetFormat(aliasOrId, modelId) {
  const models = PROVIDER_MODELS[aliasOrId];
  if (!models) return null;
  return modelTargetFormat(findModel(models, modelId, aliasOrId));
}

// Declared upstream formats for a model (registry `supportedFormats`). Drives the
// per-model guard on the sourceFormat-matched transport; null when undeclared.
export function getModelSupportedFormats(aliasOrId, modelId) {
  const models = PROVIDER_MODELS[aliasOrId];
  if (!models) return null;
  return modelSupportedFormats(findModel(models, modelId, aliasOrId));
}

export function getModelType(aliasOrId, modelId) {
  const models = PROVIDER_MODELS[aliasOrId];
  if (!models) return null;
  const found = findModel(models, modelId, aliasOrId);
  return found?.kind || found?.type || null;
}

// thinkingIntent is normalized by extractThinking after provider defaults; this
// config layer does not parse request bodies or import the translator pipeline.
export function getModelUpstreamId(aliasOrId, modelId, thinkingIntent = null) {
  // Split off thinking suffix "(level)" so lookup hits the base id; re-append it to
  // the result so downstream applyThinking still sees the suffix (body.model is stripped separately).
  const sufMatch = typeof modelId === "string" ? modelId.match(/\(([^()]+)\)\s*$/) : null;
  const suffix = sufMatch ? sufMatch[0] : "";
  const baseId = suffix ? modelId.slice(0, sufMatch.index).trim() : modelId;
  const models = PROVIDER_MODELS[aliasOrId];
  let found = findModel(models, baseId, aliasOrId);
  if (found?.resolveThinkingTier) {
    const tier = sufMatch ? sufMatch[1].trim().toLowerCase()
      : thinkingIntent?.mode === "level" ? thinkingIntent.level : null;
    if (tier) {
      // Only an existing exact registry entry can select another wire tier.
      found = models.find(entry => entry.id === `${found.id}-${tier}`) || found;
    }
  }
  const resolvedId = found?.upstreamModelId || found?.id;
  if (resolvedId) {
    const presetMatch = resolvedId.match(/\([^()]+\)\s*$/);
    const presetSuffix = presetMatch?.[0] || "";
    const resolvedBase = presetSuffix ? resolvedId.slice(0, presetMatch.index).trim() : resolvedId;
    return resolvedBase + (suffix || presetSuffix);
  }
  if (aliasOrId === "cx" && typeof baseId === "string" && baseId.endsWith(CODEX_REVIEW_SUFFIX)) {
    return baseId.slice(0, -CODEX_REVIEW_SUFFIX.length) + suffix;
  }
  return baseId + suffix;
}

export function getModelQuotaFamily(aliasOrId, modelId) {
  const models = PROVIDER_MODELS[aliasOrId];
  return modelQuotaFamily(findModel(models, modelId, aliasOrId));
}

// Registry aliases include media-only providers without a chat transport.
export const OAUTH_ALIASES = Object.fromEntries(
  REGISTRY.filter(r => r.alias && r.alias !== r.id).map(r => [r.id, r.alias])
);

// Derived from PROVIDERS — no need to maintain manually
export const PROVIDER_ID_TO_ALIAS = Object.fromEntries(
  Object.keys(PROVIDERS).map(id => [id, OAUTH_ALIASES[id] || id])
);

export function getModelsByProviderId(providerId) {
  const alias = OAUTH_ALIASES[providerId] || providerId;
  return PROVIDER_MODELS[alias] || [];
}

// Get strip list for a model entry (explicit opt-in only)
// Returns array of content types to strip, e.g. ["image", "audio"]
export function getModelStrip(alias, modelId) {
  return modelStrip(findModel(PROVIDER_MODELS[alias], modelId, alias));
}
