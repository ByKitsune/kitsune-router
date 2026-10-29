// An auditable extraction of the supplied models.dev snapshot. These are
// catalog references, not proof of an account invoice,
// entitlements, currency conversion, or a model's continued availability.
// Verify the literal rows against the pinned input with
// scripts/verify-modelsdev-pricing.mjs before changing this file.
import { canonicalizeProviderId } from "../identity.js";
import { parsePricingTimestamp } from "../../config/timeOfUsePricing.js";
import { MODELS_DEV_REGISTRY_PRICING_REFERENCES } from "./modelsDevPricingRegistry.js";
import currentObservation from "./modelsDevPricingCurrent.js";
import {
  freezePricingObservation, getObservedPricingEstimate,
  getObservedPricingReference, getObservedPricingStatus, selectPricingObservation,
  validatePricingObservation,
} from "./modelsDevPricingObservation.js";
export { createPricingObservation as createModelsDevPricingObservation, validatePricingObservation as validateModelsDevPricingObservation, MODELS_DEV_PRICING_PRODUCT_POLICY } from "./modelsDevPricingObservation.js";

// Historical observation export kept for reproducible earlier usage. New captures
// are separate immutable versions; never retimestamp these original bytes.
export const MODELS_DEV_PRICING_SOURCE = Object.freeze({
  url: "https://models.dev/api.json",
  // Filename date is local to the snapshot, not an asserted UTC fetch date.
  snapshotDate: "2026-10-29",
  verifiedAtUtc: "2026-10-28T18:11:32.422Z",
  maxEstimateAgeMs: 24 * 60 * 60 * 1000,
  sha256: "bb81b8bddd68fe7cba6504ce9a8cb217fdafb8cf1fd29b56232138b0860bb82f",
});

// Existing upstream free namespaces are only meaningful on their own routes.
export const FREE_MODEL_NAMESPACE_OWNERS = Object.freeze({
  "cline-free/": "cline", "opencode-free/": "opencode", "mimo-free/": "mimo-free",
});

// These are product identities for this extraction, not a general rule that
// every catalog provider with the same name has the same billing product.
export const MODELS_DEV_PRICING_PRODUCTS = Object.freeze({
  openrouter: "openrouter",
  "vercel-ai-gateway": "vercel",
  groq: "groq",
  cohere: "cohere",
  github: "github-copilot",
  glm: "zai-coding-plan",
  gemini: "google",
  chutes: "chutes",
  "cloudflare-ai": "cloudflare-workers-ai",
  together: "togetherai",
  "xiaomi-mimo": "xiaomi",
  nvidia: "nvidia",
  openai: "openai",
});

