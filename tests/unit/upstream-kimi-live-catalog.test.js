import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ connection: null, proxy: null, fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: state.fetch }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => state.connection ? [state.connection] : [],
  getCombos: async () => [], getCustomModels: async () => [],
  getModelAliases: async () => ({}), getProviderNodes: async () => [],
}));
vi.mock("@/models", () => ({ getProviderConnectionById: async () => state.connection }));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
vi.mock("@/lib/modelsResponseCache.js", () => ({ getCachedModelsResponse: work => work() }));
vi.mock("@/dashboardGuard", () => ({ hasValidCliToken: async () => true, isAuthenticated: async () => false }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => state.proxy }));
vi.mock("@/sse/services/tokenRefresh", () => ({
  refreshGoogleToken: vi.fn(), refreshCodexToken: vi.fn(), updateProviderCredentials: vi.fn(),
}));

import { clearProviderLiveModelsCache, fetchProviderLiveModels } from "../../src/shared/utils/providerLiveModels.js";
import { GET as publicModels } from "../../src/app/api/v1/models/route.js";
import { GET as dashboardModels } from "../../src/app/api/providers/[id]/models/route.js";

const catalog = rows => Response.json({ data: rows });
const nativeModel = (overrides = {}) => ({
  id: "synthetic-kimi-new-model", object: "model", display_name: "Synthetic Kimi model",
  limit: { context: 712345 }, ...overrides,
});
const dashboard = signal => dashboardModels({
  nextUrl: new URL("http://localhost/api/providers/kimi-account/models?refresh=1"), signal,
}, { params: Promise.resolve({ id: "kimi-account" }) });

beforeEach(() => {
  clearProviderLiveModelsCache();
  vi.clearAllMocks();
  state.connection = { id: "kimi-account", provider: "kimi", isActive: true, accessToken: "synthetic-oauth", providerSpecificData: {} };
  state.proxy = null;
  state.fetch.mockImplementation(async () => catalog([nativeModel()]));
  vi.stubGlobal("fetch", () => { throw new Error("Unexpected live provider traffic"); });
});
afterEach(() => {
  clearProviderLiveModelsCache();
  vi.unstubAllGlobals();
});

