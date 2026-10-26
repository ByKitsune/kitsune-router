import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let dataDir;
let previousDataDir;
let previousAdapter;
let previousListeners;
let db;
let validateApiKey;
let createApiKey;
let updateApiKey;
let deleteApiKey;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousAdapter = Object.getOwnPropertyDescriptor(global, "_dbAdapter");
  previousListeners = new Map(
    shutdownEvents.map((event) => [event, process.rawListeners(event)])
  );
  dataDir = await mkdtemp(join(tmpdir(), "kitsunerouter-api-key-cache-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  delete global._dbAdapter;
  ({ validateApiKey, createApiKey, updateApiKey, deleteApiKey } = await import("@/lib/db/repos/apiKeysRepo.js"));
  const { getAdapter } = await import("@/lib/db/driver.js");
  db = await getAdapter();
});

afterEach(async () => {
  try {
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
    if (previousAdapter) Object.defineProperty(global, "_dbAdapter", previousAdapter);
    else delete global._dbAdapter;
    vi.resetModules();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    db = undefined;
  }
});

function provisionKey(id, key, isActive) {
  // SQL fixtures model operator imports that do not mutate the repository cache.
  db.run(
    "INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)",
    [id, key, "Imported test key", "test-machine", isActive ? 1 : 0, "2026-01-01T00:00:00.000Z"]
  );
}

describe("API key validation after rejected credentials", () => {
  it("accepts a previously unknown credential as soon as it is provisioned", async () => {
    const key = "sk-test-imported-after-rejection";
    expect(await validateApiKey(key)).toBe(false);

    provisionKey("imported-key", key, true);

    expect(await validateApiKey(key)).toBe(true);
  });

  it("accepts a previously inactive credential after operator activation", async () => {
    const key = "sk-test-activated-after-rejection";
    provisionKey("inactive-key", key, false);
    expect(await validateApiKey(key)).toBe(false);

    db.run("UPDATE apiKeys SET isActive = 1 WHERE id = ?", ["inactive-key"]);

    expect(await validateApiKey(key)).toBe(true);
  });

  it("preserves rejection, rotation, reactivation, revocation and deletion behavior", async () => {
    const created = await createApiKey("Lifecycle test", "test-machine");
    expect(await validateApiKey(created.key)).toBe(true);
    expect(await validateApiKey("sk-test-unconfigured")).toBe(false);

    const rotatedKey = "sk-test-rotated";
    await updateApiKey(created.id, { key: rotatedKey });
    expect(await validateApiKey(created.key)).toBe(false);
    expect(await validateApiKey(rotatedKey)).toBe(true);

    await updateApiKey(created.id, { isActive: false });
    expect(await validateApiKey(rotatedKey)).toBe(false);

    await updateApiKey(created.id, { isActive: true });
    expect(await validateApiKey(rotatedKey)).toBe(true);

    await deleteApiKey(created.id);
    expect(await validateApiKey(rotatedKey)).toBe(false);
  });
});
