import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platform, arch } from "node:os";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getProviderConnectionById: vi.fn(), updateProviderConnection: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn(async () => ({})) }));
vi.mock("@/lib/network/proxyTest", () => ({ testProxyUrl: vi.fn() }));

import { GithubExecutor } from "../../open-sse/executors/github.js";
import { GeminiCLIExecutor } from "../../open-sse/executors/gemini-cli.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { resolveCopilotModels, clearCopilotModelCache } from "../../open-sse/services/copilotModels.js";
import { refreshCopilotToken } from "../../open-sse/services/tokenRefresh/providers.js";
import { getGitHubUsage } from "../../open-sse/services/usage/github.js";
import githubOAuth from "../../src/lib/oauth/providers/github.js";
import * as clientVersions from "../../open-sse/config/clientVersions.js";
import { GITHUB_CONFIG, GEMINI_CONFIG, getOAuthClientMetadata } from "../../src/lib/oauth/constants/oauth.js";
// These legacy service modules import absent interactive-only dependencies.
// Evaluate their unmodified class bodies with those I/O seams unavailable.
function loadService(file, name, globals) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "").replaceAll("export class ", "class ");
  return runInNewContext(`${source}\n${name}`, { ...clientVersions, ...globals, fetch: (...args) => globalThis.fetch(...args) });
}
const GitHubService = loadService("../../src/lib/oauth/services/github.js", "GitHubService", { GITHUB_CONFIG, OAuthService: class {} });
const GeminiCLIService = loadService("../../src/lib/oauth/services/gemini.js", "GeminiCLIService", { GEMINI_CONFIG, getOAuthClientMetadata });
import { getProviderConnectionById } from "@/lib/localDb";
import { testSingleConnection } from "../../src/app/api/providers/[id]/test/testUtils.js";
import { LOAD_CODE_ASSIST_HEADERS, ANTIGRAVITY_LOAD_CODE_ASSIST_HEADERS } from "../../open-sse/config/appConstants.js";
vi.mock("@/models", () => ({ getProviderConnectionById: vi.fn() }));
vi.mock("@/dashboardGuard", () => ({ hasValidCliToken: async () => true, isAuthenticated: async () => false }));
import { getProviderConnectionById as getModelConnection } from "@/models";
import { GET as getModels } from "../../src/app/api/providers/[id]/models/route.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";

const json = data => new Response(JSON.stringify(data));
const lastHeaders = mock => new Headers(mock.mock.calls.at(-1)[1].headers);
const auth = { accessToken: "fixture-github", copilotToken: "fixture-copilot" };
const apiClient = `gl-node/${process.version.replace(/^v/, "")}`;
const authUserAgent = "google-api-nodejs-client/10.9.0";
beforeEach(() => {
  vi.clearAllMocks();
  clearCopilotModelCache();
  proxyAwareFetch.mockImplementation(async () => json({ token: "fixture-new", expires_at: 9999999999 }));
  vi.stubGlobal("fetch", vi.fn(async () => json({ token: "fixture-new", login: "fixture-user", cloudaicompanionProject: "fixture-project" })));
});
afterEach(() => vi.unstubAllGlobals());

