// In-memory progressive lockout for dashboard login. Resets on process restart.
import { hasTrustedPeerHeaders } from "./trustedPeer.js";

const MAX_FAILS_BEFORE_LOCK = 5;
const LOCK_STEPS_MS = [30_000, 120_000, 600_000, 1_800_000]; // 30s, 2m, 10m, 30m
const FAIL_WINDOW_MS = 60 * 60 * 1000; // 1h since last fail → auto reset
const MAX_TRACKED_IPS = 4096;
const SWEEP_INTERVAL_MS = 60_000;

const attempts = new Map(); // ip → { fails, lockUntil, lockLevel, lastFailAt }
let overflow = null;
let nextSweepAt = 0;

function now() { return Date.now(); }

function isExpired(entry, timestamp) {
  return timestamp - entry.lastFailAt > FAIL_WINDOW_MS && timestamp >= entry.lockUntil;
}

function pruneExpired(timestamp) {
  if (timestamp < nextSweepAt) return;
  for (const [ip, entry] of attempts) {
    if (isExpired(entry, timestamp)) attempts.delete(ip);
  }
  nextSweepAt = timestamp + SWEEP_INTERVAL_MS;
}

function getEntry(ip) {
  const timestamp = now();
  // A sweep also reclaims IPs that never return, without allocating a timer or
  // scanning the full map on each unauthenticated request.
  pruneExpired(timestamp);
  const e = attempts.get(ip);
  if (e) {
    if (!isExpired(e, timestamp)) return e;
    attempts.delete(ip);
  }
  if (overflow && isExpired(overflow, timestamp)) overflow = null;
  return overflow;
}

export function checkLock(ip) {
  const e = getEntry(ip);
  if (!e || !e.lockUntil) return { locked: false };
  const remaining = e.lockUntil - now();
  if (remaining <= 0) return { locked: false };
  return { locked: true, retryAfter: Math.ceil(remaining / 1000) };
}

export function recordFail(ip) {
  const e = getEntry(ip) || { fails: 0, lockUntil: 0, lockLevel: 0, lastFailAt: 0 };
  e.fails += 1;
  e.lastFailAt = now();
  if (e.fails >= MAX_FAILS_BEFORE_LOCK) {
    const step = LOCK_STEPS_MS[Math.min(e.lockLevel, LOCK_STEPS_MS.length - 1)];
    e.lockUntil = now() + step;
    e.lockLevel += 1;
    e.fails = 0;
  }
  if (attempts.has(ip) || (!overflow && attempts.size < MAX_TRACKED_IPS)) {
    attempts.set(ip, e);
  } else {
    // Never evict an active client lockout to admit a rotating IP. During a
    // high-cardinality flood, new clients share one bounded fail-closed bucket.
    // Keep that bucket until expiry even if a tracked client frees a slot.
    overflow = e;
  }
  return { remainingBeforeLock: Math.max(0, MAX_FAILS_BEFORE_LOCK - e.fails) };
}

export function recordSuccess(ip) {
  attempts.delete(ip);
  // An untracked client's success must not unlock other overflow clients.
}

export function getClientIp(request) {
  // Trusted only when custom-server.js proves it stamped the header from the TCP socket;
  // otherwise a client could rotate the value to escape its own lockout bucket.
  if (hasTrustedPeerHeaders(request)) {
    const realIp = request.headers.get("x-kitsune-router-real-ip");
    if (realIp) return realIp;
  }
  // Behind a trusted reverse proxy that overwrites XFF with the real client IP.
  if (process.env.TRUST_PROXY === "true") {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
  }
  // Direct exposure without custom-server: single bucket so spoofed XFF
  // rotation cannot escape the limiter.
  return "unknown";
}
