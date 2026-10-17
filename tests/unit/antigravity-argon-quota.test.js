import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  proxyAwareFetch: vi.fn(),
  getProviderConnections: vi.fn(),
  getSettings: vi.fn(),
  getProxyPoolById: vi.fn(),
}));

// Only external I/O is replaced: usage parsing, proxy resolution, quota refresh,
// circuit breaking, and account selection run together against synthetic data.
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.proxyAwareFetch }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: io.getProviderConnections,
  getSettings: io.getSettings,
  getProxyPools: vi.fn(),
  validateApiKey: vi.fn(),
  updateProviderConnection: vi.fn(),
}));
vi.mock("@/models", () => ({ getProxyPoolById: io.getProxyPoolById }));

import { getUsageForProvider } from "../../open-sse/services/usage.js";
import {
  clearAntigravityStrikes,
  getAntigravityQuotaCache,
  getAntigravityStrikeInfo,
  handleAntigravityQuotaError,
  refreshAntigravityQuota,
} from "@/sse/services/antigravityQuota.js";
import { getProviderCredentials } from "@/sse/services/auth.js";

const NOW = "2026-10-18T00:00:00.000Z";
const SESSION_RESET = "2026-10-18T02:00:00.000Z";
const WEEKLY_RESET = "2026-10-23T09:42:31.000Z";
const ARGON = "gemini-4-argon-medium";
const GEMINI = "gemini-3.8-flash-medium";
const CLAUDE = "claude-opus-5-5-high";
const connection = { provider: "antigravity", accessToken: "synthetic-access-token" };
let fixture;
let sequence = 0;
const nextId = () => `argon-fixture-${++sequence}`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function model(remainingFraction, resetTime = SESSION_RESET) {
  return { quotaInfo: { remainingFraction, resetTime } };
}

