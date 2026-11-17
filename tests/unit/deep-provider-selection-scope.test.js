import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_LIMITS } from "open-sse/utils/boundedCache.js";

const state = vi.hoisted(() => ({ connections: [], proxy: {}, settings: {}, generation: 0, remaining: 80, keys: [], releases: [], pending: [] }));
const mocks = vi.hoisted(() => ({ read: vi.fn(), settings: vi.fn(), update: vi.fn(), resolve: vi.fn(), claude: vi.fn(), codex: vi.fn() }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.read, getProviderConnectionById: vi.fn(async () => null), getSettings: mocks.settings,
  updateProviderConnection: mocks.update, getProxyPools: vi.fn(async () => []), validateApiKey: vi.fn(),
}));
vi.mock("@/lib/db/helpers/importGeneration.js", () => ({ getDbImportGeneration: () => state.generation }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: mocks.resolve, pickProxyPoolId: vi.fn() }));
vi.mock("@/shared/constants/providers.js", () => ({ FREE_PROVIDERS: {}, resolveProviderId: provider => ({ cc: "claude", cx: "codex" }[provider] || provider) }));
vi.mock("@/sse/services/antigravityQuota.js", () => ({ getAntigravityModelQuota: () => null, getAntigravityQuotaCache: () => new Map() }));
vi.mock("open-sse/services/usage/claude.js", () => ({ getClaudeUsage: mocks.claude }));
vi.mock("open-sse/services/usage/codex.js", () => ({ getCodexUsage: mocks.codex }));
vi.mock("@/sse/utils/logger.js", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/sse/services/quotaAwareSelection.js", async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, createQuotaSnapshotCache: options => {
    const cache = actual.createQuotaSnapshotCache(options);
    const getOrFetch = cache.getOrFetch;
    return { ...cache, getOrFetch(key, fetcher) { state.keys.push(key); return getOrFetch(key, fetcher); } };
  } };
});

let auth;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T12:00:00.000Z"));
  Object.assign(state, { connections: [], generation: 0, remaining: 80, keys: [], releases: [], pending: [],
    settings: { quotaAwareSelection: true, quotaAwareProviders: ["claude", "codex"], quotaCacheTtlMs: 45_000, fallbackStrategy: "fill-first" },
    proxy: { connectionProxyEnabled: false, connectionProxyUrl: "", connectionNoProxy: "", vercelRelayUrl: "", strictProxy: false, proxyPoolId: null },
  });
  mocks.read.mockImplementation(async ({ provider }) => state.connections.filter(connection => connection.provider === provider));
  mocks.settings.mockImplementation(async () => state.settings);
  mocks.resolve.mockImplementation(async () => ({ ...state.proxy }));
  mocks.update.mockResolvedValue(null);
  mocks.claude.mockImplementation(async () => usage("claude", state.remaining));
  mocks.codex.mockImplementation(async () => usage("codex", state.remaining));
  auth = await import("@/sse/services/auth.js");
});

afterEach(async () => {
  for (const release of state.releases) release();
  await Promise.allSettled(state.pending);
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetModules();
});

function usage(provider, remaining) {
  return { quotas: { [provider === "claude" ? "session (5h)" : "session"]: { remaining: 80, total: 100 },
    weekly: { remaining, total: 100, resetAt: "2026-11-17T13:00:00.000Z" } } };
}

function account(provider = "claude") {
  const result = { provider, id: "shared-synthetic-account", isActive: true, authType: "oauth", accessToken: "synthetic-access-token", refreshToken: "synthetic-refresh-token", idToken: "synthetic-id-token", providerSpecificData: {} };
  state.connections = [result];
  return result;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  state.releases.push(() => resolve([]));
  return { promise, resolve };
}

function select(provider) {
  const result = auth.getProviderCredentials(provider);
  state.pending.push(result);
  return result;
}

async function microtasks() { for (let i = 0; i < 32; i++) await Promise.resolve(); }

