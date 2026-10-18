import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let directory;
let previousAdapter;
let listeners;
let route;
let db;
let adapter;
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "zen-provider-thinking-"));
  vi.stubEnv("DATA_DIR", directory);
  previousAdapter = global._dbAdapter;
  delete global._dbAdapter;
  listeners = new Map(shutdownEvents.map(event => [event, process.rawListeners(event)]));
  vi.resetModules();
  db = await import("../../src/lib/db/index.js");
  adapter = await (await import("../../src/lib/db/driver.js")).getAdapter();
  route = await import("../../src/app/api/settings/route.js");
});

afterEach(async () => {
  await adapter?.close();
  for (const event of shutdownEvents) {
    for (const listener of process.rawListeners(event)) {
      if (!listeners.get(event).includes(listener)) process.removeListener(event, listener);
    }
  }
  if (previousAdapter === undefined) delete global._dbAdapter;
  else global._dbAdapter = previousAdapter;
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

const request = body => new Request("http://localhost/api/settings", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

function stored() {
  return JSON.parse(adapter.get("SELECT data FROM settings WHERE id = 1")?.data || "{}");
}

describe("provider thinking settings reach persistence", () => {
  it.each(["high", "off", "none", "auto", "ultra"])("persists %s rather than reporting success while dropping it", async mode => {
    const providerThinking = { antigravity: { mode }, codex: { mode: "medium" } };
    const response = await route.PATCH(request({ providerThinking }));
    expect(response.status).toBe(200);
    expect(stored().providerThinking).toEqual(providerThinking);
    expect((await (await route.GET()).json()).providerThinking).toEqual(providerThinking);
  });

  it.each([null, [], "high", { codex: null }, { codex: { mode: "ultra-fast" } },
    JSON.parse('{"__proto__":{"mode":"high"}}')].map(value => [value]))("rejects malformed thinking settings without changing saved state: %j", async value => {
    await db.updateSettings({ providerThinking: { codex: { mode: "high" } } });
    const before = stored();
    const response = await route.PATCH(request({ providerThinking: value }));
    expect(response.status).toBe(400);
    expect(stored()).toEqual(before);
  });

  it("does not open protected settings to mass assignment alongside the new control", async () => {
    const response = await route.PATCH(request({ providerThinking: { codex: { mode: "high" } },
      requireApiKey: false, requireLogin: false, oidcClientSecret: "must-not-save", outboundProxyUrl: "http://must-not-save" }));
    expect(response.status).toBe(200);
    const saved = await db.getSettings();
    expect(saved.requireApiKey).toBe(true);
    expect(saved.requireLogin).toBe(true);
    expect(saved.oidcClientSecret).not.toBe("must-not-save");
    expect(saved.outboundProxyUrl).not.toBe("http://must-not-save");
    expect(stored().providerThinking).toEqual({ codex: { mode: "high" } });
  });
});
