import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { refreshGoogleToken } from "../../open-sse/services/tokenRefresh/providers.js";
import { getProjectIdForConnection, removeConnection } from "../../open-sse/services/projectId.js";
const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
const proxy = { connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.invalid:8080", strictProxy: true };
const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
let refreshIndex = 0;
let connection;

beforeEach(() => {
  io.fetch.mockReset();
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  connection = `project-safety-${++refreshIndex}`;
});
afterEach(() => { removeConnection(connection); vi.restoreAllMocks(); });
const refresh = () => refreshGoogleToken(`synthetic-refresh-${++refreshIndex}`, "registered-client", "installed-app-public-value", logger, proxy);

describe("Google OAuth validated grants", () => {
  it("keeps form grant, registered client and connection proxy, with credential redirects forbidden", async () => {
    io.fetch.mockResolvedValue(Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: "3600", token_type: "Bearer" }));
    expect(await refresh()).toEqual({ accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 3600 });
    const [url, options, selectedProxy] = io.fetch.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(options).toMatchObject({ method: "POST", redirect: "error", signal: expect.any(AbortSignal) });
    expect(options.body.get("client_id")).toBe("registered-client");
    expect(options.body.get("grant_type")).toBe("refresh_token");
    expect(selectedProxy).toBe(proxy);
  });

  it.each([
    {}, { access_token: {} }, { access_token: "new token", expires_in: 3600 },
    { access_token: "valid", expires_in: true }, { access_token: "valid", expires_in: [3600] },
    { access_token: "valid", expires_in: -1 }, { access_token: "valid", expires_in: "NaN" },
    { access_token: "valid", expires_in: 3600, token_type: "Basic" },
    { access_token: "valid", expires_in: 3600, refresh_token: "invalid token" },
    { access_token: "valid", expires_in: 3600, error: "invalid_grant" },
  ])("does not acquire an invalid grant %#", async payload => {
    io.fetch.mockResolvedValue(Response.json(payload));
    expect(await refresh()).toBeNull();
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 429, 503])("does not retry or expose a credential echo from HTTP %s", async status => {
    io.fetch.mockResolvedValue(new Response("synthetic-secret-echo", { status }));
    expect(await refresh()).toBeNull();
    expect(io.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("synthetic-secret-echo");
  });

  it("does not expose malformed token JSON through exception details", async () => {
    io.fetch.mockResolvedValue(new Response("synthetic-secret-echo is not JSON", { headers: { "Content-Type": "application/json" } }));
    expect(await refresh()).toBeNull();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("synthetic-secret-echo");
  });
});

describe("Google real project provisioning", () => {
  const lookup = () => getProjectIdForConnection(connection, "synthetic-access", "antigravity", proxy);

  it("preserves provider-issued project and proxy without another onboarding request", async () => {
    io.fetch.mockResolvedValue(Response.json({ cloudaicompanionProject: { id: "actual-account-project" } }));
    expect(await lookup()).toBe("actual-account-project");
    expect(io.fetch).toHaveBeenCalledTimes(1);
    expect(io.fetch.mock.calls[0]).toEqual([
      "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }), proxy,
    ]);
  });

  it.each([401, 403])("does not onboard after a %s load denial or expose upstream credential echoes", async status => {
    io.fetch.mockResolvedValue(new Response("synthetic-secret-echo", { status }));
    expect(await lookup()).toBeNull();
    expect(io.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain("synthetic-secret-echo");
  });

  it.each([401, 403, 409])("stops onboarding immediately on HTTP %s rather than creating a fake project", async status => {
    io.fetch.mockResolvedValueOnce(Response.json({ allowedTiers: [{ id: "approved-tier", isDefault: true }] }));
    io.fetch.mockResolvedValue(new Response("synthetic-secret-echo", { status }));
    expect(await lookup()).toBeNull();
    expect(io.fetch).toHaveBeenCalledTimes(2);
    expect(io.fetch.mock.calls[1][1]).toMatchObject({ redirect: "error", body: expect.stringContaining('"tierId":"approved-tier"') });
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain("synthetic-secret-echo");
  });

  it.each([{ done: true }, { done: true, response: { cloudaicompanionProject: {} } }, { error: { code: 7, message: "synthetic-secret-echo" } }])("fails closed for completed/error provisioning without an actual project %#", async payload => {
    io.fetch.mockResolvedValueOnce(Response.json({}));
    io.fetch.mockResolvedValue(Response.json(payload));
    expect(await lookup()).toBeNull();
    expect(io.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain("synthetic-secret-echo");
  });

  it("uses the project returned by successful onboarding with no local replacement", async () => {
    io.fetch.mockResolvedValueOnce(Response.json({}));
    io.fetch.mockResolvedValueOnce(Response.json({ done: true, response: { cloudaicompanionProject: { id: "provider-provisioned-project" } } }));
    expect(await lookup()).toBe("provider-provisioned-project");
    expect(io.fetch).toHaveBeenCalledTimes(2);
  });
});
