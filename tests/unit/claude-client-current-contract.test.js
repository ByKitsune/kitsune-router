import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models", () => ({ getProviderConnectionById: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn(async () => ({})) }));
vi.mock("@/dashboardGuard", () => ({ hasValidCliToken: async () => true, isAuthenticated: async () => false }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import claude from "../../src/lib/oauth/providers/claude.js";
import { OAUTH_ENDPOINTS } from "../../open-sse/config/appConstants.js";
import { refreshClaudeOAuthToken } from "../../open-sse/services/tokenRefresh/providers.js";
import { getProviderConnectionById } from "@/models";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { clearProviderLiveModelsCache } from "../../src/shared/utils/providerLiveModels.js";
import { GET } from "../../src/app/api/providers/[id]/models/route.js";

const config = claude.config;
const clientId = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const lookup = () => GET({ nextUrl: new URL("http://localhost/api/providers/claude-fixture/models?refresh=1") }, {
  params: Promise.resolve({ id: "claude-fixture" }),
});
const page = (id, extra = {}) => Response.json({ data: [{ id, display_name: id }], has_more: false, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  clearProviderLiveModelsCache();
  proxyAwareFetch.mockImplementation(async () => page("claude-fixture-model"));
  getProviderConnectionById.mockResolvedValue({ id: "claude-fixture", provider: "claude", accessToken: "fixture-oauth-proof" });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external request"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Claude 2.1.314 production OAuth endpoint contract", () => {
  it("uses the ClaudeAI login surface without broadening permissions or replacing the callback", () => {
    const callback = "http://localhost:20128/callback";
    const url = new URL(claude.buildAuthUrl(config, callback, "fixture-state", "fixture-challenge"));
    expect(url.origin + url.pathname).toBe("https://claude.com/cai/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(clientId);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code")).toBe("true");
    expect(url.searchParams.get("scope").split(" ")).toEqual(["org:create_api_key", "user:profile", "user:inference"]);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("fixture-challenge");
    expect(url.searchParams.get("state")).toBe("fixture-state");
    expect(url.searchParams.get("redirect_uri")).toBe(callback);
    expect(OAUTH_ENDPOINTS.anthropic.auth).toBe("https://platform.claude.com/oauth/authorize");
  });

  it.each([
    ["fixture-code#pasted-state", "http://localhost:20128/callback", "pasted-state"],
    ["fixture-code", "https://platform.claude.com/oauth/code/callback", "fixture-state"],
  ])("exchanges %s through the current token endpoint while preserving state and redirect", async (code, callback, state) => {
    const tokens = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600 };
    fetch.mockResolvedValueOnce(Response.json(tokens));
    expect(await claude.exchangeToken(config, code, callback, "fixture-verifier", "fixture-state")).toEqual(tokens);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://platform.claude.com/v1/oauth/token");
    expect(options.method).toBe("POST");
    expect(new Headers(options.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({
      code: "fixture-code", state, grant_type: "authorization_code", client_id: clientId,
      redirect_uri: callback, code_verifier: "fixture-verifier",
    });
    expect(claude.mapTokens(tokens)).toEqual({
      accessToken: "fixture-access", refreshToken: "fixture-refresh", expiresIn: 3600, scope: undefined,
    });
  });

  it("refreshes through the same current endpoint and retains the selected proxy boundary", async () => {
    const policy = { strictProxy: true, connectionProxyUrl: "http://fixture-proxy.invalid" };
    proxyAwareFetch.mockResolvedValueOnce(Response.json({ access_token: "fixture-renewed-access", refresh_token: "fixture-renewed-refresh", expires_in: 3600 }));
    expect(await refreshClaudeOAuthToken("fixture-current-contract-refresh", null, policy)).toEqual({
      accessToken: "fixture-renewed-access", refreshToken: "fixture-renewed-refresh", expiresIn: 3600,
    });
    const [url, options, actualPolicy] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe("https://platform.claude.com/v1/oauth/token");
    expect(actualPolicy).toBe(policy);
    expect(new Headers(options.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({
      grant_type: "refresh_token", refresh_token: "fixture-current-contract-refresh", client_id: clientId,
    });
  });
});

describe("Claude model discovery keeps destination credential profiles distinct", () => {
  it("uses Bearer/OAuth beta and the current client identity for every catalog page", async () => {
    proxyAwareFetch.mockResolvedValueOnce(page("claude-first", { has_more: true, last_id: "claude-first" }));
    proxyAwareFetch.mockResolvedValueOnce(page("claude-second"));
    const result = await lookup();
    expect(result.status).toBe(200);
    expect((await result.json()).models.map(model => model.id)).toEqual(["claude-first", "claude-second"]);
    expect(proxyAwareFetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.anthropic.com/v1/models?limit=1000",
      "https://api.anthropic.com/v1/models?limit=1000&after_id=claude-first",
    ]);
    for (const [, options] of proxyAwareFetch.mock.calls) {
      const headers = new Headers(options.headers);
      expect(headers.get("authorization")).toBe("Bearer fixture-oauth-proof");
      expect(headers.get("x-api-key")).toBeNull();
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      expect(headers.get("anthropic-beta")).toBe("oauth-2025-04-20");
      expect(headers.get("user-agent")).toBe("claude-cli/2.1.314 (external, sdk-cli)");
    }
  });

  it("prefers an explicit API key and does not attach OAuth or ClaudeCLI identity to that profile", async () => {
    getProviderConnectionById.mockResolvedValue({ id: "claude-fixture", provider: "claude", apiKey: "fixture-api-key", accessToken: "unused-oauth-proof" });
    expect((await lookup()).status).toBe(200);
    const headers = new Headers(proxyAwareFetch.mock.calls[0][1].headers);
    expect(headers.get("x-api-key")).toBe("fixture-api-key");
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("anthropic-beta")).toBeNull();
    expect(headers.get("user-agent")).toBeNull();
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  it("does not advertise an incomplete page as a successful live catalog", async () => {
    proxyAwareFetch.mockResolvedValueOnce(page("partial-model", { has_more: true }));
    const result = await lookup();
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: "Failed to fetch complete Claude model catalog" });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch discovery without a destination credential", async () => {
    getProviderConnectionById.mockResolvedValue({ id: "claude-fixture", provider: "claude" });
    expect((await lookup()).status).toBe(401);
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });
});
