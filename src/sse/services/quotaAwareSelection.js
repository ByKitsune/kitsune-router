export const DEFAULT_QUOTA_CACHE_TTL_MS = 45_000;
export const DEFAULT_STALE_OK_MS = 300_000;

const PROVIDER_SESSION_KEYS = {
  claude: "session (5h)",
  codex: "session",
};

export function toFiniteNumber(value, fallback = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function isQuotaExhausted(quota) {
  if (!quota || quota.unlimited === true) return false;
  const remaining = toFiniteNumber(quota.remaining);
  if (remaining !== null) return remaining <= 0;

  const used = toFiniteNumber(quota.used);
  const total = toFiniteNumber(quota.total);
  return total !== null && total > 0 && used !== null && used >= total;
}

export function isBlockingQuotaName(name, sessionKey) {
  if (name === sessionKey) return false;
  return !String(name).toLowerCase().includes("session");
}

export function hasExhaustedBlockingQuota(quotas, sessionKey) {
  return Object.entries(quotas || {}).some(
    ([name, quota]) => isBlockingQuotaName(name, sessionKey) && isQuotaExhausted(quota),
  );
}

function fractionFromQuota(quota) {
  if (!quota) return null;
  if (quota.unlimited === true) return 1;
  const pct = toFiniteNumber(quota.remainingPercentage);
  if (pct !== null) return Math.max(0, Math.min(1, pct / 100));
  const remaining = toFiniteNumber(quota.remaining);
  const total = toFiniteNumber(quota.total);
  if (remaining !== null && total !== null && total > 0) {
    return Math.max(0, Math.min(1, remaining / total));
  }
  if (remaining !== null && total === null) {
    // Weak signal only — prefer fraction APIs; clamp large remainings.
    return Math.max(0, Math.min(1, remaining / 100));
  }
  const used = toFiniteNumber(quota.used);
  if (used !== null && total !== null && total > 0) {
    return Math.max(0, Math.min(1, (total - used) / total));
  }
  return null;
}

export function normalizeQuotasToSnapshot(providerId, usage) {
  const quotas = usage?.quotas || {};
  const sessionKey = PROVIDER_SESSION_KEYS[providerId] || "session";
  const primary = quotas[sessionKey] || Object.values(quotas)[0] || null;
  const remainingFraction = fractionFromQuota(primary);
  const blockingExhausted = hasExhaustedBlockingQuota(quotas, sessionKey);
  let blockingResetAt = null;
  for (const [name, quota] of Object.entries(quotas)) {
    if (!isBlockingQuotaName(name, sessionKey) || !isQuotaExhausted(quota)) continue;
    const resetAt = quota?.resetAt || null;
    if (!resetAt) continue;
    if (!blockingResetAt || Date.parse(resetAt) < Date.parse(blockingResetAt)) {
      blockingResetAt = resetAt;
    }
  }
  return {
    remainingFraction,
    remaining: toFiniteNumber(primary?.remaining),
    total: toFiniteNumber(primary?.total),
    resetAt: primary?.resetAt || null,
    blockingResetAt,
    unlimited: primary?.unlimited === true,
    primaryKey: primary ? sessionKey : null,
    blockingExhausted,
    unknown: remainingFraction === null && !primary,
    fetchedAt: Date.now(),
  };
}

export function compareConnectionsByRemaining(a, b) {
  const sa = a._quotaSnapshot || {};
  const sb = b._quotaSnapshot || {};
  const fa = sa.unknown ? -1 : toFiniteNumber(sa.remainingFraction, -1);
  const fb = sb.unknown ? -1 : toFiniteNumber(sb.remainingFraction, -1);
  if (fb !== fa) return fb - fa;
  const ba = toFiniteNumber(a.backoffLevel, 0);
  const bb = toFiniteNumber(b.backoffLevel, 0);
  if (ba !== bb) return ba - bb;
  const ta = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
  const tb = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
  if (ta !== tb) return ta - tb; // older first
  return String(a.id || "").localeCompare(String(b.id || ""));
}

export function sortConnectionsByRemaining(connections) {
  return [...(connections || [])].sort(compareConnectionsByRemaining);
}

export function createQuotaSnapshotCache({
  ttlMs = DEFAULT_QUOTA_CACHE_TTL_MS,
  staleOkMs = DEFAULT_STALE_OK_MS,
  now = () => Date.now(),
  getGeneration = () => 0,
} = {}) {
  const values = new Map();
  const inflight = new Map();
  let generation = getGeneration();

  function syncGeneration() {
    const current = getGeneration();
    if (generation !== current) {
      generation = current;
      values.clear();
      inflight.clear();
    }
    return generation;
  }

  function get(connectionId) {
    syncGeneration();
    return values.get(connectionId) || null;
  }

  function set(connectionId, snap) {
    syncGeneration();
    values.set(connectionId, snap);
  }

  async function getOrFetch(connectionId, fetcher) {
    const version = syncGeneration();
    const t = now();
    const cached = values.get(connectionId);
    if (cached && t - (cached.fetchedAt || 0) < ttlMs) return cached;

    if (inflight.has(connectionId)) return inflight.get(connectionId).promise;

    const pending = {};
    inflight.set(connectionId, pending);
    pending.promise = (async () => {
      try {
        const snap = await fetcher();
        // The fetcher closes over credentials that an import may have replaced.
        // Discard it instead of publishing or retrying with those credentials.
        if (version !== syncGeneration()) return null;
        const stored = { ...snap, fetchedAt: snap.fetchedAt || now(), stale: false };
        values.set(connectionId, stored);
        return stored;
      } catch (err) {
        if (version !== syncGeneration()) return null;
        if (cached && t - (cached.fetchedAt || 0) < staleOkMs) {
          return { ...cached, stale: true };
        }
        return {
          remainingFraction: null,
          unknown: true,
          blockingExhausted: false,
          fetchedAt: now(),
          stale: true,
          error: String(err?.message || err),
        };
      } finally {
        if (inflight.get(connectionId) === pending) inflight.delete(connectionId);
      }
    })();

    return pending.promise;
  }

  return { get, set, getOrFetch };
}
