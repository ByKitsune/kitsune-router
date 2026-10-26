import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dataDir;
let previousDataDir;
let previousListeners;
let previousGlobals;
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const fixtureGlobals = [
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
];
let addCustomModel;
let getCustomModels;
let deleteCustomModel;
let getModels;
let postCustomModel;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousListeners = new Map(
    shutdownEvents.map((event) => [event, process.rawListeners(event)])
  );
  previousGlobals = new Map(
    fixtureGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)])
  );
  dataDir = await mkdtemp(join(tmpdir(), "kitsunerouter-custom-model-capabilities-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  for (const key of fixtureGlobals) delete global[key];
  ({ addCustomModel, getCustomModels, deleteCustomModel } = await import("@/lib/db/repos/aliasRepo.js"));
  ({ GET: getModels } = await import("@/app/api/models/route.js"));
  ({ POST: postCustomModel } = await import("@/app/api/models/custom/route.js"));
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
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  }
});

describe("Custom Model Capabilities & Upsert (#3752)", () => {
  const providerAlias = "test-oai-prov";
  const modelId = `test-model-${Date.now()}`;

  beforeEach(async () => {
    await deleteCustomModel({ providerAlias, id: modelId, type: "llm" });
  });

  it("adds a custom model with vision and reasoning capabilities and upserts cleanly", async () => {
    // 1. Initial creation with vision=true, reasoning=false
    const addedFirst = await addCustomModel({
      providerAlias,
      id: modelId,
      type: "llm",
      name: "Test Custom Model",
      caps: { vision: true, reasoning: false },
    });
    expect(addedFirst).toBe(true);

    let allCustom = await getCustomModels();
    let found = allCustom.find((m) => m.providerAlias === providerAlias && m.id === modelId);
    expect(found).toBeDefined();
    expect(found.caps).toEqual({ vision: true, reasoning: false });

    // 2. Upsert: re-adding with updated capabilities reasoning=true updates in-place (returns false as already exists)
    const addedSecond = await addCustomModel({
      providerAlias,
      id: modelId,
      type: "llm",
      caps: { reasoning: true },
    });
    expect(addedSecond).toBe(false);

    allCustom = await getCustomModels();
    const matching = allCustom.filter((m) => m.providerAlias === providerAlias && m.id === modelId);
    expect(matching.length).toBe(1);
    expect(matching[0].caps.reasoning).toBe(true);
    expect(matching[0].caps.vision).toBe(true); // preserved

    // Cleanup
    await deleteCustomModel({ providerAlias, id: modelId, type: "llm" });
  });

  it("POST /api/models/custom sanitizes caps to booleans and upserts", async () => {
    const fakeRequest = {
      json: async () => ({
        providerAlias,
        id: modelId,
        type: "llm",
        caps: { vision: true, reasoning: "not-a-bool", invalidProp: 123 },
      }),
    };

    const res = await postCustomModel(fakeRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const allCustom = await getCustomModels();
    const found = allCustom.find((m) => m.providerAlias === providerAlias && m.id === modelId);
    expect(found).toBeDefined();
    // Only valid boolean keys from CAPACITY_META should be retained
    expect(found.caps).toEqual({ vision: true });
    expect(found.caps.invalidProp).toBeUndefined();

    // Cleanup
    await deleteCustomModel({ providerAlias, id: modelId, type: "llm" });
  });

  it("GET /api/models includes custom models with their custom caps", async () => {
    await addCustomModel({
      providerAlias,
      id: modelId,
      type: "llm",
      name: "My Custom Vision Model",
      caps: { vision: true, reasoning: true },
    });

    const res = await getModels();
    expect(res.status).toBe(200);
    const { models } = await res.json();

    const entry = models.find((m) => m.fullModel === `${providerAlias}/${modelId}`);
    expect(entry).toBeDefined();
    expect(entry.caps.vision).toBe(true);
    expect(entry.caps.reasoning).toBe(true);

    // Cleanup
    await deleteCustomModel({ providerAlias, id: modelId, type: "llm" });
  });
});
