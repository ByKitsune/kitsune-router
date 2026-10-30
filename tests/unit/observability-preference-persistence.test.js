import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("@/dashboardGuard", () => ({ hasValidToken: async () => true, hasValidCliToken: async () => false }));

let directory;
let previousAdapter;
let adapter;
let database;
let route;
let listeners;
const lifecycleEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "kitsune-observability-preference-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("OBSERVABILITY_ENABLED", "");
  vi.stubEnv("ENABLE_REQUEST_LOGS", "");
  previousAdapter = global._dbAdapter;
  delete global._dbAdapter;
  listeners = new Map(lifecycleEvents.map(event => [event, process.rawListeners(event)]));
  vi.resetModules();
  database = await import("../../src/lib/db/index.js");
  adapter = await (await import("../../src/lib/db/driver.js")).getAdapter();
  route = await import("../../src/app/api/settings/observability/route.js");
});

afterAll(async () => {
  await adapter?.close();
  for (const event of lifecycleEvents) {
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

function update(enableObservability) {
  return route.PATCH(new Request("http://gateway.example/api/settings/observability", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enableObservability }),
  }));
}

it("stores the protected preference in SQLite and keeps runtime environment precedence separate", async () => {
  const enabled = await update(true);
  expect(enabled.status).toBe(200);
  expect(await enabled.json()).toEqual({ enableObservability: true, observabilityEnabled: true, observabilitySource: "settings" });
  expect((await database.getSettings()).enableObservability).toBe(true);
  expect(JSON.parse(adapter.get("SELECT data FROM settings WHERE id=1").data).enableObservability).toBe(true);

  expect((await update(false)).status).toBe(200);
  expect((await database.getSettings()).enableObservability).toBe(false);

  vi.stubEnv("OBSERVABILITY_ENABLED", "false");
  const overridden = await update(true);
  expect(await overridden.json()).toEqual({ enableObservability: true, observabilityEnabled: false, observabilitySource: "OBSERVABILITY_ENABLED" });
  expect((await database.getSettings()).enableObservability).toBe(true);
  expect(JSON.parse(adapter.get("SELECT data FROM settings WHERE id=1").data)).not.toHaveProperty("observabilitySource");
});
