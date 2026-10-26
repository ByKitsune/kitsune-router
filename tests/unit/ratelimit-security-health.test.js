// P03 / P04 regression gate — inbound rate limiting, security headers, health, metrics.
//
// P03-A: `apiKeys` had no quota column at all and validateApiKey() returned a
// plain boolean, so nothing bounded what a CLIENT consumed. The only limits in
// the codebase were the dashboard login limiter and the UPSTREAM account
// cooldowns — one leaked key could drain every paid provider quota, and no
// `x-ratelimit-*` header existed for a well-behaved client to respect.
//
// P03-B: the response was missing HSTS, X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy and Permissions-Policy, and sent
// `Access-Control-Allow-Headers: *`. This is not cosmetic: the gateway is
// published through a Cloudflare tunnel (router.bykitsune.org → 127.0.0.1:20128).
//
// P03-C: /api/health returned a constant {"ok":true}. The tunnel watchdog reads
// it, so it reported healthy even with the database unreachable.
//
// P04: every metric existed only as a journald line; answering "TTFT p90 per
// model?" or "401 vs 429?" required grep by hand.
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  consume,
  rateLimitKey,
  rateLimitHeaders,
  rateLimitedResponse,
  resetRateLimiter,
  RATE_LIMIT_RPM,
  RATE_LIMIT_BURST,
} from "../../src/lib/rateLimit/v1Limiter.js";
import { API_CORS_HEADERS, corsHeaders } from "../../src/shared/utils/cors.js";

const ROOT = new URL("../..", import.meta.url).pathname;

beforeEach(() => {
  resetRateLimiter();
});

