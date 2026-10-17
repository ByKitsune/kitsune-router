/**
 * Antigravity live quota cache — in-memory, refreshed on demand.
 * Used by auth.js pre-filter to skip accounts with exhausted model quota.
 * Also triggered by 409/429 error handler to sync exact resetAt from upstream.
 */

import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { getAntigravityUsage } from "open-sse/services/usage/google.js";
import { PROVIDER_MODELS } from "open-sse/providers/index.js";
import * as log from "../utils/logger.js";

// In-memory cache: connectionId → { [modelId]: { remainingPercentage, resetAt } }
const quotaCache = new Map();
// Track last refresh per connection to avoid hammering
const lastRefreshAt = new Map();
// In-flight refresh promises — dedup concurrent 409/429 bursts
const inflightRefresh = new Map();

const MIN_REFRESH_INTERVAL_MS = 30_000; // 30s between refreshes per connection

// Registry aliases share quota only when their complete upstream target (tier
// included) is identical. The native Argon base id intentionally has no preset.
const quotaModelAliases = new Map();
const aliasesByTarget = new Map();
for (const model of PROVIDER_MODELS.ag || []) {
  const target = model.upstreamModelId || model.id;
  if (!aliasesByTarget.has(target)) aliasesByTarget.set(target, new Set());
  aliasesByTarget.get(target).add(model.id);
}
for (const [target, aliases] of aliasesByTarget) {
  const keys = [...aliases];
  if (!aliases.has(target)) keys.push(target);
  const upstreamId = target.replace(/\([^()]+\)\s*$/, "").trim();
  if (!aliases.has(upstreamId) && upstreamId !== target) keys.push(upstreamId);
  quotaModelAliases.set(target, keys);
  for (const alias of aliases) quotaModelAliases.set(alias, keys);
}

const familyQuotaKeys = {
  argon: ["argon_session", "argon_weekly"],
  gemini: ["gemini_session", "gemini_weekly"],
  claude_gpt: ["claude_gpt_session", "claude_gpt_weekly"],
};

function getQuotaModelKeys(model) {
  if (typeof model !== "string") return null;
  const unprefixed = model.slice(model.indexOf("/") + 1).trim();
  const clean = unprefixed.replace(/\([^()]+\)\s*$/, "").trim();
  if (!clean) return null;
  const keys = quotaModelAliases.get(unprefixed) || quotaModelAliases.get(clean) || [clean];
  return keys.includes(model) ? keys : [...keys, model];
}

