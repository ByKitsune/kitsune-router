// P10-E / P10-F / P10-G regression gate.
//
// P10-E — unbounded Maps. Four process-local Maps had no eviction at all
// (grep for `.delete(`/`.clear(` returned nothing). Keys rotate over the process
// lifetime — OAuth access tokens are refreshed periodically, connections are
// removed — so every rotation left an entry nothing would ever read again.
// Individually small, but a process that stays up for weeks accumulates them.
//
// P10-F — capability handling skipped on the passthrough path.
// `prefetchRemoteImages()` ran only when `!passthrough`, so a native passthrough
// request carrying an HTTP image URL was forwarded to a target that cannot fetch
// URLs, and the upstream answered with a confusing 400.
//
// P10-G — dead code that misleads maintainers. Four exported functions had zero
// callers; `parseRetryAfter` was a third copy of logic that already exists twice.
// A future maintainer could modify `applyErrorState` believing it was the live
// account-health path, when the real one is
// src/sse/services/auth.js `markAccountUnavailable`.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setBounded, sweepExpired, CACHE_LIMITS } from "../../open-sse/utils/boundedCache.js";

const ROOT = new URL("../..", import.meta.url).pathname;

describe("bounded cache helper (P10-E)", () => {
  it("never grows past the cap", () => {
    const map = new Map();
    for (let i = 0; i < 50; i++) setBounded(map, `k${i}`, i, 10);
    expect(map.size).toBe(10);
  });

  it("keeps the most recent entries", () => {
    const map = new Map();
    for (let i = 0; i < 20; i++) setBounded(map, `k${i}`, i, 5);
    expect([...map.keys()]).toEqual(["k15", "k16", "k17", "k18", "k19"]);
  });

  it("re-inserting an existing key refreshes its position", () => {
    const map = new Map();
    setBounded(map, "a", 1, 3);
    setBounded(map, "b", 2, 3);
    setBounded(map, "a", 11, 3);
    setBounded(map, "c", 3, 3);
    setBounded(map, "d", 4, 3);
    expect(map.has("a")).toBe(true);
    expect(map.get("a")).toBe(11);
    expect(map.has("b")).toBe(false);
  });

  it("ignores a null/undefined key", () => {
    const map = new Map();
    setBounded(map, null, 1, 5);
    setBounded(map, undefined, 2, 5);
    expect(map.size).toBe(0);
  });

  it("sweeps entries whose expiry has passed", () => {
    const map = new Map([["old", { expiresAt: Date.now() - 1000 }], ["fresh", { expiresAt: Date.now() + 60000 }]]);
    sweepExpired(map, (v) => v.expiresAt);
    expect(map.has("old")).toBe(false);
    expect(map.has("fresh")).toBe(true);
  });

  it("keeps entries that carry no expiry", () => {
    const map = new Map([["noexp", { promise: 1 }]]);
    sweepExpired(map, (v) => v.expiresAt ?? null);
    expect(map.has("noexp")).toBe(true);
  });

  it("defines a cap for every cache it documents", () => {
    for (const [name, cap] of Object.entries(CACHE_LIMITS)) {
      expect(Number.isFinite(cap), name).toBe(true);
      expect(cap, name).toBeGreaterThan(0);
    }
  });
});

describe("the previously unbounded caches are now bounded (P10-E)", () => {
  const CASES = [
    ["open-sse/executors/default.js", "rejectedBetaByConnection", "CACHE_LIMITS.rejectedBeta"],
    ["open-sse/services/usage/claude.js", "usageCache", "CACHE_LIMITS.usageCache"],
    ["open-sse/services/usage/claude.js", "oauthCooldown", "CACHE_LIMITS.oauthCooldown"],
    ["src/sse/services/auth.js", "providerMutexes", "CACHE_LIMITS.providerMutexes"],
  ];

  it.each(CASES)("%s writes %s through setBounded", (rel, mapName, limit) => {
    const source = readFileSync(join(ROOT, rel), "utf8");
    // Every write to the map must go through the bounded helper.
    const rawWrites = [...source.matchAll(new RegExp(`${mapName}\\.set\\(`, "g"))];
    expect(rawWrites, `${mapName} still uses a raw .set()`).toHaveLength(0);
    expect(source).toContain(limit);
    expect(source).toMatch(/setBounded\(/);
  });
});

describe("remote images are prefetched on the passthrough path too (P10-F)", () => {
  it("calls prefetchRemoteImages outside the !passthrough branch", () => {
    const source = readFileSync(join(ROOT, "open-sse/handlers/chatCore.js"), "utf8");
    const callIdx = source.indexOf("await prefetchRemoteImages(");
    expect(callIdx).toBeGreaterThan(-1);

    // The call must not be inside the `if (!passthrough) {` block: find that
    // block's start and the matching close, then check the call sits after it.
    const guardIdx = source.indexOf("if (!passthrough) {");
    expect(guardIdx).toBeGreaterThan(-1);
    let depth = 0;
    let end = -1;
    for (let i = guardIdx; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    expect(end).toBeGreaterThan(-1);
    expect(callIdx, "prefetchRemoteImages is still inside the !passthrough guard").toBeGreaterThan(end);
  });

  it("documents why stripUnsupportedModalities stays translation-only", () => {
    const source = readFileSync(join(ROOT, "open-sse/handlers/chatCore.js"), "utf8");
    expect(source).toMatch(/stripUnsupportedModalities stays translation-only/);
  });
});

describe("misleading dead code is gone (P10-G)", () => {
  const DEAD = ["applyErrorState", "resetAccountState", "getEarliestRateLimitedUntil", "parseRetryAfter"];

  it.each(DEAD)("%s has no definition left in accountFallback.js", (fn) => {
    const source = readFileSync(join(ROOT, "open-sse/services/accountFallback.js"), "utf8");
    expect(source).not.toMatch(new RegExp(`export function ${fn}\\b`));
  });

  it("keeps the live account-health helpers that ARE used", () => {
    const source = readFileSync(join(ROOT, "open-sse/services/accountFallback.js"), "utf8");
    // These have real callers and must survive the cleanup.
    for (const fn of ["checkFallbackError", "buildModelLockUpdate", "isModelLockActive", "extractResetsAtMs", "getEarliestModelLockUntil"]) {
      expect(source, fn).toMatch(new RegExp(`export function ${fn}\\b`));
    }
  });
});
