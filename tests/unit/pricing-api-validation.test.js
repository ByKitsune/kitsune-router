import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const fixtureGlobals = [
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
];
let sandbox;
let previousListeners;
let previousGlobals;
let pricingRoute;
let adapter;
let proxy;
let authToken;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "kitsunerouter-pricing-api-"));
  previousListeners = new Map(shutdownEvents.map((event) => [event, process.rawListeners(event)]));
  previousGlobals = new Map(fixtureGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
  vi.stubEnv("DATA_DIR", join(sandbox, "data"));
  vi.stubEnv("TMPDIR", sandbox);
  vi.stubEnv("JWT_SECRET", "synthetic-pricing-api-test-secret-32-characters");
  vi.resetModules();
  for (const key of fixtureGlobals) delete global[key];
  pricingRoute = await import("@/app/api/pricing/route.js");
  ({ proxy } = await import("@/dashboardGuard.js"));
  const { createDashboardAuthToken } = await import("@/lib/auth/dashboardSession.js");
  const { updateSettings } = await import("@/lib/db/repos/settingsRepo.js");
  const { getAdapter } = await import("@/lib/db/driver.js");
  await updateSettings({ requireLogin: true });
  adapter = await getAdapter();
  authToken = await createDashboardAuthToken();
});

afterEach(async () => {
  try {
    for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
    global._statsEmitter?.removeAllListeners();
    await global._dbAdapter?.instance?.close();
  } finally {
    for (const event of shutdownEvents) {
      const existing = [...previousListeners.get(event)];
      for (const listener of process.rawListeners(event)) {
        const index = existing.indexOf(listener);
        if (index === -1) process.removeListener(event, listener);
        else existing.splice(index, 1);
      }
    }
    for (const key of fixtureGlobals) {
      const descriptor = previousGlobals.get(key);
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
    vi.resetModules();
    vi.unstubAllEnvs();
    await rm(sandbox, { recursive: true, force: true });
  }
});

function request(body, authenticated = true) {
  return new NextRequest("http://localhost:20128/api/pricing", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:20128",
      ...(authenticated ? { cookie: `auth_token=${authToken}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function patch(body, authenticated = true) {
  const req = request(body, authenticated);
  const guard = await proxy(req);
  return guard.headers.get("x-middleware-next") === "1" ? pricingRoute.PATCH(req) : guard;
}

function savedPricing(provider) {
  const row = adapter.get("SELECT value FROM kv WHERE scope = 'pricing' AND key = ?", [provider]);
  return row ? JSON.parse(row.value) : undefined;
}

describe("pricing API rate and tier validation", () => {
  it("retains dashboard authentication before saving hourly tariffs", async () => {
    const response = await patch({ "pricing-api-fixture": { hourly: { cache_creation_1h: 8 } } }, false);
    expect(response.status).toBe(401);
    expect(savedPricing("pricing-api-fixture")).toBeUndefined();
  });

  it("round-trips one-hour cache-write tariffs separately from the default TTL", async () => {
    const quote = { input: 2, output: 6, cached: 0, reasoning: 6, cache_creation: 2.5, cache_creation_1h: 4 };
    const response = await patch({ "pricing-api-fixture": { hourly: quote } });
    expect(response.status).toBe(200);
    expect((await response.json())["pricing-api-fixture"].hourly).toEqual(quote);
    expect(savedPricing("pricing-api-fixture").hourly).toEqual(quote);
    expect((await (await pricingRoute.GET()).json())["pricing-api-fixture"].hourly).toEqual(quote);
    const freeHourlyQuote = { ...quote, cache_creation_1h: 0 };
    const freeHourlyResponse = await patch({ "pricing-api-fixture": { hourly: freeHourlyQuote } });
    expect(freeHourlyResponse.status).toBe(200);
    expect(savedPricing("pricing-api-fixture").hourly).toEqual(freeHourlyQuote);
    expect((await (await pricingRoute.GET()).json())["pricing-api-fixture"].hourly).toEqual(freeHourlyQuote);
  });

  it("round-trips an inclusive tier without dropping zero tariffs or hourly writes", async () => {
    const quote = {
      input: 2, output: 6, cached: 0.5,
      tier: { threshold: 200000, inclusive: true, input: 0, output: 12, cached: 0, reasoning: 12, cache_creation: 5, cache_creation_1h: 8 },
    };
    const response = await patch({ "pricing-api-fixture": { tiered: quote } });
    expect(response.status).toBe(200);
    expect(savedPricing("pricing-api-fixture").tiered).toEqual(quote);
    expect((await (await pricingRoute.GET()).json())["pricing-api-fixture"].tiered).toEqual(quote);
  });

  it("keeps a partial saved tier so static threshold and missing rates can still inherit", async () => {
    const response = await patch({ openai: { "gpt-6.1-sol": { tier: { output: 0, inclusive: false } } } });
    expect(response.status).toBe(200);
    expect(savedPricing("openai")["gpt-6.1-sol"]).toEqual({ tier: { output: 0, inclusive: false } });
    const quote = (await (await pricingRoute.GET()).json()).openai["gpt-6.1-sol"];
    expect(quote.tier).toMatchObject({ threshold: 272000, output: 0, inclusive: false });
  });

  it("returns only saved overrides so editing a TTL rate cannot materialize inherited reasoning prices", async () => {
    const model = "claude-haiku-5-5";
    const quote = { cached: null, tier: { threshold: 100000, inclusive: false, input: 0.5, output: 2.5 } };
    expect((await patch({ anthropic: { [model]: quote } })).status).toBe(200);
    const url = "http://localhost:20128/api/pricing?view=overrides";
    expect((await proxy(new NextRequest(url))).status).toBe(401);
    const req = new NextRequest(url, { headers: { cookie: `auth_token=${authToken}` } });
    const overrides = await (await pricingRoute.GET(req)).json();
    expect(overrides.anthropic[model]).toEqual(quote);
    expect(overrides.anthropic[model]).not.toHaveProperty("reasoning");
    const response = await patch({ anthropic: { [model]: { ...overrides.anthropic[model], cache_creation_1h: 1.25 } } });
    expect(response.status).toBe(200);
    expect(savedPricing("anthropic")[model].tier).toEqual(quote.tier);
    const effective = (await (await pricingRoute.GET()).json()).anthropic[model];
    const { calculateCostFromTokens } = await import("../../open-sse/providers/pricing.js");
    expect(calculateCostFromTokens({ prompt_tokens: 150000, completion_tokens: 10000, reasoning_tokens: 10000 }, effective)).toBeCloseTo(0.1, 12);
  });

  it("persists explicit unknown rates instead of inheriting known defaults or recording free usage", async () => {
    const quote = { input: null, output: null, cached: null, reasoning: null, cache_creation: null, cache_creation_1h: null, tier: { cached: null, output: null } };
    const response = await patch({ openai: { "gpt-6.1-sol": quote } });
    expect(response.status).toBe(200);
    expect(savedPricing("openai")["gpt-6.1-sol"]).toEqual(quote);
    const effective = (await (await pricingRoute.GET()).json()).openai["gpt-6.1-sol"];
    expect(effective).toMatchObject({ ...quote, tier: { threshold: 272000, cached: null, output: null } });
  });

  it("can explicitly disable an inherited context tier without deleting base rates", async () => {
    const previous = (await (await pricingRoute.GET()).json()).openai["gpt-6.1-sol"];
    const response = await patch({ openai: { "gpt-6.1-sol": { input: 4, tier: null } } });
    expect(response.status).toBe(200);
    expect(savedPricing("openai")["gpt-6.1-sol"]).toEqual({ input: 4, tier: null });
    const effective = (await (await pricingRoute.GET()).json()).openai["gpt-6.1-sol"];
    expect(effective).toMatchObject({ input: 4, tier: null });
    expect(effective.output).toBe(previous.output);
  });

  it.each([
    ["root array", []],
    ["provider array", { "pricing-api-fixture": [] }],
    ["model array", { "pricing-api-fixture": { invalid: [] } }],
    ["unknown base field", { "pricing-api-fixture": { invalid: { metadata: 1 } } }],
    ["negative hourly rate", { "pricing-api-fixture": { invalid: { cache_creation_1h: -1 } } }],
    ["string hourly rate", { "pricing-api-fixture": { invalid: { cache_creation_1h: "8" } } }],
    ["tier array", { "pricing-api-fixture": { invalid: { tier: [] } } }],
    ["unknown tier field", { "pricing-api-fixture": { invalid: { tier: { threshold: 200000, metadata: 1 } } } }],
    ["nested tier", { "pricing-api-fixture": { invalid: { tier: { tier: {} } } } }],
    ["negative tier rate", { "pricing-api-fixture": { invalid: { tier: { input: -1 } } } }],
    ["string tier rate", { "pricing-api-fixture": { invalid: { tier: { output: "12" } } } }],
    ["zero threshold", { "pricing-api-fixture": { invalid: { tier: { threshold: 0 } } } }],
    ["negative threshold", { "pricing-api-fixture": { invalid: { tier: { threshold: -1 } } } }],
    ["string threshold", { "pricing-api-fixture": { invalid: { tier: { threshold: "200000" } } } }],
    ["string inclusive flag", { "pricing-api-fixture": { invalid: { tier: { inclusive: "true" } } } }],
    ["null inclusive flag", { "pricing-api-fixture": { invalid: { tier: { inclusive: null } } } }],
    ["non-finite base rate", '{"pricing-api-fixture":{"invalid":{"input":1e999}}}'],
    ["non-finite tier rate", '{"pricing-api-fixture":{"invalid":{"tier":{"cached":1e999}}}}'],
    ["non-finite threshold", '{"pricing-api-fixture":{"invalid":{"tier":{"threshold":1e999}}}}'],
  ])("rejects %s without replacing previously saved pricing", async (_label, invalid) => {
    const original = { retained: { input: 3 } };
    expect((await patch({ "pricing-api-fixture": original })).status).toBe(200);
    const response = await patch(invalid);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual(expect.any(String));
    expect(savedPricing("pricing-api-fixture")).toEqual(original);
  });
});
