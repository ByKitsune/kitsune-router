import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { fetch as socketFetch } from "undici";

const mocks = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(),
  clearAccountError: vi.fn(),
  getSettings: vi.fn(),
  getCombos: vi.fn(),
  logWarn: vi.fn(),
}));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: mocks.getProviderCredentials,
  markAccountUnavailable: mocks.markAccountUnavailable,
  clearAccountError: mocks.clearAccountError,
  extractApiKey: () => null,
  isValidApiKey: async () => true,
}));
vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
  getCombos: mocks.getCombos,
  isApiKeyRequired: () => false,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: async (_provider, credentials) => credentials,
  updateProviderCredentials: vi.fn(),
}));
vi.mock("@/sse/utils/logger.js", () => ({
  request: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: mocks.logWarn, error: vi.fn(), maskKey: () => "fixture",
}));

import { handleSearch } from "@/sse/handlers/search.js";

const wire = [];
let server;
let origin;
function request(body) {
  return new Request("http://localhost/v1/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "fixture query", ...body }),
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    wire.push({ path: req.url, body, target: req.headers["x-fixture-target"] });
    const model = /\/models\/([^:]+):generateContent/.exec(req.url)?.[1] || body.model;
    const invalidModel = ["gemini", "antigravity", "ag", "fixture-invalid-model"].includes(model);
    if (model === "fixture-ag-not-found") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Requested entity was not found." } }));
      return;
    }
    res.writeHead(invalidModel ? 404 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(invalidModel ? {
      error: { message: `models/${model} is not found for API version v1beta` },
    } : {
      candidates: [{ content: { parts: [{ text: "Grounded fixture answer" }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/fixture", title: "Fixture source" } }] } }],
      usageMetadata: { totalTokenCount: 12 },
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(() => {
  // The terminal fetch is deliberately redirected to this loopback fixture.
  // Host proxy settings would otherwise attach a real proxy dispatcher before
  // the redirect, defeating the fixture and changing the error under test.
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) {
    vi.stubEnv(name, "");
  }
  vi.clearAllMocks();
  wire.length = 0;
  mocks.getSettings.mockResolvedValue({});
  mocks.getCombos.mockResolvedValue([]);
  mocks.getProviderCredentials.mockImplementation(async (_provider, excluded) => excluded.size ? null : {
    apiKey: "fixture-not-a-secret", accessToken: "fixture-not-a-secret", projectId: "fixture-project",
    connectionId: "fixture-connection", connectionName: "fixture-account",
  });
  mocks.markAccountUnavailable.mockResolvedValue({ shouldFallback: true });
  vi.stubGlobal("fetch", vi.fn((url, init) => {
    // Exercise real HTTP serialization without ever contacting an upstream account.
    expect(init.dispatcher, "fixture requests must not use a host proxy dispatcher").toBeUndefined();
    const target = new URL(url);
    return socketFetch(origin + target.pathname + target.search, {
      ...init, headers: { ...init.headers, "x-fixture-target": target.origin },
    });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("search selector reaches the final upstream wire", () => {
  it("uses the grounding default when model is the bare Gemini provider selector", async () => {
    const response = await handleSearch(request({ model: "gemini" }));
    expect(response.status).toBe(200);
    expect(wire).toHaveLength(1);
    expect(wire[0].path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
    expect(mocks.markAccountUnavailable).not.toHaveBeenCalled();
    expect((await response.json()).results[0].url).toBe("https://example.com/fixture");
  });

  it("keeps the existing provider-only request default", async () => {
    const response = await handleSearch(request({ provider: "gemini" }));
    expect(response.status).toBe(200);
    expect(wire[0].path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
  });

  it("treats duplicate provider/model selectors as a default-model request", async () => {
    const response = await handleSearch(request({ provider: "gemini", model: "gemini" }));
    expect(response.status).toBe(200);
    expect(wire[0].path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
    expect(mocks.markAccountUnavailable).not.toHaveBeenCalled();
  });

  it("preserves an explicit separate Gemini grounding model", async () => {
    const response = await handleSearch(request({ provider: "gemini", model: "gemini-3.8-flash" }));
    expect(response.status).toBe(200);
    expect(wire[0].path).toBe("/v1beta/models/gemini-3.8-flash:generateContent");
  });

  it("uses the dedicated Antigravity search host and keeps its grounded-search model", async () => {
    const response = await handleSearch(request({ model: "antigravity" }));
    expect(response.status).toBe(200);
    expect(wire[0].target).toBe("https://daily-cloudcode-pa.sandbox.googleapis.com");
    expect(wire[0].body.model).toBe("gemini-2.5-flash");
    expect(wire[0].body.request.tools).toEqual([{ googleSearch: {} }]);
  });

  it("maps an Antigravity public model to its exact wire ID and native thinking level", async () => {
    const response = await handleSearch(request({ model: "ag/gemini-3.8-flash" }));
    expect(response.status).toBe(200);
    expect(wire[0].body.model).toBe("gemini-3.8-flash-medium");
    expect(wire[0].body.request.generationConfig.thinkingConfig.thinkingLevel).toBe("medium");
    expect(wire[0].body.request.tools).toEqual([{ googleSearch: {} }]);
    expect((await response.json()).answer.model).toBe("gemini-3.8-flash");
  });

  it("includes Antigravity request and session IDs without an unsupported requestType", async () => {
    const response = await handleSearch(request({ model: "ag/gemini-pro-agent" }));
    expect(response.status).toBe(200);
    expect(wire[0].body.requestId).toMatch(/^agent\/[0-9a-f-]{36}\/\d+\/[0-9a-f-]{36}\/1$/);
    expect(wire[0].body.request.sessionId).toEqual(expect.any(String));
    expect(wire[0].body).not.toHaveProperty("requestType");
    expect(wire[0].body.request.tools).toEqual([{ googleSearch: {} }]);
  });

  it("preserves an explicit provider/model selector", async () => {
    const response = await handleSearch(request({ model: "gemini/gemini-3.8-flash" }));
    expect(response.status).toBe(200);
    expect(wire[0].path).toBe("/v1beta/models/gemini-3.8-flash:generateContent");
  });

  it("routes the advertised gemini/search service ID to the grounding default", async () => {
    const response = await handleSearch(request({ model: "gemini/search" }));
    expect(response.status).toBe(200);
    expect(wire[0].path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
  });

  it("rejects a non-string explicit upstream model before selecting any account", async () => {
    const response = await handleSearch(request({ provider: "gemini", model: { id: "gemini-3.8-flash" } }));
    expect(response.status).toBe(400);
    expect(wire).toHaveLength(0);
    expect(mocks.getProviderCredentials).not.toHaveBeenCalled();
  });

  it("rejects a malformed combo member without throwing or reaching the upstream", async () => {
    mocks.getCombos.mockResolvedValue([{ name: "fixture-search-combo", models: [17] }]);
    const response = await handleSearch(request({ model: "fixture-search-combo" }));
    expect(response.status).toBe(400);
    expect(wire).toHaveLength(0);
    expect(mocks.getProviderCredentials).not.toHaveBeenCalled();
  });

  it("returns a Gemini model-not-found error without locking or rotating healthy accounts", async () => {
    const response = await handleSearch(request({ provider: "gemini", model: "fixture-invalid-model" }));
    expect(response.status).toBe(404);
    expect(mocks.markAccountUnavailable).not.toHaveBeenCalled();
    expect(mocks.getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(wire).toHaveLength(1);
    expect(mocks.logWarn).toHaveBeenCalledWith("SEARCH", expect.stringContaining("upstream error provider=gemini status=404"));
  });

  it("bounds repeated Antigravity resource 404s without locking all healthy credentials", async () => {
    const accounts = Array.from({ length: 15 }, (_, index) => ({
      accessToken: "fixture", projectId: `fixture-project-${index}`,
      connectionId: `fixture-${index}`, connectionName: `fixture-${index}`,
    }));
    mocks.getProviderCredentials.mockImplementation(async (_provider, excluded) =>
      accounts.find(account => !excluded.has(account.connectionId)) || null);
    const response = await handleSearch(request({ model: "ag/fixture-ag-not-found" }));
    expect(response.status).toBe(404);
    expect(wire).toHaveLength(3);
    expect(mocks.markAccountUnavailable).not.toHaveBeenCalled();
    expect((await response.json()).error.message).toBe("Requested entity was not found.");
  });

  it("clears only the successful search scope", async () => {
    const response = await handleSearch(request({ provider: "gemini" }));
    expect(response.status).toBe(200);
    expect(mocks.clearAccountError).toHaveBeenCalledWith(
      "fixture-connection", expect.any(Object), "websearch:gemini",
    );
  });

  it("uses each combo member rather than the original combo provider field", async () => {
    mocks.getCombos.mockResolvedValue([{ name: "fixture-search-combo", models: ["gemini"] }]);
    const response = await handleSearch(request({ provider: "fixture-search-combo" }));
    expect(response.status).toBe(200);
    expect(wire).toHaveLength(1);
    expect(wire[0].path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
  });

  it("uses a combo member model rather than leaking the original model selector", async () => {
    mocks.getCombos.mockResolvedValue([{ name: "fixture-search-combo", models: ["gemini/gemini-3.8-flash"] }]);
    const response = await handleSearch(request({ model: "fixture-search-combo" }));
    expect(response.status).toBe(200);
    expect(wire).toHaveLength(1);
    expect(wire[0].path).toBe("/v1beta/models/gemini-3.8-flash:generateContent");
  });
});
