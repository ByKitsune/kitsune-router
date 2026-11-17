import { beforeEach, describe, expect, it, vi } from "vitest";
import { consume, rateLimitKey, resetRateLimiter, RATE_LIMIT_RPM, RATE_LIMIT_BURST } from "../../src/lib/rateLimit/v1Limiter.js";

beforeEach(() => resetRateLimiter());

describe("inference limiter identity and active-window ownership", () => {
  it("isolates equal-length credentials that collide under the old short hash", () => {
    const first = rateLimitKey("caller-Aa");
    const second = rateLimitKey("caller-B@");
    expect(first).not.toBe(second);
    const start = 100_000;
    for (let i = 0; i < RATE_LIMIT_BURST; i++) consume(first, start);
    expect(consume(first, start).allowed).toBe(false);
    expect(consume(second, start).allowed).toBe(true);
  });

  it("does not restore an exhausted budget when other caller identities fill the table", () => {
    const start = 200_000;
    const key = rateLimitKey("active-caller");
    for (let i = 0; i < RATE_LIMIT_RPM; i++) {
      consume(key, start + Math.floor(i / Math.max(1, Math.floor(RATE_LIMIT_BURST / 2))) * 1000);
    }
    expect(consume(key, start + 20_000).allowed).toBe(false);
    for (let i = 0; i < 5000; i++) consume(rateLimitKey(`distinct-${i}`), start + 20_000);
    expect(consume(key, start + 20_000).allowed).toBe(false);
    expect(consume(key, start + 60_001).allowed).toBe(true);
  });

  it("bounds new callers with a shared overflow window and recovers after expiry", () => {
    const start = 300_000;
    for (let i = 0; i < 5000; i++) consume(rateLimitKey(`flood-${i}`), start);
    expect(consume(rateLimitKey("new-during-flood"), start).allowed).toBe(false);
    expect(consume(rateLimitKey("new-after-expiry"), start + 60_001).allowed).toBe(true);
  });

  it.each(["0.5", "9007199254740992"])("does not turn invalid limit %s into a zero or unsafe budget", async value => {
    vi.resetModules();
    vi.stubEnv("V1_RATE_LIMIT_RPM", value);
    vi.stubEnv("V1_RATE_LIMIT_BURST", value);
    try {
      const limiter = await import("../../src/lib/rateLimit/v1Limiter.js");
      expect(limiter.RATE_LIMIT_RPM).toBe(600);
      expect(limiter.RATE_LIMIT_BURST).toBe(120);
      expect(limiter.consume(limiter.rateLimitKey("valid-new-caller")).allowed).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
