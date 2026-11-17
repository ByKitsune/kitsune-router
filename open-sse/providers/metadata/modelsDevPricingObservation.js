// Pure, dependency-free pricing observations shared by server and dashboard.
// An observation is a whole immutable replacement, not an extension of an older
// capture. Requests use their original timestamp; missing/new rows never cause
// a prior capture to be silently reused after a newer observation exists.
import { parsePricingTimestamp } from "../../config/timeOfUsePricing.js";

const V1_FORMAT = "kitsune-modelsdev-pricing-observation-v1";
export const MODELS_DEV_PRICING_OBSERVATION_FORMAT = "kitsune-modelsdev-pricing-observation-v2";
export const MODELS_DEV_MAX_ESTIMATE_AGE_MS = 24 * 60 * 60 * 1000;

// These products expose public pay-as-you-go token schedules. A similarly named
// subscription, credit plan, regional product, or reseller is not interchangeable.
const V1_PUBLIC_TOKEN_PRODUCTS = Object.freeze({
  openai: "openai", anthropic: "anthropic", gemini: "google", deepseek: "deepseek",
  xai: "xai", mistral: "mistral", groq: "groq", cohere: "cohere",
  openrouter: "openrouter", "vercel-ai-gateway": "vercel", chutes: "chutes",
  "cloudflare-ai": "cloudflare-workers-ai", together: "togetherai",
  fireworks: "fireworks-ai", nebius: "nebius", cerebras: "cerebras",
  siliconflow: "siliconflow", "xiaomi-mimo": "xiaomi", venice: "venice",
});

// Reference-only routes remain separate products and never become token estimates.
const V1_PRODUCT_POLICY = Object.freeze({
  ...V1_PUBLIC_TOKEN_PRODUCTS,
  github: "github-copilot", glm: "zai-coding-plan", "glm-cn": "zhipuai-coding-plan",
  nvidia: "nvidia", codex: "openai", "gemini-cli": "google", ollama: "ollama-cloud",
  "alicode-intl": "alibaba-coding-plan", alicode: "alibaba-coding-plan-cn",
  "alitp-intl": "alibaba-token-plan", kimi: "kimi-code-plan-cn", "xiaomi-tokenplan": "xiaomi-token-plan",
});

export const MODELS_DEV_PUBLIC_TOKEN_PRODUCTS = Object.freeze({
  ...V1_PUBLIC_TOKEN_PRODUCTS,
  // The configured routes use the same public API endpoints and cite the
  // publishers' native lists. Account quotas and BYOK fees are separate.
  // https://www.alibabacloud.com/help/en/model-studio/model-pricing
  "alims-intl": "alibaba",
  // https://kilo.ai/docs/gateway/usage-and-billing
  "kilo-gateway": "kilo",
});

// Other exact hosted products contribute reference prices only. In particular,
// OpenCode Go allowance rates and subscriptions do not become dollar estimates.
// OAuth API-reference comparisons remain in their immutable v1 observations.
const { codex: _codexApiReference, "gemini-cli": _geminiApiReference, ...exactV1Products } = V1_PRODUCT_POLICY;
export const MODELS_DEV_PRICING_PRODUCT_POLICY = Object.freeze({
  ...exactV1Products, ...MODELS_DEV_PUBLIC_TOKEN_PRODUCTS,
  clinepass: "cline-pass", minimax: "minimax", "minimax-cn": "minimax-cn", morph: "morph",
  "opencode-zen": "opencode", "opencode-go": "opencode-go", paraloncloud: "paraloncloud", perplexity: "perplexity",
  "perplexity-agent": "perplexity-agent", poolside: "poolside", sambanova: "sambanova", tokenrouter: "tokenrouter",
  vertex: "google-vertex", "vertex-partner": "google-vertex",
});

const timestampMs = value => parsePricingTimestamp(value)?.getTime() ?? null;

function own(object, key) { return Boolean(object && typeof object === "object" && Object.hasOwn(object, key)); }
export function freezePricingObservation(value) {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value)) freezePricingObservation(child);
  return Object.freeze(value);
}

const v1AllowedCostFields = ["input", "output", "cache_read"];
const v2AllowedCostFields = [...v1AllowedCostFields, "reasoning", "cache_write"];