function group(displayName, remainingFraction, window = "weekly", resetTime = WEEKLY_RESET) {
  return {
    displayName,
    buckets: [{
      bucketId: `${displayName.includes("Argon") ? "gemini-argon-wtu" : displayName.includes("Claude") ? "claude-gpt" : "gemini"}-${window}`,
      remainingFraction,
      resetTime,
      window,
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  getAntigravityQuotaCache().clear();
  io.getSettings.mockResolvedValue({});
  io.getProxyPoolById.mockResolvedValue(null);
  io.getProviderConnections.mockResolvedValue([]);
  fixture = {
    models: { [ARGON]: model(0.8), [GEMINI]: model(0.6), [CLAUDE]: model(0.7) },
    summary: { groups: [] },
    summaryStatus: 200,
    modelStatus: 200,
  };
  io.proxyAwareFetch.mockImplementation(async (url, options, proxyOptions) => {
    if (fixture.checkTransport) fixture.checkTransport(url, options, proxyOptions);
    if (url.endsWith(":loadCodeAssist")) {
      return json({ cloudaicompanionProject: { id: "synthetic-project" }, currentTier: { name: "Pro" } });
    }
    if (url.endsWith(":fetchAvailableModels")) return json({ models: fixture.models }, fixture.modelStatus);
    if (url.endsWith(":retrieveUserQuotaSummary")) {
      if (fixture.summaryError) throw new Error("synthetic summary unavailable");
      if (fixture.invalidSummaryJson) return new Response("invalid-json");
      return json(fixture.summary, fixture.summaryStatus);
    }
    throw new Error(`Unexpected transport endpoint: ${url}`);
  });
});

afterEach(() => vi.useRealTimers());

describe("Antigravity Argon usage API", () => {
  it("discovers all four Argon aliases and independent weekly quotas through the existing usage API", async () => {
    fixture.models = {
      "gemini-4-argon-high": model(0.4),
      "gemini-4-argon-medium": model(0.7),
      "gemini-4-argon-low": model(0.9),
      "gemini-4-argon": model(0.7),
      [GEMINI]: model(0.6),
      [CLAUDE]: model(0.8),
      "internal-model": { ...model(0.9), isInternal: true },
      "unregistered-model": model(0.9),
    };
    fixture.summary = { groups: [group("Gemini 4 Argon", 0.98), group("Gemini Models", 0.75), group("Claude and GPT Models", 0.65)] };

    const usage = await getUsageForProvider(connection);

    expect(usage.plan).toBe("Pro");
    expect(usage.quotas).toMatchObject({
      "gemini-4-argon-high": { used: 600, total: 1000, remainingPercentage: 40 },
      "gemini-4-argon-medium": { used: 300, total: 1000, remainingPercentage: 70 },
      "gemini-4-argon-low": { used: 100, total: 1000, remainingPercentage: 90 },
      "gemini-4-argon": { used: 300, total: 1000, remainingPercentage: 70 },
      argon_weekly: { used: 20, total: 1000, remainingPercentage: 98, resetAt: WEEKLY_RESET, displayName: "Gemini 4 Argon (Weekly)" },
      gemini_weekly: { remainingPercentage: 75 },
      claude_gpt_weekly: { remainingPercentage: 65 },
    });
    expect(usage.quotas).not.toHaveProperty("argon_session");
    expect(usage.quotas).not.toHaveProperty("internal-model");
    expect(usage.quotas).not.toHaveProperty("unregistered-model");
  });

  it.each([false, true])("lets an explicit Argon bucket override its generic Gemini group (nested=%s)", async nested => {
    const summary = { groups: [{
      displayName: "Gemini Models",
      buckets: [...group("Gemini 4 Argon", 0).buckets, ...group("Gemini Models", 0.8).buckets],
    }] };
    fixture.summary = nested ? { quotaSummary: summary } : summary;
    const usage = await getUsageForProvider(connection);
    expect(usage.quotas.argon_weekly).toMatchObject({ remainingPercentage: 0, resetAt: WEEKLY_RESET });
    expect(usage.quotas.gemini_weekly).toMatchObject({ remainingPercentage: 80 });
  });

  it("reads nested summaries and emits a session window only for an actual session bucket", async () => {
    fixture.summary = { quotaSummary: { groups: [
      { ...group("Gemini 4 Argon", 0.98), buckets: [
        ...group("Gemini 4 Argon", 0.98).buckets,
        ...group("Gemini 4 Argon", 0.25, "session", SESSION_RESET).buckets,
      ] },
    ] } };

    const usage = await getUsageForProvider(connection);

    expect(usage.quotas.argon_weekly).toMatchObject({ remainingPercentage: 98, resetAt: WEEKLY_RESET });
    expect(usage.quotas.argon_session).toMatchObject({ remainingPercentage: 25, resetAt: SESSION_RESET, displayName: "Gemini 4 Argon (Session)" });
    expect(usage.quotas).not.toHaveProperty("gemini_session");
  });

  it("keeps explicit zero but never turns missing or invalid model fractions into exhaustion", async () => {
    fixture.models = {
      "gemini-4-argon-high": model(0),
      "gemini-4-argon-medium": model(undefined),
      "gemini-4-argon-low": model("invalid"),
      "gemini-4-argon": model(null),
      [GEMINI]: model("0.6"),
    };
    fixture.summary = { groups: [group("Gemini 4 Argon", null), group("Gemini Models", 0)] };

    const usage = await getUsageForProvider(connection);

    expect(usage.quotas["gemini-4-argon-high"]).toMatchObject({ used: 1000, total: 1000, remainingPercentage: 0 });
    expect(usage.quotas[GEMINI]).toMatchObject({ remainingPercentage: 60 });
    expect(usage.quotas.gemini_weekly).toMatchObject({ remainingPercentage: 0 });
    expect(usage.quotas).not.toHaveProperty("gemini-4-argon-medium");
    expect(usage.quotas).not.toHaveProperty("gemini-4-argon-low");
    expect(usage.quotas).not.toHaveProperty("gemini-4-argon");
    expect(usage.quotas).not.toHaveProperty("argon_weekly");
  });

  it.each([undefined, null, "", "not-a-number", -0.1, 1.1, true])("omits invalid summary fraction %s without inventing a healthy or exhausted window", async (fraction) => {
    fixture.summary = { groups: [group("Gemini 4 Argon", fraction)] };
    const usage = await getUsageForProvider(connection);
    expect(usage.quotas).not.toHaveProperty("argon_weekly");
    expect(usage.quotas).not.toHaveProperty("argon_session");
    expect(usage.quotas[ARGON]).toMatchObject({ remainingPercentage: 80 });
  });

  it.each([403, 404, 503, "transport", "invalid-json"])("keeps valid per-model quota when optional summary fails with %s", async (failure) => {
    if (typeof failure === "number") fixture.summaryStatus = failure;
    else if (failure === "transport") fixture.summaryError = true;
    else fixture.invalidSummaryJson = true;

    const usage = await getUsageForProvider(connection);

    expect(usage.quotas[ARGON]).toMatchObject({ remainingPercentage: 80 });
    expect(usage.quotas[GEMINI]).toMatchObject({ remainingPercentage: 60 });
    expect(usage).not.toHaveProperty("message");
  });

  it("preserves resolved relay/strict-proxy policy for subscription, model quota, and summary", async () => {
    const policy = { connectionProxyEnabled: false, connectionProxyUrl: "", connectionNoProxy: "", vercelRelayUrl: "https://synthetic-relay.invalid", strictProxy: true };
    const requested = new Set();
    fixture.summary = { groups: [group("Gemini 4 Argon", 0.98)] };
    fixture.checkTransport = (url, options, proxyOptions) => {
      requested.add(url.split(":").at(-1));
      if (JSON.stringify(proxyOptions) !== JSON.stringify(policy)) throw new Error("proxy policy lost");
      if (!(options.signal instanceof AbortSignal)) throw new Error("bounded fetch signal missing");
      if (!url.endsWith(":loadCodeAssist") && JSON.parse(options.body).project !== "synthetic-project") throw new Error("project id was not normalized");
    };

    const usage = await getUsageForProvider(connection, policy);

    expect(usage.quotas[ARGON]).toMatchObject({ remainingPercentage: 80 });
    expect(usage.quotas.argon_weekly).toMatchObject({ remainingPercentage: 98 });
    expect([...requested].sort()).toEqual(["fetchAvailableModels", "loadCodeAssist", "retrieveUserQuotaSummary"]);
  });
});

describe("Antigravity independent family account selection", () => {
  it("recovers a native-target circuit block through its public alias without clearing another tier", async () => {
    const id = nextId();
    const native = `${ARGON}(medium)`;
    const otherTier = "gemini-4-argon-high";
    fixture.models[otherTier] = model(0.9);
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    for (const target of [native, otherTier]) {
      await handleAntigravityQuotaError(id, 429, target, connection.accessToken, {});
      await handleAntigravityQuotaError(id, 429, target, connection.accessToken, {});
      await handleAntigravityQuotaError(id, 429, target, connection.accessToken, {});
    }
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ allRateLimited: true });
    clearAntigravityStrikes(id, ARGON);
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ connectionId: id });
    expect(await getProviderCredentials("antigravity", null, otherTier)).toMatchObject({ allRateLimited: true });
  });

  it("clears a native partial strike count when its public alias succeeds", async () => {
    const id = nextId();
    const native = `${ARGON}(medium)`;
    await handleAntigravityQuotaError(id, 429, native, connection.accessToken, {});
    await handleAntigravityQuotaError(id, 429, native, connection.accessToken, {});
    clearAntigravityStrikes(id, ARGON);
    expect(await handleAntigravityQuotaError(id, 429, native, connection.accessToken, {})).toBeNull();
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ connectionId: id });
  });

  it("honors synthesized blocks for full native tier spellings and their public alias", async () => {
    const id = nextId();
    const native = `${ARGON}(medium)`;
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    await handleAntigravityQuotaError(id, 429, native, connection.accessToken, {});
    await handleAntigravityQuotaError(id, 429, native, connection.accessToken, {});
    expect(await handleAntigravityQuotaError(id, 429, native, connection.accessToken, {})).toBe(Date.now() + 15 * 60_000);
    expect(await getProviderCredentials("antigravity", null, native)).toMatchObject({ allRateLimited: true });
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ allRateLimited: true });
  });

  it("counts new quota strikes after a retained weekly exhaustion has expired", async () => {
    const id = nextId();
    const expiredReset = new Date(Date.parse(NOW) + 60_000).toISOString();
    fixture.summary = { groups: [group("Gemini 4 Argon", 0, "weekly", expiredReset)] };
    await refreshAntigravityQuota(id, connection.accessToken, {});
    await vi.advanceTimersByTimeAsync(61_000);
    fixture.summaryStatus = 403;
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    expect(await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {})).toBe(Date.now() + 15 * 60_000);
  });

  it.each([null, "invalid-reset"])("retains a future exhausted reset when a fresh zero reading has reset=%s", async reset => {
    const id = nextId();
    fixture.summary = { groups: [group("Gemini 4 Argon", 0)] };
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    await refreshAntigravityQuota(id, connection.accessToken, {});
    await vi.advanceTimersByTimeAsync(30_000);
    fixture.summary = { groups: [group("Gemini 4 Argon", 0, "weekly", reset)] };
    await refreshAntigravityQuota(id, connection.accessToken, {});
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ allRateLimited: true, retryAfter: WEEKLY_RESET });
    expect(getAntigravityQuotaCache().get(id).argon_weekly.resetAt).toBe(WEEKLY_RESET);
  });

  it("skips Argon weekly exhaustion even when its exact model is healthy, without blocking ordinary Gemini", async () => {
    const id = nextId();
    fixture.summary = { groups: [group("Gemini 4 Argon", 0), group("Gemini Models", 0.9)] };
    const healthyId = nextId();
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }, { id: healthyId, isActive: true }]);
    await refreshAntigravityQuota(id, connection.accessToken, {});

    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ connectionId: healthyId });
    expect(await getProviderCredentials("antigravity", null, GEMINI)).toMatchObject({ connectionId: id });
  });

  it("keeps healthy Argon selectable when the independent Gemini pool is exhausted", async () => {
    const id = nextId();
    fixture.summary = { groups: [group("Gemini 4 Argon", 0.9), group("Gemini Models", 0)] };
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    await refreshAntigravityQuota(id, connection.accessToken, {});

    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ connectionId: id });
    expect(await getProviderCredentials("antigravity", null, GEMINI)).toMatchObject({ allRateLimited: true, retryAfter: WEEKLY_RESET });
  });

  it("uses the latest exhausted applicable reset in both the error handler and prefilter", async () => {
    const id = nextId();
    fixture.models[ARGON] = model(0, SESSION_RESET);
    fixture.summary = { groups: [
      { ...group("Gemini 4 Argon", 0), buckets: [...group("Gemini 4 Argon", 0).buckets, ...group("Gemini 4 Argon", 0, "session", SESSION_RESET).buckets] },
    ] };
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);

    expect(await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {})).toBe(Date.parse(WEEKLY_RESET));
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ allRateLimited: true, retryAfter: WEEKLY_RESET });
  });

  it("keeps native base Argon selectable without importing an unrelated tier exhaustion", async () => {
    const id = nextId();
    fixture.models = { "gemini-4-argon-high": model(0), "gemini-4-argon-medium": model(0) };
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    await refreshAntigravityQuota(id, connection.accessToken, {});

    expect(await getProviderCredentials("antigravity", null, "gemini-4-argon")).toMatchObject({ connectionId: id });
    expect(await getProviderCredentials("antigravity", null, "gemini-4-argon-high")).toMatchObject({ allRateLimited: true, retryAfter: SESSION_RESET });
  });

  it("uses exact native base quota without blocking healthy explicit tiers", async () => {
    const id = nextId();
    fixture.models = { "gemini-4-argon": model(0), "gemini-4-argon-high": model(0.9), "gemini-4-argon-medium": model(0.8) };
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    await refreshAntigravityQuota(id, connection.accessToken, {});

    expect(await getProviderCredentials("antigravity", null, "gemini-4-argon")).toMatchObject({ allRateLimited: true, retryAfter: SESSION_RESET });
    expect(await getProviderCredentials("antigravity", null, "gemini-4-argon-high")).toMatchObject({ connectionId: id });
  });

  it("preserves a known independent weekly block when a later optional summary is unavailable", async () => {
    const id = nextId();
    fixture.summary = { groups: [group("Gemini 4 Argon", 0)] };
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    await refreshAntigravityQuota(id, connection.accessToken, {});
    await vi.advanceTimersByTimeAsync(30_000);
    fixture.summaryStatus = 403;
    await refreshAntigravityQuota(id, connection.accessToken, {});

    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ allRateLimited: true, retryAfter: WEEKLY_RESET });
  });

  it("preserves valid cache after a denied model quota response instead of replacing it with unknowns", async () => {
    const id = nextId();
    fixture.models[ARGON] = model(0);
    await refreshAntigravityQuota(id, connection.accessToken, {});
    await vi.advanceTimersByTimeAsync(30_000);
    fixture.modelStatus = 403;
    await refreshAntigravityQuota(id, connection.accessToken, {});
    expect(getAntigravityQuotaCache().get(id)[ARGON]).toMatchObject({ remainingPercentage: 0, resetAt: SESSION_RESET });
  });

  it("resolves relay pool policy before live quota refresh", async () => {
    const id = nextId();
    io.getProxyPoolById.mockResolvedValue({ id: "synthetic-pool", type: "cloudflare", isActive: true, proxyUrl: "https://synthetic-relay.invalid", strictProxy: true });
    fixture.summary = { groups: [group("Gemini 4 Argon", 0)] };
    fixture.checkTransport = (_url, _options, policy) => {
      if (policy?.vercelRelayUrl !== "https://synthetic-relay.invalid" || policy?.strictProxy !== true) throw new Error("resolved relay policy lost");
    };
    expect(await refreshAntigravityQuota(id, connection.accessToken, { proxyPoolId: "synthetic-pool" })).toMatchObject({ argon_weekly: { remainingPercentage: 0 } });
  });

  it("preserves exact-model strike blocks across fresh healthy readings and clears them on success", async () => {
    const id = nextId();
    const blockUntil = Date.parse(NOW) + 15 * 60_000;
    expect(await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {})).toBeNull();
    expect(await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {})).toBeNull();
    expect(await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {})).toBe(blockUntil);
    await vi.advanceTimersByTimeAsync(30_000);
    await refreshAntigravityQuota(id, connection.accessToken, {});
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ allRateLimited: true });
    expect(await getProviderCredentials("antigravity", null, "gemini-4-argon-high")).toMatchObject({ connectionId: id });

    clearAntigravityStrikes(id, ARGON);
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ connectionId: id });
    expect(getAntigravityStrikeInfo().blocks.has(`${id}|${ARGON}`)).toBe(false);
  });

  it("does not clear a real family exhaustion when a synthesized model block succeeds", async () => {
    const id = nextId();
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    await vi.advanceTimersByTimeAsync(30_000);
    fixture.summary = { groups: [group("Gemini 4 Argon", 0)] };
    await refreshAntigravityQuota(id, connection.accessToken, {});
    clearAntigravityStrikes(id, ARGON);
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ allRateLimited: true, retryAfter: WEEKLY_RESET });
  });

  it("keeps a later real per-model reset when an active synthetic strike block is refreshed", async () => {
    const id = nextId();
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    await vi.advanceTimersByTimeAsync(30_000);
    fixture.models[ARGON] = model(0, WEEKLY_RESET);
    await refreshAntigravityQuota(id, connection.accessToken, {});
    clearAntigravityStrikes(id, ARGON);
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ allRateLimited: true, retryAfter: WEEKLY_RESET });
  });

  it("releases a synthesized strike block at its deadline and retains fixed-window strike semantics", async () => {
    const id = nextId();
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    await vi.advanceTimersByTimeAsync(45_000);
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {})).toBeNull();
    await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    const deadline = await handleAntigravityQuotaError(id, 429, ARGON, connection.accessToken, {});
    expect(deadline).toBe(Date.now() + 15 * 60_000);
    await vi.advanceTimersByTimeAsync(15 * 60_000 + 1);
    io.getProviderConnections.mockResolvedValue([{ id, isActive: true }]);
    expect(await getProviderCredentials("antigravity", null, ARGON)).toMatchObject({ connectionId: id });
  });
});
