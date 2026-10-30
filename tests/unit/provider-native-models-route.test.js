import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ connection: null, body: null, proxy: {}, fetch: vi.fn() }));
vi.mock("@/models", () => ({ getProviderConnectionById: async () => io.connection }));
vi.mock("@/dashboardGuard", () => ({ hasValidCliToken: async () => true, isAuthenticated: async () => false }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => io.proxy }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
vi.mock("@/sse/services/tokenRefresh", () => ({ refreshGoogleToken: vi.fn(), refreshCodexToken: vi.fn(), updateProviderCredentials: vi.fn() }));
import { GET } from "@/app/api/providers/[id]/models/route.js";
import { clearProviderLiveModelsCache } from "@/shared/utils/providerLiveModels.js";

beforeEach(() => {
  clearProviderLiveModelsCache();
  io.fetch.mockReset();
  io.proxy = {};
});
const response = signal => GET({ nextUrl: new URL("http://localhost/api/providers/native-fixture/models?refresh=1"), signal }, {
  params: Promise.resolve({ id: "native-fixture" }),
});
const connect = provider => { io.connection = { id: "native-fixture", provider, apiKey: "synthetic-native-key", accessToken: "not-an-api-key" }; };

describe("native API model-list dashboard and public parser parity", () => {
  it.each([
    ["anthropic", { data: [{ id: "new-anthropic", type: "model", max_input_tokens: 240000, max_tokens: 32000 }], has_more: false }, "new-anthropic", "x-api-key", "synthetic-native-key"],
    ["gemini", { models: [{ name: "models/gemini-next", inputTokenLimit: 240000, outputTokenLimit: 32000, supportedGenerationMethods: ["generateContent"] }] }, "gemini-next", "x-goog-api-key", "synthetic-native-key"],
    ["mistral", { data: [{ id: "new-mistral", type: "base", max_context_length: 240000, capabilities: { completion_chat: true, function_calling: false } }] }, "new-mistral", "Authorization", "Bearer synthetic-native-key"],
  ])("normalizes %s through its actual native API-key contract and selected egress", async (provider, body, id, header, auth) => {
    connect(provider);
    io.proxy = { strictProxy: true, connectionProxyEnabled: true, connectionProxyUrl: "http://synthetic-proxy.invalid" };
    io.fetch.mockResolvedValueOnce(Response.json(body));
    const result = await response();
    expect(result.status).toBe(200);
    const data = await result.json();
    expect(data.models).toHaveLength(1);
    expect(data.models[0].id).toBe(id);
    expect(data.models[0].kind || "llm").toBe("llm");
    expect(data.models[0]).not.toHaveProperty("type");
    const [url, options, proxy] = io.fetch.mock.calls[0];
    expect(options.headers[header]).toBe(auth);
    expect(options.redirect).toBe("error");
    expect(proxy).toBe(io.proxy);
    expect(new URL(url).searchParams.has("key")).toBe(false);
    expect(JSON.stringify(options.headers)).not.toContain("not-an-api-key");
    if (provider === "mistral") expect(data.models[0].capabilities).toMatchObject({ contextWindow: 240000, tools: false });
    else expect(data.models[0].capabilities).toMatchObject({ maxInput: 240000, maxOutput: 32000 });
  });

  it.each(["anthropic", "gemini", "mistral"])("returns an explicit complete empty %s list without inventing native models", async provider => {
    connect(provider);
    io.fetch.mockResolvedValueOnce(Response.json(provider === "gemini" ? { models: [] } : { data: [] }));
    const result = await response();
    expect(result.status).toBe(200);
    expect((await result.json()).models).toEqual([]);
  });

  it.each(["anthropic", "gemini", "mistral"])("rejects an unverified %s body instead of treating it as a complete empty list", async provider => {
    connect(provider);
    io.fetch.mockResolvedValueOnce(Response.json({}));
    const result = await response();
    expect(result.status).toBe(502);
    expect((await result.json()).models).toBeUndefined();
  });

  it.each(["anthropic", "gemini", "mistral"])("never substitutes an OAuth proof for a missing native %s API key", async provider => {
    connect(provider); io.connection.apiKey = undefined;
    expect((await response()).status).toBe(401);
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429])("retains native HTTP %s without exposing an upstream error body", async status => {
    connect("anthropic");
    io.fetch.mockResolvedValueOnce(Response.json({ error: "private-upstream-proof" }, { status }));
    const result = await response();
    expect(result.status).toBe(status);
    expect(await result.text()).not.toContain("private-upstream-proof");
  });
});
