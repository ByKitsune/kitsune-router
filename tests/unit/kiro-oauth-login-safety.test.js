import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import kiro from "../../src/lib/oauth/providers/kiro.js";
import { KiroService } from "../../src/lib/oauth/services/kiro.js";
import { pollForToken } from "../../src/lib/oauth/providers/index.js";

const client = { _clientId: "synthetic-client", _clientSecret: "synthetic-client-secret", _region: "eu-west-1", _authMethod: "idc" };
const grant = { accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresIn: 3600, tokenType: "Bearer" };
const registration = { clientId: client._clientId, clientSecret: client._clientSecret };
const device = { deviceCode: "synthetic-device", userCode: "ABCD-EFGH", verificationUri: "https://device.sso.eu-west-1.amazonaws.com/", expiresIn: 600, interval: 5 };
const malformedGrants = [null, [], {}, { accessToken: {} }, { accessToken: 17 }, { accessToken: " " },
  { accessToken: "invalid\n" }, { ...grant, refreshToken: {} }, { ...grant, refreshToken: "invalid token" },
  { ...grant, expiresIn: -1 }, { ...grant, expiresIn: "3600" }, { ...grant, tokenType: "Basic" },
  { ...grant, error: "access_denied" }];
let fetchMock;
beforeEach(() => { fetchMock = vi.spyOn(globalThis, "fetch"); });
afterEach(() => vi.restoreAllMocks());

