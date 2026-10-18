import { setImmediate } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  getProviderConnectionById: vi.fn(),
  updateProviderConnection: vi.fn(),
  deleteProviderConnection: vi.fn(),
  getProxyPoolById: vi.fn(),
  proxyAwareFetch: vi.fn(),
}));

// Keep the proactive operation, credential manager, provider dispatcher and
// ten-second refresh-result cache real. Only persistence and OAuth I/O are fake.
vi.mock("../../src/lib/localDb.js", () => ({
  getProviderConnectionById: io.getProviderConnectionById,
  updateProviderConnection: io.updateProviderConnection,
  deleteProviderConnection: io.deleteProviderConnection,
}));
vi.mock("@/models", () => ({ getProxyPoolById: io.getProxyPoolById }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: io.proxyAwareFetch,
}));

const NOW = Date.parse("2026-10-18T12:00:00.000Z");
const DIRECT = { connectionProxyEnabled: false, strictProxy: false };
let db;
let checkAndRefreshToken;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function connection(id, overrides = {}) {
  return {
    id,
    connectionId: id,
    provider: "codex",
    authType: "oauth",
    accessToken: `expired-access-${id}`,
    refreshToken: `refresh-${id}`,
    idToken: `id-token-${id}`,
    expiresAt: "2026-10-18T11:59:00.000Z",
    lastRefreshAt: "2026-10-18T11:00:00.000Z",
    isActive: true,
    providerSpecificData: { accountId: `account-${id}` },
    ...overrides,
  };
}

function seed(row) {
  db.rows.set(row.id, structuredClone(row));
  return row;
}

function oauthResponse(accessToken, refreshToken) {
  return Response.json({
    access_token: accessToken,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    expires_in: 3600,
  });
}

function githubConnection(id, overrides = {}) {
  return connection(id, {
    provider: "github",
    accessToken: `github-access-${id}`,
    expiresAt: "2026-10-18T14:00:00.000Z",
    copilotToken: `expired-copilot-${id}`,
    providerSpecificData: {
      accountId: `account-${id}`,
      copilotToken: `expired-copilot-${id}`,
      copilotTokenExpiresAt: NOW / 1000 - 60,
    },
    ...overrides,
  });
}

function copilotResponse(token, expiresAt = NOW / 1000 + 3600) {
  return Response.json({ token, expires_at: expiresAt });
}

