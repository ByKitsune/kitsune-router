import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import antigravity from "../../src/lib/oauth/providers/antigravity.js";
import { exchangeTokens } from "../../src/lib/oauth/providers/index.js";

const tokens = { access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600 };
const userInfo = { email: "synthetic@example.test" };
const realProject = "real-account-project";
const config = { tokenUrl: antigravity.config.tokenUrl, clientId: "synthetic-client", clientSecret: "synthetic-client-secret" };
let fetchMock;
beforeEach(() => { fetchMock = vi.spyOn(globalThis, "fetch"); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function mockLoad(data) {
  fetchMock.mockResolvedValueOnce(Response.json(userInfo)).mockResolvedValueOnce(Response.json(data));
}

describe("Antigravity OAuth credential transport", () => {
  it("binds the authorization grant to the configured token endpoint and refuses redirects", async () => {
    fetchMock.mockResolvedValue(Response.json(tokens));
    expect(await antigravity.exchangeToken(config, "synthetic-code", "http://localhost/callback")).toEqual(tokens);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(config.tokenUrl);
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(options.body)).toMatchObject({ client_id: config.clientId, client_secret: config.clientSecret, code: "synthetic-code" });
  });

  it.each([307, 401, 403])("rejects HTTP %s token responses without exposing their credential echoes", async status => {
    fetchMock.mockResolvedValue(Response.json({ ...tokens, message: `Echo ${config.clientSecret}` }, { status }));
    await expect(antigravity.exchangeToken(config, "synthetic-code", "http://localhost/callback")).rejects.toThrow(`Token exchange failed (HTTP ${status})`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { access_token: {} }, { access_token: "invalid token" }, { ...tokens, refresh_token: {} },
    { ...tokens, token_type: "Basic" }, { ...tokens, expires_in: -1 }, { ...tokens, error: "access_denied" }])("rejects malformed successful exchanges: %j", async payload => {
    fetchMock.mockResolvedValue(Response.json(payload));
    await expect(antigravity.exchangeToken(config, "synthetic-code", "http://localhost/callback")).rejects.toThrow("invalid token response");
  });

  it("redacts parser errors containing credential-bearing response text", async () => {
    fetchMock.mockResolvedValue(new Response(`invalid-json ${tokens.access_token}`));
    await expect(antigravity.exchangeToken(config, "synthetic-code", "http://localhost/callback")).rejects.toThrow("Token exchange returned invalid JSON");
  });
});

describe("Antigravity account-bound project provisioning", () => {
  it.each([realProject, { id: realProject }])("uses the real loaded project without onboarding again: %j", async project => {
    mockLoad({ cloudaicompanionProject: project });
    const extra = await antigravity.postExchange(tokens);
    expect(extra).toEqual({ userInfo, projectId: realProject });
    expect(antigravity.mapTokens(tokens, extra).projectId).toBe(realProject);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.redirect).toBe("error");
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.headers.Authorization).toBe(`Bearer ${tokens.access_token}`);
    }
    expect(fetchMock.mock.calls[1][0]).toBe(antigravity.config.loadCodeAssistEndpoint);
  });

  it("completes onboarding only when the provider returns the account's real project", async () => {
    mockLoad({ allowedTiers: [{ id: "allowed-default-tier", isDefault: true }] });
    fetchMock.mockResolvedValueOnce(Response.json({ done: true, response: { cloudaicompanionProject: { id: realProject } } }));
    expect(await antigravity.postExchange(tokens)).toEqual({ userInfo, projectId: realProject });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(antigravity.config.onboardUserEndpoint);
    expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body).tierId).toBe("allowed-default-tier");
  });

  it.each([401, 403, 429, 503])("treats onboarding HTTP %s as terminal without background retries", async status => {
    vi.useFakeTimers();
    mockLoad({});
    fetchMock.mockResolvedValueOnce(Response.json({ done: true, response: { cloudaicompanionProject: realProject }, message: `Echo ${tokens.access_token}` }, { status }));
    await expect(antigravity.postExchange(tokens)).rejects.toThrow(`Antigravity onboarding failed (HTTP ${status})`);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([{ done: false }, { name: "operations/synthetic-operation" }])("polls only a successful pending operation and preserves the completed real project: %j", async pending => {
    vi.useFakeTimers();
    mockLoad({});
    fetchMock.mockResolvedValueOnce(Response.json(pending))
      .mockResolvedValueOnce(Response.json({ done: true, response: { cloudaicompanionProject: realProject } }));
    const result = antigravity.postExchange(tokens);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual({ userInfo, projectId: realProject });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("bounds pending-operation polling and leaves no background onboarding", async () => {
    vi.useFakeTimers();
    mockLoad({});
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ done: false })));
    const settled = antigravity.postExchange(tokens).then(value => ({ value }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(45_000);
    expect((await settled).error?.message).toBe("Antigravity onboarding did not complete");
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops immediately when the internal OAuth deadline expires during polling backoff", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    mockLoad({});
    fetchMock.mockResolvedValue(Response.json({ done: false }));
    const settled = antigravity.postExchange(tokens).then(value => ({ value }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    controller.abort(new Error("Synthetic OAuth deadline"));
    expect((await settled).error?.message).toBe("Synthetic OAuth deadline");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not send a credential request when the internal deadline is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Synthetic expired deadline"));
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    await expect(antigravity.postExchange(tokens)).rejects.toThrow("Synthetic expired deadline");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { error: { message: "account disabled" } }, { done: true },
    { done: true, response: { cloudaicompanionProject: { id: {} } } },
    { done: true, response: { cloudaicompanionProject: "not a project" } },
    { done: true, response: { cloudaicompanionProject: { id: "not\ta-project" } } }])("does not synthesize a project or retry malformed provisioning responses: %j", async payload => {
    mockLoad({});
    fetchMock.mockResolvedValueOnce(Response.json(payload));
    await expect(antigravity.postExchange(tokens)).rejects.toThrow(/Antigravity onboarding/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not map account credentials when provisioning returns a whitespace-containing project", async () => {
    const mapTokens = vi.spyOn(antigravity, "mapTokens");
    fetchMock.mockResolvedValueOnce(Response.json(tokens));
    mockLoad({ cloudaicompanionProject: "not a project" });
    fetchMock.mockResolvedValueOnce(Response.json({ done: true, response: { cloudaicompanionProject: { id: "also not a project" } } }));
    await expect(exchangeTokens("antigravity", "synthetic-code", "http://localhost/callback"))
      .rejects.toThrow("Antigravity onboarding completed without a valid project");
    expect(mapTokens).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not onboard after loadCodeAssist denies the account", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(userInfo)).mockResolvedValueOnce(new Response(`Echo ${tokens.access_token}`, { status: 403 }));
    await expect(antigravity.postExchange(tokens)).rejects.toThrow("Load Code Assist failed (HTTP 403)");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not send another credential request after user-info authorization is denied", async () => {
    fetchMock.mockResolvedValue(new Response(`Echo ${tokens.access_token}`, { status: 403 }));
    await expect(antigravity.postExchange(tokens)).rejects.toThrow("User information request failed (HTTP 403)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([null, [], { error: { message: "account disabled" } }])("does not provision from a malformed loadCodeAssist response: %j", async payload => {
    mockLoad(payload);
    await expect(antigravity.postExchange(tokens)).rejects.toThrow("Load Code Assist returned an invalid response");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
