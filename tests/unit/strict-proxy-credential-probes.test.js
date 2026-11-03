import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { isDeepStrictEqual } from "node:util";

const mocks = vi.hoisted(() => ({
  getProviderConnectionById: vi.fn(), updateProviderConnection: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: mocks.getProviderConnectionById,
  updateProviderConnection: mocks.updateProviderConnection,
}));
vi.mock("@/models", () => ({ getProviderNodeById: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: mocks.resolveConnectionProxyConfig }));
vi.mock("@/lib/network/proxyTest", () => ({ testProxyUrl: vi.fn() }));

// Load the real transport: mocking global fetch after import skips its strict guard.
import "../../open-sse/utils/proxyFetch.js";
import { testApiKeyConnection, testSingleConnection } from "../../src/app/api/providers/[id]/test/testUtils.js";

const strictProxyFailure = "[ProxyFetch] Proxy required but no proxy URL configured (strictProxy=true)";
const diagnosticExpectations = {
  "does not directly refresh an expired OAuth token when its strict proxy is unavailable": [
    ["log", "Error refreshing gemini-cli token:", strictProxyFailure],
  ],
  "does not directly refresh expired codex credentials without its strict proxy": [
    ["error", "TOKEN_REFRESH", `Network error refreshing Codex token: ${strictProxyFailure}`],
  ],
  "does not directly refresh expired grok-cli credentials without its strict proxy": [
    ["warn", "TOKEN_REFRESH", `xai refresh failed: ${strictProxyFailure}`],
  ],
};

let expectedDiagnostics = [];
let diagnosticCalls = [];
let diagnosticSpies = [];

beforeEach(({ task }) => {
  expectedDiagnostics = diagnosticExpectations[task.name] || [];
  diagnosticCalls = [];
  diagnosticSpies = ["warn","error","log"].map(method => {
    const original = console[method].bind(console);
    return vi.spyOn(console, method).mockImplementation((...args) => {
      if (method === "log" && !(typeof args[0] === "string" && /^Error refreshing [a-z0-9-]+ token:$/.test(args[0]))) return original(...args);
      const call = [method, ...args];
      const expected = expectedDiagnostics[diagnosticCalls.length];
      diagnosticCalls.push(call);
      const matches = expected?.length === call.length && expected.every((value, index) =>
        typeof value?.asymmetricMatch === "function" ? value.asymmetricMatch(call[index]) : isDeepStrictEqual(value, call[index]));
      if (!matches) original(...args);
    });
  });
});

afterEach(() => {
  try {
    expect(diagnosticCalls, "console diagnostics must match this case exactly").toEqual(expectedDiagnostics);
  } finally {
    diagnosticSpies.forEach(spy => spy.mockRestore());
  }
});


beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) {
    vi.stubEnv(key, "");
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("credential probes honor strict egress", () => {
  it("rejects an API-key probe rather than sending credentials directly without a proxy", async () => {
    const result = await testApiKeyConnection({ provider: "openai", apiKey: "synthetic-key" }, {
      strictProxy: true, connectionProxyEnabled: false, connectionProxyUrl: "",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("strictProxy=true");
  });

  it("does not directly refresh an expired OAuth token when its strict proxy is unavailable", async () => {
    mocks.getProviderConnectionById.mockResolvedValue({
      id: "strict-oauth", provider: "gemini-cli", authType: "oauth",
      accessToken: "synthetic-access", refreshToken: "synthetic-refresh",
      expiresAt: "2000-01-01T00:00:00Z", providerSpecificData: { strictProxy: true },
    });
    mocks.resolveConnectionProxyConfig.mockResolvedValue({ strictProxy: true, connectionProxyEnabled: false });
    const result = await testSingleConnection("strict-oauth");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token expired and refresh failed");
  });

  it.each(["codex", "grok-cli"])("does not directly refresh expired %s credentials without its strict proxy", async (provider) => {
    mocks.getProviderConnectionById.mockResolvedValue({
      id: "strict-refresh", provider, authType: "oauth",
      accessToken: "synthetic-access", refreshToken: "synthetic-refresh",
      expiresAt: "2000-01-01T00:00:00Z", providerSpecificData: { strictProxy: true },
    });
    mocks.resolveConnectionProxyConfig.mockResolvedValue({ strictProxy: true, connectionProxyEnabled: false });
    const result = await testSingleConnection("strict-refresh");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token expired and refresh failed");
  });

  it("refuses a Cline credential probe without its required proxy", async () => {
    mocks.getProviderConnectionById.mockResolvedValue({ id: "strict-cline", provider: "cline",
      authType: "oauth", accessToken: "synthetic-access", providerSpecificData: {} });
    mocks.resolveConnectionProxyConfig.mockResolvedValue({ strictProxy: true });
    await expect(testSingleConnection("strict-cline")).rejects.toThrow("strictProxy=true");
  });

  it("refreshes expired Codex credentials and probes using the same strict relay", async () => {
    const requests = [];
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      requests.push({ target: request.headers["x-relay-target"], path: request.headers["x-relay-path"],
        authorization: request.headers.authorization, body });
      response.setHeader("Content-Type", "application/json");
      if (request.headers["x-relay-path"] === "/oauth/token") {
        response.end(JSON.stringify({ access_token: "relay-fresh-access", refresh_token: "relay-new-refresh", expires_in: 3600 }));
      } else {
        response.statusCode = 400; // Codex's minimal probe accepts authenticated invalid input.
        response.end("{}");
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      mocks.getProviderConnectionById.mockResolvedValue({
        id: "relay-codex", provider: "codex", authType: "oauth", accessToken: "expired-access",
        refreshToken: "relay-synthetic-refresh", expiresAt: "2000-01-01T00:00:00Z", providerSpecificData: {},
      });
      mocks.resolveConnectionProxyConfig.mockResolvedValue({ strictProxy: true,
        vercelRelayUrl: `http://127.0.0.1:${server.address().port}` });
      const result = await testSingleConnection("relay-codex");
      expect(result.valid).toBe(true);
      expect(result.refreshed).toBe(true);
      expect(requests.map(({ target, path }) => ({ target, path }))).toEqual([
        { target: "https://auth.openai.com", path: "/oauth/token" },
        { target: "https://chatgpt.com", path: "/backend-api/codex/responses" },
      ]);
      expect(JSON.parse(requests[0].body).refresh_token).toBe("relay-synthetic-refresh");
      expect(requests[1].authorization).toBe("Bearer relay-fresh-access");
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
