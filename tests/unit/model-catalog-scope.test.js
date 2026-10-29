import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Both modules read their file path from DATA_DIR at import time, so the temp
// data dir has to be in place before the first import.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "9r-catalog-"));
process.env.DATA_DIR = dataDir;
const catalogFile = path.join(dataDir, "model-catalog.json");

// One upstream record per gateway: the same short id means different things to
// different vendors, which is what used to leak capabilities across providers.
const upstream = {
  "zai-coding-plan": { models: { "glm-4.6v": { modalities: { input: ["text", "image"] } } } },
  // Direct API and coding-plan catalogs are distinct, even for the same weights.
  "zhipuai-coding-plan": { models: { "glm-5-canary": { modalities: { input: ["text", "image", "pdf"] } } } },
  zhipuai: { models: { "glm-5-canary": { modalities: { input: ["text", "image", "pdf"] } } } },
  "kimi-code-plan-cn": { models: { "kimi-k3": { modalities: { input: ["text"] } } } },
  kilo: { models: { "kilo-auto/efficient": { modalities: { input: ["text", "image"] } } } },
};
// The registry snapshot the sync feeds build(): local ids, with the capabilities
// the tables resolve on their own.
const entries = [
  { provider: "glm", model: "glm-4.6v", current: { contextWindow: 200000, maxOutput: 128000 } },
  { provider: "glm-cn", model: "glm-5-canary", current: { contextWindow: 200000, maxOutput: 128000 } },
  { provider: "zhipu", model: "glm-5-canary", current: { contextWindow: 200000, maxOutput: 128000 } },
  { provider: "kimi", model: "kimi-k3", current: { contextWindow: 128000, maxOutput: 32000 } },
];

let build, getCatalogModalities, invalidateCatalog, syncModelCatalog, startModelCatalogSync, capabilities, catalogVersion;