function holdNextWrite(connectionId) {
  const entered = deferred();
  const release = deferred();
  let held = false;
  db.beforeCommit = (id) => {
    if (id !== connectionId || held) return;
    held = true;
    entered.resolve();
    return release.promise;
  };
  return { entered: entered.promise, release };
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  // Native setImmediate drains settled promise work without advancing fake time.
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
  db = { rows: new Map(), writes: [], commits: [], beforeCommit: null };
  io.getProviderConnectionById.mockImplementation(async (id) => {
    const row = db.rows.get(id);
    return row ? structuredClone(row) : null;
  });
  io.updateProviderConnection.mockImplementation(async (id, patch) => {
    db.writes.push({ id, patch: structuredClone(patch) });
    await db.beforeCommit?.(id, patch);
    const row = db.rows.get(id);
    if (!row) return null;
    const next = { ...row, ...structuredClone(patch) };
    db.rows.set(id, next);
    db.commits.push(id);
    return structuredClone(next);
  });
  io.deleteProviderConnection.mockImplementation(async (id) => db.rows.delete(id));
  io.getProxyPoolById.mockResolvedValue(null);
  // An accidental OAuth call must be visible, not escape to a live provider.
  io.proxyAwareFetch.mockImplementation(async () => {
    throw new Error("Unexpected synthetic OAuth request");
  });
  ({ checkAndRefreshToken } = await import("../../src/sse/services/tokenRefresh.js"));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("proactive credential snapshot and persistence boundary", () => {
  it("adopts newer valid DB access credentials without refresh-token rotation or OAuth I/O", async () => {
    const caller = connection("same-refresh", { callerContext: "request-only" });
    delete caller.connectionId;
    seed(connection("same-refresh", {
      accessToken: "persisted-access",
      expiresAt: "2026-10-18T13:00:00.000Z",
      lastRefreshAt: "2026-10-18T11:59:30.000Z",
    }));

    const result = await checkAndRefreshToken("codex", caller);

    expect(result).toMatchObject({
      connectionId: "same-refresh",
      accessToken: "persisted-access",
      refreshToken: "refresh-same-refresh",
      expiresAt: "2026-10-18T13:00:00.000Z",
      lastRefreshAt: "2026-10-18T11:59:30.000Z",
      idToken: "id-token-same-refresh",
      callerContext: "request-only",
      providerSpecificData: { accountId: "account-same-refresh" },
    });
    expect(caller.accessToken).toBe("expired-access-same-refresh");
    expect(caller).not.toHaveProperty("connectionId");
    expect(io.proxyAwareFetch).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it("does not replace a newer caller snapshot with older valid DB credentials", async () => {
    const caller = connection("older-db", {
      refreshToken: "newer-caller-refresh",
      lastRefreshAt: "2026-10-18T11:59:00.000Z",
    });
    seed(connection("older-db", { expiresAt: "2026-10-18T15:00:00.000Z" }));
    io.proxyAwareFetch.mockResolvedValue(oauthResponse("renewed-caller-access", "rotated-caller-refresh"));

    const result = await checkAndRefreshToken("codex", caller, { proxyOptions: DIRECT });

    expect(JSON.parse(io.proxyAwareFetch.mock.calls[0][1].body).refresh_token).toBe("newer-caller-refresh");
    expect(result.accessToken).toBe("renewed-caller-access");
    expect(db.rows.get(caller.id).refreshToken).toBe("rotated-caller-refresh");
  });

  it.each([0, 11_001])(
    "keeps following proactive work behind a synthetic uncommitted write at +%ims",
    async (elapsedMs) => {
      const caller = seed(connection("held-commit"));
      const barrier = holdNextWrite(caller.id);
      io.proxyAwareFetch.mockImplementation(async () => oauthResponse("committed-access", "rotated-refresh"));
      const first = checkAndRefreshToken("codex", { ...caller, callerContext: "first" }, { proxyOptions: DIRECT });
      await barrier.entered;
      // This deliberately delayed persistence is a synthetic scheduling fixture,
      // not evidence that synchronous SQLite transactions normally take 11s.
      vi.setSystemTime(NOW + elapsedMs);
      let secondSettled = false;
      const second = checkAndRefreshToken("codex", { ...caller, callerContext: "second" }, { proxyOptions: DIRECT })
        .finally(() => { secondSettled = true; });
      let results;
      try {
        await setImmediate();
        expect({
          writes: db.writes.length,
          transports: io.proxyAwareFetch.mock.calls.length,
          secondSettled,
          commits: db.commits,
        }).toEqual({ writes: 1, transports: 1, secondSettled: false, commits: [] });
      } finally {
        barrier.release.resolve();
        results = await Promise.allSettled([first, second]);
      }

      expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(results[0].value).toMatchObject({ accessToken: "committed-access", callerContext: "first" });
      expect(results[1].value).toMatchObject({
        accessToken: "committed-access",
        refreshToken: "rotated-refresh",
        expiresAt: "2026-10-18T13:00:00.000Z",
        callerContext: "second",
      });
      expect(io.proxyAwareFetch).toHaveBeenCalledTimes(1);
      expect(db.writes).toHaveLength(1);
      expect(db.commits).toEqual([caller.id]);
    },
  );

  it("allows an unrelated connection to commit while another connection's synthetic write is held", async () => {
    const heldCaller = seed(connection("held-account"));
    const independentCaller = seed(connection("independent-account"));
    const barrier = holdNextWrite(heldCaller.id);
    io.proxyAwareFetch.mockImplementation(async (_url, options) => {
      const token = JSON.parse(options.body).refresh_token;
      return oauthResponse(`access-for-${token}`, `rotated-${token}`);
    });
    const first = checkAndRefreshToken("codex", heldCaller, { proxyOptions: DIRECT });
    await barrier.entered;
    let independentResult;
    const second = checkAndRefreshToken("codex", independentCaller, { proxyOptions: DIRECT })
      .then((result) => { independentResult = result; return result; });
    try {
      await setImmediate();
      expect(independentResult?.accessToken).toBe("access-for-refresh-independent-account");
      expect(db.commits).toEqual(["independent-account"]);
      expect(db.rows.get(heldCaller.id).accessToken).toBe("expired-access-held-account");
    } finally {
      barrier.release.resolve();
      await Promise.allSettled([first, second]);
    }
  });

  it("honors a queued caller's force option and keeps that caller's credential fields", async () => {
    const caller = seed(connection("forced-follower"));
    const barrier = holdNextWrite(caller.id);
    io.proxyAwareFetch
      .mockResolvedValueOnce(oauthResponse("first-access", "first-rotation"))
      .mockResolvedValueOnce(oauthResponse("forced-access", "second-rotation"));
    const first = checkAndRefreshToken("codex", { ...caller, callerContext: "ordinary" }, { proxyOptions: DIRECT });
    await barrier.entered;
    const forced = checkAndRefreshToken("codex", { ...caller, callerContext: "forced" }, {
      force: true,
      proxyOptions: DIRECT,
    });
    barrier.release.resolve();

    const [ordinaryResult, forcedResult] = await Promise.all([first, forced]);

    expect(ordinaryResult).toMatchObject({ accessToken: "first-access", callerContext: "ordinary" });
    expect(forcedResult).toMatchObject({
      accessToken: "forced-access",
      refreshToken: "second-rotation",
      callerContext: "forced",
    });
    expect(io.proxyAwareFetch.mock.calls.map(([, options]) => JSON.parse(options.body).refresh_token))
      .toEqual(["refresh-forced-follower", "first-rotation"]);
    expect(db.rows.get(caller.id).accessToken).toBe("forced-access");
  });

  it("serializes different proxy policies without sharing their whole results or lower cache entries", async () => {
    const caller = seed(connection("policy-follower"));
    const barrier = holdNextWrite(caller.id);
    const strictPolicy = {
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://synthetic-proxy.example:8080",
      connectionNoProxy: "localhost",
      strictProxy: true,
    };
    // The provider intentionally keeps the same refresh token, so only policy
    // separation permits the second forced transport inside the lower cache TTL.
    io.proxyAwareFetch
      .mockResolvedValueOnce(oauthResponse("direct-access"))
      .mockResolvedValueOnce(oauthResponse("strict-proxy-access"));
    const first = checkAndRefreshToken("codex", { ...caller, callerContext: "direct" }, {
      force: true,
      proxyOptions: DIRECT,
    });
    await barrier.entered;
    const second = checkAndRefreshToken("codex", { ...caller, callerContext: "strict" }, {
      force: true,
      proxyOptions: strictPolicy,
    });
    let results;
    try {
      await setImmediate();
      expect(io.proxyAwareFetch).toHaveBeenCalledTimes(1);
      expect(db.writes).toHaveLength(1);
      expect(db.commits).toEqual([]);
      expect(db.rows.get(caller.id).accessToken).toBe("expired-access-policy-follower");
    } finally {
      barrier.release.resolve();
      results = await Promise.allSettled([first, second]);
    }

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(results[0].value).toMatchObject({ accessToken: "direct-access", callerContext: "direct" });
    expect(results[1].value).toMatchObject({ accessToken: "strict-proxy-access", callerContext: "strict" });
    expect(io.proxyAwareFetch.mock.calls.map(([, , policy]) => policy)).toEqual([DIRECT, strictPolicy]);
    expect(db.rows.get(caller.id).accessToken).toBe("strict-proxy-access");
  });

  it.each([
    { elapsedMs: 0, transportCount: 1, accessToken: "first-access" },
    { elapsedMs: 11_001, transportCount: 2, accessToken: "retry-access" },
  ])("releases a rejected persistence operation and retains the real lower cache at +$elapsedMs ms", async ({ elapsedMs, transportCount, accessToken }) => {
    const caller = seed(connection("failed-persist"));
    let rejectFirstWrite = true;
    db.beforeCommit = () => {
      if (!rejectFirstWrite) return;
      rejectFirstWrite = false;
      throw new Error("Synthetic persistence rejection");
    };
    io.proxyAwareFetch
      .mockResolvedValueOnce(oauthResponse("first-access", "first-rotation"))
      .mockResolvedValueOnce(oauthResponse("retry-access", "retry-rotation"));

    const first = await checkAndRefreshToken("codex", { ...caller, callerContext: "first" }, { proxyOptions: DIRECT });

    // Existing persistence failures are swallowed and refreshed credentials are
    // returned to this request; the account itself must remain untouched.
    expect(first.accessToken).toBe("first-access");
    expect(db.rows.get(caller.id)).toEqual(caller);
    expect(db.commits).toEqual([]);
    vi.setSystemTime(NOW + elapsedMs);
    const second = await checkAndRefreshToken("codex", { ...caller, callerContext: "retry" }, { proxyOptions: DIRECT });

    expect(second).toMatchObject({ accessToken, callerContext: "retry", isActive: true });
    expect(io.proxyAwareFetch).toHaveBeenCalledTimes(transportCount);
    expect(db.writes).toHaveLength(2);
    expect(db.commits).toEqual([caller.id]);
    expect(db.rows.get(caller.id)).toMatchObject({ accessToken, isActive: true });
    expect(db.writes.every(({ patch }) => !("isActive" in patch))).toBe(true);
    expect(io.deleteProviderConnection).not.toHaveBeenCalled();
  });

  it("releases a rejected refresh for a queued caller without deleting or deactivating credentials", async () => {
    const caller = seed(connection("rejected-refresh", {
      provider: "kiro",
      providerSpecificData: {
        authMethod: "idc",
        clientId: "synthetic-client",
        clientSecret: "synthetic-secret",
        region: "us-east-1",
        profileArn: "arn:aws:codewhisperer:us-east-1:000000000000:profile/synthetic",
      },
    }));
    const entered = deferred();
    const release = deferred();
    const refreshError = new Error("Synthetic OAuth rejection");
    io.proxyAwareFetch
      .mockImplementationOnce(async () => {
        entered.resolve();
        await release.promise;
        throw refreshError;
      })
      .mockResolvedValueOnce(Response.json({
        accessToken: "kiro-retry-access",
        refreshToken: "kiro-retry-refresh",
        expiresIn: 3600,
      }));
    const first = checkAndRefreshToken("kiro", { ...caller, callerContext: "failed" }, { proxyOptions: DIRECT });
    // Attach the rejection observer before releasing the transport barrier.
    const firstOutcome = first.then((value) => ({ value }), (error) => ({ error }));
    await entered.promise;
    const second = checkAndRefreshToken("kiro", { ...caller, callerContext: "retry" }, { proxyOptions: DIRECT });
    const secondOutcome = second.then((value) => ({ value }), (error) => ({ error }));
    await setImmediate();
    expect(db.rows.get(caller.id)).toEqual(caller);
    release.resolve();

    expect(await firstOutcome).toEqual({ error: refreshError });
    expect(await secondOutcome).toMatchObject({
      value: { accessToken: "kiro-retry-access", callerContext: "retry", isActive: true },
    });
    expect(io.proxyAwareFetch).toHaveBeenCalledTimes(2);
    expect(db.commits).toEqual([caller.id]);
    expect(db.rows.get(caller.id)).toMatchObject({ accessToken: "kiro-retry-access", isActive: true });
    expect(db.writes.every(({ patch }) => !("isActive" in patch))).toBe(true);
    expect(io.deleteProviderConnection).not.toHaveBeenCalled();
  });

  it("keeps Codex permanent refresh errors non-destructive and allows a later retry", async () => {
    const caller = seed(connection("invalid-grant"));
    io.proxyAwareFetch
      .mockResolvedValueOnce(Response.json({ error: "invalid_grant", error_description: "Synthetic expired grant" }, { status: 400 }))
      .mockResolvedValueOnce(oauthResponse("reauthenticated-access", "reauthenticated-refresh"));

    const result = await checkAndRefreshToken("codex", caller, { proxyOptions: DIRECT });

    expect(result).toEqual(caller);
    expect(db.rows.get(caller.id)).toEqual(caller);
    expect(db.writes).toEqual([]);
    expect(io.deleteProviderConnection).not.toHaveBeenCalled();
    vi.setSystemTime(NOW + 11_001);
    const retry = await checkAndRefreshToken("codex", caller, { proxyOptions: DIRECT });
    expect(retry).toMatchObject({ accessToken: "reauthenticated-access", isActive: true });
    expect(io.proxyAwareFetch).toHaveBeenCalledTimes(2);
    expect(db.rows.get(caller.id).isActive).toBe(true);
    expect(io.deleteProviderConnection).not.toHaveBeenCalled();
  });
});

describe("proactive GitHub Copilot service-token snapshots", () => {
  it("adopts newer service credentials with equal OAuth timestamps without replacing caller proxy metadata", async () => {
    const caller = githubConnection("service-snapshot");
    caller.providerSpecificData = {
      ...caller.providerSpecificData,
      callerSetting: "request-only",
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://caller-proxy.example:8080",
      connectionNoProxy: "localhost",
      strictProxy: true,
    };
    seed(githubConnection(caller.id, {
      providerSpecificData: {
        copilotToken: "persisted-service",
        copilotTokenExpiresAt: NOW / 1000 + 3600,
        callerSetting: "database-only",
        connectionProxyEnabled: false,
        connectionProxyUrl: "http://different-db-proxy.example:8080",
        strictProxy: false,
      },
    }));

    const result = await checkAndRefreshToken("github", caller);

    expect(result).toMatchObject({
      accessToken: "github-access-service-snapshot",
      lastRefreshAt: "2026-10-18T11:00:00.000Z",
      copilotToken: "persisted-service",
      providerSpecificData: {
        accountId: "account-service-snapshot",
        copilotToken: "persisted-service",
        copilotTokenExpiresAt: NOW / 1000 + 3600,
        callerSetting: "request-only",
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://caller-proxy.example:8080",
        connectionNoProxy: "localhost",
        strictProxy: true,
      },
    });
    expect(caller.copilotToken).toBe("expired-copilot-service-snapshot");
    expect(caller.providerSpecificData.copilotToken).toBe("expired-copilot-service-snapshot");
    expect(io.proxyAwareFetch).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it("synchronizes a stale top-level token with the caller's already-valid nested service token", async () => {
    const caller = seed(githubConnection("stale-top-level", {
      providerSpecificData: {
        copilotToken: "valid-nested-service",
        copilotTokenExpiresAt: NOW / 1000 + 3600,
      },
    }));

    const result = await checkAndRefreshToken("github", caller, { proxyOptions: DIRECT });

    expect(result.copilotToken).toBe("valid-nested-service");
    expect(result.providerSpecificData.copilotToken).toBe("valid-nested-service");
    expect(caller.copilotToken).toBe("expired-copilot-stale-top-level");
    expect(io.proxyAwareFetch).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it("retains newer caller service credentials even when the DB OAuth timestamp is newer", async () => {
    const caller = githubConnection("newer-caller-service", {
      copilotToken: "newer-caller-service",
      providerSpecificData: {
        copilotToken: "newer-caller-service",
        copilotTokenExpiresAt: NOW / 1000 + 7200,
        callerSetting: "retain-me",
      },
    });
    seed(githubConnection(caller.id, {
      lastRefreshAt: "2026-10-18T11:30:00.000Z",
      providerSpecificData: {
        copilotToken: "older-db-service",
        copilotTokenExpiresAt: NOW / 1000 + 3600,
        callerSetting: "do-not-adopt",
      },
    }));

    const result = await checkAndRefreshToken("github", caller, { proxyOptions: DIRECT });

    expect(result).toMatchObject({
      lastRefreshAt: "2026-10-18T11:30:00.000Z",
      copilotToken: "newer-caller-service",
      providerSpecificData: {
        copilotToken: "newer-caller-service",
        copilotTokenExpiresAt: NOW / 1000 + 7200,
        callerSetting: "retain-me",
      },
    });
    expect(io.proxyAwareFetch).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it.each([0, 11_001])(
    "adopts a queued service-token commit without repeating persistence at +%ims",
    async (elapsedMs) => {
      const caller = seed(githubConnection("service-queue"));
      const barrier = holdNextWrite(caller.id);
      io.proxyAwareFetch
        .mockResolvedValueOnce(copilotResponse("committed-service"))
        .mockResolvedValueOnce(copilotResponse("unnecessary-service-exchange"));
      const first = checkAndRefreshToken("github", { ...caller, callerContext: "first" }, { proxyOptions: DIRECT });
      await barrier.entered;
      // Synthetic delayed persistence probes queue ordering. Inside ten seconds
      // the real lower Copilot cache already suppresses duplicate HTTP calls;
      // snapshot adoption must additionally avoid the redundant second write.
      vi.setSystemTime(NOW + elapsedMs);
      let secondSettled = false;
      const second = checkAndRefreshToken("github", { ...caller, callerContext: "second" }, { proxyOptions: DIRECT })
        .finally(() => { secondSettled = true; });
      let results;
      try {
        await setImmediate();
        expect(secondSettled).toBe(false);
        expect(io.proxyAwareFetch).toHaveBeenCalledTimes(1);
        expect(db.writes).toHaveLength(1);
        expect(db.commits).toEqual([]);
        expect(db.rows.get(caller.id).providerSpecificData.copilotToken).toBe("expired-copilot-service-queue");
      } finally {
        barrier.release.resolve();
        results = await Promise.allSettled([first, second]);
      }

      expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(results[0].value).toMatchObject({ copilotToken: "committed-service", callerContext: "first" });
      expect(results[1].value).toMatchObject({
        copilotToken: "committed-service",
        callerContext: "second",
        providerSpecificData: {
          copilotToken: "committed-service",
          copilotTokenExpiresAt: NOW / 1000 + 3600,
        },
      });
      expect(io.proxyAwareFetch).toHaveBeenCalledTimes(1);
      expect(io.proxyAwareFetch.mock.calls[0]).toMatchObject([
        "https://api.github.com/copilot_internal/v2/token",
        { headers: { Authorization: "token github-access-service-queue" } },
        DIRECT,
      ]);
      expect(db.writes).toHaveLength(1);
      expect(db.commits).toEqual([caller.id]);
      expect(db.rows.get(caller.id).lastRefreshAt).toBe("2026-10-18T11:00:00.000Z");
    },
  );

  it("adopts an immediately committed service token after the real lower cache has expired", async () => {
    const caller = seed(githubConnection("service-after-cache"));
    io.proxyAwareFetch
      .mockResolvedValueOnce(copilotResponse("persisted-before-cache-expiry"))
      .mockResolvedValueOnce(copilotResponse("unnecessary-after-cache-exchange"));

    const first = await checkAndRefreshToken("github", caller, { proxyOptions: DIRECT });
    vi.setSystemTime(NOW + 11_001);
    const second = await checkAndRefreshToken("github", caller, { proxyOptions: DIRECT });

    expect(first.copilotToken).toBe("persisted-before-cache-expiry");
    expect(second).toMatchObject({
      copilotToken: "persisted-before-cache-expiry",
      lastRefreshAt: "2026-10-18T11:00:00.000Z",
      providerSpecificData: { copilotToken: "persisted-before-cache-expiry", copilotTokenExpiresAt: NOW / 1000 + 3600 },
    });
    expect(db.rows.get(caller.id).lastRefreshAt).toBe("2026-10-18T11:00:00.000Z");
    expect(io.proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(db.writes).toHaveLength(1);
  });

  it("still forces OAuth refresh under caller policy when a newer DB service token is adopted", async () => {
    const caller = githubConnection("forced-service-adoption");
    caller.providerSpecificData = {
      ...caller.providerSpecificData,
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://forced-caller-proxy.example:8080",
      strictProxy: true,
    };
    seed(githubConnection(caller.id, {
      providerSpecificData: {
        copilotToken: "already-valid-service",
        copilotTokenExpiresAt: NOW / 1000 + 3600,
        connectionProxyEnabled: false,
        strictProxy: false,
      },
    }));
    io.proxyAwareFetch
      .mockResolvedValueOnce(oauthResponse("forced-github-access", "forced-github-refresh"))
      .mockResolvedValueOnce(copilotResponse("unnecessary-forced-service-exchange"));

    const result = await checkAndRefreshToken("github", caller, { force: true });

    expect(result).toMatchObject({
      accessToken: "forced-github-access",
      refreshToken: "forced-github-refresh",
      lastRefreshAt: "2026-10-18T12:00:00.000Z",
      copilotToken: "already-valid-service",
      providerSpecificData: {
        copilotToken: "already-valid-service",
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://forced-caller-proxy.example:8080",
        strictProxy: true,
      },
    });
    expect(io.proxyAwareFetch).toHaveBeenCalledTimes(1);
    const [url, request, proxyPolicy] = io.proxyAwareFetch.mock.calls[0];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect(new URLSearchParams(request.body).get("refresh_token")).toBe("refresh-forced-service-adoption");
    expect(proxyPolicy).toMatchObject({
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://forced-caller-proxy.example:8080",
      strictProxy: true,
    });
  });
});
