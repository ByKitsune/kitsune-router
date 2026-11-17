import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MAX_TRACKED_IPS = 4096;
const HOUR_MS = 60 * 60 * 1000;
let limiter;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
  vi.resetModules();
  limiter = await import("@/lib/auth/loginLimiter.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

function fillDistinctClients(count = MAX_TRACKED_IPS) {
  for (let index = 0; index < count; index++) limiter.recordFail(`tracked-${index}`);
}

describe("bounded dashboard login failures", () => {
  it("shares a bounded overflow lockout instead of allocating a bucket for every new IP", () => {
    fillDistinctClients();
    for (let index = 0; index < 5; index++) limiter.recordFail(`overflow-${index}`);
    expect(limiter.checkLock("another-new-client")).toEqual({ locked: true, retryAfter: 30 });
    // The normal buckets retain their own counters instead of inheriting the overflow lock.
    expect(limiter.checkLock("tracked-0")).toEqual({ locked: false });
    for (let index = 0; index < 4; index++) limiter.recordFail("tracked-0");
    expect(limiter.checkLock("tracked-0")).toEqual({ locked: true, retryAfter: 30 });
  });

  it("retains an existing lockout during a flood and does not unlock overflow clients on another client's success", () => {
    for (let index = 0; index < 5; index++) limiter.recordFail("locked-client");
    fillDistinctClients(MAX_TRACKED_IPS - 1);
    for (let index = 0; index < 5; index++) limiter.recordFail(`overflow-${index}`);
    limiter.recordSuccess("untracked-successful-client");
    expect(limiter.checkLock("locked-client")).toEqual({ locked: true, retryAfter: 30 });
    expect(limiter.checkLock("another-new-client")).toEqual({ locked: true, retryAfter: 30 });
    limiter.recordSuccess("locked-client");
    expect(limiter.checkLock("tracked-0")).toEqual({ locked: false });
    expect(limiter.checkLock("another-new-client")).toEqual({ locked: true, retryAfter: 30 });
  });

  it("reclaims expired untouched IPs before forcing new clients into the overflow bucket", () => {
    fillDistinctClients();
    vi.setSystemTime(Date.now() + HOUR_MS + 1);
    for (let index = 0; index < 4; index++) limiter.recordFail("new-client");
    limiter.recordFail("separate-new-client");
    expect(limiter.checkLock("new-client")).toEqual({ locked: false });
    expect(limiter.checkLock("separate-new-client")).toEqual({ locked: false });
    limiter.recordFail("new-client");
    expect(limiter.checkLock("new-client")).toEqual({ locked: true, retryAfter: 30 });
    expect(limiter.checkLock("separate-new-client")).toEqual({ locked: false });
  });

  it("expires overflow state and preserves progressive lock durations for tracked clients", () => {
    fillDistinctClients();
    for (let index = 0; index < 5; index++) limiter.recordFail(`overflow-${index}`);
    vi.setSystemTime(Date.now() + HOUR_MS + 1);
    expect(limiter.checkLock("new-client")).toEqual({ locked: false });
    for (let index = 0; index < 5; index++) limiter.recordFail("new-client");
    expect(limiter.checkLock("new-client")).toEqual({ locked: true, retryAfter: 30 });
    vi.setSystemTime(Date.now() + 30_000);
    expect(limiter.checkLock("new-client")).toEqual({ locked: false });
    for (let index = 0; index < 5; index++) limiter.recordFail("new-client");
    expect(limiter.checkLock("new-client")).toEqual({ locked: true, retryAfter: 120 });
    expect(limiter.checkLock("another-new-client")).toEqual({ locked: false });
  });
});
