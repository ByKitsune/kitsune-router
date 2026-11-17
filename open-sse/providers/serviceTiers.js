import {
  OPENAI_FAST_MODELS, OPENAI_ULTRAFAST_MODELS, OPENAI_MODELS_WITHOUT_FLEX,
  CODEX_NO_ULTRAFAST_MODELS, CODEX_NO_ULTRAFAST_PLANS, CODEX_LIMITED_ULTRAFAST_PLANS,
  OPENAI_ULTRAFAST_REGIONS, OPENAI_FAST_UNSUPPORTED_REGIONS, SERVICE_TIER_MODES, SERVICE_TIER_WIRE_VALUES,
} from "../config/serviceTierConfig.js";
import { isGpt62Model, usesOpenAIModernPromptCache } from "../config/models.js";
import openai from "./registry/openai.js";

// Browser-safe: no auth, persistence, fetch or process-level capability cache.
export const SERVICE_TIER_OPTIONS = [
  { value: "auto", label: "Auto (inherit)" },
  { value: "default", label: "Standard" },
  { value: "fast", label: "Fast" },
  { value: "ultrafast", label: "Ultrafast" },
];

const fastModels = new Set(OPENAI_FAST_MODELS);
const ultrafastModels = new Set(OPENAI_ULTRAFAST_MODELS);
const knownModels = new Set(openai.models.map(model => model.id));

export const isServiceTierMode = value => SERVICE_TIER_MODES.includes(value);
export const supportsServiceTiers = provider => provider === "openai" || provider === "codex" || provider === "cx";

