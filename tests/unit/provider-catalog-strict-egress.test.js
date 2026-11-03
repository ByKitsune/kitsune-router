import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { isDeepStrictEqual } from "node:util";

// Capture the native fetch before the real transport patches it. Never permit
// a failing regression to send the synthetic credentials to a public service.
const state = vi.hoisted(() => {
  const nativeFetch = globalThis.fetch;
  const directRequests = [];
  const originalBypass = process.env.DISABLE_MITM_BYPASS;
  process.env.DISABLE_MITM_BYPASS = "1";
  globalThis.fetch = (url, options) => {
    const target = new URL(String(url));
    if (target.hostname !== "127.0.0.1") {
      directRequests.push(String(url));
      throw new Error("Unexpected direct catalog egress");
    }
    return nativeFetch(url, options);
  };
  return { nativeFetch, originalBypass, directRequests, connection: null, pool: null,
    getProviderConnectionById: vi.fn(), getProxyPoolById: vi.fn(),
    updateProviderConnection: vi.fn() };
});

vi.mock("@/models", () => ({
  getProviderConnectionById: state.getProviderConnectionById,
  getProxyPoolById: state.getProxyPoolById,
}));
vi.mock("@/lib/localDb.js", () => ({
  getProviderConnectionById: state.getProviderConnectionById,
  updateProviderConnection: state.updateProviderConnection,
}));
vi.mock("@/dashboardGuard", () => ({
  hasValidCliToken: async () => true,
  isAuthenticated: async () => false,
}));

import "../../open-sse/utils/proxyFetch.js";
import { GET } from "../../src/app/api/providers/[id]/models/route.js";
import { getAccessToken } from "../../src/sse/services/tokenRefresh.js";
import { resolveKiroModels } from "../../open-sse/services/kiroModels.js";
import { resolveCopilotModels } from "../../open-sse/services/copilotModels.js";
import { resolveCursorModels } from "../../open-sse/services/cursorModels.js";
import { resolveZedModels, fetchZedLlmToken } from "../../open-sse/shared/zedAuth.js";
import { resolveQoderModels, resolveQoderCredentials } from "../../open-sse/services/qoderModels.js";
import { resolveKimchiModels } from "../../open-sse/services/kimchiModels.js";
import { getProjectIdForConnection, removeConnection } from "../../open-sse/services/projectId.js";

beforeEach(() => {
  vi.clearAllMocks();
  state.directRequests.length = 0;
  state.pool = null;
  state.getProviderConnectionById.mockImplementation(async () => state.connection);
  state.getProxyPoolById.mockImplementation(async () => state.pool);
  state.updateProviderConnection.mockResolvedValue({ id: "catalog-account" });
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) {
    vi.stubEnv(name, "");
  }
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => {
  globalThis.fetch = state.nativeFetch;
  if (state.originalBypass === undefined) delete process.env.DISABLE_MITM_BYPASS;
  else process.env.DISABLE_MITM_BYPASS = state.originalBypass;
});

const account = (provider, providerSpecificData = {}) => ({
  id: "catalog-account", provider, apiKey: "synthetic-key",
  accessToken: "expired-access", refreshToken: "synthetic-refresh",
  expiresAt: "2000-01-01T00:00:00Z", providerSpecificData,
});
const catalog = () => GET({ nextUrl: new URL("http://localhost/api/providers/catalog-account/models?refresh=1") }, {
  params: Promise.resolve({ id: "catalog-account" }),
});

