import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { makeKv } from "../helpers/kvStore.js";
import { getScopedCache, readScopeRevision } from "../helpers/scopedCache.js";
import { canonicalizeProviderId, getDeclaredUpstreamModelId, getProviderIdentityTokens } from "open-sse/providers/identity.js";
import { getCustomPricingProvider, PRICING_RATE_FIELDS } from "open-sse/config/pricingConfig.js";
import { getTimeOfUsePricing, parsePricingTimestamp } from "open-sse/config/timeOfUsePricing.js";
const pricingKv = makeKv("pricing");
const CACHE_TTL_MS = 5000;

let cache = { value: null, expiresAt: 0, revision: null };

export function invalidatePricingCache() {
  cache = { value: null, expiresAt: 0, revision: null };
}

export async function getSavedPricing() {
  const db = await getAdapter();
  return getScopedCache(db, "savedPricing", { ttlMs: CACHE_TTL_MS }).get(["pricing", "internal", "saved"], ["pricing"], () => pricingKv.getAll());
}

// Shared display/billing merge: choose one saved row, exact token first. Missing
// fields inherit static metadata, not a conflicting row saved under another alias.
function resolvePricing(userPricing, provider, model, resolveConst, defaultsModel = model) {
  const defaults = resolveConst(provider, defaultsModel);
  for (const token of getProviderIdentityTokens(provider)) {
    if (!Object.hasOwn(userPricing, token)) continue;
    const models = userPricing[token];
    if (models && Object.hasOwn(models, model)) {
      return mergeQuote(defaults, models[model]);
    }
  }
  return defaults;
}

function mergeQuote(defaults, saved) {
  const merged = { ...defaults, ...saved };
  // Explicit null means unknown, not an omitted override.
  if (saved && Object.hasOwn(saved, "output") && !Object.hasOwn(saved, "reasoning")
    && defaults && Object.hasOwn(defaults, "reasoning") && defaults.reasoning === defaults.output) {
    merged.reasoning = saved.output;
  }
  if (saved?.tier || (defaults?.tier && saved?.tier !== null)) {
    const savedTier = saved?.tier || {};
    const tier = { ...defaults?.tier, ...savedTier };
    for (const field of PRICING_RATE_FIELDS) {
      if (saved && Object.hasOwn(saved, field) && !Object.hasOwn(savedTier, field)) tier[field] = saved[field];
    }
    // A saved output price also owns output-billed reasoning, including a
    // separately saved tier output. Distinct reasoning tariffs stay intact.
    if (saved && Object.hasOwn(saved, "output") && !Object.hasOwn(saved, "reasoning") && !Object.hasOwn(savedTier, "reasoning")
      && defaults?.reasoning === defaults?.output
      && (defaults?.tier?.reasoning == null || defaults.tier.reasoning === defaults.tier.output)) {
      tier.reasoning = tier.output;
    }
    merged.tier = tier;
  }
  if (saved?.service_tiers && typeof saved.service_tiers === "object") {
    const tiers = { ...defaults?.service_tiers };
    for (const [tier, quote] of Object.entries(saved.service_tiers)) {
      tiers[tier] = quote === null ? null : mergeQuote(defaults?.service_tiers?.[tier], quote);
    }
    merged.service_tiers = tiers;
  }
  return merged;
}

export async function getPricing() {
  const db = await getAdapter();
  const revision = readScopeRevision(db, ["pricing", "nodes"]);
  const now = Date.now();
  if (cache.value && cache.expiresAt > now && cache.revision === revision) return cache.value;

  const pendingCache = cache;
  const userPricing = await getSavedPricing();
  const { PROVIDER_PRICING, getPricingForModel: resolveConst } = await import("open-sse/providers/pricing.js");
  // An import or pricing write may have committed while this snapshot loaded.
  if (cache !== pendingCache || readScopeRevision(db, ["pricing", "nodes"]) !== revision) return getPricing();
  const providers = new Set([...Object.keys(PROVIDER_PRICING), ...Object.keys(userPricing)]);
  const entries = [];
  for (const provider of providers) {
    const models = new Set();
    for (const token of getProviderIdentityTokens(provider)) {
      for (const source of [PROVIDER_PRICING, userPricing]) {
        if (Object.hasOwn(source, token)) for (const model of Object.keys(source[token] || {})) models.add(model);
      }
    }
    entries.push([provider, Object.fromEntries([...models].map(model => [
      model, resolvePricing(userPricing, provider, model, resolveConst),
    ]))]);
  }
  const merged = Object.fromEntries(entries);
  cache = { value: merged, expiresAt: now + CACHE_TTL_MS, revision };
  return merged;
}