describe("Kiro provider device flow credential boundaries", () => {
  it("registers and authorizes the selected regional client without following redirects", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(registration)).mockResolvedValueOnce(Response.json(device));
    const auth = await kiro.requestDeviceCode(kiro.config, null, { region: "eu-west-1", authMethod: "idc" });
    expect(auth).toMatchObject({ device_code: device.deviceCode, _region: "eu-west-1", _clientSecret: client._clientSecret });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://oidc.eu-west-1.amazonaws.com/client/register", "https://oidc.eu-west-1.amazonaws.com/device_authorization",
    ]);
    for (const [, options] of fetchMock.mock.calls) expect(options.redirect).toBe("error");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject(registration);
  });

  it("polls the same client and region using the native device grant", async () => {
    fetchMock.mockResolvedValue(Response.json(grant));
    expect(await kiro.pollToken(kiro.config, device.deviceCode, null, client)).toMatchObject({ ok: true, data: {
      access_token: grant.accessToken, refresh_token: grant.refreshToken, _region: "eu-west-1",
    } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oidc.eu-west-1.amazonaws.com/token");
    expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body)).toEqual({ ...registration, deviceCode: device.deviceCode, grantType: "urn:ietf:params:oauth:grant-type:device_code" });
  });

  it.each([400, 401, 403, 500])("does not authenticate a token embedded in HTTP %s", async status => {
    fetchMock.mockResolvedValue(Response.json({ ...grant, message: `Echo ${client._clientSecret}` }, { status }));
    const result = await pollForToken("kiro", device.deviceCode, null, client);
    expect(result.success).toBe(false);
    expect(result.tokens).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(client._clientSecret);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["authorization_pending", "slow_down", "expired_token", "access_denied", "invalid_grant"])("preserves the native device-flow %s condition", async error => {
    fetchMock.mockResolvedValue(Response.json({ error, error_description: `Echo ${client._clientSecret}` }, { status: 400 }));
    const result = await pollForToken("kiro", device.deviceCode, null, client);
    expect(result).toMatchObject({ success: false, error });
    expect(JSON.stringify(result)).not.toContain(client._clientSecret);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not treat an HTTP denial as pending even if the body claims it is", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...grant, error: "authorization_pending" }, { status: 403 }));
    expect(await pollForToken("kiro", device.deviceCode, null, client)).toMatchObject({ success: false, error: "access_denied" });
    expect(await new KiroService().pollDeviceToken(client._clientId, client._clientSecret, device.deviceCode)).toMatchObject({ success: false, error: "access_denied", pending: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(malformedGrants)("rejects malformed successful grants before account mapping: %j", async payload => {
    fetchMock.mockResolvedValue(Response.json(payload));
    expect(await pollForToken("kiro", device.deviceCode, null, client)).toMatchObject({ success: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles non-JSON errors without rereading the consumed body", async () => {
    fetchMock.mockResolvedValue(new Response(`not-json ${client._clientSecret}`, { status: 400 }));
    expect(await kiro.pollToken(kiro.config, device.deviceCode, null, client)).toMatchObject({ ok: false, data: { error: "invalid_response" } });
  });

  it.each(["us-east-1.amazonaws.com@unrelated.example/", "eu-west-1?x=invalid"])("rejects a modified region before the device secret can leave: %s", async region => {
    await expect(kiro.pollToken(kiro.config, device.deviceCode, null, { ...client, _region: region })).rejects.toThrow("Invalid region");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, {}, { clientId: "valid", clientSecret: {} }, { clientId: "valid", clientSecret: "invalid token" }])("rejects invalid registration before device authorization: %j", async payload => {
    fetchMock.mockResolvedValue(Response.json(payload));
    await expect(kiro.requestDeviceCode(kiro.config)).rejects.toThrow("invalid credentials");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not include credential echoes in registration errors", async () => {
    fetchMock.mockResolvedValue(new Response(`Echo ${client._clientSecret}`, { status: 403 }));
    await expect(kiro.requestDeviceCode(kiro.config)).rejects.toThrow("Client registration failed (HTTP 403)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Kiro service alternate OAuth/import boundaries", () => {
  const cases = [
    ["register", service => service.registerClient("eu-west-1"), registration, "https://oidc.eu-west-1.amazonaws.com/client/register"],
    ["authorize", service => service.startDeviceAuthorization(client._clientId, client._clientSecret, kiro.config.startUrl, "eu-west-1"), device, "https://oidc.eu-west-1.amazonaws.com/device_authorization"],
    ["poll", service => service.pollDeviceToken(client._clientId, client._clientSecret, device.deviceCode, "eu-west-1"), grant, "https://oidc.eu-west-1.amazonaws.com/token"],
    ["social exchange", service => service.exchangeSocialCode("synthetic-code", "synthetic-verifier"), grant, "https://prod.us-east-1.auth.desktop.kiro.dev/oauth/token"],
    ["AWS refresh", service => service.refreshToken("synthetic-refresh", { clientId: client._clientId, clientSecret: client._clientSecret, region: "eu-west-1" }), grant, "https://oidc.eu-west-1.amazonaws.com/token"],
    ["social refresh", service => service.refreshToken("synthetic-refresh"), grant, "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken"],
    ["profiles", service => service.listAvailableProfiles(grant.accessToken, "eu-west-1"), { profiles: [] }, "https://codewhisperer.eu-west-1.amazonaws.com"],
    ["API-key models", service => service.listAvailableApiKeyModels(grant.accessToken, "eu-west-1"), { models: [{ modelId: "synthetic" }] }, "https://q.eu-west-1.amazonaws.com/ListAvailableModels?origin=AI_EDITOR"],
    ["models", service => service.listAvailableModels(grant.accessToken, "synthetic-profile"), { models: [] }, "https://codewhisperer.us-east-1.amazonaws.com"],
  ];
  it.each(cases)("keeps %s credentials on the original configured endpoint", async (_name, invoke, payload, url) => {
    fetchMock.mockResolvedValue(Response.json(payload));
    await invoke(new KiroService());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "error" }));
  });

  it.each(cases)("does not accept %s redirect responses or expose response-body secrets", async (name, invoke) => {
    fetchMock.mockResolvedValue(new Response(`Echo ${client._clientSecret}`, { status: 307, headers: { Location: "https://unrelated.example/credential-collector" } }));
    if (name === "poll") {
      expect(await invoke(new KiroService())).toMatchObject({ success: false, pending: false, error: "invalid_response" });
    } else {
      const error = await invoke(new KiroService()).catch(error => error);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).not.toContain(client._clientSecret);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
  });

  it.each(malformedGrants)("rejects malformed social grants instead of importing them: %j", async payload => {
    fetchMock.mockResolvedValue(Response.json(payload));
    await expect(new KiroService().exchangeSocialCode("synthetic-code", "synthetic-verifier")).rejects.toThrow("invalid token response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["authorization_pending", "slow_down", "access_denied", "expired_token"])("keeps service device error %s terminal/pending as declared", async error => {
    fetchMock.mockResolvedValue(Response.json({ ...grant, error }, { status: 400 }));
    expect(await new KiroService().pollDeviceToken(client._clientId, client._clientSecret, device.deviceCode)).toMatchObject({
      success: false, error, pending: error === "authorization_pending" || error === "slow_down",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
