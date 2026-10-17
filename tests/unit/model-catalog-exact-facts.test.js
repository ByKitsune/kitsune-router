import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const previousDataDir = process.env.DATA_DIR;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zen-catalog-facts-"));
process.env.DATA_DIR = dataDir;
const provider = "openai-compatible-catalog-contract";
const current = { contextWindow: 200000, maxInput: null, maxOutput: 64000 };
let build, reader, capabilities;
beforeAll(async () => {
  ({ build } = await import("../../src/lib/modelCatalog/sync.js"));
  reader = await import("../../open-sse/providers/catalogOverride.js");
  capabilities = await import("../../open-sse/providers/capabilities.js");
});
afterEach(() => {
  capabilities.setCatalogSource(null);
  delete capabilities.MODEL_CAPABILITIES["catalog-partial-opaque"];
  delete capabilities.MODEL_CAPABILITIES["catalog-explicit-opaque"];
});
afterAll(() => {
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  fs.rmSync(dataDir, { recursive: true, force: true });
});
async function publish(catalog, entries) {
  const built = build(catalog, entries);
  fs.writeFileSync(reader.CATALOG_FILE, JSON.stringify({ v: reader.CATALOG_VERSION, ...built }));
  reader.invalidateCatalog();
  await reader.installCatalogSource();
  return built;
}
function row(model, extra = {}) { return { provider, model, current, ...extra }; }
function source(model, facts) { return { [provider]: { models: { [model]: facts } } }; }

describe("exact provider catalog facts at the live capability reader", () => {
  it("keeps exact input/context/output limits even when they differ by less than ten percent", async () => {
    const model = "opaque-exact-window";
    await publish(source(model, { limit: { context: 1048576, input: 1024000, output: 65536 } }), [
      row(model, { current: { contextWindow: 1000000, maxInput: 900000, maxOutput: 64000 } }),
    ]);
    expect(capabilities.getCapabilitiesForModel(provider, model)).toMatchObject({ contextWindow: 1048576, maxInput: 1024000, maxOutput: 65536 });
  });

  it("fills unknown independent limits rather than losing them to NaN comparisons", async () => {
    const model = "opaque-unknown-window";
    await publish(source(model, { limit: { context: 500000, input: 450000, output: 50000 } }), [row(model, { current: { contextWindow: null, maxInput: null, maxOutput: null } })]);
    expect(capabilities.getCapabilitiesForModel(provider, model)).toMatchObject({ contextWindow: 500000, maxInput: 450000, maxOutput: 50000 });
  });

  it("does not invent a separate input maximum when only a context window is published", async () => {
    const model = "opaque-shared-context";
    await publish(source(model, { limit: { context: 500000, output: 50000 } }), [row(model)]);
    expect(capabilities.getCapabilitiesForModel(provider, model).maxInput).toBeNull();
  });

  it("lets explicit text-only/nonreasoning/no-tools facts beat name-based guesses", async () => {
    const model = "qwen3.8-vl-catalog-canary";
    await publish(source(model, { modalities: { input: ["text"], output: ["text"] }, reasoning: false, tool_call: false }), [row(model)]);
    expect(capabilities.getCapabilitiesForModel(provider, model)).toMatchObject({ vision: false, pdf: false, audioInput: false, videoInput: false, reasoning: false, tools: false });
  });

  it("does not turn omitted input modalities into an explicit negative", async () => {
    const model = "qwen3.8-vl-missing-input";
    const built = await publish(source(model, { reasoning: false }), [row(model)]);
    expect(built.models[`${provider}:${model}`]).not.toHaveProperty("vision");
    expect(capabilities.getCapabilitiesForModel(provider, model).vision).toBe(true);
  });

  it("fills limits absent from a partial exact table without replacing its explicit capabilities", async () => {
    const model = "catalog-partial-opaque";
    capabilities.MODEL_CAPABILITIES[model] = { vision: true };
    await publish(source(model, { modalities: { input: ["text"] }, limit: { context: 262144, input: 240000, output: 32768 } }), [row(model)]);
    expect(capabilities.getCapabilitiesForModel(provider, model)).toMatchObject({ vision: true, contextWindow: 262144, maxInput: 240000, maxOutput: 32768 });
  });

  it("preserves explicit exact flags and independently declared route ceilings", async () => {
    const model = "catalog-explicit-opaque";
    const declared = { vision: false, reasoning: true, tools: false, contextWindow: 123456, maxInput: 98765, maxOutput: 20000 };
    capabilities.MODEL_CAPABILITIES[model] = declared;
    await publish(source(model, { modalities: { input: ["text", "image"] }, reasoning: false, tool_call: true, limit: { context: 1000000, input: 900000, output: 100000 } }), [row(model)]);
    expect(capabilities.getCapabilitiesForModel(provider, model)).toMatchObject(declared);
  });

  it.each([false, true])("prefers the declared Kimi coding-plan product over an identically named direct catalog regardless of order (%s)", async (reverse) => {
    const model = "opaque-product-collision";
    const records = [
      ["kimi", { models: { [model]: { modalities: { input: ["text", "image"] }, limit: { context: 1000000, output: 128000 } } } }],
      ["kimi-code-plan-cn", { models: { [model]: { modalities: { input: ["text"] }, limit: { context: 262144, output: 32768 } } } }],
    ];
    await publish(Object.fromEntries(reverse ? [...records].reverse() : records), [{ provider: "kimi", model, current }]);
    expect(capabilities.getCapabilitiesForModel("kimi", model)).toMatchObject({ vision: false, contextWindow: 262144, maxOutput: 32768 });
  });

  it("does not manufacture a bare alias from a lone namespaced upstream model", async () => {
    const built = await publish({ openrouter: { models: { "vendor/opaque-single": { modalities: { input: ["text", "image"] }, limit: { context: 500000, output: 32000 } } } } }, [
      { provider: "openrouter", model: "opaque-single", current },
    ]);
    expect(built.providers.openrouter?.["opaque-single"]).toBeUndefined();
    expect(reader.getCatalogModalities("openrouter", "opaque-single")).toBeNull();
    expect(reader.getCatalogModalities("openrouter", "vendor/opaque-single").vision).toBe(true);
  });

  it("follows an explicitly declared upstream alias without changing the local identity", async () => {
    const model = "friendly-local-model";
    await publish(source("vendor/native-model", { modalities: { input: ["text", "image"] }, limit: { context: 500000, input: 450000, output: 32000 } }), [row(model, { upstreamModelId: "vendor/native-model" })]);
    expect(capabilities.getCapabilitiesForModel(provider, model)).toMatchObject({ vision: true, contextWindow: 500000, maxInput: 450000, maxOutput: 32000 });
  });

  it("makes a global catalog uninstall authoritative for every module copy", async () => {
    const other = await import("../../open-sse/providers/capabilities.js?catalog-uninstall-contract");
    other.setCatalogSource({ getModalities: () => ({ vision: true }), getLimits: () => null });
    capabilities.setCatalogSource(null);
    expect(other.getCapabilitiesForModel(provider, "opaque-uninstalled").vision).toBe(false);
  });
});