/** Positive, untiered text-token quotes only. Unsupported units remain references. */
export function getObservedTextPricing(record, format = MODELS_DEV_PRICING_OBSERVATION_FORMAT) {
  const cost = record?.cost;
  const v1 = format === V1_FORMAT;
  const allowedFields = v1 ? v1AllowedCostFields : v2AllowedCostFields;
  if (!record || !Array.isArray(record.input) || record.input.length !== 1 || record.input[0] !== "text"
    || !Array.isArray(record.output) || record.output.length !== 1 || record.output[0] !== "text"
    || !cost || typeof cost !== "object" || Array.isArray(cost)
    || !Number.isFinite(cost.input) || cost.input <= 0 || !Number.isFinite(cost.output) || cost.output <= 0
    || Object.entries(cost).some(([field, value]) => !allowedFields.includes(field) || !Number.isFinite(value) || value < 0)) return null;
  return {
    input: cost.input, output: cost.output,
    cached: own(cost, "cache_read") ? cost.cache_read : null,
    // The catalog's generic cache_write has no lifetime. Keep it as a
    // reference without guessing which accounting counter it belongs to.
    reasoning: !v1 && own(cost, "reasoning") ? cost.reasoning : null, cache_creation: null, cache_creation_1h: null,
    cache_write_30m: null, cache_write_12h: null,
  };
}

export function createPricingObservation(catalog, source, products = MODELS_DEV_PRICING_PRODUCT_POLICY) {
  const observed = timestampMs(source?.verifiedAtUtc);
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog) || observed == null
    || typeof source?.sha256 !== "string" || !/^[a-f\d]{64}$/.test(source.sha256)
    || source.url !== "https://models.dev/api.json") throw new Error("Invalid models.dev observation source");
  const references = Object.create(null);
  const estimates = Object.create(null);
  const mappedProducts = Object.create(null);
  for (const [provider, product] of Object.entries(products || {})) {
    if (MODELS_DEV_PRICING_PRODUCT_POLICY[provider] !== product) throw new Error("Pricing observation product is not an exact approved route");
    if (!product || !own(catalog, product) || !catalog[product]?.models || typeof catalog[product].models !== "object") continue;
    mappedProducts[provider] = product;
    const records = references[provider] = Object.create(null);
    for (const [id, model] of Object.entries(catalog[product].models)) {
      if (!model || model.id !== id || !model.cost || typeof model.cost !== "object" || Array.isArray(model.cost)) continue;
      const record = { cost: structuredClone(model.cost), input: structuredClone(model.modalities?.input || []), output: structuredClone(model.modalities?.output || []) };
      records[id] = record;
      if (MODELS_DEV_PUBLIC_TOKEN_PRODUCTS[provider] === product && getObservedTextPricing(record)) {
        (estimates[provider] ||= []).push(id);
      }
    }
  }
  for (const ids of Object.values(estimates)) ids.sort();
  return validatePricingObservation({ format: MODELS_DEV_PRICING_OBSERVATION_FORMAT, source: structuredClone(source), products: mappedProducts, references, estimates });
}

function validateRawCost(cost) {
  for (const [field, value] of Object.entries(cost)) {
    if (/^(?:input|output|reasoning|cache_read|cache_write)(?:_[a-z0-9]+)*$/.test(field)
      && (typeof value !== "number" || !Number.isFinite(value))) throw new Error("Invalid pricing observation cost");
    if (field === "tiers") {
      if (!Array.isArray(value)) throw new Error("Invalid pricing observation cost tiers");
      for (const tier of value) {
        if (!tier || typeof tier !== "object" || Array.isArray(tier)) throw new Error("Invalid pricing observation cost tier");
        validateRawCost(tier);
      }
    }
    if (field === "context_over_200k") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid pricing observation context tier");
      validateRawCost(value);
    }
  }
}

export function selectPricingObservation(observations, timestamp) {
  const at = timestampMs(timestamp);
  if (at == null) return null;
  const selected = observations.filter(item => timestampMs(item.source?.verifiedAtUtc) <= at)
    .sort((a, b) => timestampMs(b.source.verifiedAtUtc) - timestampMs(a.source.verifiedAtUtc));
  const latest = selected[0];
  if (!latest) return null;
  if (selected.some(item => timestampMs(item.source.verifiedAtUtc) === timestampMs(latest.source.verifiedAtUtc)
    && item.source.sha256 !== latest.source.sha256)) throw new Error("Conflicting pricing observations at the same instant");
  return latest;
}