function modelId(provider, model) {
  const id = typeof model === "object" ? model?.slug || model?.id || model?.model : model;
  if (typeof id !== "string") return null;
  let clean = id.replace(/\([^()]*\)$/, "").replace(/\[(?:1m|\d+k)\]$/i, "");
  if (clean.startsWith(`${provider}/`)) clean = clean.slice(provider.length + 1);
  if (provider === "codex" || provider === "cx") clean = clean.replace(/^(?:codex|cx)\//, "").replace(/-review$/, "");
  return clean;
}

function modelMetadata(provider, model, credentials) {
  if (model && typeof model === "object") return model;
  const id = modelId(provider, model);
  const models = credentials?.providerSpecificData?.models;
  return Array.isArray(models) ? models.find(entry => modelId(provider, entry) === id) : null;
}

/** Unknown capability/entitlement stays requestable; only known negatives block. */
export function getServiceTierAvailability(provider, model, tier, credentials = null) {
  if (!supportsServiceTiers(provider)) return { status: "unsupported", reason: "Processing speed controls are available for OpenAI and Codex." };
  if (tier === "priority") tier = "fast";
  if (!SERVICE_TIER_WIRE_VALUES.includes(tier)) return { status: "unsupported", reason: "Invalid service tier." };
  if (tier === "auto" || tier === "default") return { status: "supported", reason: null };
  const id = modelId(provider, model);
  if (!id) return { status: "unknown", reason: "Select a model to check processing speed support." };
  if (/^(?:ft:|text-embedding-|tts-|whisper-|gpt-image-)|(?:-transcribe|-image)$/.test(id)) {
    return { status: "unsupported", reason: "This service tier requires a supported, non-fine-tuned chat model." };
  }
  if (tier === "ultrafast" && provider === "openai") {
    const region = credentials?.providerSpecificData?.dataResidency;
    if (region && Object.hasOwn(OPENAI_ULTRAFAST_REGIONS, id) && !OPENAI_ULTRAFAST_REGIONS[id].includes(region)) {
      return { status: "unsupported", scope: "account", reason: "Ultrafast is unavailable in the configured data residency region for this model; choose Standard/Fast or a supported model." };
    }
    return ultrafastModels.has(id)
      ? { status: "supported", reason: null }
      : { status: "unsupported", reason: "Ultrafast is unavailable for this model on the public Responses API." };
  }
  if (tier === "fast" && provider === "openai") {
    if (Object.hasOwn(OPENAI_FAST_UNSUPPORTED_REGIONS, id)
      && OPENAI_FAST_UNSUPPORTED_REGIONS[id].includes(credentials?.providerSpecificData?.dataResidency)) {
      return { status: "unsupported", scope: "account", reason: "Fast is unavailable in the configured data residency region for this model." };
    }
    if (fastModels.has(id)) return { status: "supported", reason: null };
    if (knownModels.has(id)) return { status: "unsupported", reason: "Fast is not supported for this model." };
  }
  if (tier === "flex" && provider === "openai" && OPENAI_MODELS_WITHOUT_FLEX.includes(id)) {
    return { status: "unsupported", reason: "Flex is not supported for this model." };
  }
  if (provider === "codex" || provider === "cx") {
    const account = credentials?.providerSpecificData;
    // Normalized gateway policy metadata, never inferred from a generic Pro
    // label or credit balance. These permissions can only restrict a request.
    if (account?.serviceTierPermissions?.[tier] === false) {
      return { status: "unsupported", scope: "account", reason: "This processing speed is disabled by the selected account/workspace permission. Enable it or choose Standard." };
    }
    if (tier === "ultrafast" && typeof account?.chatgptPlanType === "string") {
      const plan = account.chatgptPlanType;
      const limitedModels = Object.hasOwn(CODEX_LIMITED_ULTRAFAST_PLANS, plan) ? CODEX_LIMITED_ULTRAFAST_PLANS[plan] : null;
      if (CODEX_NO_ULTRAFAST_PLANS.includes(plan) || (limitedModels && !limitedModels.includes(id))) {
        return { status: "unsupported", scope: "account", reason: "This plan does not support Ultrafast for the selected model." };
      }
    }
    if (tier === "ultrafast" && isGpt62Model(id) && account?.dataResidency
        && !OPENAI_ULTRAFAST_REGIONS[id]?.includes(account.dataResidency)) {
      return { status: "unsupported", scope: "account", reason: "Ultrafast is unavailable in the configured data residency region for this model." };
    }
    // The official account-specific Codex catalog uses service_tiers; the
    // app-server exposes the same data as serviceTiers. Empty is a known no.
    const metadata = modelMetadata(provider, model, credentials);
    const tiers = metadata?.service_tiers ?? metadata?.serviceTiers;
    if (Array.isArray(tiers)) {
      const advertised = tiers.some(entry => (entry?.id === "priority" ? "fast" : entry?.id) === tier);
      return advertised ? { status: "supported", reason: null }
        : { status: "unsupported", scope: "account", reason: "This service tier is not advertised for the selected model/account. Choose Standard or an advertised speed." };
    }
    if (tier === "flex" || tier === "scale") {
      return { status: "unsupported", reason: "This public API service tier is not supported on the Codex subscription transport." };
    }
    if (tier === "ultrafast" && CODEX_NO_ULTRAFAST_MODELS.includes(id)) {
      return { status: "unsupported", reason: "Ultrafast is not supported for this model. Select a model advertising Ultrafast." };
    }
  }
  return { status: "unknown", reason: "Model/account speed entitlement is unverified; the upstream will validate this request." };
}

export function getServiceTierOptions(provider, model = null) {
  if (!supportsServiceTiers(provider)) return [];
  return SERVICE_TIER_OPTIONS.filter(option => !model || getServiceTierAvailability(provider, model, option.value).status !== "unsupported");
}

function tierError(message, code = "unsupported_service_tier", param = "service_tier") {
  return Object.assign(new Error(message), { code, param });
}

/** Resolve native wire values without ever inferring subscription access. */
export function resolveServiceTier(provider, model, requested, credentials = null) {
  if (!supportsServiceTiers(provider)) return requested;
  if (requested != null && !SERVICE_TIER_WIRE_VALUES.includes(requested)) {
    throw tierError("Invalid service_tier. Use auto, default, fast (or priority), or ultrafast.", "invalid_service_tier");
  }
  const codex = provider === "codex" || provider === "cx";
  let tier = requested;
  if (codex && (tier == null || tier === "auto")) {
    const metadata = modelMetadata(provider, model, credentials);
    tier = metadata?.default_service_tier ?? metadata?.defaultServiceTier;
  }
  if (codex && (tier == null || tier === "auto" || tier === "default")) return undefined;
  if (tier != null && !SERVICE_TIER_WIRE_VALUES.includes(tier)) {
    throw tierError("The advertised default_service_tier is invalid; select Standard or update the model catalog.", "invalid_service_tier");
  }
  if (tier != null) {
    const availability = getServiceTierAvailability(provider, model, tier, credentials);
    if (availability.status === "unsupported") {
      const error = tierError(availability.reason);
      if (availability.scope === "account") error.scope = "account";
      throw error;
    }
  }
  return codex && tier === "fast" ? "priority" : tier;
}

export function prepareServiceTierRequest(provider, model, body, providerServiceTier, credentials) {
  if (!supportsServiceTiers(provider)) return null;
  if (Object.hasOwn(body, "serviceTier")) {
    throw tierError("serviceTier is an OpenCode configuration option. Send the native request field service_tier instead.", "invalid_service_tier", "serviceTier");
  }
  const selection = Object.hasOwn(body, "service_tier") ? body.service_tier : providerServiceTier ?? undefined;
  // Explicit Auto leaves project routing in effect and asks OpenAI to report
  // the delivered tier, even when GPT-6.2 callers omit the selection.
  const useProjectTier = provider === "openai" && selection == null && isGpt62Model(modelId(provider, model));
  const wire = resolveServiceTier(provider, model, useProjectTier ? "auto" : selection, credentials);
  const cache = body.prompt_cache_options;
  const requiresResponses = provider === "openai" && (wire === "ultrafast"
    || (usesOpenAIModernPromptCache(modelId(provider, model)) && (cache?.ttl === "12h" || cache?.mode !== undefined || cache?.prewarm !== undefined)));
  return { selection, requestedServiceTier: selection ?? null, wireServiceTier: wire ?? null, requiresResponses };
}

export function getResponseServiceTier(response, eventType = response?.type ?? response?.data?.type) {
  const snapshot = response?.response ?? response?.data?.response ?? response;
  if (["response.created", "response.queued", "response.in_progress"].includes(eventType)
    || ["queued", "in_progress"].includes(snapshot?.status)) return null;
  const value = snapshot?.service_tier ?? response?.service_tier;
  return typeof value === "string" && value ? value : null;
}

/** Preserve raw actual spelling: a requested Fast may have run at Standard. */
export function getServiceTierAccounting(provider, selection = null, response = null) {
  if (!supportsServiceTiers(provider)) return null;
  const requestedServiceTier = selection?.requestedServiceTier ?? null;
  const actualServiceTier = getResponseServiceTier(response) ?? selection?.actualServiceTier ?? null;
  const wire = selection?.wireServiceTier ?? requestedServiceTier;
  // The pricing layer requires an explicit tariff for confirmed premium tiers.
  // Auto is a policy echo, not proof of Standard or paid-tier delivery.
  // Historical omitted/explicit Standard requests retain their baseline estimate.
  const serviceTierCostStatus = actualServiceTier === "default" ? "standard"
    : actualServiceTier === "auto" ? "unconfirmed"
    : actualServiceTier != null ? "unpriced"
      : selection?.selection === null || selection?.serviceTierCostStatus === "unconfirmed" || (wire != null && wire !== "default") ? "unconfirmed" : "standard-estimate";
  return { requestedServiceTier, actualServiceTier, serviceTierCostStatus };
}