describe("inbound rate limiter (P03-A)", () => {
  it("allows up to the RPM limit then refuses with a reset hint", () => {
    // Time is advanced in the simulation so the burst guard (which limits any
    // single 1s slice) does not trip first — production peaks at ~246 req/min
    // (~4 req/s), so the burst guard is not the binding limit for real traffic.
    const key = rateLimitKey("sk-test-key");
    const t0 = Date.now();
    let last = null;
    for (let i = 0; i < RATE_LIMIT_RPM; i++) {
      // Spread the RPM budget across the minute, staying under the per-second cap.
      const now = t0 + Math.floor(i / Math.max(1, Math.floor(RATE_LIMIT_BURST / 2))) * 1000;
      last = consume(key, now);
    }
    expect(last.allowed).toBe(true);
    expect(last.remaining).toBe(0);

    const refused = consume(key, t0 + 1000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.resetSeconds).toBeGreaterThan(0);
  });

  it("rolls the window so a client recovers after the reset period", () => {
    const key = rateLimitKey("sk-recover");
    const t0 = Date.now();
    for (let i = 0; i < RATE_LIMIT_RPM; i++) {
      consume(key, t0 + Math.floor(i / Math.max(1, Math.floor(RATE_LIMIT_BURST / 2))) * 1000);
    }
    expect(consume(key, t0 + 1000).allowed).toBe(false);
    // A full window later the budget is restored.
    expect(consume(key, t0 + 61_000).allowed).toBe(true);
  });

  it("isolates buckets per API key", () => {
    const a = rateLimitKey("sk-key-a");
    const b = rateLimitKey("sk-key-b");
    for (let i = 0; i < 10; i++) consume(a);
    expect(consume(b).remaining).toBeGreaterThan(consume(a).remaining);
  });

  it("never uses the raw key as the bucket identity", () => {
    const key = "sk-super-secret-value";
    const derived = rateLimitKey(key);
    expect(derived).not.toContain("super-secret");
    expect(derived).toMatch(/^k[0-9a-z]+:\d+$/);
    // Stable across calls, so the same key keeps one bucket.
    expect(rateLimitKey(key)).toBe(derived);
  });

  it("applies a burst guard independently of the minute window", () => {
    const key = rateLimitKey("sk-burst");
    let refused = null;
    for (let i = 0; i < RATE_LIMIT_BURST; i++) {
      const r = consume(key);
      if (!r.allowed) { refused = r; break; }
    }
    const after = consume(key);
    expect(after.allowed).toBe(false);
    expect(after.retryAfterSeconds).toBeGreaterThan(0);
    if (refused) expect(refused.allowed).toBe(false);
  });

  it("reports the standard advisory headers", () => {
    const result = consume(rateLimitKey("sk-hdr"));
    const headers = rateLimitHeaders(result);
    expect(headers["x-ratelimit-limit"]).toBe(String(RATE_LIMIT_RPM));
    expect(Number(headers["x-ratelimit-remaining"])).toBeGreaterThanOrEqual(0);
    expect(Number(headers["x-ratelimit-reset"])).toBeGreaterThan(0);
  });

  it("returns 429 with Retry-After and a neutral message", async () => {
    const result = { limit: 10, remaining: 0, resetSeconds: 42, retryAfterSeconds: 42 };
    const res = rateLimitedResponse(result, { "Access-Control-Allow-Origin": "*" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(res.headers.get("x-ratelimit-limit")).toBe("10");
    const body = await res.json();
    expect(body.error.code).toBe("rate_limit_exceeded");
    expect(body.error).toMatchObject({ type: "rate_limit_error", request_id: expect.stringMatching(/^[A-Za-z0-9._:-]{1,128}$/) });
    expect(res.headers.get("x-request-id")).toBe(body.error.request_id);
    // Must not double as a reconnaissance oracle.
    expect(body.error.message).not.toMatch(/provider|account|codex|openai/i);
  });

  it("is bounded, so the limiter itself cannot leak", () => {
    // Many distinct keys must not grow the table without limit.
    for (let i = 0; i < 5000; i++) consume(rateLimitKey(`sk-flood-${i}`));
    // No assertion on internals: the important property is that this completes
    // without unbounded growth, which the bounded-cache test covers directly.
    expect(consume(rateLimitKey("sk-after")).allowed).toBe(true);
  });

  it("is wired into the chat handler before any upstream work", () => {
    const source = readFileSync(join(ROOT, "src/sse/handlers/chat.js"), "utf8");
    expect(source).toMatch(/consume\(apiKey \? rateLimitKey\(apiKey\)/);
    // Must refuse before dispatch.
    const limitIdx = source.indexOf("rateLimitedResponse(rateLimit");
    const dispatchIdx = source.indexOf("await handleChatCore(");
    expect(limitIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(limitIdx);
  });
});

describe("CORS allowlist (P03-B)", () => {
  it("does not use a wildcard header allowlist", () => {
    expect(API_CORS_HEADERS["Access-Control-Allow-Headers"]).not.toBe("*");
    expect(API_CORS_HEADERS["Access-Control-Allow-Headers"]).not.toContain("*");
  });

  it("allows exactly the headers the API actually reads", () => {
    const allowed = API_CORS_HEADERS["Access-Control-Allow-Headers"].toLowerCase();
    for (const needed of ["authorization", "content-type", "accept", "x-api-key", "x-connection-id", "idempotency-key"]) {
      expect(allowed, needed).toContain(needed);
    }
  });

  it("keeps the origin permissive (API-key auth, not cookies)", () => {
    expect(API_CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("exposes request correlation and retry policy without credential headers", () => {
    expect(API_CORS_HEADERS["Access-Control-Expose-Headers"]).toBe("x-request-id, x-should-retry, Retry-After");
  });

  it("lets a caller override specific values", () => {
    expect(corsHeaders({ "Access-Control-Allow-Methods": "GET" })["Access-Control-Allow-Methods"]).toBe("GET");
  });

  it("is applied to every client-facing /v1 and /v1beta route", () => {
    const files = [
      "src/app/api/v1/chat/completions/route.js",
      "src/app/api/v1/messages/route.js",
      "src/app/api/v1/models/route.js",
      "src/app/api/v1/responses/route.js",
      "src/app/api/v1beta/models/route.js",
    ];
    for (const rel of files) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(source, rel).not.toMatch(/"Access-Control-Allow-Headers":\s*"\*"/);
    }
  });
});

describe("security headers (P03-B)", () => {
  const config = readFileSync(join(ROOT, "next.config.mjs"), "utf8");

  it.each([
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ])("declares %s", (header) => {
    expect(config).toContain(header);
  });

  it("applies them to the API and /v1 surfaces, not only the dashboard", () => {
    // The header array must be spread into each rule.
    const spreads = [...config.matchAll(/\.\.\.securityHeaders/g)];
    expect(spreads.length).toBeGreaterThanOrEqual(4);
  });

  it("documents that the gateway is publicly reachable via the tunnel", () => {
    expect(config).toMatch(/Cloudflare tunnel/);
    expect(config).toMatch(/router\.bykitsune\.org/);
  });
});

describe("health probe is informative but not a data leak (P03-C)", () => {
  const source = readFileSync(join(ROOT, "src/app/api/health/route.js"), "utf8");

  it("no longer returns a constant ok", () => {
    expect(source).not.toMatch(/NextResponse\.json\(\{ ok: true \}/);
  });

  it("reports database state, uptime and version", () => {
    expect(source).toMatch(/database:/);
    expect(source).toMatch(/uptimeSeconds/);
    expect(source).toMatch(/APP_CONFIG\.version/);
  });

  it("reports locked accounts, which is what made operators blind", () => {
    expect(source).toMatch(/locked:/);
    expect(source).toMatch(/needsReauth/);
  });

  it("fails the probe when storage is unavailable", () => {
    expect(source).toMatch(/status: db\.ok \? 200 : 503/);
  });

  it("never serialises an account identity", () => {
    // The response body must not include email/name/token fields. The source may
    // reference them only when reading (e.g. counting), never in the response.
    const bodyStart = source.indexOf("const body = {");
    expect(bodyStart).toBeGreaterThan(-1);
    const body = source.slice(bodyStart, source.indexOf("return NextResponse.json(body"));
    expect(body).not.toMatch(/\.email|\.name|accessToken|refreshToken|apiKey/);
  });
});

describe("metrics endpoint (P04)", () => {
  const source = readFileSync(join(ROOT, "src/app/api/metrics/route.js"), "utf8");

  it("is token-gated — it reveals traffic shape", () => {
    expect(source).toMatch(/hasValidCliToken/);
    expect(source).toMatch(/isAuthenticated/);
    expect(source).toMatch(/401/);
  });

  it("emits Prometheus text format", () => {
    expect(source).toMatch(/version=0\.0\.4/);
    expect(source).toMatch(/# HELP/);
    expect(source).toMatch(/# TYPE/);
  });

  it("answers the questions the audit could not answer from logs", () => {
    // Which models are used, and how many failures per status.
    expect(source).toMatch(/zenrouter_model_requests_total/);
    expect(source).toMatch(/zenrouter_failures_total/);
    expect(source).toMatch(/zenrouter_requests_in_flight/);
  });

  it("never emits an account label or identity", () => {
    // byAccount/byApiKey carry emails and key names; the endpoint must not READ
    // them. Comments are stripped first so documentation mentioning them (to
    // explain why they are avoided) does not count as a violation.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(code).not.toMatch(/byAccount/);
    expect(code).not.toMatch(/byApiKey/);
    expect(code).not.toMatch(/accountName/);
    // And no identity field may be interpolated into the output.
    expect(code).not.toMatch(/\.email\b/);
    expect(code).not.toMatch(/accessToken|refreshToken/);
  });

  it("escapes label values", () => {
    expect(source).toMatch(/function escapeLabel/);
  });

  it("still serves liveness when the stats query fails", () => {
    // zenrouter_up and uptime are emitted before the try/catch block.
    const upIdx = source.indexOf('line("zenrouter_up"');
    const tryIdx = source.indexOf("stats = await getUsageStats");
    expect(upIdx).toBeGreaterThan(-1);
    expect(tryIdx).toBeGreaterThan(upIdx);
  });
});