// cost is copied literally, including fields that cannot be used by the token
// calculator. A reference can be shown even when a reviewed quote blocks it.
export const MODELS_DEV_PRICING_REFERENCES = {
  openrouter: {
    "nvidia/nemotron-3-super-120b-a12b": { input: 0.3, output: 2.4, cache_read: 0.15 },
    "nvidia/nemotron-3-ultra-550b-a55b": { input: 0.6, output: 2.4, cache_read: 0.12 },
    "nvidia/nemotron-3.5-lightning": { input: 0.07, output: 0.2, cache_read: 0.04 },
    "nvidia/nemotron-3-nano-30b-a3b": { input: 0.06, output: 0.24, cache_read: 0.012 },
    "liquid/lfm-2.5-2.6b": { input: 0.35, output: 0.5, cache_read: 0.04 },
    "liquid/lfm-2.5-24b-a2b": { input: 0.05, output: 0.7, cache_read: 0.025 },
    "cohere/command-a": { input: 2.5, output: 10 },
    "tencent/hy-mt2-7b": { input: 0.074, output: 0.295 },
    "minimax/minimax-m3.1-flash": { input: 0.15, output: 0.6, cache_read: 0.015 },
  },
  "vercel-ai-gateway": {
    "nvidia/nemotron-3-super-120b-a12b": { input: 0.15, output: 0.65 },
    "nvidia/nemotron-nano-9b-v2": { input: 0.06, output: 0.23 },
    "nvidia/nemotron-3-ultra-550b-a55b": { input: 0.6, output: 2.4, cache_read: 0.12 },
    "nvidia/nemotron-3.5-lightning": { input: 0.05, output: 0.2, cache_read: 0.01 },
    "nvidia/nemotron-3-nano-30b-a3b": { input: 0.05, output: 0.2, cache_read: 0.025 },
    "liquid/lfm2.5-24b-a2b": { input: 0.05, output: 0.7, cache_read: 0.025 },
    "cohere/command-a": { input: 2.5, output: 10 },
    "meta/llama-3.3-70b": { input: 0.72, output: 0.72 },
  },
  groq: {
    "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
    "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
  },
  cohere: {
    "command-a-03-2025": { input: 2.5, output: 10 },
    "command-r-08-2024": { input: 0.15, output: 0.6 },
    "command-r7b-12-2024": { input: 0.0375, output: 0.15 },
  },
  github: {
    "gpt-5.5": { input: 5, output: 30, cache_read: 0.5, tiers: [{ input: 10, output: 45, cache_read: 1, tier: { type: "context", size: 272000 } }], context_over_200k: { input: 10, output: 45, cache_read: 1 } },
    "gpt-5.4": { input: 2.5, output: 15, cache_read: 0.25, tiers: [{ input: 5, output: 22.5, cache_read: 0.5, tier: { type: "context", size: 272000 } }], context_over_200k: { input: 5, output: 22.5, cache_read: 0.5 } },
  },
  glm: {
    "glm-5.3": { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    "glm-4.7": { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  },
  gemini: {
    "gemini-3.7-flash": { input: 0.75, output: 3.75, cache_read: 0.075, input_audio: 0.75 },
    "gemini-3.5-flash": { input: 1.5, output: 9, cache_read: 0.15, input_audio: 1.5 },
    "gemini-3.1-flash-image": { input: 0.5, output: 60 },
    "gemini-embedding-2": { input: 0.2, output: 0, input_audio: 6.5 },
  },
  chutes: {
    "moonshotai/Kimi-K2.6-TEE": { input: 0.39, output: 1.8, cache_read: 0.03899999999999999 },
    "zai-org/GLM-5.1-TEE": { input: 0.9, output: 2.9, cache_read: 0.08999999999999998 },
  },
  "cloudflare-ai": {
    "@cf/qwen/qwen3.8-27b": { input: 0.45, output: 3.2, cache_read: 0.05 },
    "@cf/openai/gpt-oss-120b": { input: 0.35, output: 0.75 },
  },
  together: { "Qwen/Qwen3.7-Max": { input: 2.5, output: 7.5, cache_read: 0.5 } },
  "xiaomi-mimo": {
    "mimo-v2.5-pro": { input: 0.435, output: 0.87, cache_read: 0.0036 },
    "mimo-v2.5": { input: 0.14, output: 0.28, cache_read: 0.0028 },
  },
  nvidia: { "deepseek-ai/deepseek-v4.1-flash": { input: 0, output: 0 } },
  openai: {
    "gpt-5.5": { input: 5, output: 30, cache_read: 0.5, tiers: [{ input: 10, output: 45, cache_read: 1, tier: { type: "context", size: 272000 } }], context_over_200k: { input: 10, output: 45, cache_read: 1 } },
    "gpt-5.4": { input: 2.5, output: 15, cache_read: 0.25, tiers: [{ input: 5, output: 22.5, cache_read: 0.5, tier: { type: "context", size: 272000 } }], context_over_200k: { input: 5, output: 22.5, cache_read: 0.5 } },
  },
};

// Narrow opt-in: exact text-only hosted models with positive input/output
// catalog rates and no tier recorded in this snapshot. Zero, media, subscription and conditional
// tariffs stay references only. This list is NOT a model availability list.
export const MODELS_DEV_PRICING_ESTIMATE_MODELS = {
  openrouter: [
    "nvidia/nemotron-3-super-120b-a12b", "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3.5-lightning", "nvidia/nemotron-3-nano-30b-a3b",
    "liquid/lfm-2.5-2.6b", "liquid/lfm-2.5-24b-a2b", "cohere/command-a", "tencent/hy-mt2-7b",
  ],
  "vercel-ai-gateway": [
    "nvidia/nemotron-3-super-120b-a12b", "nvidia/nemotron-nano-9b-v2",
    "nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3.5-lightning",
    "nvidia/nemotron-3-nano-30b-a3b", "liquid/lfm2.5-24b-a2b", "cohere/command-a", "meta/llama-3.3-70b",
  ],
};

function freezeTree(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeTree(child);
  return Object.freeze(value);
}
// Only additional exact registry literals are merged. The pre-existing dynamic
// references remain independent; neither collection expands the estimate list.
for (const [provider, model, cost] of MODELS_DEV_REGISTRY_PRICING_REFERENCES) {
  if (!Object.hasOwn(MODELS_DEV_PRICING_PRODUCTS, provider)) throw new Error(`Unmapped catalog product: ${provider}`);
  const table = MODELS_DEV_PRICING_REFERENCES[provider] ||= Object.create(null);
  if (Object.hasOwn(table, model)) throw new Error(`Duplicate models.dev reference: ${provider}/${model}`);
  Object.defineProperty(table, model, { value: cost, enumerable: true, writable: true, configurable: true });
}
freezeTree(MODELS_DEV_PRICING_REFERENCES);
freezeTree(MODELS_DEV_PRICING_ESTIMATE_MODELS);
freezeTree(MODELS_DEV_REGISTRY_PRICING_REFERENCES);

/** Exact provider/product and literal ID only; never rewrite a wire ID. */
function getLegacyPricingReference(provider, model) {
  if (typeof provider !== "string" || typeof model !== "string" || !model) return null;
  const id = canonicalizeProviderId(provider);
  if (!Object.hasOwn(MODELS_DEV_PRICING_PRODUCTS, id) || !Object.hasOwn(MODELS_DEV_PRICING_REFERENCES, id)) return null;
  const table = MODELS_DEV_PRICING_REFERENCES[id];
  if (!Object.hasOwn(table, model)) return null;
  return { product: MODELS_DEV_PRICING_PRODUCTS[id], model, cost: structuredClone(table[model]), ...MODELS_DEV_PRICING_SOURCE };
}

/** Whether a literal provider/model pair is eligible, regardless of date. */
function hasLegacyPricingEstimate(provider, model) {
  const id = canonicalizeProviderId(provider);
  return Object.hasOwn(MODELS_DEV_PRICING_ESTIMATE_MODELS, id) && MODELS_DEV_PRICING_ESTIMATE_MODELS[id].includes(model);
}

/** A short-lived text-token reference, never a complete provider invoice. */
function getLegacyPricingEstimate(provider, model, options = {}) {
  if (!hasLegacyPricingEstimate(provider, model)) return null;
  // Observation is not proof of when a tariff began or ended. Do not backdate
  // the reference, and bound its use after the file/hash were observed.
  const date = parsePricingTimestamp(options?.timestamp);
  const start = Date.parse(MODELS_DEV_PRICING_SOURCE.verifiedAtUtc);
  if (!date || date.getTime() < start || date.getTime() >= start + MODELS_DEV_PRICING_SOURCE.maxEstimateAgeMs) return null;
  const reference = getLegacyPricingReference(provider, model);
  const cost = reference?.cost;
  if (!cost || !Number.isFinite(cost.input) || cost.input <= 0 || !Number.isFinite(cost.output) || cost.output <= 0
    || Object.keys(cost).some(field => !["input", "output", "cache_read"].includes(field))) return null;
  // Do not infer cache or reasoning treatment, including output-billed
  // reasoning: an explicit null prevents the calculator's output fallback.
  return { input: cost.input, output: cost.output, cached: null, reasoning: null,
    cache_creation: null, cache_creation_1h: null, cache_write_30m: null, cache_write_12h: null,
    provenance: { kind: "models-dev-catalog-estimate", product: reference.product, model: reference.model,
      url: reference.url, snapshotDate: reference.snapshotDate, verifiedAtUtc: reference.verifiedAtUtc,
      sha256: reference.sha256, inheritedFields: ["input", "output"] } };
}


// The original snapshot remains immutable for historical/in-flight requests.
// New observations replace the complete catalog view at their observation time.
const legacyObservation = freezePricingObservation({
  format: "kitsune-modelsdev-pricing-observation-v1", source: MODELS_DEV_PRICING_SOURCE,
  products: MODELS_DEV_PRICING_PRODUCTS,
  references: Object.fromEntries(Object.entries(MODELS_DEV_PRICING_REFERENCES).map(([provider, rows]) => [provider,
    Object.fromEntries(Object.entries(rows).map(([id, cost]) => [id, { cost, input: ["text"], output: ["text"] }]))])),
  estimates: MODELS_DEV_PRICING_ESTIMATE_MODELS,
});
export const BUNDLED_MODELS_DEV_PRICING_OBSERVATIONS = Object.freeze([legacyObservation, validatePricingObservation(currentObservation)]);
// Next bundles pricing into instrumentation and API chunks independently. Use
// one process-wide reader, and read it on every lookup so clearing it also
// detaches copies which previously consulted the old source.
const OBSERVATION_SOURCE = Symbol.for("kitsune.modelsDevPricingObservationSource");

/** Install a synchronous, already-validated immutable observation history reader. */
export function setModelsDevPricingObservationSource(reader) {
  if (reader !== null && typeof reader !== "function") throw new TypeError("Pricing observation source must be a function or null");
  globalThis[OBSERVATION_SOURCE] = reader;
}

function observations(options = {}) {
  const extra = globalThis[OBSERVATION_SOURCE]?.(options);
  if (extra != null && !Array.isArray(extra)) throw new Error("Invalid pricing observation history");
  return extra?.length ? [...BUNDLED_MODELS_DEV_PRICING_OBSERVATIONS, ...extra] : BUNDLED_MODELS_DEV_PRICING_OBSERVATIONS;
}
function latestObservation(history) {
  return selectPricingObservation(history, 8640000000000000);
}
function observationFor(options = {}) {
  const history = observations(options);
  return options.timestamp == null ? latestObservation(history) : selectPricingObservation(history, options.timestamp);
}

/** Exact product/literal ID reference, optionally selected at a recorded instant. */
export function getModelsDevPricingReference(provider, model, options = {}) {
  if (typeof provider !== "string" || typeof model !== "string" || !model) return null;
  try { return getObservedPricingReference(observationFor(options), canonicalizeProviderId(provider), model); }
  catch { return null; }
}

export function hasModelsDevPricingEstimate(provider, model, options = {}) {
  const state = getModelsDevPricingStatus(provider, model, options);
  return state.eligible;
}

/** Stable status keys let translated consumers explain unknowns without guessing. */
export function getModelsDevPricingStatus(provider, model, options = {}) {
  try {
    const selected = observationFor(options);
    const observation = selected || latestObservation(observations(options));
    return getObservedPricingStatus(observation, canonicalizeProviderId(provider), model, options);
  } catch {
    return { status: "source-unavailable", reference: null, eligible: false, observedAtUtc: null, expiresAtUtc: null };
  }
}

/** A dated catalog estimate; no global family guesses, invoice or plan conversion. */
export function getModelsDevPricingEstimate(provider, model, options = {}) {
  try {
    const observation = observationFor(options);
    if (!observation) return null;
    if (observation === legacyObservation) return getLegacyPricingEstimate(provider, model, options);
    return getObservedPricingEstimate(observation, canonicalizeProviderId(provider), model, options);
  } catch { return null; }
}