export async function getPricingForModel(provider, model, options = {}) {
  if (!model) return null;
  const db = await getAdapter();
  for (;;) {
    const revision = readScopeRevision(db, ["pricing", "nodes"]);
    const userPricing = await getSavedPricing();
    const [{ getPricingForModel: resolveConst, PROVIDER_PRICING, MODEL_PRICING }, { getReviewedModelMetadata }, { stripThinkingSuffix }] = await Promise.all([
      import("open-sse/providers/pricing.js"), import("open-sse/providers/metadata/reviewed.js"), import("open-sse/translator/concerns/thinkingUnified.js"),
    ]);
    let node;
    if (/^(?:openai|anthropic)-compatible-/.test(provider || "")) {
      const { getProviderNodeById } = await import("./nodesRepo.js");
      node = await getProviderNodeById(provider);
    }
    if (readScopeRevision(db, ["pricing", "nodes"]) !== revision) continue;
    return resolveModelPricing(userPricing, provider, model,
      defaultResolver(resolveConst, node, options, getReviewedModelMetadata), stripThinkingSuffix,
      (product, id) => hasLiteralQuote(PROVIDER_PRICING, MODEL_PRICING, product, id));
  }
}

function hasLiteralQuote(providerPrices, modelPrices, provider, model) {
  return getProviderIdentityTokens(provider).some(token => Object.hasOwn(providerPrices[token] || {}, model))
    || Object.hasOwn(modelPrices, model);
}

function defaultResolver(resolveConst, node, options = {}, getReviewedModelMetadata) {
  let resolveDefaults = resolveConst;
  const reference = getCustomPricingProvider(node?.baseUrl);
  if (reference) resolveDefaults = (_provider, id) => resolveConst(reference, id);
  const resolveReference = resolveDefaults;
  return (product, id) => {
    const timed = getTimeOfUsePricing(canonicalizeProviderId(product), getDeclaredUpstreamModelId(product, id), options?.timestamp);
    if (timed) return timed;
    const base = resolveReference(product, id);
    const reviewed = getReviewedModelMetadata?.(product, id);
    const next = reviewed?.billing?.nextRates || reviewed?.billing?.promotion?.nextRates;
    if (!base || !next?.from || options?.timestamp === undefined) return base;
    const at = options.timestamp;
    const timestamp = parsePricingTimestamp(at)?.getTime();
    const boundary = /^\d{4}-\d{2}-\d{2}$/.test(next.from) ? `${next.from}T00:00:00Z` : next.from;
    const startsAt = parsePricingTimestamp(boundary)?.getTime();
    if (!Number.isFinite(timestamp) || !Number.isFinite(startsAt)) return Object.fromEntries(PRICING_RATE_FIELDS.map(field => [field, null]));
    if (timestamp < startsAt) return base;
    // Only native token rates cross into the token calculator. A storage/hour
    // charge, billing annotation or guaranteed-minimum offer is not a rate.
    const rates = Object.fromEntries(PRICING_RATE_FIELDS.filter(field => Object.hasOwn(next, field)).map(field => [field, next[field]]));
    if (Object.hasOwn(rates, "output") && !Object.hasOwn(rates, "reasoning")
      && (base.reasoning === undefined || base.reasoning === base.output)) rates.reasoning = rates.output;
    return { ...base, ...rates };
  };
}

function resolveModelPricing(userPricing, provider, model, resolveDefaults, stripThinkingSuffix, hasLiteral = () => false) {
  const base = stripThinkingSuffix(model);
  // A user override on the exact (effort-annotated) id always wins.
  if (hasUserOverride(userPricing, provider, model)) {
    return resolvePricing(userPricing, provider, model, resolveDefaults, hasLiteral(provider, model) ? model : base);
  }
  // Usage rows keep the effort-annotated id ("gpt-6.1-sol(xhigh)"); resolving
  // it as-is missed the base model's exact entry and fell through to a broader
  // glob or to null ($0). Price the variant at its base model's rate — which
  // also honors a user override saved on the base id (9router #4635).
  if (base === model) {
    return resolvePricing(userPricing, provider, model, resolveDefaults);
  }
  return resolvePricing(userPricing, provider, base, resolveDefaults);
}