describe("provider selection retains only live per-provider promise tails", () => {
  it("does not let completed provider churn evict a provider whose selection is still running", async () => {
    const gate = deferred();
    let active = 0, maximum = 0, calls = 0;
    mocks.read.mockImplementation(async ({ provider }) => {
      if (provider !== "selection-held") return [];
      calls++; active++; maximum = Math.max(maximum, active);
      try { return await gate.promise; } finally { active--; }
    });
    const first = select("selection-held");
    await microtasks();
    expect(calls).toBe(1);
    for (let i = 0; i <= CACHE_LIMITS.providerMutexes; i++) await select(`selection-completed-${i}`);
    const second = select("selection-held");
    await microtasks();
    expect(calls).toBe(1);
    gate.resolve([]);
    await Promise.all([first, second]);
    expect(calls).toBe(2);
    expect(maximum).toBe(1);
  });

  it("drops a completed tail instead of retaining every historical provider ID", async () => {
    const set = Map.prototype.set;
    let observed;
    const spy = vi.spyOn(Map.prototype, "set").mockImplementation(function (key, value) {
      if (key === "selection-cleanup" && value instanceof Promise) observed = this;
      return set.call(this, key, value);
    });
    await select("selection-cleanup");
    spy.mockRestore();
    expect(observed).toBeInstanceOf(Map);
    expect(observed.has("selection-cleanup")).toBe(false);
    expect(auth.getProviderSelectionCacheMetrics().activeProviders).toBe(0);
  });

  it("keeps a later queued tail when an earlier call releases and lets other providers proceed independently", async () => {
    const firstGate = deferred(), secondGate = deferred();
    let calls = 0;
    mocks.read.mockImplementation(async ({ provider }) => {
      if (provider !== "selection-queued") return [];
      calls++;
      return calls === 1 ? firstGate.promise : calls === 2 ? secondGate.promise : [];
    });
    const first = select("selection-queued");
    const second = select("selection-queued");
    await microtasks();
    expect(calls).toBe(1);
    expect(await select("selection-independent")).toBeNull();
    firstGate.resolve([]);
    await first;
    await microtasks();
    expect(calls).toBe(2);
    const third = select("selection-queued");
    await microtasks();
    expect(calls).toBe(2);
    secondGate.resolve([]);
    await Promise.all([second, third]);
    expect(calls).toBe(3);
    expect(auth.getProviderSelectionCacheMetrics().activeProviders).toBe(0);
  });

  it("serializes aliases of the same provider and releases after a failed database read", async () => {
    const gate = deferred();
    let calls = 0;
    mocks.read.mockImplementation(async () => {
      if (++calls === 1) { await gate.promise; throw new Error("synthetic database failure"); }
      return [];
    });
    const first = select("cc");
    const rejected = expect(first).rejects.toThrow("synthetic database failure");
    const second = select("claude");
    await microtasks();
    expect(calls).toBe(1);
    gate.resolve([]);
    await rejected;
    expect(await second).toBeNull();
    expect(calls).toBe(2);
    expect(auth.getProviderSelectionCacheMetrics().activeProviders).toBe(0);
  });
});

