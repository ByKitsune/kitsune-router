import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models", () => ({ getProviderConnectionById: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn(async () => ({})) }));
vi.mock("@/dashboardGuard", () => ({ hasValidCliToken: async () => true, isAuthenticated: async () => false }));
vi.mock("@/sse/services/tokenRefresh", () => ({
  refreshGoogleToken: vi.fn(), refreshCodexToken: vi.fn(), updateProviderCredentials: vi.fn(),
}));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { getProviderConnectionById } from "@/models";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { refreshCodexToken, updateProviderCredentials } from "@/sse/services/tokenRefresh";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { CODEX_MODELS_CLIENT_VERSION, CODEX_USER_AGENT } from "../../open-sse/config/clientVersions.js";
import { GET } from "../../src/app/api/providers/[id]/models/route.js";

const response = id => Response.json({ models: [{ slug: id, display_name: id }] });
const lookup = id => GET({ nextUrl: new URL(`http://localhost/api/providers/${id}/models?refresh=1`) }, {
  params: Promise.resolve({ id }),
});
const connection = data => ({ id: "fixture-connection", provider: "codex", accessToken: "fixture-token", ...data });

beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => response("fixture-model"));
  getProviderConnectionById.mockResolvedValue(connection());
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external catalog request"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Codex catalog identity belongs to the destination connection", () => {
  it.each([
    [{ workspaceId: "chosen-workspace", chatgptAccountId: "fallback-account", accountId: "legacy-account" }, "chosen-workspace"],
    [{ chatgptAccountId: "chosen-account", accountId: "legacy-account" }, "chosen-account"],
    [{ accountId: "legacy-account" }, "legacy-account"],
    [{}, null],
  ])("uses the same release and account priority as execution for %j", async (providerSpecificData, expected) => {
    getProviderConnectionById.mockResolvedValue(connection({ providerSpecificData }));
    const result = await lookup("fixture-connection");
    expect(result.status).toBe(200);
    const [url, options] = proxyAwareFetch.mock.calls[0];
    const headers = new Headers(options.headers);
    expect(url).toBe(`https://chatgpt.com/backend-api/codex/models?client_version=${CODEX_MODELS_CLIENT_VERSION}`);
    expect(headers.get("user-agent")).toBe(CODEX_USER_AGENT);
    expect(headers.get("originator")).toBe("codex_cli_rs");
    expect(headers.get("authorization")).toBe("Bearer fixture-token");
    expect(headers.get("chatgpt-account-id")).toBe(expected);
  });

  it("does not share a caller/account identity or catalog between concurrent connections", async () => {
    getProviderConnectionById.mockImplementation(async id => connection({
      id, accessToken: `fixture-token-${id}`, providerSpecificData: { chatgptAccountId: `account-${id}` },
      rawHeaders: { "chatgpt-account-id": "untrusted-caller-account", "user-agent": "untrusted-caller-agent" },
    }));
    proxyAwareFetch.mockImplementation(async (_url, options) => response(new Headers(options.headers).get("chatgpt-account-id")));
    const [first, second] = await Promise.all([lookup("first"), lookup("second")]);
    expect((await first.json()).models[0].id).toBe("account-first");
    expect((await second.json()).models[0].id).toBe("account-second");
    for (const [, options] of proxyAwareFetch.mock.calls) {
      const headers = new Headers(options.headers);
      const account = headers.get("chatgpt-account-id");
      expect(headers.get("authorization")).toBe(`Bearer fixture-token-${account.slice("account-".length)}`);
      expect(headers.get("user-agent")).toBe(CODEX_USER_AGENT);
    }
  });

  it("retains the selected account and proxy boundary when refreshing a rejected token", async () => {
    const proxyOptions = { strictProxy: true, connectionProxyUrl: "http://fixture-proxy.invalid" };
    resolveConnectionProxyConfig.mockResolvedValue(proxyOptions);
    getProviderConnectionById.mockResolvedValue(connection({
      refreshToken: "fixture-refresh", providerSpecificData: { chatgptAccountId: "bound-account" },
    }));
    proxyAwareFetch.mockResolvedValueOnce(new Response("expired", { status: 401 }));
    proxyAwareFetch.mockResolvedValueOnce(response("refreshed-model"));
    refreshCodexToken.mockResolvedValue({ accessToken: "fixture-new-token", refreshToken: "fixture-new-refresh", expiresIn: 3600 });
    expect((await lookup("fixture-connection")).status).toBe(200);
    expect(refreshCodexToken).toHaveBeenCalledWith("fixture-refresh", proxyOptions, expect.any(AbortSignal));
    expect(updateProviderCredentials).toHaveBeenCalledWith("fixture-connection", {
      accessToken: "fixture-new-token", refreshToken: "fixture-new-refresh", expiresIn: 3600,
    });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    for (const [, options, proxy] of proxyAwareFetch.mock.calls) {
      expect(proxy).toBe(proxyOptions);
      expect(new Headers(options.headers).get("chatgpt-account-id")).toBe("bound-account");
      expect(new Headers(options.headers).get("user-agent")).toBe(CODEX_USER_AGENT);
    }
    expect(new Headers(proxyAwareFetch.mock.calls[1][1].headers).get("authorization")).toBe("Bearer fixture-new-token");
  });
});
