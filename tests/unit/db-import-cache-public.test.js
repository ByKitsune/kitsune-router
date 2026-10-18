import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const globalKeys = [
  Symbol.for("zenrouter.db.importState"),
  "fetch", "__mitmBypassCooldown", "_dbAdapter", "_pendingRequests", "_lastErrorProvider",
  "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
  "__mitmSudoPassword",
];
const envKeys = [
  "HOME", "DATA_DIR", "JWT_SECRET", "INITIAL_PASSWORD", "DISABLE_MITM_BYPASS",
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  "ZENROUTER_PROXY_MANAGED", "ZENROUTER_PROXY_URL", "ZENROUTER_NO_PROXY",
  "NINE_ROUTER_PROXY_MANAGED", "NINE_ROUTER_PROXY_URL", "NINE_ROUTER_NO_PROXY",
];

let root;
let previousGlobals;
let previousEnv;
let previousListeners;
let db;
let aliases;
let declared;
let live;
let replica;
let projects;
let modelsGet;
let databasePost;
let authToken;
let server;
let serve;
let version;
let releases;

function payload(stage) {
  return {
    settings: { requireApiKey: true, outboundProxyEnabled: false },
    apiKeys: [{ id: `admin-${stage}`, key: `sk-test-admin-${stage}`, isActive: true }],
    providerConnections: [{ id: "import-connection", provider: "openai", authType: "apikey", apiKey: `provider-${stage}`, isActive: true }],
    customModels: [
      { providerAlias: "openai", id: "import-declared", type: "llm", caps: { vision: stage === "new" } },
      { providerAlias: "openai", id: `import-custom-${stage}`, type: "llm" },
    ],
    modelAliases: { "import-alias": `openai/import-alias-${stage}` },
    combos: [{ id: "import-combo", name: `import-combo-${stage}`, models: [`openai/import-custom-${stage}`] }],
    mitmAlias: { claude: { chat: `openai/import-custom-${stage}` } },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  releases.push(resolve);
  return { promise, resolve };
}

function pauseSnapshot(object, method) {
  const reached = deferred();
  const release = deferred();
  const original = object[method];
  // Keep the real repository read, then suspend delivery of that old snapshot.
  vi.spyOn(object, method).mockImplementationOnce(async (...args) => {
    const value = await original(...args);
    reached.resolve();
    await release.promise;
    return value;
  });
  return { reached: reached.promise, release: release.resolve };
}

function holdUpstream(matches = () => true) {
  const reached = deferred();
  const release = deferred();
  const original = serve;
  let held = false;
  serve = async (request, response, body) => {
    if (!held && matches(request)) {
      held = true;
      reached.resolve();
      await release.promise;
    }
    return original(request, response, body);
  };
  return { reached: reached.promise, release: release.resolve };
}

async function postImport(next = payload("new")) {
  const keys = await db.getApiKeys();
  return databasePost(new NextRequest("http://localhost/api/settings/database", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${keys[0].key}`, Cookie: `auth_token=${authToken}` },
    body: JSON.stringify({ password: "import-fixture-password", ...next }),
  }));
}

async function modelList() {
  const response = await modelsGet();
  expect(response.status).toBe(200);
  return (await response.json()).data;
}

async function aliasFile() {
  return JSON.parse(await readFile(join(root, "data", "mitm", "aliases.json"), "utf8"));
}

function quotaPayload(provider, stage) {
  return {
    ...payload(stage),
    providerConnections: [{
      id: "import-connection", provider, authType: "oauth", accessToken: `quota-${stage}`,
      isActive: true, providerSpecificData: { projectId: "fixture-project" },
    }],
  };
}

function serveQuotas(oldRemaining = 0) {
  const credentialsRequested = [];
  serve = (request, response) => {
    const token = request.headers.authorization;
    credentialsRequested.push(token);
    const remaining = token === "Bearer quota-old" ? oldRemaining : 1;
    const resetAt = new Date(Date.now() + 3600000).toISOString();
    let body;
    if (request.url.endsWith("/wham/usage")) {
      body = { rate_limit: { secondary_window: { used_percent: (1 - remaining) * 100, reset_at: Date.parse(resetAt) / 1000 } } };
    } else if (request.url.endsWith(":loadCodeAssist")) {
      body = { cloudaicompanionProject: "fixture-project" };
    } else if (request.url.endsWith(":fetchAvailableModels")) {
      body = { models: { "claude-sonnet-4-6": { quotaInfo: { remainingFraction: remaining, resetTime: resetAt } } } };
    } else if (request.url.endsWith(":retrieveUserQuotaSummary")) {
      body = {};
    } else {
      throw new Error(`Unexpected quota request: ${request.url}`);
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  return credentialsRequested;
}

beforeEach(async () => {
  previousGlobals = Object.fromEntries(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  previousListeners = new Map(shutdownEvents.map(event => [event, process.rawListeners(event)]));
  root = await mkdtemp(join(tmpdir(), "zenrouter-import-public-"));
  for (const key of envKeys) delete process.env[key];
  process.env.HOME = join(root, "home");
  process.env.DATA_DIR = join(root, "data");
  process.env.JWT_SECRET = "db-import-regression-fixture-secret-20261019";
  process.env.INITIAL_PASSWORD = "import-fixture-password";
  process.env.DISABLE_MITM_BYPASS = "1";
  await mkdir(process.env.HOME);
  for (const key of globalKeys) if (key !== "fetch") delete global[key];
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
  releases = [];
  version = "old";
  serve = (_request, response, body) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  server = createServer((request, response) => {
    const body = request.url.includes("loadCodeAssist")
      ? { cloudaicompanionProject: `project-${version}` }
      : { data: [{ id: `import-live-${version}`, context_window: 64000, capabilities: { vision: version === "new" } }] };
    Promise.resolve(serve(request, response, body)).catch(error => response.destroy(error));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const upstream = `http://127.0.0.1:${server.address().port}`;
  const fetch = previousGlobals.fetch.value;
  // Only remap the network boundary. Catalog parsing, cache and SQLite stay real.
  const loopbackFetch = (url, options) => {
    const target = new URL(url);
    if (target.hostname !== "api.openai.com" && target.hostname !== "chatgpt.com" && !target.hostname.endsWith(".googleapis.com")) {
      throw new Error(`Unexpected upstream: ${target.origin}`);
    }
    return fetch(`${upstream}${target.pathname}${target.search}`, options);
  };
  global.fetch = loopbackFetch;
  db = await import("@/lib/db/index.js");
  aliases = await import("@/lib/db/repos/aliasRepo.js");
  declared = await import("open-sse/providers/declaredCaps.js");
  live = await import("@/shared/utils/providerLiveModels.js");
  replica = await import("@/lib/mitmAliasCache.js");
  projects = await import("open-sse/services/projectId.js");
  ({ GET: modelsGet } = await import("@/app/api/v1/models/route.js"));
  ({ POST: databasePost } = await import("@/app/api/settings/database/route.js"));
  global.fetch = loopbackFetch;
  await db.importDb(payload("old"));
  await replica.syncToJson();
  authToken = await (await import("@/lib/auth/dashboardSession.js")).createDashboardAuthToken();
});

afterEach(async () => {
  try {
    for (const release of releases || []) release();
    projects?.stopCacheCleanup();
    for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
    await global._dbAdapter?.instance?.close();
    server?.closeAllConnections();
    if (server) await new Promise(resolve => server.close(resolve));
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const event of shutdownEvents) {
      const existing = [...previousListeners.get(event)];
      for (const listener of process.rawListeners(event)) {
        const index = existing.indexOf(listener);
        if (index === -1) process.removeListener(event, listener);
        else existing.splice(index, 1);
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
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("public database import consistency", () => {
  it("refreshes warmed runtime declarations before responding successfully", async () => {
    expect(await declared.getDeclaredModelCaps("openai", "import-declared")).toEqual({ vision: false });

    expect((await postImport()).status).toBe(200);

    expect(await declared.getDeclaredModelCaps("openai", "import-declared")).toEqual({ vision: true });
    expect(await declared.getDeclaredModelCaps("openai", "import-custom-old")).toBeUndefined();
    expect(await db.validateApiKey("sk-test-admin-old")).toBe(false);
    expect(await db.validateApiKey("sk-test-admin-new")).toBe(true);
  });

  it("refreshes a warmed models response including aliases and combos", async () => {
    expect((await modelList()).map(model => model.id)).toContain("import-combo-old");
    version = "new";

    expect((await postImport()).status).toBe(200);

    const models = await modelList();
    const ids = models.map(model => model.id);
    expect(ids).toEqual(expect.arrayContaining(["import-combo-new", "openai/import-custom-new", "openai/import-alias-new", "openai/import-live-new"]));
    expect(ids).not.toContain("import-combo-old");
    expect(ids).not.toContain("openai/import-custom-old");
    expect(ids).not.toContain("openai/import-live-old");
    expect(models.find(model => model.id === "openai/import-declared").capabilities.vision).toBe(true);
  });

  it("refreshes a warmed live catalog even when the imported credential is unchanged", async () => {
    expect((await live.fetchProviderLiveModels("openai", "provider-old"))[0].id).toBe("import-live-old");
    version = "new";
    const next = payload("new");
    next.providerConnections[0].apiKey = "provider-old";

    expect((await postImport(next)).status).toBe(200);

    expect((await live.fetchProviderLiveModels("openai", "provider-old"))[0].id).toBe("import-live-new");
  });

  it("publishes imported aliases to the standalone MITM file before success", async () => {
    expect(await aliasFile()).toEqual({ claude: { chat: "openai/import-custom-old" } });

    expect((await postImport()).status).toBe(200);

    expect(await aliasFile()).toEqual({ claude: { chat: "openai/import-custom-new" } });
  });

  it("keeps warmed public snapshots and the alias file when the transaction rolls back", async () => {
    const caps = await declared.getDeclaredModelCaps("openai", "import-declared");
    const models = await modelList();
    const catalog = await live.fetchProviderLiveModels("openai", "provider-old");
    version = "new";

    const response = await postImport({ ...payload("new"), combos: [{ id: "bad", name: null }] });

    expect(response.status).toBe(400);
    expect(await declared.getDeclaredModelCaps("openai", "import-declared")).toBe(caps);
    expect(await modelList()).toEqual(models);
    expect(await live.fetchProviderLiveModels("openai", "provider-old")).toBe(catalog);
    expect(await aliasFile()).toEqual({ claude: { chat: "openai/import-custom-old" } });
    expect(await db.validateApiKey("sk-test-admin-old")).toBe(true);
  });

  it("does not publish declarations from a pre-import SQLite snapshot that completes later", async () => {
    const pause = pauseSnapshot(aliases, "getCustomModels");
    const oldRead = declared.getDeclaredModelCaps("openai", "import-declared");
    await pause.reached;

    expect((await postImport()).status).toBe(200);
    // A new reader must not wait for the obsolete in-flight load.
    expect(await declared.getDeclaredModelCaps("openai", "import-declared")).toEqual({ vision: true });
    pause.release();
    expect(await oldRead).toEqual({ vision: true });
    expect(await declared.getDeclaredModelCaps("openai", "import-declared")).toEqual({ vision: true });
  });

  it("rebuilds an in-flight models response after import instead of caching its old catalog", async () => {
    const pause = holdUpstream();
    const oldResponse = modelsGet();
    await pause.reached;
    version = "new";

    expect((await postImport()).status).toBe(200);
    const current = await modelList();
    pause.release();
    const completed = await (await oldResponse).json();

    expect(current.map(model => model.id)).toContain("openai/import-live-new");
    expect(completed.data.map(model => model.id)).toContain("import-combo-new");
    expect(completed.data.map(model => model.id)).not.toContain("openai/import-live-old");
    expect(await modelList()).toEqual(current);
  });

  it("discards a live response fetched with pre-import credentials", async () => {
    const pause = holdUpstream();
    const oldRead = live.fetchProviderLiveModels("openai", "provider-old");
    await pause.reached;
    version = "new";

    expect((await postImport()).status).toBe(200);
    expect((await live.fetchProviderLiveModels("openai", "provider-new"))[0].id).toBe("import-live-new");
    pause.release();

    expect(await oldRead).toBeNull();
    expect((await live.fetchProviderLiveModels("openai", "provider-new"))[0].id).toBe("import-live-new");
  });

  it("isolates a late old-credential catalog request from the imported credential", async () => {
    expect((await postImport()).status).toBe(200);
    expect((await live.fetchProviderLiveModels("openai", "provider-old"))[0].id).toBe("import-live-old");
    version = "new";

    expect((await live.fetchProviderLiveModels("openai", "provider-new"))[0].id).toBe("import-live-new");
  });

  it("keeps the new alias file when an older full-file synchronization finishes later", async () => {
    const pause = pauseSnapshot(aliases, "getMitmAlias");
    const oldSync = replica.syncToJson();
    await pause.reached;

    expect((await postImport()).status).toBe(200);
    pause.release();
    await oldSync;

    expect(await aliasFile()).toEqual({ claude: { chat: "openai/import-custom-new" } });
  });

  it("evicts project metadata for replaced connection credentials using the lifecycle hook", async () => {
    expect(await projects.getProjectIdForConnection("import-connection", "old-token")).toBe("project-old");
    version = "new";

    expect((await postImport()).status).toBe(200);

    expect(await projects.getProjectIdForConnection("import-connection", "new-token")).toBe("project-new");
  });

  it("cancels an old in-flight project lookup instead of reusing it after import", async () => {
    const pause = holdUpstream();
    const oldRead = projects.getProjectIdForConnection("import-connection", "old-token");
    await pause.reached;
    version = "new";

    expect((await postImport()).status).toBe(200);
    const currentRead = projects.getProjectIdForConnection("import-connection", "new-token");
    pause.release();

    expect(await oldRead).toBeNull();
    expect(await currentRead).toBe("project-new");
  });

  it("does not report success if committed aliases cannot be published", async () => {
    const manager = await import("@/mitm/manager.js");
    manager.setCachedPassword("old-sudo-password");
    await rm(join(root, "data", "mitm", "aliases.json"));
    await mkdir(join(root, "data", "mitm", "aliases.json"));

    const response = await postImport();

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/imported.*synchroniz/i);
    expect(await db.getMitmAlias("claude")).toEqual({ chat: "openai/import-custom-new" });
    expect(manager.getCachedPassword()).toBeNull();
  });

  it("clears cached sudo credentials after settings are replaced", async () => {
    const manager = await import("@/mitm/manager.js");
    manager.setCachedPassword("old-sudo-password");

    expect((await postImport()).status).toBe(200);

    expect(manager.getCachedPassword()).toBeNull();
  });

  it("keeps cached sudo credentials when the transaction rolls back", async () => {
    const manager = await import("@/mitm/manager.js");
    manager.setCachedPassword("old-sudo-password");

    expect((await postImport({ ...payload("new"), combos: [{ id: "bad", name: null }] })).status).toBe(400);

    expect(manager.getCachedPassword()).toBe("old-sudo-password");
  });
});

describe("imported same-ID quota credentials", () => {
  it("selects the imported Codex credential immediately despite a warmed exhausted snapshot", async () => {
    const { getProviderCredentials } = await import("@/sse/services/auth.js");
    const requests = serveQuotas();
    await db.importDb(quotaPayload("codex", "old"));
    expect(await getProviderCredentials("codex", null, "quota-model")).toMatchObject({ allRateLimited: true });

    expect((await postImport(quotaPayload("codex", "new"))).status).toBe(200);

    expect(await getProviderCredentials("codex", null, "quota-model")).toMatchObject({ accessToken: "quota-new" });
    expect(requests).toEqual(["Bearer quota-old", "Bearer quota-new"]);
  });

  it("does not republish a delayed exhausted Codex snapshot after import", async () => {
    const { getProviderCredentials } = await import("@/sse/services/auth.js");
    const requests = serveQuotas();
    await db.importDb(quotaPayload("codex", "old"));
    const pause = holdUpstream();
    const oldRead = getProviderCredentials("codex", null, "quota-model");
    await pause.reached;

    expect((await postImport(quotaPayload("codex", "new"))).status).toBe(200);
    pause.release();
    await oldRead;

    expect(await getProviderCredentials("codex", null, "quota-model")).toMatchObject({ accessToken: "quota-new" });
    expect(requests).toEqual(["Bearer quota-old", "Bearer quota-new"]);
  });

  it.each(["codex", "antigravity"])("preserves the %s exhausted quota on transaction rollback", async provider => {
    const { getProviderCredentials } = await import("@/sse/services/auth.js");
    const ag = await import("@/sse/services/antigravityQuota.js");
    serveQuotas();
    await db.importDb(quotaPayload(provider, "old"));
    if (provider === "antigravity") await ag.refreshAntigravityQuota("import-connection", "quota-old");
    expect(await getProviderCredentials(provider, null, "claude-sonnet-4-6")).toMatchObject({ allRateLimited: true });
    const newRequests = serveQuotas(1);

    expect((await postImport({ ...quotaPayload(provider, "new"), combos: [{ id: "bad", name: null }] })).status).toBe(400);

    expect(await db.getProviderConnectionById("import-connection")).toMatchObject({ accessToken: "quota-old" });
    expect(await getProviderCredentials(provider, null, "claude-sonnet-4-6")).toMatchObject({ allRateLimited: true });
    expect(newRequests).toEqual([]);
  });

  it("clears Antigravity exhaustion and its refresh throttle for imported credentials", async () => {
    const { getProviderCredentials } = await import("@/sse/services/auth.js");
    const ag = await import("@/sse/services/antigravityQuota.js");
    serveQuotas();
    await db.importDb(quotaPayload("antigravity", "old"));
    await ag.refreshAntigravityQuota("import-connection", "quota-old");
    expect(await getProviderCredentials("antigravity", null, "claude-sonnet-4-6")).toMatchObject({ allRateLimited: true });

    expect((await postImport(quotaPayload("antigravity", "new"))).status).toBe(200);

    expect(await getProviderCredentials("antigravity", null, "claude-sonnet-4-6")).toMatchObject({ accessToken: "quota-new" });
    expect(await ag.refreshAntigravityQuota("import-connection", "quota-new")).toMatchObject({
      "claude-sonnet-4-6": { remainingPercentage: 100 },
    });
  });

  it("keeps the new Antigravity refresh pending when an older refresh finishes", async () => {
    const ag = await import("@/sse/services/antigravityQuota.js");
    serveQuotas();
    await db.importDb(quotaPayload("antigravity", "old"));
    const oldPause = holdUpstream(request => request.url.endsWith(":fetchAvailableModels"));
    const oldRead = ag.refreshAntigravityQuota("import-connection", "quota-old");
    await oldPause.reached;

    expect((await postImport(quotaPayload("antigravity", "new"))).status).toBe(200);
    const newPause = holdUpstream(request => request.headers.authorization === "Bearer quota-new");
    const newRead = ag.refreshAntigravityQuota("import-connection", "quota-new");
    // Release the old request even on the broken implementation, which still deduplicates it.
    oldPause.release();
    expect(await oldRead).toBeNull();
    await newPause.reached;
    const concurrentRead = ag.refreshAntigravityQuota("import-connection", "quota-new");
    newPause.release();

    const current = await newRead;
    expect(current).toMatchObject({ "claude-sonnet-4-6": { remainingPercentage: 100 } });
    expect(await concurrentRead).toBe(current);
    expect(ag.getAntigravityQuotaCache().get("import-connection")).toBe(current);
  });

  it("clears Antigravity strike blocks on import without carrying them into the new quota", async () => {
    const { getProviderCredentials } = await import("@/sse/services/auth.js");
    const ag = await import("@/sse/services/antigravityQuota.js");
    serveQuotas(1);
    await db.importDb(quotaPayload("antigravity", "old"));
    for (let i = 0; i < 3; i++) await ag.handleAntigravityQuotaError("import-connection", 429, "claude-sonnet-4-6", "quota-old");
    expect(ag.getAntigravityStrikeInfo().blocks.size).toBe(1);
    expect(await getProviderCredentials("antigravity", null, "claude-sonnet-4-6")).toMatchObject({ allRateLimited: true });

    expect((await postImport(quotaPayload("antigravity", "new"))).status).toBe(200);

    expect(ag.getAntigravityStrikeInfo().blocks.size).toBe(0);
    expect(await ag.refreshAntigravityQuota("import-connection", "quota-new")).toMatchObject({
      "claude-sonnet-4-6": { remainingPercentage: 100 },
    });
    expect(await getProviderCredentials("antigravity", null, "claude-sonnet-4-6")).toMatchObject({ accessToken: "quota-new" });
  });

  it("does not count pre-import Antigravity errors as strikes against imported credentials", async () => {
    const ag = await import("@/sse/services/antigravityQuota.js");
    serveQuotas(1);
    await db.importDb(quotaPayload("antigravity", "old"));
    const pause = holdUpstream();
    const oldErrors = Array.from({ length: 3 }, () => ag.handleAntigravityQuotaError("import-connection", 429, "claude-sonnet-4-6", "quota-old"));
    await pause.reached;

    expect((await postImport(quotaPayload("antigravity", "new"))).status).toBe(200);
    pause.release();
    expect(await Promise.all(oldErrors)).toEqual([null, null, null]);

    expect(ag.getAntigravityStrikeInfo().counts.size).toBe(0);
    expect(ag.getAntigravityStrikeInfo().blocks.size).toBe(0);
    expect(ag.getAntigravityQuotaCache().size).toBe(0);
  });
});
