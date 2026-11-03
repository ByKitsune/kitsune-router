import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { KiroExecutor } from "../../open-sse/executors/kiro.js";
import { refreshKiroToken } from "../../open-sse/services/tokenRefresh/providers.js";
import { clearKiroModelCache, resolveKiroModels } from "../../open-sse/services/kiroModels.js";
import { assertValidAwsRegion as importRegionValidator } from "@/lib/oauth/constants/oauth";
import { assertValidAwsRegion } from "../../open-sse/config/awsRegions.js";

const invalidRegions = [
  "us-east-1.amazonaws.com@unrelated.example/",
  "us-east-1/../../unrelated.example",
  "us-east-1?redirect=unrelated.example",
  "us-east-1.attacker.example",
  42,
];
const profileArn = region => `arn:aws:codewhisperer:${region}:123456789012:profile/synthetic`;
const specific = (region, authMethod = "idc") => ({
  authMethod, region, clientId: "synthetic-client", clientSecret: "synthetic-client-secret",
  profileArn: profileArn("us-east-1"),
});
let sequence = 0;
const refreshToken = () => `synthetic-kiro-refresh-${++sequence}`;
const externalSpecific = () => ({
  authMethod: "external_idp", clientId: "synthetic-client",
  tokenEndpoint: "https://login.microsoftonline.com/tenant/oauth2/v2.0/token", scope: "offline_access",
});

beforeEach(() => {
  vi.clearAllMocks();
  clearKiroModelCache();
});
afterEach(() => clearKiroModelCache());

describe("Kiro runtime credential destination safety", () => {
  it("shares the same region validator for OAuth import and runtime", () => {
    expect(importRegionValidator).toBe(assertValidAwsRegion);
  });

  it.each(invalidRegions)("does not send inference credentials for a persisted invalid region: %s", async region => {
    const executor = new KiroExecutor();
    await expect(executor.execute({
      model: "claude-sonnet-4-6", body: {}, stream: false,
      credentials: { accessToken: "synthetic-access", providerSpecificData: specific(region) },
    })).rejects.toThrow("Invalid region");
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it.each(invalidRegions)("does not send client/refresh secrets for an invalid region: %s", async region => {
    await expect(refreshKiroToken(refreshToken(), specific(region))).rejects.toThrow("Invalid region");
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("validates before returning a previously acquired refresh result", async () => {
    const oldToken = refreshToken();
    proxyAwareFetch.mockResolvedValue(Response.json({ accessToken: "synthetic-new-access", refreshToken: "synthetic-new-refresh" }));
    expect(await refreshKiroToken(oldToken, specific("us-east-1"))).toMatchObject({ accessToken: "synthetic-new-access" });
    await expect(refreshKiroToken(oldToken, specific(invalidRegions[0]))).rejects.toThrow("Invalid region");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it.each(invalidRegions.filter(region => typeof region === "string"))("does not send catalog credentials for an invalid profile region: %s", async region => {
    expect(await resolveKiroModels({
      accessToken: "synthetic-catalog-access", refreshToken: "synthetic-catalog-refresh",
      providerSpecificData: { profileArn: profileArn(region) },
    })).toBeNull();
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("keeps valid native profile ARN catalog requests on their regional AWS host", async () => {
    proxyAwareFetch.mockResolvedValue(Response.json({ models: [{ modelId: "synthetic-model" }] }));
    expect(await resolveKiroModels({ accessToken: "synthetic-catalog-access",
      providerSpecificData: { profileArn: profileArn("eu-west-1") } })).not.toBeNull();
    const [url, options] = proxyAwareFetch.mock.calls[0];
    expect(new URL(url).hostname).toBe("q.eu-west-1.amazonaws.com");
    expect(new URL(url).searchParams.get("profileArn")).toBe(profileArn("eu-west-1"));
    expect(options.headers.Authorization).toBe("Bearer synthetic-catalog-access");
    expect(options.redirect).toBe("error");
  });

  it.each(["idc", "builder-id"])("refreshes %s on its registered region with redirects disabled", async authMethod => {
    proxyAwareFetch.mockResolvedValue(Response.json({ accessToken: "synthetic-new-access", refreshToken: "synthetic-new-refresh", expiresIn: 3600 }));
    const token = refreshToken();
    expect(await refreshKiroToken(token, specific("eu-west-1", authMethod))).toMatchObject({ accessToken: "synthetic-new-access", refreshToken: "synthetic-new-refresh" });
    const [url, options] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe("https://oidc.eu-west-1.amazonaws.com/token");
    expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body)).toEqual({
      clientId: "synthetic-client", clientSecret: "synthetic-client-secret", refreshToken: token, grantType: "refresh_token",
    });
  });

  it.each([
    ["social", { accessToken: "synthetic-new-access" }],
    ["external_idp", { access_token: "synthetic-new-access" }],
  ])("refuses redirects on %s refresh", async (authMethod, payload) => {
    proxyAwareFetch.mockResolvedValue(Response.json(payload));
    const data = authMethod === "social" ? { profileArn: profileArn("us-east-1") } : externalSpecific();
    expect(await refreshKiroToken(refreshToken(), data)).toMatchObject({ accessToken: "synthetic-new-access" });
    expect(proxyAwareFetch.mock.calls[0][1].redirect).toBe("error");
  });

  it.each([null, {}, { accessToken: {} }, { accessToken: 12 }, { accessToken: "  " }, { accessToken: "invalid token" }, { accessToken: "invalid\n" }, { accessToken: "valid", refreshToken: {} }, { accessToken: "valid", refreshToken: "invalid token" }])("rejects malformed AWS grant payload without enrichment: %j", async payload => {
    proxyAwareFetch.mockResolvedValue(Response.json(payload));
    expect(await refreshKiroToken(refreshToken(), specific("us-east-1"))).toBeNull();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { accessToken: {} }, { accessToken: " " }, { accessToken: "invalid token" }, { accessToken: "valid", refreshToken: [] }, { accessToken: "valid", refreshToken: "invalid token" }])("rejects malformed social grant payload without enrichment: %j", async payload => {
    proxyAwareFetch.mockResolvedValue(Response.json(payload));
    expect(await refreshKiroToken(refreshToken(), {})).toBeNull();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { access_token: {} }, { access_token: " " }, { access_token: "invalid token" }, { access_token: "valid", refresh_token: [] }, { access_token: "valid", refresh_token: "invalid token" }])("rejects malformed external IdP grant payload: %j", async payload => {
    proxyAwareFetch.mockResolvedValue(Response.json(payload));
    expect(await refreshKiroToken(refreshToken(), externalSpecific())).toBeNull();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["AWS", specific("us-east-1"), 401],
    ["AWS", specific("us-east-1"), 403],
    ["social", {}, 403],
    ["external IdP", externalSpecific(), 403],
  ])("stops %s refresh on denial and keeps upstream credential echoes out of logs", async (_branch, metadata, status) => {
    const token = refreshToken();
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    proxyAwareFetch.mockResolvedValue(Response.json({
      accessToken: "should-not-be-accepted", access_token: "should-not-be-accepted",
      message: `Account disabled. Echo ${token}, synthetic-client-secret`,
    }, { status }));
    expect(await refreshKiroToken(token, metadata, log)).toBeNull();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(token);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("synthetic-client-secret");
    expect(log.error).toHaveBeenCalledWith("TOKEN_REFRESH", expect.any(String), { status });
  });
});
