// Bounded Map helper for process-local caches.
//
// Several caches in this codebase are keyed by something that CHANGES over the
// process lifetime: a rotated OAuth access token, a connection id, a provider
// id. Entries for the old key are never read again, so without a bound the Map
// grows for as long as the process lives — a slow leak that only shows up as
// steadily rising RSS after days of uptime.
//
// `thoughtSignature.js` already solved this with a simple size cap plus FIFO
// eviction. This module exposes that same policy so the remaining caches do not
// each invent their own.
//
// FIFO (not true LRU) is deliberate: the access pattern here is "write once,
// read a few times soon after", so recency tracking would add bookkeeping
// without improving the hit rate. The cap is a safety valve, not a tuning knob.

/**
 * Store a value, evicting the oldest entries once the cap is exceeded.
 * @param {Map} map
 * @param {*} key
 * @param {*} value
 * @param {number} maxEntries
 */
export function setBounded(map, key, value, maxEntries) {
  if (key == null) return;
  if (map.has(key)) map.delete(key); // re-insert so the newest write is last
  map.set(key, value);
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/**
 * Drop entries whose recorded expiry has passed.
 * Used by caches that store `{ expiresAt }`-shaped values and want time-based
 * cleanup in addition to the size cap.
 * @param {Map} map
 * @param {(value: *) => number|null} expiryOf - epoch ms, or null when the entry has no expiry
 * @param {number} [now]
 */
export function sweepExpired(map, expiryOf, now = Date.now()) {
  for (const [key, value] of map) {
    const expiry = expiryOf(value);
    if (Number.isFinite(expiry) && expiry <= now) map.delete(key);
  }
}

// Default caps. Chosen to be far above any realistic working set on a single
// gateway (a few dozen accounts / providers) while still bounding memory.
export const CACHE_LIMITS = {
  // One entry per connection (or token) whose beta flags were rejected.
  rejectedBeta: 500,
  // One entry per OAuth access token currently in rotation.
  usageCache: 500,
  // One entry per access token in a 429 cooldown.
  oauthCooldown: 500,
  // One entry per provider id.
  providerMutexes: 200,
};
