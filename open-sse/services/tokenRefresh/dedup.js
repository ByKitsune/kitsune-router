const REFRESH_RESULT_TTL_MS = 10_000;
const MAX_DEDUP_CACHE_SIZE = 500;
const refreshDedupCache = new Map();

// Periodic sweep to clean up expired cache entries and prevent memory leaks
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of refreshDedupCache.entries()) {
    if (!val.promise && val.expiresAt && val.expiresAt <= now) {
      refreshDedupCache.delete(key);
    }
  }
}, 60_000);

if (sweepInterval.unref) sweepInterval.unref();

function evictOldestIfNeeded() {
  if (refreshDedupCache.size >= MAX_DEDUP_CACHE_SIZE) {
    const now = Date.now();
    // Try to evict expired entry first
    for (const [key, val] of refreshDedupCache.entries()) {
      if (!val.promise && val.expiresAt && val.expiresAt <= now) {
        refreshDedupCache.delete(key);
        if (refreshDedupCache.size < MAX_DEDUP_CACHE_SIZE) return;
      }
    }
    // Fall back to oldest inserted entry
    const oldestKey = refreshDedupCache.keys().next().value;
    if (oldestKey) refreshDedupCache.delete(oldestKey);
  }
}

// Match the policy fields consumed by proxyAwareFetch; keys stay in memory only.
export function getRefreshProxyKey(proxyOptions = null) {
  const normalize = (value) => typeof value === "string" ? value.trim() : "";
  return JSON.stringify([
    proxyOptions?.enabled === true || proxyOptions?.connectionProxyEnabled === true,
    normalize(proxyOptions?.url ?? proxyOptions?.connectionProxyUrl),
    normalize(proxyOptions?.noProxy ?? proxyOptions?.connectionNoProxy),
    proxyOptions?.strictProxy === true,
    normalize(proxyOptions?.vercelRelayUrl),
  ]);
}

// An operation owns its transport signal; callers own only their subscriptions.
// Deferring dispatch one microtask also prevents a same-turn cancellation from
// starting a new OAuth request. A credential commit already in progress may
// finish, but no follow-up network operation may ignore this signal.
export function createRefreshOperation(fn) {
  const operation = { controller: new AbortController(), waiters: 0, settled: false };
  operation.promise = Promise.resolve().then(() => {
    operation.controller.signal.throwIfAborted();
    return fn(operation.controller.signal);
  }).finally(() => { operation.settled = true; });
  // Every waiter may leave before the shared transport rejects.
  operation.promise.catch(() => {});
  return operation;
}

export function waitForRefresh(operation, signal = null) {
  signal?.throwIfAborted();
  operation.waiters++;
  return new Promise((resolve, reject) => {
    let finished = false;
    const release = () => {
      if (finished) return false;
      finished = true;
      operation.waiters--;
      signal?.removeEventListener("abort", onAbort);
      return true;
    };
    const onAbort = () => {
      if (!release()) return;
      if (!operation.waiters && !operation.settled) operation.controller.abort(signal.reason);
      reject(signal.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    operation.promise.then(value => {
      if (release()) resolve(value);
    }, error => {
      if (release()) reject(error);
    });
    if (signal?.aborted) onAbort();
  });
}

function hasAcquiredToken(result) {
  return !!(result?.accessToken || result?.apiKey || result?.token || result?.copilotToken);
}

// Credential commits may need an already-running result after the last HTTP
// waiter cancels optional post-grant enrichment. This observation never invokes
// a refresh function or starts I/O, including on a cache miss.
export async function getAcquiredRefreshResult(provider, oldToken, proxyOptions = null) {
  const key = JSON.stringify([provider, oldToken, getRefreshProxyKey(proxyOptions)]);
  const entry = refreshDedupCache.get(key);
  if (!entry) return null;
  try {
    const result = entry.promise ? await entry.promise : entry.expiresAt > Date.now() ? entry.result : null;
    return hasAcquiredToken(result) ? result : null;
  } catch {
    return null;
  }
}

export async function dedupRefresh(provider, oldToken, fn, log, proxyOptions = null, signal = null) {
  signal?.throwIfAborted();
  if (!oldToken) return waitForRefresh(createRefreshOperation(fn), signal);
  const key = JSON.stringify([provider, oldToken, getRefreshProxyKey(proxyOptions)]);
  const hit = refreshDedupCache.get(key);
  if (hit) {
    if (hit.promise) {
      if (!hit.controller.signal.aborted) {
        log?.info?.("TOKEN_REFRESH", `Reusing in-flight refresh for ${provider}`);
        return waitForRefresh(hit, signal);
      }
      // Cancellation cannot undo a provider-side rotation. Let the aborted
      // transport settle before reusing its old token; keep any acquired result.
      let acquired;
      try { acquired = await waitForRefresh(hit, signal); }
      catch { signal?.throwIfAborted(); }
      signal?.throwIfAborted();
      if (hasAcquiredToken(acquired)) return acquired;
      if (refreshDedupCache.get(key) === hit) refreshDedupCache.delete(key);
      return dedupRefresh(provider, oldToken, fn, log, proxyOptions, signal);
    }
    if (hit.expiresAt > Date.now()) {
      log?.info?.("TOKEN_REFRESH", `Reusing recent refresh result for ${provider}`);
      return hit.result;
    }
    refreshDedupCache.delete(key);
  }

  evictOldestIfNeeded();

  const operation = createRefreshOperation(fn);
  refreshDedupCache.set(key, operation);
  operation.promise.then(result => {
    if (refreshDedupCache.get(key) !== operation) return;
    if (operation.controller.signal.aborted && !hasAcquiredToken(result)) refreshDedupCache.delete(key);
    else refreshDedupCache.set(key, { result, expiresAt: Date.now() + REFRESH_RESULT_TTL_MS });
  }, () => {
    if (refreshDedupCache.get(key) === operation) refreshDedupCache.delete(key);
  });
  return waitForRefresh(operation, signal);
}