describe("quota routing snapshots belong to a complete credential and transport scope", () => {
  it.each([
    ["access token", row => { row.accessToken = "synthetic-new-access"; }],
    ["refresh token", row => { row.refreshToken = "synthetic-new-refresh"; }],
    ["ID token", row => { row.idToken = "synthetic-new-id-token"; }],
    ["API key", row => { row.apiKey = "synthetic-new-api-key"; }],
    ["auth type", row => { row.authType = "apikey"; }],
    ["project identity", row => { row.projectId = "synthetic-new-project"; }],
    ["account identity", row => { row.providerSpecificData.chatgptAccountId = "synthetic-new-account"; }],
    ["organization identity", row => { row.providerSpecificData.organizationId = "synthetic-new-organization"; }],
  ])("does not reuse exhausted quota after the %s changes under the same connection ID", async (_name, change) => {
    const row = account();
    state.remaining = 0;
    expect(await select("claude")).toMatchObject({ allRateLimited: true });
    change(row);
    state.remaining = 80;
    expect(await select("claude")).toMatchObject({ connectionId: row.id });
    expect(mocks.claude).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["enabled flag", { connectionProxyEnabled: true }],
    ["proxy URL", { connectionProxyEnabled: true, connectionProxyUrl: "http://synthetic-user:synthetic-password@proxy.invalid:8080" }],
    ["no-proxy list", { connectionNoProxy: "example.invalid" }],
    ["strict flag", { strictProxy: true }],
    ["relay URL", { vercelRelayUrl: "https://relay.example.invalid/path" }],
    ["resolved pool identity", { proxyPoolId: "synthetic-replaced-pool" }],
  ])("does not reuse exhausted quota after a resolved %s change", async (_name, policy) => {
    const row = account();
    state.remaining = 0;
    expect(await select("claude")).toMatchObject({ allRateLimited: true });
    Object.assign(state.proxy, policy);
    state.remaining = 80;
    expect(await select("claude")).toMatchObject({ connectionId: row.id });
    expect(mocks.claude).toHaveBeenCalledTimes(2);
  });

  it("separates Claude and Codex account scopes even if a connection ID and proof are reused", async () => {
    const row = account();
    state.remaining = 0;
    expect(await select("claude")).toMatchObject({ allRateLimited: true });
    row.provider = "codex";
    state.remaining = 80;
    expect(await select("codex")).toMatchObject({ connectionId: row.id });
    expect(mocks.codex).toHaveBeenCalledTimes(1);
  });

  it("keeps unchanged scope warm without exposing credential or proxy material in retained keys or metrics", async () => {
    account();
    state.proxy.connectionProxyUrl = "http://synthetic-proxy-secret@proxy.invalid:8080";
    expect(await select("claude")).toMatchObject({ connectionId: "shared-synthetic-account" });
    expect(await select("cc")).toMatchObject({ connectionId: "shared-synthetic-account" });
    expect(mocks.claude).toHaveBeenCalledTimes(1);
    expect(state.keys.length).toBe(2);
    for (const key of state.keys) {
      expect(key).toMatch(/^[a-f\d]{64}$/);
      expect(key).not.toContain("synthetic-access-token");
      expect(key).not.toContain("synthetic-proxy-secret");
    }
    const metrics = auth.getProviderSelectionCacheMetrics();
    expect(metrics).toEqual({ activeProviders: 0, quotaScopes: 1 });
    expect(JSON.stringify(metrics)).not.toContain("synthetic");
  });

  it("bounds retained TTL/proof generations instead of leaking one cache for each settings change", async () => {
    account();
    const set = Map.prototype.set;
    let observed;
    const spy = vi.spyOn(Map.prototype, "set").mockImplementation(function (key, value) {
      if (typeof value?.getOrFetch === "function") observed = this;
      return set.call(this, key, value);
    });
    for (let i = 0; i <= CACHE_LIMITS.usageCache + 10; i++) {
      state.settings.quotaCacheTtlMs = 100_000 + i;
      await select("claude");
    }
    spy.mockRestore();
    expect(observed).toBeInstanceOf(Map);
    expect(observed.size).toBeLessThanOrEqual(CACHE_LIMITS.usageCache);
    expect(auth.getProviderSelectionCacheMetrics().quotaScopes).toBeLessThanOrEqual(CACHE_LIMITS.usageCache);
  });

  it("bounds changing proofs even when the configured TTL is constant", async () => {
    const row = account();
    for (let i = 0; i <= CACHE_LIMITS.usageCache + 10; i++) {
      row.accessToken = `synthetic-rotated-${i}`;
      await select("claude");
    }
    expect(mocks.claude).toHaveBeenCalledTimes(CACHE_LIMITS.usageCache + 11);
    expect(auth.getProviderSelectionCacheMetrics().quotaScopes).toBeLessThanOrEqual(CACHE_LIMITS.usageCache);
  });

  it("invalidates unchanged proof scopes when the database import generation changes", async () => {
    const row = account();
    state.remaining = 0;
    expect(await select("claude")).toMatchObject({ allRateLimited: true });
    state.generation++;
    state.remaining = 80;
    expect(await select("claude")).toMatchObject({ connectionId: row.id });
    expect(mocks.claude).toHaveBeenCalledTimes(2);
    expect(auth.getProviderSelectionCacheMetrics().quotaScopes).toBe(1);
  });

  it("discards an old in-flight quota result after import and does not publish it into the new scope", async () => {
    account();
    const gate = deferred();
    mocks.claude.mockImplementationOnce(() => gate.promise);
    const pending = select("claude");
    await microtasks();
    expect(mocks.claude).toHaveBeenCalledTimes(1);
    state.generation++;
    gate.resolve(usage("claude", 0));
    expect(await pending).toMatchObject({ connectionId: "shared-synthetic-account" });
    expect(await select("claude")).toMatchObject({ connectionId: "shared-synthetic-account" });
    expect(mocks.claude).toHaveBeenCalledTimes(2);
    expect(auth.getProviderSelectionCacheMetrics().quotaScopes).toBe(1);
  });
});