// VS Code 1.143.0 bundles Copilot 0.71.0 and CAPI 0.5.2 at
// 2d0b7506a36c1d6db9a466440131a8e01eab2289: chat/models 2026-08-01;
// CopilotToken and CopilotUserInfo bypass it and keep 2025-04-01.
describe("Copilot API-version surfaces", () => {
  it.each(["chat", "responses", "messages"])("sends final CAPI version on %s", async route => {
    const executor = new GithubExecutor();
    proxyAwareFetch.mockResolvedValue(new Response("fixture rejection", { status: 400 }));
    const options = { model: route === "messages" ? "claude-sonnet-5" : "gpt-5.4", body: { messages: [{ role: "user", content: "fixture" }] }, stream: false, credentials: auth };
    if (route === "responses") await executor.executeWithResponsesEndpoint(options);
    else await executor.execute(options);
    const headers = lastHeaders(proxyAwareFetch);
    expect(headers.get("x-github-api-version")).toBe("2026-08-01");
    expect(headers.get("editor-version")).toBe("vscode/1.143.0");
    expect(headers.get("editor-plugin-version")).toBe("copilot-chat/0.71.0");
    expect(PROVIDERS.github.headers["x-github-api-version"]).toBe("2026-08-01");
  });

  it("sends final CAPI version on actual model discovery", async () => {
    proxyAwareFetch.mockResolvedValue(json({ data: [{ id: "fixture-model", capabilities: { type: "chat" } }] }));
    expect(await resolveCopilotModels(auth, { forceRefresh: true })).toMatchObject({ models: [{ id: "fixture-model" }] });
    expect(lastHeaders(proxyAwareFetch).get("x-github-api-version")).toBe("2026-08-01");
  });

  it("sends final CAPI version from the dashboard provider model route", async () => {
    getModelConnection.mockResolvedValue({ id: "fixture-copilot-catalog", provider: "github", accessToken: "fixture-github", providerSpecificData: { copilotToken: "fixture-copilot" } });
    proxyAwareFetch.mockResolvedValue(json({ data: [{ id: "fixture-model", capabilities: { type: "chat" } }] }));
    const response = await getModels({ nextUrl: new URL("http://localhost/api/providers/fixture-copilot-catalog/models?refresh=1") }, { params: Promise.resolve({ id: "fixture-copilot-catalog" }) });
    expect(response.status).toBe(200);
    expect(lastHeaders(proxyAwareFetch).get("x-github-api-version")).toBe("2026-08-01");
  });

  it("keeps executor and service token refresh on the token API", async () => {
    await new GithubExecutor().refreshCopilotToken("fixture-executor");
    expect(lastHeaders(proxyAwareFetch).get("x-github-api-version")).toBe("2025-04-01");
    await refreshCopilotToken("fixture-service");
    expect(lastHeaders(proxyAwareFetch).get("x-github-api-version")).toBe("2025-04-01");
  });

  it("uses Copilot user-info version rather than generic GitHub OAuth version", async () => {
    await getGitHubUsage("fixture-user-token", {});
    expect(lastHeaders(proxyAwareFetch).get("x-github-api-version")).toBe("2025-04-01");
  });

  it("splits both OAuth token implementations from general GitHub user lookup", async () => {
    await githubOAuth.postExchange({ access_token: "fixture-oauth" });
    expect(new Headers(fetch.mock.calls[0][1].headers).get("x-github-api-version")).toBe("2025-04-01");
    expect(new Headers(fetch.mock.calls[1][1].headers).get("x-github-api-version")).toBe("2022-11-28");
    await new GitHubService().getCopilotToken("fixture-service-oauth");
    expect(lastHeaders(fetch).get("x-github-api-version")).toBe("2025-04-01");
    await new GitHubService().getUserInfo("fixture-service-user");
    expect(lastHeaders(fetch).get("x-github-api-version")).toBe("2022-11-28");
  });
});

// Gemini CLI 0.65.0 resolves core google-auth-library 10.9.0, not the
// root 9.15.1 or API-key GoogleGenAI branch. Runtime is the executing host.
describe("Gemini OAuth Code Assist headers", () => {
  it("uses the auth-client fingerprint and full per-model CLI UA on actual generation", async () => {
    await new GeminiCLIExecutor().execute({ model: "fixture-model", body: { contents: [] }, stream: false, credentials: { accessToken: "fixture-google", projectId: "fixture-project" } });
    const headers = lastHeaders(proxyAwareFetch);
    expect(headers.get("x-goog-api-client")).toBe(apiClient);
    expect(headers.get("user-agent")).toBe(`GeminiCLI/0.65.0/fixture-model (${platform()}; ${arch() === "ia32" ? "x86" : arch()}; terminal) ${authUserAgent}`);
    expect(headers.get("x-goog-api-client")).not.toContain("google-genai-sdk");
  });

  it("uses the auth fingerprint on the actual provider model route", async () => {
    getModelConnection.mockResolvedValue({ id: "fixture-catalog", provider: "gemini-cli", accessToken: "fixture-google", expiresAt: "2099-01-01T00:00:00Z", projectId: "fixture-project" });
    proxyAwareFetch.mockResolvedValue(json({ models: [{ id: "fixture-model" }] }));
    const response = await getModels({ nextUrl: new URL("http://localhost/api/providers/fixture-catalog/models?refresh=1") }, { params: Promise.resolve({ id: "fixture-catalog" }) });
    expect(response.status).toBe(200);
    expect(lastHeaders(proxyAwareFetch).get("user-agent")).toBe(authUserAgent);
    expect(lastHeaders(proxyAwareFetch).get("x-goog-api-client")).toBe(apiClient);
  });

  it("uses the bundled auth identity for OAuth project discovery", async () => {
    expect(await new GeminiCLIService().fetchProjectId("fixture-google")).toBe("fixture-project");
    expect(lastHeaders(fetch).get("user-agent")).toBe(authUserAgent);
    expect(lastHeaders(fetch).get("x-goog-api-client")).toBe(apiClient);
    expect(LOAD_CODE_ASSIST_HEADERS["User-Agent"]).toBe(authUserAgent);
    expect(LOAD_CODE_ASSIST_HEADERS["X-Goog-Api-Client"]).toBe(apiClient);
    expect(ANTIGRAVITY_LOAD_CODE_ASSIST_HEADERS).not.toHaveProperty("X-Goog-Api-Client");
  });

  it("uses the same auth fingerprint in the real dashboard connection probe", async () => {
    getProviderConnectionById.mockResolvedValue({ id: "fixture-gemini", provider: "gemini-cli", accessToken: "fixture-google", expiresAt: "2099-01-01T00:00:00Z" });
    expect(await testSingleConnection("fixture-gemini")).toMatchObject({ valid: true });
    expect(lastHeaders(fetch).get("user-agent")).toBe(authUserAgent);
    expect(lastHeaders(fetch).get("x-goog-api-client")).toBe(apiClient);
  });
});
