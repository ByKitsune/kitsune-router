import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { makeKv } from "../helpers/kvStore.js";
import { getProviderIdentityTokens } from "open-sse/providers/identity.js";
const pricingKv = makeKv("pricing");
const CACHE_TTL_MS = 5000;

let cache = { value: null, expiresAt: 0 };

function invalidate() {
  cache = { value: null, expiresAt: 0 };
}

async function getUserPricing() {
  return await pricingKv.getAll();
}

// Shared display/billing merge: choose one saved row, exact token first. Missing
// fields inherit static metadata, not a conflicting row saved under another alias.
function resolvePricing(userPricing, provider, model, resolveConst) {
  const defaults = resolveConst(provider, model);
  for (const token of getProviderIdentityTokens(provider)) {
    if (!Object.hasOwn(userPricing, token)) continue;
    const models = userPricing[token];
    if (models && Object.hasOwn(models, model)) {
      const saved = models[model];
      const merged = { ...defaults, ...saved };
      // Output-billed reasoning follows an overridden output rate; preserve
      // explicit saved reasoning (including zero) and distinct static tariffs.
      if (saved?.output != null && saved.reasoning == null
        && defaults?.reasoning != null && defaults.reasoning === defaults.output) {
        merged.reasoning = saved.output;
      }
      return merged;
    }
  }
  return defaults;
}

export async function getPricing() {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now) return cache.value;

  const userPricing = await getUserPricing();
  const { PROVIDER_PRICING, getPricingForModel: resolveConst } = await import("open-sse/providers/pricing.js");
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
  cache = { value: merged, expiresAt: now + CACHE_TTL_MS };
  return merged;
}

export async function getPricingForModel(provider, model) {
  if (!model) return null;
  const userPricing = await getUserPricing();
  const { getPricingForModel: resolveConst } = await import("open-sse/providers/pricing.js");
  // A user override on the exact (effort-annotated) id always wins.
  if (hasUserOverride(userPricing, provider, model)) {
    return resolvePricing(userPricing, provider, model, resolveConst);
  }
  // Usage rows keep the effort-annotated id ("gpt-6.1-sol(xhigh)"); resolving
  // it as-is missed the base model's exact entry and fell through to a broader
  // glob or to null ($0). Price the variant at its base model's rate — which
  // also honors a user override saved on the base id (9router #4635).
  const { stripThinkingSuffix } = await import("open-sse/translator/concerns/thinkingUnified.js");
  const base = stripThinkingSuffix(model);
  if (base === model) {
    return resolvePricing(userPricing, provider, model, resolveConst);
  }
  return resolvePricing(userPricing, provider, base, resolveConst);
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
      const merged = { ...current };
      for (const [model, pricing] of Object.entries(models)) {
        merged[model] = pricing;
      }
      db.run(
        `INSERT INTO kv(scope, key, value) VALUES('pricing', ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [provider, stringifyJson(merged)]
      );
    }
  });
  invalidate();
  return await getUserPricing();
}

export async function resetPricing(provider, model) {
  if (!provider) return await getUserPricing();
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
  invalidate();
  return await getUserPricing();
}

export async function resetAllPricing() {
  await pricingKv.clear();
  invalidate();
  return {};
}
