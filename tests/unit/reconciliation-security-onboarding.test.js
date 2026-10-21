import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";

const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const globalKeys = [
  Symbol.for("zenrouter.db.importState"),
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
];
const envKeys = ["HOME", "DATA_DIR", "JWT_SECRET", "ZENROUTER_PEER_TOKEN", "NINEROUTER_PEER_TOKEN"];
const actions = [
  { pathname: "/api/headroom/restart", method: "POST" },
  { pathname: "/api/headroom/extras", method: "POST" },
  { pathname: "/api/headroom/extras", method: "DELETE" },
  { pathname: "/api/headroom/extras?log=1", method: "GET" },
];
const PEER_TOKEN = "reconciliation-synthetic-peer-token";

let root;
let db;
let adapter;
let guard;
let authToken;
let cliToken;
let generation;
let previousGlobals;
let previousEnv;
let previousListeners;

beforeEach(async () => {
  previousGlobals = Object.fromEntries(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  previousListeners = new Map(shutdownEvents.map(event => [event, process.rawListeners(event)]));
  root = fs.mkdtempSync(path.join(tmpdir(), "reconciliation-security-onboarding-"));
  process.env.HOME = path.join(root, "home");
  process.env.DATA_DIR = path.join(root, "data");
  process.env.JWT_SECRET = "reconciliation-only-synthetic-jwt-secret-20261021";
  process.env.ZENROUTER_PEER_TOKEN = PEER_TOKEN;
  process.env.NINEROUTER_PEER_TOKEN = PEER_TOKEN;
  fs.mkdirSync(process.env.HOME, { mode: 0o700 });
  fs.mkdirSync(path.join(process.env.DATA_DIR, "auth"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(process.env.DATA_DIR, "machine-id"), "synthetic-machine-id", { mode: 0o600 });
  fs.writeFileSync(path.join(process.env.DATA_DIR, "auth", "cli-secret"), "synthetic-cli-secret", { mode: 0o600 });
  for (const key of globalKeys) delete global[key];
  vi.resetModules();
  // Never run checkpoint, refresh or other background timers in these tests.
  vi.useFakeTimers();
  db = await import("@/lib/db/index.js");
  adapter = await (await import("@/lib/db/driver.js")).getAdapter();
  guard = await import("@/dashboardGuard.js");
  authToken = await (await import("@/lib/auth/dashboardSession.js")).createDashboardAuthToken();
  cliToken = await (await import("@/shared/utils/machineId.js")).getConsistentMachineId("zen-cli-auth");
  generation = await import("@/lib/db/helpers/importGeneration.js");
});

afterEach(() => {
  try {
    adapter?.close();
  } finally {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    for (const event of shutdownEvents) {
      for (const listener of process.rawListeners(event)) {
        if (!previousListeners.get(event).includes(listener)) process.removeListener(event, listener);
      }
    }
    for (const key of globalKeys) {
      if (previousGlobals[key]) Object.defineProperty(global, key, previousGlobals[key]);
      else delete global[key];
    }
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    vi.resetModules();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    adapter = undefined;
  }
});

function request(action, headers = {}) {
  return new NextRequest(`http://localhost:20128${action.pathname}`, { method: action.method, headers });
}

function localHeaders(extra = {}) {
  return {
    "x-zen-peer-token": PEER_TOKEN,
    "x-zen-real-ip": "127.0.0.1",
    origin: "http://localhost:20128",
    ...extra,
  };
}

describe("Headroom host actions use the real local-only guard", () => {
  it.each(actions)("denies an authenticated remote $method $pathname", async action => {
    const response = await guard.proxy(request(action, { cookie: `auth_token=${authToken}` }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/local only/i);
  });

  it.each(actions)("denies remote $method $pathname with login disabled", async action => {
    await db.updateSettings({ requireLogin: false });
    expect((await guard.proxy(request(action))).status).toBe(403);
  });

  it.each(actions)("denies reverse-proxied loopback $method $pathname", async action => {
    await db.updateSettings({ requireLogin: false });
    const response = await guard.proxy(request(action, localHeaders({ "x-zen-via-proxy": "1" })));
    expect(response.status).toBe(403);
  });

  it.each(actions)("denies cross-origin loopback $method $pathname", async action => {
    const response = await guard.proxy(request(action, localHeaders({
      cookie: `auth_token=${authToken}`, origin: "https://untrusted.invalid",
    })));
    expect(response.status).toBe(403);
  });

  it.each(actions)("allows authenticated direct loopback $method $pathname", async action => {
    const response = await guard.proxy(request(action, localHeaders({ cookie: `auth_token=${authToken}` })));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(actions)("allows CLI-authorized $method $pathname", async action => {
    const response = await guard.proxy(request(action, { "x-zen-cli-token": cliToken }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/api/headroom/restart/", "/api/headroom/restart/child", "/api/headroom/extras/", "/api/headroom/extras/child"])(
    "protects canonical descendants at %s", async pathname => {
      expect((await guard.proxy(request({ pathname, method: "POST" }, { cookie: `auth_token=${authToken}` }))).status).toBe(403);
    },
  );

  it("does not classify a similarly named route as a host action", async () => {
    const response = await guard.proxy(request({ pathname: "/api/headroom/restart-other", method: "POST" }, {
      cookie: `auth_token=${authToken}`,
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("onboarding settings and database storage", () => {
  it("persists both enabled and disabled MITM state through trusted settings updates", async () => {
    await db.updateSettings({ mitmEnabled: true, unknownSetting: "must-not-persist" });
    expect(JSON.parse(adapter.get("SELECT data FROM settings WHERE id = 1").data)).toEqual({ mitmEnabled: true });
    expect((await db.getSettings()).mitmEnabled).toBe(true);
    await db.updateSettings({ mitmEnabled: false });
    expect(await db.exportSettings()).toEqual({ mitmEnabled: false });
    expect((await db.getSettings()).mitmEnabled).toBe(false);
  });

  it("keeps MITM enablement out of the generic settings PATCH allowlist", async () => {
    await db.updateSettings({ mitmEnabled: false });
    const { PATCH } = await import("@/app/api/settings/route.js");
    const patch = new NextRequest("http://localhost:20128/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: `auth_token=${authToken}` },
      body: JSON.stringify({ mitmEnabled: true, rtkEnabled: false }),
    });
    expect((await guard.proxy(patch)).headers.get("x-middleware-next")).toBe("1");
    expect((await PATCH(patch)).status).toBe(200);
    expect(await db.getSettings()).toMatchObject({ mitmEnabled: false, rtkEnabled: false });
  });

  it("exports and restores disabled models, replacing stale providers rather than merging", async () => {
    await db.disableModels("openai", ["disabled-a", "disabled-b"]);
    await db.disableModels("anthropic", ["disabled-c"]);
    const backup = JSON.parse(JSON.stringify(await db.exportDb()));
    expect(backup.disabledModels).toEqual({ openai: ["disabled-a", "disabled-b"], anthropic: ["disabled-c"] });

    await db.enableModels("openai");
    await db.enableModels("anthropic");
    await db.disableModels("stale-provider", ["stale-model"]);
    const imported = await db.importDb(backup);

    expect(imported.disabledModels).toEqual({ openai: ["disabled-a", "disabled-b"], anthropic: ["disabled-c"] });
    expect(await db.getDisabledModels()).toEqual({ openai: ["disabled-a", "disabled-b"], anthropic: ["disabled-c"] });
  });

  it("treats an explicit empty disabled-model map as a full replacement", async () => {
    await db.disableModels("openai", ["disabled-a"]);
    await db.importDb({ disabledModels: {} });
    expect(await db.getDisabledModels()).toEqual({});
  });

  it("retains disabled-model choices when importing an older export without that section", async () => {
    await db.disableModels("openai", ["kept-disabled"]);
    await db.importDb({ settings: { requireLogin: true } });
    expect(await db.getDisabledModels()).toEqual({ openai: ["kept-disabled"] });
  });

  it.each([null, [], "not-a-map", { openai: "not-an-array" }].map(disabledModels => ({ disabledModels })))(
    "rejects malformed disabled models $disabledModels without changing existing state", async ({ disabledModels }) => {
      await db.updateSettings({ requireLogin: true });
      await db.disableModels("openai", ["kept-disabled"]);
      const oldGeneration = generation.getDbImportGeneration();

      await expect(db.importDb({ settings: { requireLogin: false }, disabledModels }))
        .rejects.toThrow(/disabled.?models/i);

      expect(await db.getDisabledModels()).toEqual({ openai: ["kept-disabled"] });
      expect((await db.getSettings()).requireLogin).toBe(true);
      expect(generation.getDbImportGeneration()).toBe(oldGeneration);
    },
  );

  it("rolls back disabled-model replacement without advancing generation or publishing aliases", async () => {
    await db.disableModels("openai", ["kept-disabled"]);
    await db.importDb({ mitmAlias: { claude: { chat: "openai/old" } } });
    const oldSettings = await db.exportSettings();
    const oldGeneration = generation.getDbImportGeneration();
    const aliasFile = path.join(process.env.DATA_DIR, "mitm", "aliases.json");
    const oldReplica = fs.readFileSync(aliasFile, "utf8");
    // Fail on a real SQLite constraint after all ordinary entity inserts.
    adapter.exec(`CREATE TRIGGER reject_disabled BEFORE INSERT ON kv
      WHEN NEW.scope = 'disabledModels' AND NEW.key = 'reject'
      BEGIN SELECT RAISE(ABORT, 'disabled model fixture rejected'); END`);

    await expect(db.importDb({
      settings: { requireLogin: false }, mitmAlias: { claude: { chat: "openai/new" } },
      disabledModels: { openai: ["replacement"], reject: ["invalid"] },
    })).rejects.toThrow("disabled model fixture rejected");

    expect(await db.getDisabledModels()).toEqual({ openai: ["kept-disabled"] });
    expect(generation.getDbImportGeneration()).toBe(oldGeneration);
    expect(await db.exportSettings()).toBe(oldSettings);
    expect(fs.readFileSync(aliasFile, "utf8")).toBe(oldReplica);
    expect(await db.getMitmAlias("claude")).toEqual({ chat: "openai/old" });
  });

  it("reports replica failure after committing disabled models and advancing generation", async () => {
    const oldGeneration = generation.getDbImportGeneration();
    // A real filesystem conflict prevents the post-commit alias replica write.
    fs.writeFileSync(path.join(process.env.DATA_DIR, "mitm"), "not-a-directory");

    await expect(db.importDb({ disabledModels: { openai: ["committed-model"] } }))
      .rejects.toMatchObject({ code: "DB_IMPORT_SYNC_FAILED" });

    expect(generation.getDbImportGeneration()).toBe(oldGeneration + 1);
    expect(await db.getDisabledModels()).toEqual({ openai: ["committed-model"] });
  });
});
