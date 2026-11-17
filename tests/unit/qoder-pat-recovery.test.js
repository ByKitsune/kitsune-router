import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), connections: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: mocks.fetch }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.connections,
  getCombos: async () => [],
  getCustomModels: async () => [],
  getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
vi.mock("@/sse/services/tokenRefresh", () => ({ updateProviderCredentials: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => ({}) }));

let resolveQoderCredentials;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
const jobToken = (token = "jt-synthetic") => json({ token });

beforeEach(async () => {
  vi.resetModules();
  mocks.fetch.mockReset();
  mocks.connections.mockReset();
  ({ resolveQoderCredentials } = await import("../../open-sse/services/qoderModels.js"));
});
afterEach(() => vi.restoreAllMocks());

describe("Qoder PAT credential recovery", () => {
  it("recovers identity on the next request without exchanging a valid job token again", async () => {
    mocks.fetch
      .mockResolvedValueOnce(jobToken())
      .mockRejectedValueOnce(new Error("temporary userinfo outage"))
      .mockResolvedValueOnce(json({ id: "recovered-user" }));
    const credentials = { apiKey: "pt-recovery", providerSpecificData: { machineId: "machine" } };
    const proxyOptions = { connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.test:8080" };
    const signal = new AbortController().signal;

    const first = await resolveQoderCredentials(credentials, proxyOptions, signal);
    expect(first.accessToken).toBe("jt-synthetic");
    expect(first.providerSpecificData.userId).toBe("");

    const recovered = await resolveQoderCredentials(credentials, proxyOptions, signal);
    expect(recovered.accessToken).toBe("jt-synthetic");
    expect(recovered.apiKey).toBeUndefined();
    expect(recovered.providerSpecificData).toMatchObject({
      userId: "recovered-user", machineId: "machine", authMethod: "pat",
    });
    expect(await resolveQoderCredentials(credentials, proxyOptions, signal)).toEqual(recovered);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    for (const [, options, proxy] of mocks.fetch.mock.calls) {
      expect(options.signal).toBe(signal);
      expect(proxy).toBe(proxyOptions);
    }
    expect(mocks.fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer jt-synthetic");
  });

  it("preserves the stored identity while a cached job token's identity lookup fails", async () => {
    mocks.fetch
      .mockResolvedValueOnce(jobToken())
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ user_id: "live-user" }));
    const credentials = { apiKey: "pt-stored-user", providerSpecificData: { userId: "stored-user" } };
    expect((await resolveQoderCredentials(credentials)).providerSpecificData.userId).toBe("stored-user");
    expect((await resolveQoderCredentials(credentials)).providerSpecificData.userId).toBe("stored-user");
    expect((await resolveQoderCredentials(credentials)).providerSpecificData.userId).toBe("live-user");
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });

  it("does not erase a recovered identity when an older overlapping lookup fails", async () => {
    let finishFirstLookup;
    const pendingLookup = new Promise((resolve) => { finishFirstLookup = resolve; });
    let lookupStarted;
    const started = new Promise((resolve) => { lookupStarted = resolve; });
    mocks.fetch
      .mockResolvedValueOnce(jobToken())
      .mockImplementationOnce(() => { lookupStarted(); return pendingLookup; })
      .mockResolvedValueOnce(json({ id: "recovered-concurrently" }));
    const credentials = { apiKey: "pt-overlapping" };
    const first = resolveQoderCredentials(credentials);
    await started;
    expect((await resolveQoderCredentials(credentials)).providerSpecificData.userId).toBe("recovered-concurrently");
    finishFirstLookup(json({}, 503));
    expect((await first).providerSpecificData.userId).toBe("recovered-concurrently");
    expect((await resolveQoderCredentials(credentials)).providerSpecificData.userId).toBe("recovered-concurrently");
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it("exchanges an expired job token instead of retrying identity with stale authentication", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    mocks.fetch
      .mockResolvedValueOnce(json({ token: "jt-old", expires_at: "2027-01-15T09:00:00.000Z" }))
      .mockResolvedValueOnce(json({ id: "old-user" }))
      .mockResolvedValueOnce(jobToken("jt-new"))
      .mockResolvedValueOnce(json({ id: "new-user" }));
    const credentials = { apiKey: "pt-expiring" };
    expect((await resolveQoderCredentials(credentials)).accessToken).toBe("jt-old");
    now.mockReturnValue(Date.parse("2027-01-16T00:00:00.000Z"));
    const refreshed = await resolveQoderCredentials(credentials);
    expect(refreshed.accessToken).toBe("jt-new");
    expect(refreshed.providerSpecificData.userId).toBe("new-user");
  });

  it("keeps exchange errors visible instead of converting missing job tokens into credentials", async () => {
    mocks.fetch.mockResolvedValueOnce(json({}));
    await expect(resolveQoderCredentials({ apiKey: "pt-no-token" })).rejects.toThrow("returned no job token");
  });
});

describe("public Qoder PAT model catalog", () => {
  it("lists account catalog models when the only stored credential is a PAT API key", async () => {
    mocks.connections.mockResolvedValue([{ id: "qoder-pat", provider: "qoder", isActive: true,
      apiKey: "pt-catalog", providerSpecificData: {} }]);
    mocks.fetch
      .mockResolvedValueOnce(jobToken("jt-catalog"))
      .mockResolvedValueOnce(json({ id: "catalog-user" }))
      .mockResolvedValueOnce(json({ chat: [
        { key: "pat-account-exclusive", display_name: "Account-only model", enable: true },
        { key: "pat-hidden", enable: false },
      ] }));
    const { GET } = await import("../../src/app/api/v1/models/route.js");
    const response = await GET();
    expect(response.status).toBe(200);
    const catalog = await response.json();
    expect(catalog.object).toBe("list");
    // Provider UI enable:false rows remain executable in the native catalog.
    // Keep this account-scoped list exact, including that upstream row, without
    // treating the UI flag as a new entitlement or inventing model limits.
    expect(catalog.data.filter((model) => model.owned_by === "qd")).toEqual([
      expect.objectContaining({ id: "qd/pat-account-exclusive", object: "model", owned_by: "qd" }),
      expect.objectContaining({ id: "qd/pat-hidden", object: "model", owned_by: "qd" }),
    ]);
  });
});