beforeAll(async () => {
  ({ build, syncModelCatalog, startModelCatalogSync } = await import("../../src/lib/modelCatalog/sync.js"));
  ({ getCatalogModalities, invalidateCatalog, CATALOG_VERSION: catalogVersion } = await import("../../open-sse/providers/catalogOverride.js"));
  const { models, providers } = build(upstream, entries);
  fs.writeFileSync(catalogFile, JSON.stringify({ v: catalogVersion, models, providers }));
  capabilities = await import("../../open-sse/providers/capabilities.js");
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("model catalog", () => {
  it("keys modalities by gateway and writes no model-only key", () => {
    const { models } = build(upstream, entries);
    // upstream "zai" is filed under the local id requests arrive with...
    expect(models["glm:glm-4.6v"]).toMatchObject({ vision: true });
    // ...and under its upstream name, because a custom provider node can carry
    // that name without being in the registry snapshot
    expect(models["zai-coding-plan:glm-4.6v"]).toMatchObject({ vision: true });
    expect(models["kilo:kilo-auto/efficient"]).toMatchObject({ vision: true });
    // the vendor-stripped key is what used to be shared with every other gateway
    expect(models["glm-4.6v"]).toBeUndefined();
    expect(models["efficient"]).toBeUndefined();
    // Explicit text-only input must not inherit a name-based vision guess.
    expect(models["kimi:kimi-k3"]).toMatchObject({ vision: false });
  });

  it("files direct API and coding-plan providers only under their correct local IDs", () => {
    const { models } = build(upstream, entries);
    // glm-cn uses its plan catalog; zhipu uses the separate direct API catalog.
    expect(models["glm-cn:glm-5-canary"]).toMatchObject({ vision: true, pdf: true });
    expect(models["zhipu:glm-5-canary"]).toMatchObject({ vision: true, pdf: true });
    expect(models["zhipuai:glm-5-canary"]).toMatchObject({ vision: true, pdf: true });
    expect(getCatalogModalities("glm-cn", "glm-5-canary")).toMatchObject({ vision: true, pdf: true });
    expect(getCatalogModalities("zhipu", "glm-5-canary")).toMatchObject({ vision: true, pdf: true });
  });

  it("does not hand a router mode another vendor's modalities", () => {
    // kilo's "efficient" is a real model; another gateway's "efficient" is a mode
    expect(getCatalogModalities("kilo", "kilo-auto/efficient")).toMatchObject({ vision: true });
    expect(getCatalogModalities("kilo-gateway", "kilo-auto/efficient")).toBeNull();
    expect(getCatalogModalities("qoder", "efficient")).toBeNull();
  });

  it("resolves a gateway the file was written for, and nobody else", () => {
    expect(getCatalogModalities("glm", "glm-4.6v")).toMatchObject({ vision: true });
    expect(getCatalogModalities("zai-coding-plan", "glm-4.6v")).toMatchObject({ vision: true });
    expect(getCatalogModalities("unrelated", "glm-4.6v")).toBeNull();
    expect(getCatalogModalities(undefined, "glm-4.6v")).toBeNull();
  });

  it("passes the gateway to the catalog reader when refining", () => {
    capabilities.setCatalogSource({
      getModalities: (provider) => {
        return provider === "gateway-a" ? { vision: true } : null;
      },
      getLimits: () => null,
    });
    try {
      // "*laguna*" resolves from the pattern table, so refine() runs
      expect(capabilities.getCapabilitiesForModel("gateway-a", "laguna-9-preview").vision).toBe(true);
      expect(capabilities.getCapabilitiesForModel("gateway-b", "laguna-9-preview").vision).toBe(false);
    } finally {
      capabilities.setCatalogSource(null);
    }
  });

  it("shares the installed source with every copy of the module", async () => {
    const source = {
      getModalities: (provider) => (provider === "gateway-a" ? { vision: true } : null),
      getLimits: () => null,
    };
    capabilities.setCatalogSource(source);
    try {
      // The server bundles this module into more than one chunk and the startup
      // hook only runs in one of them, so the slot has to be process-wide.
      const other = await import("../../open-sse/providers/capabilities.js?copy=2");
      // ...and that second copy resolves through the source it never installed
      expect(other.getCapabilitiesForModel("gateway-a", "laguna-9-preview").vision).toBe(true);
    } finally {
      capabilities.setCatalogSource(null);
    }
  });

  it("detaches the source from a copy that already resolved through it", async () => {
    capabilities.setCatalogSource({
      getModalities: (provider) => (provider === "gateway-a" ? { vision: true } : null),
      getLimits: () => null,
    });
    const other = await import("../../open-sse/providers/capabilities.js?copy=3");
    try {
      expect(other.getCapabilitiesForModel("gateway-a", "laguna-9-preview").vision).toBe(true);
    } finally {
      capabilities.setCatalogSource(null);
    }
    // the sync resets the source before rebuilding; a copy that has read the
    // slot once must not keep serving the uninstalled reader
    expect(other.getCapabilitiesForModel("gateway-a", "laguna-9-preview").vision).toBe(false);
  });
});

describe("catalog schema", () => {
  it("ignores a file written before the keys were scoped", () => {
    const scoped = fs.readFileSync(catalogFile);
    // v1: flat model keys, which is exactly the shape that collided
    fs.writeFileSync(catalogFile, JSON.stringify({ v: 1, models: { "kimi-k3": { vision: true } }, providers: {} }));
    invalidateCatalog();
    expect(getCatalogModalities("kimi", "kimi-k3")).toBeNull();
    fs.writeFileSync(catalogFile, scoped);
    invalidateCatalog();
  });

  it("rebuilds an older-schema file instead of trusting its etag", async () => {
    fs.writeFileSync(catalogFile, JSON.stringify({ v: 1, etag: 'W/"old"', models: {}, providers: {} }));
    invalidateCatalog();
    startModelCatalogSync();   // picks the file's etag + schema version back up

    const sent = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => {
      sent.push(options?.headers || {});
      return new Response(JSON.stringify(upstream), { headers: { etag: 'W/"new"' } });
    };
    try {
      expect((await syncModelCatalog()).status).toBe("updated");
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(sent[0]["if-none-match"]).toBeUndefined();
    const written = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
    expect(written.models["glm:glm-4.6v"]).toMatchObject({ vision: true });
  });

  it("requires the full source instead of extending price freshness with a 304", async () => {
    const sent = [];
    const before = fs.readFileSync(catalogFile, "utf8");
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => {
      sent.push(options?.headers || {});
      return new Response(null, { status: 304 });
    };
    try {
      expect(await syncModelCatalog()).toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(sent[0]["if-none-match"]).toBeUndefined();
    expect(fs.readFileSync(catalogFile, "utf8")).toBe(before);
  });
});
