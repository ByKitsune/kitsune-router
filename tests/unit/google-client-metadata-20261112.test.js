import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platform, release } from "node:os";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("../../open-sse/services/tokenRefresh.js", () => ({ refreshKiroToken: vi.fn() }));
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getProjectIdForConnection, removeConnection } from "../../open-sse/services/projectId.js";
import { getGeminiUsage } from "../../open-sse/services/usage/google.js";
import { resolveKiroModels, clearKiroModelCache } from "../../open-sse/services/kiroModels.js";
import geminiOAuth from "../../src/lib/oauth/providers/gemini-cli.js";
import { GEMINI_AUTH_USER_AGENT, GEMINI_CLI_API_CLIENT } from "../../open-sse/config/clientVersions.js";

// Literal metadata from the integrity-checked Gemini CLI 0.68.0 core setup,
// independent of Antigravity's numeric IDE/platform/plugin enum profile.
const geminiMetadata = { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" };
const connectionIds = [];
const json = value => Response.json(value);

beforeEach(() => { vi.clearAllMocks(); clearKiroModelCache(); });
afterEach(() => {
  for (const id of connectionIds.splice(0)) removeConnection(id);
  vi.unstubAllGlobals();
});

describe("provider-scoped Google client metadata", () => {
  it.each([false, true])("uses terminal metadata for Gemini project provisioning, onboarding=%s", async onboarding => {
    if (onboarding) {
      proxyAwareFetch.mockResolvedValueOnce(json({ allowedTiers: [{ id: "fixture-default", isDefault: true }] }));
      proxyAwareFetch.mockResolvedValueOnce(json({ done: true, response: { cloudaicompanionProject: { id: "account-project" } } }));
    } else proxyAwareFetch.mockResolvedValueOnce(json({ cloudaicompanionProject: "account-project" }));
    const id = `gemini-terminal-${onboarding}`;
    connectionIds.push(id);
    expect(await getProjectIdForConnection(id, "synthetic-token", "gemini-cli")).toBe("account-project");
    for (const [, request] of proxyAwareFetch.mock.calls) {
      expect(JSON.parse(request.body).metadata).toEqual(geminiMetadata);
      const headers = new Headers(request.headers);
      expect(headers.get("user-agent")).toBe(GEMINI_AUTH_USER_AGENT);
      expect(headers.get("x-goog-api-client")).toBe(GEMINI_CLI_API_CLIENT);
      expect(headers.has("client-metadata")).toBe(false);
      expect(request.redirect).toBe("error");
    }
  });

  it.each([false, true])("retains Antigravity's independent numeric metadata, onboarding=%s", async onboarding => {
    if (onboarding) {
      proxyAwareFetch.mockResolvedValueOnce(json({ allowedTiers: [{ id: "fixture-default", isDefault: true }] }));
      proxyAwareFetch.mockResolvedValueOnce(json({ done: true, response: { cloudaicompanionProject: { id: "account-project" } } }));
    } else proxyAwareFetch.mockResolvedValueOnce(json({ cloudaicompanionProject: "account-project" }));
    const id = `antigravity-independent-${onboarding}`;
    connectionIds.push(id);
    expect(await getProjectIdForConnection(id, "synthetic-token", "antigravity")).toBe("account-project");
    for (const [, request] of proxyAwareFetch.mock.calls) {
      expect(JSON.parse(request.body).metadata).toMatchObject({ ideType: 9, pluginType: 2 });
      expect(typeof JSON.parse(request.body).metadata.platform).toBe("number");
      expect(new Headers(request.headers).has("x-goog-api-client")).toBe(false);
    }
  });

  it("uses the same terminal profile when checking Gemini quota without a stored project", async () => {
    proxyAwareFetch.mockResolvedValueOnce(json({ cloudaicompanionProject: "account-project" }));
    proxyAwareFetch.mockResolvedValueOnce(json({ buckets: [] }));
    await getGeminiUsage("synthetic-token", {});
    expect(JSON.parse(proxyAwareFetch.mock.calls[0][1].body).metadata).toEqual(geminiMetadata);
    expect(JSON.parse(proxyAwareFetch.mock.calls[1][1].body)).toEqual({ project: "account-project" });
  });

  it("uses the terminal metadata and auth headers on the real Gemini OAuth post-exchange path", async () => {
    const fetch = vi.fn(async url => url.includes("userinfo") ? json({ email: "synthetic@example.invalid" }) : json({ cloudaicompanionProject: "account-project" }));
    vi.stubGlobal("fetch", fetch);
    const result = await geminiOAuth.postExchange({ access_token: "synthetic-token" });
    expect(result.projectId).toBe("account-project");
    const [, request] = fetch.mock.calls.find(([url]) => url.includes(":loadCodeAssist"));
    expect(JSON.parse(request.body).metadata).toEqual(geminiMetadata);
    expect(new Headers(request.headers).get("user-agent")).toBe(GEMINI_AUTH_USER_AGENT);
    expect(new Headers(request.headers).get("x-goog-api-client")).toBe(GEMINI_CLI_API_CLIENT);
  });
});

it("reports the actual gateway host/runtime in Kiro model discovery", async () => {
  proxyAwareFetch.mockResolvedValueOnce(json({ models: [{ modelId: "synthetic-model" }] }));
  await resolveKiroModels({ accessToken: "synthetic-kiro-token" }, { forceRefresh: true });
  const userAgent = new Headers(proxyAwareFetch.mock.calls[0][1].headers).get("user-agent");
  expect(userAgent).toContain(`os/${platform()}#${release()}`);
  expect(userAgent).toContain(`md/nodejs#${process.versions.node}`);
});