async function withRelay(handler, run) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const entry = { target: request.headers["x-relay-target"], path: request.headers["x-relay-path"],
      authorization: request.headers.authorization, body };
    requests.push(entry);
    response.setHeader("Content-Type", "application/json");
    handler(entry, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    state.pool = { id: "strict-relay", isActive: true, strictProxy: true, type: "vercel",
      proxyUrl: `http://127.0.0.1:${server.address().port}` };
    await run(requests);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const networkBranches = ["codex", "gemini-cli", "openai", "kiro", "cursor", "zed", "openai-compatible-catalog", "anthropic-compatible-catalog"];

const catalogProxyFailure = ["log", "Error fetching provider models:", "Configured account proxy unavailable (strictProxy=true)"];
const codexProxyFailure = ["log", expect.stringMatching(/^\[\d{2}:\d{2}:\d{2}\] ❌ \[TOKEN_REFRESH\] Network error refreshing Codex token: \[ProxyFetch\] Proxy required but no proxy URL configured \(strictProxy=true\)$/)];
const diagnosticExpectations = {
  ...Object.fromEntries(networkBranches.map(provider => [
    `does not dispatch ${provider} credentials when the strict pool is missing`, [catalogProxyFailure],
  ])),
  "preserves strict policy from an inactive pool": [catalogProxyFailure],
  "does not directly refresh credentials through the shared wrapper without their strict proxy": [codexProxyFailure],
  "does not share a successful relay refresh with the same token under a missing strict proxy": [codexProxyFailure],
  "isolates cached project identity by credentialed lookup policy": [
    ["warn", "[ProjectId] Project lookup failed (Error)"],
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
      if (method === "log" && !(args[0] === "Error fetching provider models:" || (typeof args[0] === "string" && /^\[\d{2}:\d{2}:\d{2}\] ❌ \[TOKEN_REFRESH\] /.test(args[0])))) return original(...args);
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

describe("provider catalog account egress", () => {
  it.each(networkBranches)("does not dispatch %s credentials when the strict pool is missing", async (provider) => {
    state.connection = account(provider, { proxyPoolId: "missing", strictProxy: true,
      baseUrl: "https://catalog.example/v1", machineId: "synthetic-machine", organizationId: "synthetic-org", userId: "synthetic-user" });
    const response = await catalog();
    const result = await response.json();
    expect(state.directRequests).toEqual([]);
    expect(result.error || result.warning).toContain("strictProxy=true");
    expect(state.updateProviderConnection).not.toHaveBeenCalled();
  });

  it("preserves strict policy from an inactive pool", async () => {
    state.pool = { isActive: false, strictProxy: true, proxyUrl: "http://127.0.0.1:1" };
    state.connection = account("openai", { proxyPoolId: "inactive" });
    const result = await (await catalog()).json();
    expect(state.directRequests).toEqual([]);
    expect(result.error).toContain("strictProxy=true");
  });

  it.each(["openai", "openai-compatible-catalog", "anthropic-compatible-catalog"])("returns live %s models through a working strict relay", async (provider) => {
    await withRelay((_request, response) => response.end(JSON.stringify({ data: [{ id: "relay-model", name: "Relay model" }] })), async (requests) => {
      state.connection = account(provider, { proxyPoolId: "strict-relay", baseUrl: "https://catalog.example/v1" });
      const response = await catalog();
      expect(response.status).toBe(200);
      expect((await response.json()).models).toContainEqual(expect.objectContaining({ id: "relay-model", name: "Relay model" }));
      expect(requests).toHaveLength(1);
      expect(requests[0].authorization).toBe(`Bearer ${provider === "openai" ? "expired-access" : "synthetic-key"}`);
      expect(requests[0].target).toBe(provider === "openai" ? "https://api.openai.com" : "https://catalog.example");
      expect(state.directRequests).toEqual([]);
    });
  });

  it.each(["codex", "gemini-cli"])("refreshes %s after rejection and retries its catalog through the same relay", async (provider) => {
    let catalogCalls = 0;
    await withRelay((request, response) => {
      if (request.path === "/oauth/token" || request.path === "/token") {
        response.end(JSON.stringify({ access_token: "relay-fresh-access", refresh_token: "relay-new-refresh", expires_in: 3600 }));
      } else if (++catalogCalls === 1) {
        response.statusCode = 401;
        response.end("{}");
      } else {
        response.end(JSON.stringify({ models: [{ id: "relay-model", name: "Relay model" }] }));
      }
    }, async (requests) => {
      state.connection = account(provider, { proxyPoolId: "strict-relay" });
      const response = await catalog();
      expect(response.status).toBe(200);
      expect((await response.json()).models).toContainEqual(expect.objectContaining({ id: "relay-model" }));
      expect(requests.map(({ target }) => target)).toEqual(provider === "codex"
        ? ["https://chatgpt.com", "https://auth.openai.com", "https://chatgpt.com"]
        : ["https://cloudcode-pa.googleapis.com", "https://oauth2.googleapis.com", "https://cloudcode-pa.googleapis.com"]);
      expect(requests[2].authorization).toBe("Bearer relay-fresh-access");
      const refreshBody = provider === "codex" ? JSON.parse(requests[1].body) : Object.fromEntries(new URLSearchParams(requests[1].body));
      expect(refreshBody.refresh_token).toBe("synthetic-refresh");
      expect(state.updateProviderConnection).toHaveBeenCalledWith("catalog-account", expect.objectContaining({ accessToken: "relay-fresh-access" }));
      expect(state.directRequests).toEqual([]);
    });
  });

  it("returns Kiro's live catalog through the configured strict relay", async () => {
    await withRelay((_request, response) => response.end(JSON.stringify({ models: [{ modelId: "relay-kiro-model", modelName: "Relay Kiro" }] })), async (requests) => {
      state.connection = account("kiro", { proxyPoolId: "strict-relay" });
      const response = await catalog();
      expect(response.status).toBe(200);
      expect((await response.json()).models).toContainEqual(expect.objectContaining({ id: "relay-kiro-model" }));
      expect(requests[0].target).toBe("https://q.us-east-1.amazonaws.com");
      expect(requests[0].authorization).toBe("Bearer expired-access");
      expect(state.directRequests).toEqual([]);
    });
  });

  it("does not directly refresh credentials through the shared wrapper without their strict proxy", async () => {
    const result = await getAccessToken("codex", account("codex", { strictProxy: true, proxyPoolId: "missing" }));
    expect(result).toBeNull();
    expect(state.directRequests).toEqual([]);
  });

  it("resolves credential metadata for shared access-token refresh wrappers", async () => {
    await withRelay((_request, response) => response.end(JSON.stringify({ access_token: "relay-fresh-access", expires_in: 3600 })), async (requests) => {
      const credentials = account("codex", { proxyPoolId: "strict-relay" });
      const result = await getAccessToken("codex", credentials);
      expect(result.accessToken).toBe("relay-fresh-access");
      expect(requests.map(({ target, path }) => ({ target, path }))).toEqual([{ target: "https://auth.openai.com", path: "/oauth/token" }]);
      expect(state.directRequests).toEqual([]);
    });
  });

  it("does not share a successful relay refresh with the same token under a missing strict proxy", async () => {
    await withRelay((_request, response) => response.end(JSON.stringify({ access_token: "relay-isolated-access", expires_in: 3600 })), async (requests) => {
      const credentials = account("codex", { proxyPoolId: "strict-relay" });
      credentials.refreshToken = "synthetic-policy-isolation-refresh";
      expect((await getAccessToken("codex", credentials)).accessToken).toBe("relay-isolated-access");
      const rejected = await getAccessToken("codex", credentials, { strictProxy: true });
      expect(rejected).toBeNull();
      expect(requests).toHaveLength(1);
      expect(state.directRequests).toEqual([]);
    });
  });

  it.each([
    ["kiro", resolveKiroModels],
    ["copilot", resolveCopilotModels],
    ["cursor", resolveCursorModels],
    ["zed", resolveZedModels],
    ["qoder", resolveQoderModels],
    ["kimchi", resolveKimchiModels],
  ])("isolates %s cached live models from a different strict policy", async (provider, resolveModels) => {
    await withRelay((request, response) => {
      if (request.path === "/client/llm_tokens") {
        response.end(JSON.stringify({ token: "synthetic-zed-llm" }));
      } else if (provider === "cursor") {
        // GetUsableModels: response field 1 contains model id field 1.
        const id = Buffer.from("isolated-model");
        response.end(Buffer.from([10, id.length + 2, 10, id.length, ...id]));
      } else if (provider === "copilot") {
        response.end(JSON.stringify({ data: [{ id: "isolated-model", capabilities: { type: "chat" } }] }));
      } else if (provider === "qoder") {
        response.end(JSON.stringify({ chat: [{ key: "isolated-model", display_name: "Isolated model", enable: true }] }));
      } else {
        response.end(JSON.stringify({ models: [{ id: "isolated-model", modelId: "isolated-model", modelName: "Isolated model" }] }));
      }
    }, async (requests) => {
      const credentials = account(provider, { machineId: "cache-machine", userId: "cache-user", organizationId: "cache-org" });
      credentials.accessToken = `synthetic-cache-${provider}`;
      const proxyOptions = { vercelRelayUrl: state.pool.proxyUrl, strictProxy: false };
      const first = await resolveModels(credentials, { proxyOptions });
      expect(first.models).toContainEqual(expect.objectContaining({ id: "isolated-model" }));
      const requestCount = requests.length;
      await expect(resolveModels(credentials, { proxyOptions: { strictProxy: true } })).rejects.toThrow("strictProxy=true");
      expect(requests).toHaveLength(requestCount);
      expect(state.directRequests).toEqual([]);
    });
  });

  it("isolates Zed's acquired LLM token from a different strict policy", async () => {
    await withRelay((_request, response) => response.end(JSON.stringify({ token: "synthetic-cached-zed-token" })), async (requests) => {
      const credentials = account("zed", { userId: "token-cache-user", organizationId: "token-cache-org" });
      expect(await fetchZedLlmToken(credentials, { proxyOptions: { vercelRelayUrl: state.pool.proxyUrl } })).toBe("synthetic-cached-zed-token");
      await expect(fetchZedLlmToken(credentials, { proxyOptions: { strictProxy: true } })).rejects.toThrow("strictProxy=true");
      expect(requests).toHaveLength(1);
      expect(state.directRequests).toEqual([]);
    });
  });

  it("does not let a strict Zed lookup join a pending non-strict catalog", async () => {
    let releaseResponse;
    let signalCatalogStarted;
    const catalogStarted = new Promise((resolve) => { signalCatalogStarted = resolve; });
    await withRelay((request, response) => {
      if (request.path === "/client/llm_tokens") {
        response.end(JSON.stringify({ token: "synthetic-pending-zed-token" }));
      } else {
        releaseResponse = () => response.end(JSON.stringify({ models: [{ id: "pending-model" }] }));
        signalCatalogStarted();
      }
    }, async () => {
      const credentials = account("zed", { userId: "pending-user", organizationId: "pending-org" });
      const pending = resolveZedModels(credentials, { proxyOptions: { vercelRelayUrl: state.pool.proxyUrl } });
      await catalogStarted;
      const strict = resolveZedModels(credentials, { proxyOptions: { strictProxy: true } });
      const strictResult = expect(strict).rejects.toThrow("strictProxy=true");
      releaseResponse();
      expect((await pending).models).toContainEqual(expect.objectContaining({ id: "pending-model" }));
      await strictResult;
      expect(state.directRequests).toEqual([]);
    });
  });

  it("does not reuse a Qoder PAT's acquired job token under a different strict policy", async () => {
    await withRelay((request, response) => {
      response.end(JSON.stringify(request.path.includes("userinfo")
        ? { id: "isolated-pat-user" } : { token: "jt-isolated-pat" }));
    }, async (requests) => {
      const credentials = { apiKey: "pt-policy-isolation", providerSpecificData: { userId: "stored-pat-user" } };
      const first = await resolveQoderCredentials(credentials, { vercelRelayUrl: state.pool.proxyUrl });
      expect(first.accessToken).toBe("jt-isolated-pat");
      await expect(resolveQoderCredentials(credentials, { strictProxy: true })).rejects.toThrow("strictProxy=true");
      expect(requests).toHaveLength(2);
      expect(state.directRequests).toEqual([]);
    });
  });

  it("isolates cached project identity by credentialed lookup policy", async () => {
    await withRelay((_request, response) => response.end(JSON.stringify({ cloudaicompanionProject: { id: "relay-project" } })), async (requests) => {
      const connectionId = "policy-project-account";
      try {
        expect(await getProjectIdForConnection(connectionId, "synthetic-project-token", "gemini-cli", { vercelRelayUrl: state.pool.proxyUrl })).toBe("relay-project");
        expect(await getProjectIdForConnection(connectionId, "synthetic-project-token", "gemini-cli", { strictProxy: true })).toBeNull();
        expect(requests).toHaveLength(1);
        expect(state.directRequests).toEqual([]);
      } finally {
        removeConnection(connectionId);
      }
    });
  });
});
