import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let directory, previousGlobals, previousListeners, api;

beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-deep-db-kv-"));
  previousGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  previousListeners = new Map(events.map(event => [event, process.rawListeners(event)]));
  for (const key of globals) delete globalThis[key];
  vi.stubEnv("HOME", directory);
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("KITSUNE_ROUTER_MIGRATION", "skip");
  vi.resetModules();
  api = await import("@/lib/db/index.js");
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
  await globalThis._dbAdapter?.instance?.close();
  for (const event of events) {
    for (const listener of process.rawListeners(event)) {
      if (!previousListeners.get(event).includes(listener)) process.removeListener(event, listener);
    }
  }
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  vi.unstubAllEnvs();
  vi.resetModules();
  fs.rmSync(directory, { recursive: true, force: true });
});

it("retains literal prototype-like keys through repository reads and an export/import roundtrip", async () => {
  await api.setModelAlias("__proto__", "openai/retained-model");
  await api.setModelAlias("constructor", "openai/second-model");
  await api.disableModels("__proto__", ["retained-disabled-model"]);
  const aliases = await api.getModelAliases();
  expect(Object.hasOwn(aliases, "__proto__")).toBe(true);
  expect(aliases.__proto__).toBe("openai/retained-model");
  expect(aliases.constructor).toBe("openai/second-model");
  const snapshot = await api.exportDb();
  expect(Object.hasOwn(snapshot.modelAliases, "__proto__")).toBe(true);
  expect(Object.hasOwn(snapshot.disabledModels, "__proto__")).toBe(true);
  expect(snapshot.disabledModels.__proto__).toEqual(["retained-disabled-model"]);
  const serialized = JSON.stringify(snapshot);
  expect(JSON.parse(serialized).modelAliases.__proto__).toBe("openai/retained-model");
  await api.importDb(JSON.parse(serialized));
  expect((await api.getModelAliases()).__proto__).toBe("openai/retained-model");
  expect(await api.getDisabledByProvider("__proto__")).toEqual(["retained-disabled-model"]);
  expect(Object.hasOwn(await api.getDisabledModels(), "__proto__")).toBe(true);
  expect(Object.hasOwn(Object.prototype, "retained-disabled-model")).toBe(false);
});

it("retains opaque model values under a prototype-like KV key without changing the returned record's prototype", async () => {
  const { makeKv } = await import("@/lib/db/helpers/kvStore.js");
  const kv = makeKv("synthetic-kv");
  await kv.set("__proto__", { nested: { retained: true } });
  const result = await kv.getAll();
  expect(Object.hasOwn(result, "__proto__")).toBe(true);
  expect(result.__proto__).toEqual({ nested: { retained: true } });
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.hasOwn(Object.prototype, "nested")).toBe(false);
});
