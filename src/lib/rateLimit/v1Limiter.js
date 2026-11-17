// Inbound rate limiting for the client-facing /v1 surface.
//
// Why this exists: `apiKeys` had no quota column at all (`schema.js`: id, key,
// name, machineId, isActive, createdAt) and `validateApiKey()` returned a plain
// boolean. The only limits in the codebase were the dashboard login limiter and
// the *upstream* account cooldowns in accountFallback.js — neither bounds what a
// CLIENT consumes. One leaked key could therefore drain every paid provider
// quota, and there was no `x-ratelimit-*` header for a well-behaved client to
// respect (Griphub, by comparison, sends limit/remaining/reset).
//
// Design decisions:
//  - Keyed by API key, not by IP: many legitimate clients sit behind one NAT,
//    and one abusive client can rotate IPs. `getClientIp()` is still used as a
//    secondary bucket so an UNKNOWN/invalid key cannot become an unmetered
//    path.
//  - Fixed window, not sliding: the goal is to stop runaway consumption, and a
//    fixed window is O(1) with no timers.
//  - In-memory and per-process, like loginLimiter.js. A restart resets the
//    counters; this is a guard rail, not billing. Counters are bounded so the
//    limiter itself cannot become the leak.
//  - Limits are env-tunable with a deliberately GENEROUS default, because the
//    first job is to not break real traffic (ByKitsune protects its own users
//    at 60 RPM/user, 120 RPM/key, concurrency 100).
import { createHash } from "node:crypto";
import { CACHE_LIMITS } from "open-sse/utils/boundedCache.js";
import { buildErrorBody } from "open-sse/utils/error.js";

const DEFAULT_RPM = 600;         // requests per minute per API key
const DEFAULT_BURST = 120;       // max requests in any 1s slice (burst guard)
const WINDOW_MS = 60_000;

// Bound the counter table: one entry per key that made a request this window.
const MAX_TRACKED_KEYS = Math.max(CACHE_LIMITS.providerMutexes, 2000);

function readPositiveInt(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export const RATE_LIMIT_RPM = readPositiveInt(process.env.V1_RATE_LIMIT_RPM, DEFAULT_RPM);
export const RATE_LIMIT_BURST = readPositiveInt(process.env.V1_RATE_LIMIT_BURST, DEFAULT_BURST);

// bucket key → { windowStart, count, secondStart, secondCount }
const buckets = new Map();
let overflow = null;
let nextSweepAt = 0;

function pruneExpired(now) {
  if (now < nextSweepAt) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key);
  }
  nextSweepAt = now + 1000;
}

function bucketFor(key, now) {
  let b = buckets.get(key);
  if (!b) {
    pruneExpired(now);
    if (overflow && now - overflow.windowStart >= WINDOW_MS) overflow = null;
    // Never erase an active caller's budget to admit a new identity. Excess
    // identities share one window until it expires, even if a slot opens.
    if (!overflow && buckets.size < MAX_TRACKED_KEYS) {
      b = { windowStart: now, count: 0, secondStart: now, secondCount: 0 };
      buckets.set(key, b);
    } else {
      b = overflow ??= { windowStart: now, count: 0, secondStart: now, secondCount: 0 };
    }
  }
  // Roll the fixed 60s window.
  if (now - b.windowStart >= WINDOW_MS) {
    b.windowStart = now;
    b.count = 0;
  }
  // Roll the 1s slice used by the burst guard.
  if (now - b.secondStart >= 1000) {
    b.secondStart = now;
    b.secondCount = 0;
  }
  return b;
}

/**
 * Stable, non-reversible identity for a caller.
 *
 * The raw API key must never be used as a Map key: it would sit in the heap for
 * the process lifetime (visible in a heap dump) and it is a credential. A short
 * hash keeps the bucket stable without retaining the secret.
 * @param {string} apiKey
 * @returns {string}
 */
export function rateLimitKey(apiKey) {
  if (typeof apiKey !== "string" || !apiKey) return "anon";
  // A 32-bit rolling hash allowed equal-length credentials to share budgets.
  return `k${createHash("sha256").update(apiKey).digest("hex")}:${apiKey.length}`;
}

/**
 * Consume one request for a caller.
 * @param {string} key - Result of rateLimitKey(), or an IP-derived bucket
 * @returns {{ allowed: boolean, limit: number, remaining: number, resetSeconds: number, retryAfterSeconds: number }}
 */
export function consume(key, now = Date.now()) {
  const b = bucketFor(key, now);

  const windowRemaining = Math.max(0, RATE_LIMIT_RPM - b.count);
  const secondRemaining = Math.max(0, RATE_LIMIT_BURST - b.secondCount);
  const resetSeconds = Math.max(1, Math.ceil((b.windowStart + WINDOW_MS - now) / 1000));

  if (windowRemaining <= 0) {
    return {
      allowed: false,
      limit: RATE_LIMIT_RPM,
      remaining: 0,
      resetSeconds,
      retryAfterSeconds: resetSeconds,
    };
  }
  if (secondRemaining <= 0) {
    // Burst guard: refuse until the current 1s slice rolls over.
    return {
      allowed: false,
      limit: RATE_LIMIT_RPM,
      remaining: windowRemaining,
      resetSeconds,
      retryAfterSeconds: Math.max(1, Math.ceil((b.secondStart + 1000 - now) / 1000)),
    };
  }

  b.count += 1;
  b.secondCount += 1;
  return {
    allowed: true,
    limit: RATE_LIMIT_RPM,
    remaining: Math.max(0, RATE_LIMIT_RPM - b.count),
    resetSeconds,
    retryAfterSeconds: 0,
  };
}

/** Standard advisory headers so a client can pace itself. */
export function rateLimitHeaders(result) {
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(result.resetSeconds),
  };
}

/**
 * 429 response carrying the standard headers.
 *
 * Security: the message is neutral and never names a provider, account or key
 * (see clientErrors.js) — a rate-limit response must not double as a
 * reconnaissance oracle.
 */
export function rateLimitedResponse(result, corsHeaders = {}) {
  const body = buildErrorBody(429, "Rate limit exceeded. Please retry later.");
  return new Response(
    JSON.stringify(body),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "x-request-id": body.error.request_id,
        ...corsHeaders,
        ...rateLimitHeaders(result),
        "Retry-After": String(result.retryAfterSeconds || result.resetSeconds),
      },
    },
  );
}

// Test seam: reset all counters.
export function resetRateLimiter() {
  buckets.clear();
  overflow = null;
  nextSweepAt = 0;
}