export function getObservedPricingReference(observation, provider, model) {
  const table = observation?.references?.[provider];
  if (!own(table, model)) return null;
  return { product: observation.products[provider], model, cost: structuredClone(table[model].cost), ...observation.source };
}

export function getObservedPricingStatus(observation, provider, model, options = {}) {
  const reference = getObservedPricingReference(observation, provider, model);
  const observed = timestampMs(observation?.source?.verifiedAtUtc);
  const at = timestampMs(options.timestamp);
  const eligible = Boolean(reference && own(observation.estimates, provider) && observation.estimates[provider].includes(model));
  const expires = observed == null ? null : observed + MODELS_DEV_MAX_ESTIMATE_AGE_MS;
  const status = !reference ? "unmapped" : !eligible ? "reference-only" : at == null ? "timestamp-required"
    : at < observed ? "not-yet-observed" : at >= expires ? "expired" : "estimate";
  return { status, reference, eligible, observedAtUtc: observed == null ? null : new Date(observed).toISOString(), expiresAtUtc: expires == null ? null : new Date(expires).toISOString() };
}

export function getObservedPricingEstimate(observation, provider, model, options = {}) {
  const status = getObservedPricingStatus(observation, provider, model, options);
  if (status.status !== "estimate") return null;
  const quote = getObservedTextPricing(observation.references[provider][model], observation.format);
  const reference = status.reference;
  return { ...quote, provenance: { kind: "models-dev-catalog-estimate", product: reference.product, model,
    url: reference.url, snapshotDate: reference.snapshotDate, verifiedAtUtc: reference.verifiedAtUtc,
    sha256: reference.sha256, ...(reference.repositoryCommit ? { repositoryCommit: reference.repositoryCommit } : {}),
    inheritedFields: Object.keys(quote).filter(field => Number.isFinite(quote[field])) } };
}

/** Validate persisted observations before they enter the synchronous resolver. */
export function validatePricingObservation(value) {
  if (!value || ![V1_FORMAT, MODELS_DEV_PRICING_OBSERVATION_FORMAT].includes(value.format) || !value.products || !value.references || !value.estimates
    || Array.isArray(value.products) || Array.isArray(value.references) || Array.isArray(value.estimates)
    || value.source?.url !== "https://models.dev/api.json" || timestampMs(value.source?.verifiedAtUtc) == null
    || typeof value.source.sha256 !== "string" || !/^[a-f\d]{64}$/.test(value.source.sha256)) {
    throw new Error("Invalid models.dev pricing observation");
  }
  if (value.source.repositoryCommit && !/^[a-f\d]{40}$/.test(value.source.repositoryCommit)) throw new Error("Invalid pricing observation repository commit");
  const policies = value.format === V1_FORMAT ? V1_PRODUCT_POLICY : MODELS_DEV_PRICING_PRODUCT_POLICY;
  const tokenProducts = value.format === V1_FORMAT ? V1_PUBLIC_TOKEN_PRODUCTS : MODELS_DEV_PUBLIC_TOKEN_PRODUCTS;
  const expected = Object.create(null);
  for (const [provider, product] of Object.entries(value.products)) {
    const rows = value.references[provider];
    if (policies[provider] !== product || typeof product !== "string" || !rows || typeof rows !== "object" || Array.isArray(rows)) throw new Error("Invalid pricing observation product");
    for (const [model, row] of Object.entries(rows)) {
      if (!model || !row || !row.cost || typeof row.cost !== "object" || Array.isArray(row.cost)
        || !Array.isArray(row.input) || !Array.isArray(row.output) || [...row.input, ...row.output].some(item => typeof item !== "string")) {
        throw new Error("Invalid pricing observation record");
      }
      validateRawCost(row.cost);
      if (tokenProducts[provider] === product && getObservedTextPricing(row, value.format)) (expected[provider] ||= []).push(model);
    }
  }
  for (const ids of Object.values(expected)) ids.sort();
  for (const provider of new Set([...Object.keys(expected), ...Object.keys(value.estimates)])) {
    if (!Array.isArray(value.estimates[provider]) || JSON.stringify(expected[provider]) !== JSON.stringify(value.estimates[provider])) {
      throw new Error("Pricing observation estimate eligibility differs from its literal records");
    }
  }
  if (Object.keys(value.references).some(provider => !own(value.products, provider))) throw new Error("Unmapped observation reference product");
  return freezePricingObservation(value);
}