/** Resolve exact model/tier and independent family limits; any exhaustion wins. */
export function getAntigravityModelQuota(quotas, model) {
  if (!quotas || typeof quotas !== "object") return null;
  const modelKeys = getQuotaModelKeys(model);
  if (!modelKeys) return null;
  const clean = modelKeys[0];
  const candidates = modelKeys.map(key => quotas[key]);
  const family = /argon/i.test(clean) ? "argon"
    : /^(?:claude|gpt)(?:-|$)/i.test(clean) ? "claude_gpt"
      : /^gemini(?:-|$)/i.test(clean) && !/image/i.test(clean) ? "gemini" : null;
  for (const key of familyQuotaKeys[family] || []) candidates.push(quotas[key]);

  const now = Date.now();
  let constrained = null;
  let exhausted = null;
  let latestReset = now;
  for (const candidate of candidates) {
    const remaining = candidate?.remainingPercentage;
    if (typeof remaining !== "number" || !Number.isFinite(remaining) || remaining < 0 || remaining > 100) continue;
    const reset = remaining === 0 ? Date.parse(candidate.resetAt) : null;
    // A stale/missing deadline cannot explain a fresh 429 or suppress strikes.
    if (remaining === 0 && (!Number.isFinite(reset) || reset <= now)) continue;
    if (!constrained || remaining < constrained.remainingPercentage) constrained = candidate;
    if (remaining === 0 && reset > latestReset) {
      exhausted = candidate;
      latestReset = reset;
    }
  }
  return exhausted || constrained;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strike-based circuit breaker — WHY and HOW (superset of upstream #3681)
// ─────────────────────────────────────────────────────────────────────────────
// Google's quota API (fetchAvailableModels / GetManagedQuotas) can report
// remaining quota (e.g. 60–90%) while the *generation* endpoints still
// return 429 with a reset hint. This happens with sprint/weekly dual-pool
// mismatch: quota endpoint reads one pool, generation reads another. Trusting
// `remainingPercentage > 0` as healthy caused 429 retry-storms across the
// whole multi-account pool (every 429 refreshed quota → still optimistic →
// retry next account → also 429 → loop forever).
//
// Design (more robust than upstream's first iteration 62c45b60):
// - Count every qualifying 429/409 whose quota reading is either optimistic
//   (remaining > 0) OR unavailable (quota API 403 / error / null). After
//   STRIKE_THRESHOLD within a FIXED window anchored at the FIRST strike,
//   synthesize a 15-minute 0% cache-block for that exact connection+model pair.
// - Re-assert active blocks onto every fresh quota snapshot so an optimistic
//   upstream reading cannot resurrect a broken pair prematurely (same channel
//   as genuine 0% exhaustion).
// - Clear strikes on *success* so "consecutive" means consecutive, not
//   "ever". Only removes a SYTHESIZED entry (resetAt === our block deadline);
//   a real upstream 0% reading with a different resetAt is left untouched.
// - Fixed window (anchored at first strike) vs sliding window: prevents
//   slow-drip poisoning — three 429s over 90s (45s gaps) must NOT trip, only
//   three inside 60s of the first one. Upstream proved sliding window (lastTime)
//   false-fired on intermittent flaps.
//
// TTL / memory handling (beyond upstream):
// - Both Maps store only per-(connection|model) that actually 429ed; size is
//   bounded by (activeAccounts * modelsThat429Recently). Expired entries are
//   pruned lazily on every quota refresh + strike path so Maps never grow
//   unbounded even with churn.
// - Race: Node is single-threaded, but concurrent async 429 paths can interleave
//   via `await refreshAntigravityQuota`. The strike counter is updated synchronously
//   (no await between read and write) so increments are atomic within the event
//   loop tick; inflightRefresh dedup ensures quota fetch races don't double-count
//   wall time.
//
const STRIKE_WINDOW_MS = 60_000; // fixed window anchored at first strike
const STRIKE_THRESHOLD = 3;
const STRIKE_BLOCK_MS = 15 * 60_000;
const strikeCounts = new Map(); // "connectionId|model" → { count, windowStart (anchored at first strike) }
const strikeBlocks = new Map(); // "connectionId|model" → blockedUntil ms (TTL)

/** Prune expired blocks + stale windows. Cheap O(n) where n = blocked pairs (usually <10). */
function pruneExpiredStrikeBlocks(now = Date.now()) {
  for (const [key, until] of strikeBlocks) {
    if (until <= now) strikeBlocks.delete(key);
  }
  for (const [key, entry] of strikeCounts) {
    if (now - entry.windowStart > STRIKE_WINDOW_MS) strikeCounts.delete(key);
  }
}

/**
 * Re-apply active strike blocks onto a fresh quotas snapshot so the auth
 * pre-filter (which reads this cache) keeps skipping the blocked pair across
 * requests until the block expires — same channel as the exhausted-0% path.
 * Expired blocks are GC'd inline so they don't linger after TTL.
 */
function applyActiveStrikeBlocks(connectionId, quotas) {
  const now = Date.now();
  pruneExpiredStrikeBlocks(now);
  if (!connectionId || typeof quotas !== "object" || quotas === null) return quotas;
  for (const [key, until] of strikeBlocks) {
    if (!key.startsWith(`${connectionId}|`)) continue;
    const modelId = key.slice(connectionId.length + 1);
    // Guard: never overwrite a genuine upstream 0% with a later expiry already present;
    // but strike blocks intentionally shadow optimistic >0% — that's the whole point.
    const existing = quotas[modelId];
    if (existing?.remainingPercentage === 0 && Date.parse(existing.resetAt) >= until) continue;
    quotas[modelId] = {
      remainingPercentage: 0,
      resetAt: new Date(until).toISOString(),
    };
  }
  return quotas;
}

/**
 * Clear strike state for a connection|model after a successful request, so
 * "consecutive" strikes means consecutive. Only removes a synthesized cache
 * entry (resetAt == our block deadline); a real upstream 0% reading stays.
 * Safe to call even when no strike exists — no-op.
 */
export function clearAntigravityStrikes(connectionId, model) {
  const modelKeys = getQuotaModelKeys(model);
  if (!connectionId || !modelKeys) return;
  const cached = quotaCache.get(connectionId);
  for (const modelId of modelKeys) {
    const key = `${connectionId}|${modelId}`;
    strikeCounts.delete(key);
    const until = strikeBlocks.get(key);
    if (until === undefined) continue;
    strikeBlocks.delete(key);
    // Preserve genuine quota readings; only remove our synthesized deadline.
    if (cached?.[modelId]?.resetAt === new Date(until).toISOString()) {
      delete cached[modelId];
      // Keep the existing (possibly empty) cache object for the auth prefilter.
      log.info("AG_QUOTA", `${connectionId.slice(0, 8)} | strike CLEAR ${modelId} — synthesized block removed, pair selectable again`);
    } else {
      log.debug("AG_QUOTA", `${connectionId.slice(0, 8)} | strike CLEAR ${modelId} — no synthesized entry to remove (real 0% kept)`);
    }
  }
}

/** Introspection for diagnostics / tests — returns shallow copy, not live Map. */
export function getAntigravityStrikeInfo() {
  pruneExpiredStrikeBlocks();
  return {
    counts: new Map(strikeCounts),
    blocks: new Map(strikeBlocks),
  };
}

/**
 * Get the quota cache (read-only reference for auth.js pre-filter).
 */
export function getAntigravityQuotaCache() {
  return quotaCache;
}

/**
 * Refresh quota for a single antigravity connection from upstream API.
 * Updates in-memory cache only. Cache expiry is the upstream model resetAt.
 * @returns {object|null} quotas map or null on failure
 */
export async function refreshAntigravityQuota(connectionId, accessToken, providerSpecificData) {
  const now = Date.now();
  // Coalesce concurrent refreshes before applying the interval gate.
  const inflight = inflightRefresh.get(connectionId);
  if (inflight) return inflight;

  const lastRefresh = lastRefreshAt.get(connectionId) || 0;
  if (now - lastRefresh < MIN_REFRESH_INTERVAL_MS) {
    log.debug("AG_QUOTA", `${connectionId.slice(0, 8)} | skip refresh (${Math.round((now - lastRefresh) / 1000)}s ago)`);
    return quotaCache.get(connectionId) || null;
  }

  // Record every attempt so failed quota calls cannot amplify an upstream 429 burst.
  lastRefreshAt.set(connectionId, now);
  const promise = _doRefresh(connectionId, accessToken, providerSpecificData, now);
  inflightRefresh.set(connectionId, promise);
  try {
    return await promise;
  } finally {
    inflightRefresh.delete(connectionId);
  }
}

async function _doRefresh(connectionId, accessToken, providerSpecificData, now) {
  try {
    const proxyCfg = await resolveConnectionProxyConfig(providerSpecificData || {});
    const proxyOptions = {
      connectionProxyEnabled: proxyCfg.connectionProxyEnabled === true,
      connectionProxyUrl: proxyCfg.connectionProxyUrl || "",
      connectionNoProxy: proxyCfg.connectionNoProxy || "",
      vercelRelayUrl: proxyCfg.vercelRelayUrl || "",
      strictProxy: proxyCfg.strictProxy === true,
    };

    const usage = await getAntigravityUsage(accessToken, providerSpecificData, proxyOptions);
    // 401/403 usage responses can contain an empty quotas object plus message.
    // Preserve known cache instead of replacing it with an upstream error response.
    if (!usage?.quotas || usage.message) return null;

    // Update in-memory cache. Caller logs CACHE_BLOCK only if requested model is exhausted.
    // Strike blocks are re-asserted after every refresh so an optimistic
    // upstream reading cannot resurrect a pair we just circuit-broke.
    // Missing windows can mean denied optional summary access or an unknown
    // fraction. Keep the last known reading; its real reset still bounds blocks.
    const quotas = { ...quotaCache.get(connectionId) };
    for (const [modelId, quota] of Object.entries(usage.quotas)) {
      const known = quotas[modelId];
      const preserveReset = quota?.remainingPercentage === 0 && !Number.isFinite(Date.parse(quota.resetAt))
        && known?.remainingPercentage === 0 && Date.parse(known.resetAt) > now;
      quotas[modelId] = preserveReset ? { ...quota, resetAt: known.resetAt } : quota;
    }
    applyActiveStrikeBlocks(connectionId, quotas);
    quotaCache.set(connectionId, quotas);

    return quotas;
  } catch (e) {
    log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | refresh failed: ${e.message}`);
    return null;
  }
}

/**
 * Handle Antigravity 409/429 — refresh RAM cache and return model resetAt when exhausted.
 * Called from chat handler error path.
 * @param {string} connectionId - provider connection id (maps to RAM cache key)
 * @param {number} status - upstream HTTP status (409 or 429)
 * @param {string} model - model id that 429ed
 * @param {string} accessToken - OAuth access token for quota refresh
 * @param {object} providerSpecificData - per-connection proxy / metadata
 * @returns {number|null} resetAt timestamp ms (for resetsAtMs passthrough) or null (retry next account)
 */
export async function handleAntigravityQuotaError(connectionId, status, model, accessToken, providerSpecificData) {
  if (!connectionId || !model) {
    log.warn("AG_QUOTA", `${String(connectionId).slice(0, 8)} | ${status} on ${model} — missing id/model, skipping quota handling`);
    return null;
  }
  log.info("AG_QUOTA", `${connectionId.slice(0, 8)} | ${status} on ${model} — refreshing quota (strike-aware)`);

  // Throttle applies to error paths too: one quota request per account/30s.
  // The first 409/429 populates cache; concurrent or repeated errors reuse it.
  // Race: inflightRefresh dedups concurrent bursts, so multiple 429s arriving
  // within the same tick share one upstream call and don't amplify the storm.
  const quotas = await refreshAntigravityQuota(connectionId, accessToken, providerSpecificData);
  const quota = getAntigravityModelQuota(quotas || quotaCache.get(connectionId), model);

  // Strike breaker: count every 429 whose quota reading is either optimistic
  // (remaining > 0) or unavailable (quota API 403/error). 3 within the window
  // => the pair is unhealthy regardless of what the API claims; block 15m.
  // 409 counts too by design: Antigravity signals pool exhaustion with 409 as
  // well (see #3561 — "skip exhausted account/model quota before upstream
  // retry" was motivated by 409/429 pairs), and poisoning by transient 409s
  // requires 3 of them inside 60 seconds on the same pair.
  if (!quota || quota.remainingPercentage > 0) {
    const key = `${connectionId}|${model}`;
    const now = Date.now();
    // Prune stale windows before counting so a lapsed window doesn't inflate count
    const existing = strikeCounts.get(key);
    const windowStillOpen = existing && now - existing.windowStart <= STRIKE_WINDOW_MS;
    const windowStart = windowStillOpen ? existing.windowStart : now;
    const count = windowStillOpen ? existing.count + 1 : 1;
    strikeCounts.set(key, { count, windowStart });
    const remainingInWindow = Math.max(0, STRIKE_WINDOW_MS - (now - windowStart));
    const reading = quota ? `${Math.round(quota.remainingPercentage)}%` : "unknown";
    const resetAtStr = quota?.resetAt || "n/a";
    if (count >= STRIKE_THRESHOLD) {
      strikeCounts.delete(key);
      const blockedUntil = now + STRIKE_BLOCK_MS;
      const blockedUntilIso = new Date(blockedUntil).toISOString();
      log.warn(
        "AG_QUOTA",
        `${connectionId.slice(0, 8)} | STRIKE_${status} ${model} — ${count}x ${status} (quota ${reading}, resetAt ${resetAtStr}) within ${Math.round((now - windowStart)/1000)}s; CACHE_BLOCK 15m until ${blockedUntilIso} (strike window ${STRIKE_WINDOW_MS/1000}s, block ${STRIKE_BLOCK_MS/60000}m)`
      );
      // Synthesize a 0% entry in the shared cache so the auth pre-filter skips
      // this pair on subsequent requests too, not just the current retry loop
      // (the chat handler does not persist modelLock_* for this path).
      const cached = quotaCache.get(connectionId) || {};
      cached[model] = { remainingPercentage: 0, resetAt: blockedUntilIso };
      quotaCache.set(connectionId, cached);
      strikeBlocks.set(key, blockedUntil);
      return blockedUntil;
    }
    log.info(
      "AG_QUOTA",
      `${connectionId.slice(0, 8)} | optimistic quota ${reading} (resetAt ${resetAtStr}) — strike ${count}/${STRIKE_THRESHOLD} for ${model}, window ${Math.round(remainingInWindow/1000)}s remaining; not yet blocking`
    );
    return null;
  }

  // Healthy-but-exhausted reading: clear strikes and use the exact resetAt.
  // This is the "honest 0%": quota API correctly says exhausted. The resetAt
  // is authoritative — trust it, and reset strike state since the 0% explains
  // the 429 (no need for circuit breaker).
  strikeCounts.delete(`${connectionId}|${model}`);
  // Also opportunistically prune any expired blocks for this connection so
  // successful 0% doesn't leave stale TTL entries for other models.
  pruneExpiredStrikeBlocks();
  if (!quota.resetAt) {
    log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | UPSTREAM_${status} ${model} — quota 0% but no resetAt, not blocking`);
    return null;
  }

  const resetMs = new Date(quota.resetAt).getTime();
  if (Number.isNaN(resetMs) || resetMs <= Date.now()) {
    log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | UPSTREAM_${status} ${model} — resetAt ${quota.resetAt} already passed or invalid, not blocking`);
    return null;
  }

  const delaySec = Math.round((resetMs - Date.now()) / 1000);
  log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | UPSTREAM_${status} ${model} — quota exhausted (0%, remaining ${quota.remainingPercentage}%); CACHE_BLOCK until ${quota.resetAt} (~${delaySec}s)`);
  return resetMs;
}
