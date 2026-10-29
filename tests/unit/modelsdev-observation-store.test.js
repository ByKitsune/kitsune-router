import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPricingObservationStore, installPricingObservationStore, parseModelsDevCatalog, readModelsDevResponse } from "../../src/lib/modelCatalog/pricingObservations.js";
import { getModelsDevPricingEstimate, getModelsDevPricingStatus, setModelsDevPricingObservationSource } from "../../open-sse/providers/metadata/modelsDevPricing.js";

const id = "audit-store-canary";
const catalog = (input, model = id) => ({ openrouter: { id: "openrouter", models: { [model]: { id: model, modalities: { input: ["text"], output: ["text"] }, cost: { input, output: input * 2 } } } } });
const source = (day, hash = "a") => ({ url: "https://models.dev/api.json", verifiedAtUtc: `2030-01-${day}T12:00:00.000Z`, sha256: hash.repeat(64) });
let temporary, directory;
beforeEach(() => { temporary = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-observations-")); directory = path.join(temporary, "observations"); });
afterEach(() => { setModelsDevPricingObservationSource(null); fs.rmSync(temporary, { recursive: true, force: true }); });

describe("immutable pricing observation storage", () => {
  it("shares and clears the source across independently bundled module copies", async () => {
    const store = installPricingObservationStore(directory);
    store.publish(catalog(1), source("01"));
    const other = await import("../../open-sse/providers/metadata/modelsDevPricing.js?store-copy=1");
    expect(other.getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-01-01T13:00:00Z" }).input).toBe(1);
    setModelsDevPricingObservationSource(null);
    expect(other.getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-01-01T13:00:00Z" })).toBeNull();
  });
  it("detects a different process's publication and retains time-of-request prices", () => {
    const store = installPricingObservationStore(directory);
    store.publish(catalog(1), source("01"));
    expect(store.read()).toHaveLength(1);
    const filename = fileURLToPath(new URL("../../src/lib/modelCatalog/pricingObservations.js", import.meta.url));
    const program = `import { createPricingObservationStore } from ${JSON.stringify(pathToFileURL(filename).href)}; createPricingObservationStore(process.argv[1]).publish(JSON.parse(process.argv[2]), JSON.parse(process.argv[3]));`;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", program, directory, JSON.stringify(catalog(2)), JSON.stringify(source("02", "b"))], { encoding: "utf8", timeout: 15000 });
    expect(child.status, child.stderr).toBe(0);
    expect(store.read()).toHaveLength(2);
    expect(getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-01-01T13:00:00Z" }).input).toBe(1);
    expect(getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-01-02T13:00:00Z" }).input).toBe(2);
    expect(createPricingObservationStore(directory).read()).toHaveLength(2);
  });

  it("does not revive a removed model from an older observation", () => {
    const store = installPricingObservationStore(directory);
    store.publish(catalog(1), source("01"));
    store.publish(catalog(3, "replacement-model"), source("02", "b"));
    expect(getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-01-02T13:00:00Z" })).toBeNull();
    expect(getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-01-01T13:00:00Z" }).input).toBe(1);
    expect(getModelsDevPricingEstimate("openrouter", "replacement-model", { timestamp: "2030-01-03T12:00:00Z" })).toBeNull();
  });

  it("publishes idempotently with private files and no temporary artifacts", () => {
    const store = createPricingObservationStore(directory);
    store.publish(catalog(1), source("01")); store.publish(catalog(1), source("01"));
    const files = fs.readdirSync(directory);
    expect(files).toHaveLength(1);
    expect(fs.statSync(path.join(directory, files[0])).mode & 0o777).toBe(0o600);
    expect(fs.statSync(directory).mode & 0o777).toBe(0o700);
  });

  it("rejects malformed modality records before any durable publication", () => {
    const malformed = catalog(1);
    malformed.openrouter.models[id].modalities.input = "text";
    const store = createPricingObservationStore(directory);
    expect(() => store.publish(malformed, source("01"))).toThrow(/record/);
    expect(fs.existsSync(directory)).toBe(false);
    expect(() => parseModelsDevCatalog(Buffer.from(JSON.stringify(malformed)))).toThrow(/modalities/);
  });

  it.each(["1.25", NaN, Infinity])("rejects invalid numeric catalog rates before publication: %s", input => {
    const store = createPricingObservationStore(directory);
    expect(() => store.publish(catalog(input), source("01"))).toThrow(/cost/);
    expect(fs.existsSync(directory)).toBe(false);
  });

  it("fails closed on checksum corruption instead of silently reverting to bundled estimates", () => {
    const store = installPricingObservationStore(directory);
    store.publish(catalog(1), source("01")); store.read();
    fs.writeFileSync(path.join(directory, `1893585600000-${"0".repeat(64)}.json`), "{}");
    expect(() => store.read()).toThrow(/checksum/);
    expect(getModelsDevPricingStatus("openrouter", id, { timestamp: "2030-01-02T13:00:00Z" }).status).toBe("source-unavailable");
    expect(getModelsDevPricingEstimate("openrouter", id, { timestamp: "2030-01-02T13:00:00Z" })).toBeNull();
  });

  it("refuses a directory symlink without writing through it", () => {
    const outside = path.join(temporary, "outside"); fs.mkdirSync(outside); fs.symlinkSync(outside, directory);
    expect(() => createPricingObservationStore(directory).publish(catalog(1), source("01"))).toThrow(/real directory/);
    expect(fs.readdirSync(outside)).toEqual([]);
  });
});

describe("complete source response validation", () => {
  it.each(["{}", "[]", '{"openrouter":{"models":{}}}', '{"openrouter":{"models":{"one":{"id":"other"}}}}'])
    ("rejects a wrong-shaped or empty response: %s", bytes => expect(() => parseModelsDevCatalog(Buffer.from(bytes))).toThrow());
  it("parses a valid full response and retains literal prices and modalities", async () => {
    const expected = catalog(2);
    const bytes = await readModelsDevResponse(new Response(JSON.stringify(expected)), new AbortController().signal);
    expect(parseModelsDevCatalog(bytes)).toEqual(expected);
  });
  it("rejects an oversized announced body before reading it", async () => {
    await expect(readModelsDevResponse(new Response("{}", { headers: { "content-length": String(33 * 1024 * 1024) } }))).rejects.toThrow(/too large/);
  });
  it("observes caller cancellation rather than accepting a response after abort", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(readModelsDevResponse(new Response(JSON.stringify(catalog(1))), controller.signal)).rejects.toHaveProperty("name", "AbortError");
  });
});

describe("pricing history and cancellation review regressions", () => {

  it("selects an older persisted quote after more than64 newer observations without falling back to bundled prices", () => {
    const store = installPricingObservationStore(directory);
    // This exact model has a bundled reference. Losing the first persisted
    // capture previously selected that older bundled rate instead of fail-closed.
    const model = "gpt-3.5-turbo";
    const base = Date.parse("2026-10-29T08:00:00.000Z");
    for (let index = 0; index < 66; index++) {
      store.publish({ openai: { id: "openai", models: {
        [model]: { id: model, cost: { input: 100 + index, output: 200 + index }, modalities: { input: ["text"], output: ["text"] } },
      } } }, {
        url: "https://models.dev/api.json",
        verifiedAtUtc: new Date(base + index * 60000).toISOString(),
        sha256: (index + 1).toString(16).padStart(64, "0"),
      });
    }
    expect(fs.readdirSync(directory)).toHaveLength(66);
    // Both the existing worker and a newly installed reader must consult the
    // on-disk capture applicable at request time, not just the64 newest files.
    const options = { timestamp: new Date(base + 30000).toISOString() };
    expect(getModelsDevPricingEstimate("openai", model, options)).toMatchObject({ input: 100, output: 200 });
    installPricingObservationStore(directory);
    expect(getModelsDevPricingEstimate("openai", model, options)).toMatchObject({ input: 100, output: 200 });
  });

  it("aborts a pending body read even when stream cleanup never settles", async () => {
    const controller = new AbortController();
    let enterRead;
    const readingStarted = new Promise(resolve => { enterRead = resolve; });
    let cancelled = false;
    const response = new Response(new ReadableStream({
      pull() { enterRead(); return new Promise(() => {}); },
      cancel() { cancelled = true; return new Promise(() => {}); },
    }));
    const reading = readModelsDevResponse(response, controller.signal);
    await readingStarted;
    controller.abort();
    let timeout;
    try {
      await expect(Promise.race([
        reading,
        new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error("Body read ignored caller abort")), 1000); }),
      ])).rejects.toHaveProperty("name", "AbortError");
      expect(cancelled).toBe(true);
    } finally {
      clearTimeout(timeout);
      void reading.catch(() => {});
    }
  });
});