// Effective editor rows include configured custom/native IDs, but public
// references are never persisted as operator overrides. Resolve node identity
// freshly so changing/importing a URL cannot retain another host's quote.
export async function getConfiguredPricing() {
  const [{ getProviderNodes }, { getCustomModels }, { getProviderConnections }, { default: registry }] = await Promise.all([
    import("./nodesRepo.js"), import("./aliasRepo.js"), import("./connectionsRepo.js"), import("open-sse/providers/registry/index.js"),
  ]);
  const [defaults, nodes, custom, connections] = await Promise.all([
    getPricing(), getProviderNodes(), getCustomModels(), getProviderConnections(),
  ]);
  const [userPricing, { getPricingForModel: resolveConst, PROVIDER_PRICING, MODEL_PRICING }, { stripThinkingSuffix }, { getReviewedModelMetadata }] = await Promise.all([
    getSavedPricing(), import("open-sse/providers/pricing.js"), import("open-sse/translator/concerns/thinkingUnified.js"), import("open-sse/providers/metadata/reviewed.js"),
  ]);
  const output = { ...defaults };
  const identities = new Map(nodes.flatMap(node => [[node.id, node.id], ...(node.prefix ? [[node.prefix, node.id]] : [])]));
  const nativeTokens = new Set(registry.flatMap(provider => [provider.id, provider.alias, provider.uiAlias, ...(provider.aliases || [])].filter(Boolean)));
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const rows = new Map();
  const add = (provider, model) => {
    if (typeof provider !== "string" || typeof model !== "string" || !model) return;
    const id = nativeTokens.has(provider) ? provider : identities.get(provider) || provider;
    rows.set(JSON.stringify([id, model]), [id, model]);
  };
  for (const provider of registry) for (const model of provider.models || []) add(provider.id, model.id);
  for (const [provider, models] of Object.entries(defaults)) {
    if (!identities.has(provider) && !/^(?:openai|anthropic)-compatible-/.test(provider)) continue;
    for (const model of Object.keys(models || {})) add(provider, model);
  }
  for (const row of custom) add(row.providerAlias, row.id);
  for (const connection of connections) {
    add(connection.provider, connection.defaultModel);
    for (const model of connection.providerSpecificData?.customModels || []) {
      add(connection.provider, typeof model === "string" ? model : model?.id);
    }
  }
  const timestamp = new Date().toISOString();
  const copiedProviders = new Set();
  for (const [provider, model] of rows.values()) {
    const quote = resolveModelPricing(userPricing, provider, model,
      defaultResolver(resolveConst, nodeById.get(provider), { timestamp }, getReviewedModelMetadata), stripThinkingSuffix,
      (product, id) => hasLiteralQuote(PROVIDER_PRICING, MODEL_PRICING, product, id));
    if (!copiedProviders.has(provider)) { output[provider] = Object.assign(Object.create(null), output[provider]); copiedProviders.add(provider); }
    output[provider][model] = quote || {};
  }
  return output;
}

function hasUserOverride(userPricing, provider, model) {
  for (const token of getProviderIdentityTokens(provider)) {
    if (!Object.hasOwn(userPricing, token)) continue;
    const models = userPricing[token];
    if (models && Object.hasOwn(models, model)) return true;
  }
  return false;
}

// Atomic merge inside transaction (per-provider read-modify-write)
export async function updatePricing(pricingData) {
  const db = await getAdapter();
  db.transaction(() => {
    for (const [provider, models] of Object.entries(pricingData)) {
      const row = db.get(`SELECT value FROM kv WHERE scope = 'pricing' AND key = ?`, [provider]);
      const current = row ? (parseJson(row.value, {}) || {}) : {};
      const merged = Object.assign(Object.create(null), current);
      for (const [model, pricing] of Object.entries(models)) {
        merged[model] = pricing;
      }
      db.run(
        `INSERT INTO kv(scope, key, value) VALUES('pricing', ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [provider, stringifyJson(merged)]
      );
    }
  });
  invalidatePricingCache();
  return await getSavedPricing();
}

export async function resetPricing(provider, model) {
  if (!provider) return await getSavedPricing();
  const db = await getAdapter();
  db.transaction(() => {
    if (!model) {
      db.run(`DELETE FROM kv WHERE scope = 'pricing' AND key = ?`, [provider]);
      return;
    }
    const row = db.get(`SELECT value FROM kv WHERE scope = 'pricing' AND key = ?`, [provider]);
    const current = row ? (parseJson(row.value, {}) || {}) : {};
    delete current[model];
    if (Object.keys(current).length === 0) {
      db.run(`DELETE FROM kv WHERE scope = 'pricing' AND key = ?`, [provider]);
    } else {
      db.run(
        `INSERT INTO kv(scope, key, value) VALUES('pricing', ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [provider, stringifyJson(current)]
      );
    }
  });
  invalidatePricingCache();
  return await getSavedPricing();
}

export async function resetAllPricing() {
  await pricingKv.clear();
  invalidatePricingCache();
  return {};
}