describe("Kimi Code native account catalog instead of guessed static model limits", () => {
  it("reads the publisher's native limit.context without confusing context with input or output", async () => {
    state.fetch.mockResolvedValueOnce(catalog([nativeModel({ limit: { context: "712345", output: 999999 } })]));
    const [model] = await fetchProviderLiveModels("kimi", "synthetic-key");
    expect(model).toMatchObject({
      id: "synthetic-kimi-new-model", name: "Synthetic Kimi model", context_length: 712345,
      capabilities: { contextWindow: 712345, maxInput: null, maxOutput: null },
    });
    expect(model).not.toHaveProperty("max_input_tokens");
    expect(model).not.toHaveProperty("max_completion_tokens");
  });

  it("keeps legacy explicit limits distinct and prefers the native declared context", async () => {
    state.fetch.mockResolvedValueOnce(catalog([nativeModel({
      limit: { context: 712345 }, context_length: 200000, max_input_tokens: 600000, max_output_tokens: 32000,
    })]));
    const [model] = await fetchProviderLiveModels("kimi", "synthetic-key");
    expect(model).toMatchObject({ context_length: 712345, max_input_tokens: 600000, max_completion_tokens: 32000 });
    expect(model.capabilities).toMatchObject({ contextWindow: 712345, maxInput: 600000, maxOutput: 32000 });
  });

  it("does not reinterpret another provider's similarly named native field", async () => {
    state.fetch.mockResolvedValueOnce(catalog([nativeModel()]));
    const [model] = await fetchProviderLiveModels("groq", "synthetic-key");
    expect(model).not.toHaveProperty("context_length");
    expect(model.capabilities?.contextWindow).toBeUndefined();
  });

  it.each([undefined, null, 0, -1, 1.5, "", "unknown", Number.MAX_SAFE_INTEGER + 1])(
    "preserves unknown context for an unregistered model with invalid native limit %j", async context => {
      state.fetch.mockResolvedValueOnce(catalog([nativeModel({ limit: { context } })]));
      const [model] = await fetchProviderLiveModels("kimi", "synthetic-key");
      expect(model.capabilities.contextWindow).toBeNull();
      expect(model).not.toHaveProperty("context_length");
    },
  );

  it.each([
    ["OAuth", { accessToken: "synthetic-oauth" }, "synthetic-oauth"],
    ["API key", { apiKey: "synthetic-api-key", accessToken: "unused-oauth" }, "synthetic-api-key"],
  ])("discovers exact account model IDs using %s credentials through both API surfaces", async (_mode, credentials, proof) => {
    Object.assign(state.connection, credentials);
    state.proxy = { strictProxy: true, vercelRelayUrl: "https://synthetic-relay.invalid" };
    const response = await dashboard();
    expect(response.status).toBe(200);
    expect((await response.json()).models).toContainEqual(expect.objectContaining({ id: "synthetic-kimi-new-model", context_length: 712345 }));
    const published = await publicModels();
    expect(published.status).toBe(200);
    const rows = (await published.json()).data;
    expect(rows.filter(row => row.owned_by === "kimi").map(row => row.id)).toEqual(["kimi/synthetic-kimi-new-model"]);
    expect(rows.find(row => row.id === "kimi/synthetic-kimi-new-model")).toMatchObject({ context_length: 712345 });
    for (const [url, options, proxy] of state.fetch.mock.calls) {
      expect(url).toBe("https://api.kimi.com/coding/v1/models");
      expect(new Headers(options.headers).get("authorization")).toBe(`Bearer ${proof}`);
      expect(options).toMatchObject({ redirect: "error", cache: "no-store" });
      expect(proxy).toEqual(state.proxy);
    }
  });

  it("does not revive static suggestions when the authenticated account catalog is complete and empty", async () => {
    state.fetch.mockImplementation(async () => catalog([]));
    const response = await dashboard();
    expect(response.status).toBe(200);
    expect((await response.json()).models).toEqual([]);
    expect((await (await publicModels()).json()).data.filter(row => row.owned_by === "kimi")).toEqual([]);
  });

  it("does not replace unknown native model limits with generic public-catalog defaults", async () => {
    state.fetch.mockImplementation(async () => catalog([nativeModel({ limit: {} })]));
    const rows = (await (await publicModels()).json()).data;
    const model = rows.find(row => row.id === "kimi/synthetic-kimi-new-model");
    expect(model).toBeDefined();
    expect(model.capabilities).toMatchObject({ contextWindow: null, maxInput: null, maxOutput: null });
    expect(model).not.toHaveProperty("context_length");
    expect(model).not.toHaveProperty("max_input_tokens");
    expect(model).not.toHaveProperty("max_completion_tokens");
  });

  it("preserves explicit operator selections without performing catalog I/O", async () => {
    state.connection.providerSpecificData.enabledModels = ["operator-model"];
    const rows = (await (await publicModels()).json()).data;
    expect(rows.some(row => row.id === "kimi/operator-model")).toBe(true);
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("does not expose a provider failure body or retry credentials on another endpoint", async () => {
    state.fetch.mockResolvedValueOnce(new Response("private-credential-echo", { status: 401 }));
    const response = await dashboard();
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("private-credential-echo");
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("stops a pre-cancelled catalog request before using its credentials", async () => {
    const controller = new AbortController();
    const reason = new Error("synthetic caller cancellation");
    controller.abort(reason);
    await expect(fetchProviderLiveModels("kimi", "synthetic-key", { signal: controller.signal })).rejects.toBe(reason);
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("propagates caller cancellation to the in-flight catalog without retrying", async () => {
    state.fetch.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }));
    const controller = new AbortController();
    const pending = fetchProviderLiveModels("kimi", "synthetic-key", { signal: controller.signal });
    const reason = new Error("synthetic in-flight cancellation");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not publish credentials from malformed native metadata fields", async () => {
    const secret = "synthetic-private-catalog-value";
    state.fetch.mockImplementation(async () => catalog([nativeModel({
      access_token: secret, refresh_token: secret, limit: { context: { access_token: secret } },
    })]));
    const payload = await (await publicModels()).json();
    expect(payload.data.some(model => model.id === "kimi/synthetic-kimi-new-model")).toBe(true);
    expect(JSON.stringify(payload)).not.toContain(secret);
  });
});
