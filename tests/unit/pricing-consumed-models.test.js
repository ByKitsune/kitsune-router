import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts", Symbol.for("kitsune.modelsDevPricingObservationSource")];
const model = "synthetic-dynamically-discovered-model";
let directory, previousGlobals, listeners, repo, db;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "kitsune-consumed-pricing-"));
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  vi.stubEnv("DATA_DIR", join(directory, "data"));
  vi.stubEnv("TMPDIR", directory);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Pricing fixture must not contact a provider"); }));
  for (const key of globals) delete global[key];
  vi.resetModules();
  repo = await import("../../src/lib/db/repos/pricingRepo.js");
  db = await (await import("../../src/lib/db/driver.js")).getAdapter();
});

afterEach(async () => {
  for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
  await global._dbAdapter?.instance?.close();
  for (const event of events) for (const listener of process.listeners(event)) {
    if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
  }
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(global, key, descriptor);
    else delete global[key];
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

function consume(provider = "bykitsune", id = model) {
  db.run("INSERT INTO usageHistory(timestamp, provider, model, cost, meta) VALUES(?, ?, ?, ?, ?)",
    ["2026-10-27T08:00:00.000Z", provider, id, null, JSON.stringify({ quote: { pricing: null }, inputCost: null, cachedCost: 0, outputCost: null })]);
}

describe("pricing editor includes actually consumed dynamic model identities", () => {
  it("exposes a used ByKitsune model without requiring a static registry row or saving guessed rates", async () => {
    consume();
    consume();
    const { GET } = await import("../../src/app/api/pricing/route.js");
    const effective = await (await GET(new Request("http://localhost/api/pricing"))).json();
    expect(Object.hasOwn(effective.bykitsune || {}, model)).toBe(true);
    expect(effective.bykitsune[model]).toEqual({});
    const diagnostic = await (await GET(new Request("http://localhost/api/pricing?view=diagnostics"))).json();
    expect(diagnostic.providers.bykitsune[model]).toMatchObject({ status: "unknown", source: "unpriced", knownFields: [] });
    expect(Object.keys(diagnostic.providers.bykitsune).filter(id => id === model)).toHaveLength(1);
    expect(await repo.getSavedPricing()).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it("makes the exact route editable for future requests while preserving the accepted unknown quote", async () => {
    consume();
    const old = db.get("SELECT cost, meta FROM usageHistory");
    const effective = await repo.getConfiguredPricing();
    expect(Object.hasOwn(effective.bykitsune || {}, model)).toBe(true);
    await repo.updatePricing({ bykitsune: { [model]: { input: 2, output: 6 } } });
    const usage = await import("../../src/lib/db/repos/usageRepo.js");
    const next = { provider: "bykitsune", model, tokens: { prompt_tokens: 1000, completion_tokens: 500 } };
    await usage.saveRequestUsage(next);
    expect(next.cost).toBeCloseTo(0.005, 12);
    expect(db.get("SELECT cost, meta FROM usageHistory ORDER BY id LIMIT 1")).toEqual(old);
    expect((await repo.getConfiguredPricing()).bykitsune[model]).toMatchObject({ input: 2, output: 6 });
  });

  it("retains provider ownership instead of applying a native vendor tariff to a consumed reseller model", async () => {
    consume("bykitsune", "claude-haiku-5-5");
    consume("anthropic", "claude-haiku-5-5");
    const effective = await repo.getConfiguredPricing();
    expect(effective.bykitsune["claude-haiku-5-5"]).toEqual({});
    expect(effective.anthropic["claude-haiku-5-5"].input).toBeGreaterThan(0);
  });

  it("resolves a consumed custom prefix to its configured node without stealing a native provider name", async () => {
    const { createProviderNode } = await import("../../src/lib/db/repos/nodesRepo.js");
    const id = "openai-compatible-chat-consumed-pricing";
    await createProviderNode({ id, name: "Synthetic custom route", type: "openai-compatible", prefix: "custom-history", baseUrl: "https://unverified.example/v1", apiType: "chat" });
    consume("custom-history");
    consume("", "missing-provider");
    consume("bykitsune", "");
    const effective = await repo.getConfiguredPricing();
    expect(effective[id][model]).toEqual({});
    expect(effective["custom-history"]).toBeUndefined();
    expect(effective[""]).toBeUndefined();
    expect(effective.bykitsune?.[""]).toBeUndefined();
  });

  it("retains editable exact identities after raw history retention and supports legacy daily keys", async () => {
    const usage = await import("../../src/lib/db/repos/usageRepo.js");
    await usage.saveRequestUsage({ provider: "bykitsune", model, tokens: { prompt_tokens: 100, completion_tokens: 20 } });
    db.run("DELETE FROM usageHistory");
    for (let day = 1; day <= 65; day++) {
      db.run("INSERT INTO usageDaily(dateKey, data) VALUES(?, ?)",
        [`2025-${String(Math.ceil(day / 28)).padStart(2, "0")}-${String((day - 1) % 28 + 1).padStart(2, "0")}`,
          JSON.stringify({ byModel: { [`legacy|literal-${day}|bykitsune`]: { requests: 2, cost: null }, "missing-provider": { requests: 1 } } })]);
    }
    const before = db.all("SELECT dateKey, data FROM usageDaily ORDER BY dateKey");
    const effective = await repo.getConfiguredPricing();
    expect(effective.bykitsune[model]).toEqual({});
    expect(effective.bykitsune["legacy|literal-1"]).toEqual({});
    expect(effective.bykitsune["legacy|literal-65"]).toEqual({});
    expect(effective[""]).toBeUndefined();
    expect(db.all("SELECT dateKey, data FROM usageDaily ORDER BY dateKey")).toEqual(before);
    expect(await repo.getSavedPricing()).toEqual({});
  });
});

describe("literal annotated catalog identity follows the usage timestamp", () => {
  const at = "2026-10-31T00:30:00Z";
  const literal = `${model}(high)`;
  const text = (id, input, output) => ({ id, cost: { input, output }, modalities: { input: ["text"], output: ["text"] } });
  async function observations(beforeLiteral, afterLiteral) {
    const metadata = await import("../../open-sse/providers/metadata/modelsDevPricing.js");
    const observation = (date, hash, quoted) => metadata.createModelsDevPricingObservation({ openrouter: { models: {
      [model]: text(model, 3, 6), ...(quoted ? { [literal]: text(literal, 7, 8) } : {}),
    } } }, { url: "https://models.dev/api.json", verifiedAtUtc: date, sha256: hash.repeat(64), snapshotDate: "2026-10-31" });
    const history = [observation("2026-10-31T00:00:00Z", "a", beforeLiteral), observation("2026-10-31T01:00:00Z", "b", afterLiteral)];
    metadata.setModelsDevPricingObservationSource(() => history);
  }

  it("keeps the independently quoted literal on an in-flight request after a newer catalog removes it", async () => {
    await observations(true, false);
    const quote = await repo.getPricingForModel("openrouter", literal, { timestamp: at });
    expect(quote).toMatchObject({ input: 7, output: 8 });
    expect(quote.provenance.model).toBe(literal);
  });

  it("does not let a future literal quote suppress the historical base rate of a thinking suffix", async () => {
    await observations(false, true);
    const quote = await repo.getPricingForModel("openrouter", literal, { timestamp: at });
    expect(quote).toMatchObject({ input: 3, output: 6 });
    expect(quote.provenance.model).toBe(model);
  });
});
