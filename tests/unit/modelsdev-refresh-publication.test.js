import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let temporary, sync, pricing;
const id = "runtime-refresh-canary";
const payload = input => ({ openrouter: { id: "openrouter", models: { [id]: { id, cost: { input, output: input * 2 }, modalities: { input: ["text"], output: ["text"] } } } } });
beforeEach(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-pricing-sync-"));
  vi.resetModules();
  vi.stubEnv("DATA_DIR", temporary);
  vi.stubEnv("MODEL_CATALOG_SYNC", "off");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-02-01T12:00:00Z"));
  sync = await import("../../src/lib/modelCatalog/sync.js");
  pricing = await import("../../open-sse/providers/metadata/modelsDevPricing.js");
});
afterEach(async () => {
  await sync.stopModelCatalogSync();
  const { closeDb } = await import("../../src/lib/db/driver.js");
  await closeDb();
  pricing.setModelsDevPricingObservationSource(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  fs.rmSync(temporary, { recursive: true, force: true });
});

describe("public catalog sync and pricing publication", { timeout: 20_000 }, () => {
  it("recovers eligible persisted usage at startup with outbound sync disabled", async () => {
    const { saveRequestUsage, getUsageHistory } = await import("../../src/lib/db/repos/usageRepo.js");
    const { createPricingObservationStore } = await import("../../src/lib/modelCatalog/pricingObservations.js");
    const timestamp = "2030-02-01T12:00:00Z";
    const request = { provider: "openrouter", model: id, tokens: { prompt_tokens: 1000, completion_tokens: 1000 } };
    await saveRequestUsage({ ...request, timestamp: "2030-02-01T11:00:00Z" });
    await saveRequestUsage({ ...request, timestamp });
    expect((await getUsageHistory()).map(row => row.cost)).toEqual([null, null]);

    const catalog = payload(1);
    createPricingObservationStore(path.join(temporary, "model-pricing-observations")).publish(catalog, {
      url: "https://models.dev/api.json", verifiedAtUtc: timestamp,
      sha256: createHash("sha256").update(JSON.stringify(catalog)).digest("hex"),
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    sync.startModelCatalogSync();
    sync.startModelCatalogSync();
    await vi.waitFor(() => expect(sync.getSyncState().startupPricingRecovery).toEqual({ checked: 2, recovered: 1 }));
    expect(fetch).not.toHaveBeenCalled();
    expect((await getUsageHistory()).map(row => row.cost)).toEqual([null, 0.003]);
  });

  it("checks persisted unpriced requests after publication", async () => {
    const { saveRequestUsage, getUsageHistory } = await import("../../src/lib/db/repos/usageRepo.js");
    const request = { provider: "openrouter", model: id, tokens: { prompt_tokens: 1000, completion_tokens: 1000 } };
    await saveRequestUsage({ ...request, timestamp: "2030-02-01T11:00:00Z" });
    await saveRequestUsage({ ...request, timestamp: "2030-02-01T12:00:00Z" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(payload(1)))));
    expect(await sync.syncModelCatalog()).toMatchObject({ status: "updated", pricingRecovery: { checked: 2, recovered: 1 } });
    expect((await getUsageHistory()).map(row => row.cost)).toEqual([null, 0.003]);
  });

  it("publishes the full validated response with its actual digest and retains previous request-time quotes", async () => {
    const first = JSON.stringify(payload(1));
    const second = JSON.stringify(payload(2));
    const fetch = vi.fn().mockResolvedValueOnce(new Response(first, { headers: { etag: '"first"' } })).mockResolvedValueOnce(new Response(second));
    vi.stubGlobal("fetch", fetch);
    expect(await sync.syncModelCatalog()).toMatchObject({ status: "updated", pricingReferences: 1 });
    expect(fetch.mock.calls[0]).toEqual(["https://models.dev/api.json", expect.objectContaining({ redirect: "error" })]);
    const original = pricing.getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-02-01T13:00:00Z" });
    expect(original).toMatchObject({ input: 1, provenance: { sha256: createHash("sha256").update(first).digest("hex") } });
    vi.setSystemTime(new Date("2030-02-02T12:00:00Z"));
    expect(await sync.syncModelCatalog()).toMatchObject({ status: "updated" });
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty("if-none-match");
    expect(pricing.getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-02-02T13:00:00Z" }).input).toBe(2);
    expect(pricing.getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-02-01T13:00:00Z" })).toEqual(original);
  });
  it.each([new Response(null, { status: 304 }), new Response("{}"), new Response('not-json')])
    ("does not extend or replace prices when refresh is incomplete", async response => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(payload(1)))).mockResolvedValueOnce(response));
      expect(await sync.syncModelCatalog()).toMatchObject({ status: "updated" });
      const history = path.join(temporary, "model-pricing-observations");
      const before = fs.readdirSync(history);
      vi.setSystemTime(new Date("2030-02-02T13:00:00Z"));
      expect(await sync.syncModelCatalog()).toBeNull();
      expect(fs.readdirSync(history)).toEqual(before);
      expect(pricing.getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-02-02T13:00:00Z" })).toBeNull();
    });
});
