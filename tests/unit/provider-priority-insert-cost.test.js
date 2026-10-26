import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dataDir;
let previousDataDir;
let previousListeners;
const shutdownEvents = ["beforeExit", "SIGINT", "SIGTERM"];
let createProviderConnection;
let getProviderConnections;
let deleteProviderConnection;
let updateProviderConnection;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T00:00:00.000Z"));
  previousDataDir = process.env.DATA_DIR;
  previousListeners = new Map(
    shutdownEvents.map((event) => [event, process.rawListeners(event)])
  );
  dataDir = await mkdtemp(join(tmpdir(), "kitsunerouter-provider-priority-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  delete global._dbAdapter;
  ({
    createProviderConnection,
    getProviderConnections,
    deleteProviderConnection,
    updateProviderConnection,
  } = await import("../../src/lib/db/index.js"));
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
    delete global._dbAdapter;
    vi.useRealTimers();
    vi.resetModules();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  }
});

async function seed(provider, n) {
  for (let i = 0; i < n; i++) {
    await createProviderConnection({
      provider,
      authType: "apikey",
      name: `seed-${i}`,
      apiKey: `k${i}`,
    });
  }
}

describe("provider insertion ordering (#4311)", () => {
  it("keeps a large pool in insertion order with sequential priorities", async () => {
    const provider = "openai-compatible-order";
    await seed(provider, 60);
    const list = await getProviderConnections({ provider });
    expect(list.map((c) => c.name)).toEqual(
      Array.from({ length: 60 }, (_, i) => `seed-${i}`)
    );
    expect(list.map((c) => c.priority)).toEqual(
      Array.from({ length: 60 }, (_, i) => i + 1)
    );
  });

  it("preserves remaining order and renumbers after delete", async () => {
    const provider = "openai-compatible-delete";
    await seed(provider, 4);
    const before = await getProviderConnections({ provider });
    await deleteProviderConnection(before[1].id);
    const after = await getProviderConnections({ provider });
    expect(after.map((c) => c.name)).toEqual(["seed-0", "seed-2", "seed-3"]);
    expect(after.map((c) => c.priority)).toEqual([1, 2, 3]);
  });

  it("moves a connection to the requested priority", async () => {
    const provider = "openai-compatible-update";
    await seed(provider, 4);
    const list = await getProviderConnections({ provider });
    vi.setSystemTime(new Date("2026-10-02T00:00:01.000Z"));
    await updateProviderConnection(list[3].id, { priority: 1 });
    const after = await getProviderConnections({ provider });
    expect(after.map((c) => c.name)).toEqual(["seed-3", "seed-0", "seed-1", "seed-2"]);
    expect(after.map((c) => c.priority)).toEqual([1, 2, 3, 4]);
  });
});

describe("name collision does not destroy a key silently (#4311)", () => {
  it("throws a typed conflict and preserves the key when overwrite is refused", async () => {
    const provider = "openai-compatible-conflict";
    await seed(provider, 1);
    const [original] = await getProviderConnections({ provider });
    await expect(
      createProviderConnection({
        provider,
        authType: "apikey",
        name: original.name,
        apiKey: "REPLACEMENT-KEY",
        allowOverwrite: false,
      })
    ).rejects.toMatchObject({ code: "PROVIDER_NAME_CONFLICT", existingId: original.id });
    const after = await getProviderConnections({ provider });
    expect(after.map((c) => ({ id: c.id, apiKey: c.apiKey }))).toEqual([
      { id: original.id, apiKey: original.apiKey },
    ]);
  });

  it("replaces the key without adding a connection when overwrite is explicit", async () => {
    const provider = "openai-compatible-overwrite";
    await seed(provider, 1);
    const [original] = await getProviderConnections({ provider });
    const updated = await createProviderConnection({
      provider,
      authType: "apikey",
      name: original.name,
      apiKey: "REPLACEMENT-KEY",
      allowOverwrite: true,
    });
    expect(updated.id).toBe(original.id);
    const after = await getProviderConnections({ provider });
    expect(after.map((c) => ({ id: c.id, apiKey: c.apiKey }))).toEqual([
      { id: original.id, apiKey: "REPLACEMENT-KEY" },
    ]);
  });

  it("allows the same name in separate providers without changing either key", async () => {
    const provider = "openai-compatible-first";
    const otherProvider = "openai-compatible-second";
    await seed(provider, 1);
    const [original] = await getProviderConnections({ provider });
    const other = await createProviderConnection({
      provider: otherProvider,
      authType: "apikey",
      name: original.name,
      apiKey: "other-key",
      allowOverwrite: false,
    });
    expect(other.id).not.toBe(original.id);
    expect((await getProviderConnections({ provider }))[0].apiKey).toBe(original.apiKey);
    expect((await getProviderConnections({ provider: otherProvider }))[0].apiKey).toBe("other-key");
  });
});
