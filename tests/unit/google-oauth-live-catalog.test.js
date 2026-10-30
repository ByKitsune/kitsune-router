import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { resolveGoogleOAuthModels, parseGoogleOAuthModels, clearGoogleOAuthModelsCache } from "../../open-sse/services/googleOAuthModels.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { GEMINI_AUTH_USER_AGENT, GEMINI_CLI_API_CLIENT, ANTIGRAVITY_CLI_USER_AGENT, ANTIGRAVITY_CLI_VERSION } from "../../open-sse/config/clientVersions.js";
import { MODEL_CATALOG_TIMEOUT_MS, MODEL_CATALOG_MAX_BYTES, MODEL_CATALOG_MAX_CACHE_ENTRIES } from "../../open-sse/config/modelCatalog.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { advanceDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";

const connection = (overrides = {}) => ({ id: "synthetic-google-connection", provider: "gemini-cli", accessToken: "synthetic-oauth-token", projectId: "synthetic-project", ...overrides });
const json = body => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const catalog = id => ({ models: { [id]: { displayName: id, maxTokens: 300000, maxOutputTokens: 12345 } } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

beforeEach(() => {
  clearGoogleOAuthModelsCache();
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => json(catalog("synthetic-new-model")));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No live provider traffic is allowed in this fixture"); }));
});
afterEach(() => {
  clearGoogleOAuthModelsCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Google OAuth account catalogs use their own metadata transport", () => {
  it("uses the CLI OAuth library identity and selected normalized project without API keys or onboarding", async () => {
    const result = await resolveGoogleOAuthModels("gemini-cli", connection({ projectId: { id: "normalized-project" } }));
    expect(result.models).toContainEqual({ id: "synthetic-new-model", name: "synthetic-new-model", kind: "llm", capabilities: { maxOutput: 12345 } });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    const [url, options, proxy] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe("https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels");
    expect(options).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    expect(JSON.parse(options.body)).toEqual({ project: "normalized-project" });
    const headers = new Headers(options.headers);
    expect(headers.get("user-agent")).toBe(GEMINI_AUTH_USER_AGENT);
    expect(headers.get("x-goog-api-client")).toBe(GEMINI_CLI_API_CLIENT);
    expect(headers.get("authorization")).toBe("Bearer synthetic-oauth-token");
    expect(headers.has("x-goog-api-key")).toBe(false);
    expect(headers.has("x-client-name")).toBe(false);
    expect(proxy).toBeUndefined();
  });

  it("keeps Antigravity's separate URL/headers and image kind without exposing quota or internal models", async () => {
    proxyAwareFetch.mockResolvedValueOnce(json({ models: {
      "synthetic-ag-model(high)": { displayName: "Literal AG model", contextWindow: 250000, maxTokens: 999999, maxInputTokens: 200000, maxOutputTokens: 64000, capabilities: { vision: true, tools: false }, quotaInfo: { remainingFraction: 0.5 }, accessToken: "private" },
      "gemini-3.1-flash-image": { displayName: "Image", maxOutputTokens: 1024 },
      "hidden-model": { isInternal: true },
      "gemini-3-flash-agent": { displayName: "Old retired quota entry" },
    } }));
    const proxyOptions = { connectionProxyEnabled: true, connectionProxyUrl: "http://synthetic-proxy.invalid:8080" };
    const result = await resolveGoogleOAuthModels("antigravity", connection({ provider: "antigravity", projectId: null, providerSpecificData: { projectId: "ag-project" } }), { proxyOptions });
    expect(result.models).toHaveLength(2);
    expect(result.models[0]).toEqual({ id: "synthetic-ag-model(high)", name: "Literal AG model", kind: "llm", capabilities: { vision: true, tools: false, contextWindow: 250000, maxInput: 200000, maxOutput: 64000 } });
    expect(result.models[1].kind).toBe("image");
    expect(JSON.stringify(result)).not.toMatch(/private|quotaInfo|remainingFraction|hidden-model|retired/);
    const [url, options, policy] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe(PROVIDERS.antigravity.usage.quotaApiUrl);
    expect(new Headers(options.headers).get("user-agent")).toBe(ANTIGRAVITY_CLI_USER_AGENT);
    expect(new Headers(options.headers).get("x-client-name")).toBe("antigravity");
    expect(new Headers(options.headers).get("x-client-version")).toBe(ANTIGRAVITY_CLI_VERSION);
    expect(new Headers(options.headers).has("x-goog-api-client")).toBe(false);
    expect(JSON.parse(options.body)).toEqual({ project: "ag-project" });
    expect(policy).toEqual(proxyOptions);
  });

  it("filters internal array entries, preserves exact IDs/explicit false and keeps separate limits", () => {
    expect(parseGoogleOAuthModels("gemini-cli", { models: [
      { id: "models/literal-vendor-id(high)", displayName: "Exact model", inputTokenLimit: 1000, outputTokenLimit: 200, capabilities: { vision: false, reasoning: true, secret: true } },
      { id: "private-array-model", isInternal: true },
      { id: "synthetic-embedding", type: "embedding" },
    ] })).toEqual([
      { id: "models/literal-vendor-id(high)", name: "Exact model", kind: "llm", capabilities: { vision: false, reasoning: true, maxInput: 1000, maxOutput: 200 } },
      { id: "synthetic-embedding", name: "synthetic-embedding", kind: "embedding" },
    ]);
  });

  it("rejects malformed model descriptors and does not reinterpret ambiguous maxTokens as context", () => {
    expect(parseGoogleOAuthModels("gemini-cli", { models: { malformed: [], invalid: "text", unknown: null } })).toEqual([]);
    expect(parseGoogleOAuthModels("gemini-cli", { models: { literal: { maxTokens: 900000, maxOutputTokens: 100 } } })).toEqual([
      { id: "literal", name: "literal", kind: "llm", capabilities: { maxOutput: 100 } },
    ]);
    expect(parseGoogleOAuthModels("gemini-cli", { models: "not a catalog" })).toEqual([]);
  });

  it("does not refresh credentials on public metadata failures or try another provider's endpoint", async () => {
    proxyAwareFetch.mockResolvedValueOnce(new Response("denied", { status: 401 }));
    expect(await resolveGoogleOAuthModels("gemini-cli", connection({ refreshToken: "synthetic-unused-refresh" }))).toBeNull();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(await resolveGoogleOAuthModels("gemini-cli", connection({ provider: "antigravity" }))).toBeNull();
    expect(await resolveGoogleOAuthModels("gemini", connection())).toBeNull();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("distinguishes verified empty/internal-only catalogs from missing or malformed catalogs", async () => {
    for (const models of [[], {}, [{ id: "private-only", isInternal: true }]]) {
      proxyAwareFetch.mockResolvedValueOnce(json({ models }));
      expect(await resolveGoogleOAuthModels("gemini-cli", connection(), { forceRefresh: true })).toEqual({ models: [], complete: true });
    }
    // Empty visibility is retained in the account-scoped cache too.
    const calls = proxyAwareFetch.mock.calls.length;
    expect(await resolveGoogleOAuthModels("gemini-cli", connection())).toEqual({ models: [], complete: true });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(calls);
    proxyAwareFetch.mockResolvedValueOnce(json({ models: { "gemini-3-flash-agent": {} } }));
    expect(await resolveGoogleOAuthModels("antigravity", connection({ provider: "antigravity" }))).toEqual({ models: [], complete: true });
    for (const body of [{}, { models: null }, { models: { malformed: [] } }, { models: [], nextPageToken: "unverified-page" }]) {
      proxyAwareFetch.mockResolvedValueOnce(json(body));
      expect(await resolveGoogleOAuthModels("gemini-cli", connection(), { forceRefresh: true })).toBeNull();
    }
  });
});

describe("Google metadata cache is scoped, invalidated and bounded", () => {
  it("binds the proof/project/proxy before a caller can mutate its connection objects", async () => {
    const selected = connection();
    const proxyOptions = { connectionProxyEnabled: true, connectionProxyUrl: "http://first-policy.invalid:8080" };
    const pending = resolveGoogleOAuthModels("gemini-cli", selected, { proxyOptions });
    selected.accessToken = "mutated-token";
    selected.projectId = "mutated-project";
    proxyOptions.connectionProxyUrl = "http://mutated-policy.invalid:8080";
    await pending;
    const [, options, actualPolicy] = proxyAwareFetch.mock.calls[0];
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer synthetic-oauth-token");
    expect(JSON.parse(options.body)).toEqual({ project: "synthetic-project" });
    expect(actualPolicy.connectionProxyUrl).toBe("http://first-policy.invalid:8080");
  });
  it("separates proof/project/egress/provider scopes and returns caller-owned model objects", async () => {
    const first = await resolveGoogleOAuthModels("gemini-cli", connection());
    first.models[0].name = "caller mutation";
    expect((await resolveGoogleOAuthModels("gemini-cli", connection())).models[0].name).toBe("synthetic-new-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    await resolveGoogleOAuthModels("gemini-cli", connection({ accessToken: "another-token" }));
    await resolveGoogleOAuthModels("gemini-cli", connection({ projectId: "another-project" }));
    await resolveGoogleOAuthModels("gemini-cli", connection(), { proxyOptions: { strictProxy: true } });
    await resolveGoogleOAuthModels("antigravity", connection({ provider: "antigravity" }));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(5);
    advanceDbImportGeneration();
    await resolveGoogleOAuthModels("gemini-cli", connection());
    expect(proxyAwareFetch).toHaveBeenCalledTimes(6);
  });

  it("coalesces only the same account scope and rejects pre-import in-flight results", async () => {
    const gate = deferred();
    proxyAwareFetch.mockImplementationOnce(() => gate.promise);
    const first = resolveGoogleOAuthModels("gemini-cli", connection());
    const second = resolveGoogleOAuthModels("gemini-cli", connection());
    await Promise.resolve();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    advanceDbImportGeneration();
    gate.resolve(json(catalog("pre-import-model")));
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect((await resolveGoogleOAuthModels("gemini-cli", connection())).models[0].id).toBe("synthetic-new-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("evicts old account entries rather than growing a permanent catalog for every proof", async () => {
    for (let index = 0; index <= MODEL_CATALOG_MAX_CACHE_ENTRIES; index++) {
      await resolveGoogleOAuthModels("gemini-cli", connection({ accessToken: `synthetic-token-${index}` }));
    }
    const calls = proxyAwareFetch.mock.calls.length;
    await resolveGoogleOAuthModels("gemini-cli", connection({ accessToken: "synthetic-token-0" }));
    expect(proxyAwareFetch.mock.calls.length).toBe(calls + 1);
  });

  it("bounds retained catalog bytes independently of account count", async () => {
    const description = "🙂".repeat(1500000);
    proxyAwareFetch.mockImplementation(async () => json({ models: { large: { description } } }));
    for (const accessToken of ["large-proof-a", "large-proof-b", "large-proof-c"]) {
      await resolveGoogleOAuthModels("gemini-cli", connection({ accessToken }));
    }
    expect(proxyAwareFetch).toHaveBeenCalledTimes(3);
    await resolveGoogleOAuthModels("gemini-cli", connection({ accessToken: "large-proof-a" }));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(4);
  });

  it("keeps a dashboard-only refresh policy separate and never caches a rotated proof under the old token", async () => {
    const refresh = vi.fn(async () => connection({ accessToken: "rotated-token" }));
    proxyAwareFetch.mockResolvedValueOnce(new Response("expired", { status: 401 }));
    expect((await resolveGoogleOAuthModels("gemini-cli", connection(), { onUnauthorized: refresh })).models).toHaveLength(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(new Headers(proxyAwareFetch.mock.calls[1][1].headers).get("authorization")).toBe("Bearer rotated-token");
    proxyAwareFetch.mockResolvedValueOnce(new Response("expired", { status: 401 }));
    expect(await resolveGoogleOAuthModels("gemini-cli", connection())).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(3);
  });
});

describe("Google metadata body and cancellation limits", () => {
  it("keeps the deadline active after response headers while the JSON body stalls", async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    proxyAwareFetch.mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"models":')); }, cancel: cancelled,
    })));
    const pending = resolveGoogleOAuthModels("gemini-cli", connection());
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TIMEOUT_MS + 1);
    expect(await pending).toBeNull();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized/malformed bodies and propagates strict proxy failures", async () => {
    proxyAwareFetch.mockResolvedValueOnce(new Response(new Uint8Array(MODEL_CATALOG_MAX_BYTES + 1)));
    expect(await resolveGoogleOAuthModels("gemini-cli", connection())).toBeNull();
    proxyAwareFetch.mockResolvedValueOnce(new Response('{"private": invalid-json-secret'));
    expect(await resolveGoogleOAuthModels("gemini-cli", connection())).toBeNull();
    proxyAwareFetch.mockRejectedValueOnce(new Error("strictProxy=true egress unavailable"));
    await expect(resolveGoogleOAuthModels("gemini-cli", connection(), { proxyOptions: { strictProxy: true } })).rejects.toThrow("strictProxy=true");
  });

  it("honors terminal caller cancellation without cancelling another subscriber's metadata", async () => {
    const already = new AbortController();
    const reason = new Error("caller cancelled");
    already.abort(reason);
    await expect(resolveGoogleOAuthModels("gemini-cli", connection(), { signal: already.signal })).rejects.toBe(reason);
    expect(proxyAwareFetch).not.toHaveBeenCalled();
    const gate = deferred();
    proxyAwareFetch.mockImplementationOnce(() => gate.promise);
    const firstController = new AbortController();
    const first = resolveGoogleOAuthModels("gemini-cli", connection(), { signal: firstController.signal });
    const firstResult = expect(first).rejects.toBe(reason);
    const second = resolveGoogleOAuthModels("gemini-cli", connection());
    await Promise.resolve();
    firstController.abort(reason);
    await firstResult;
    expect(proxyAwareFetch.mock.calls[0][1].signal.aborted).toBe(false);
    gate.resolve(json(catalog("shared-result")));
    expect((await second).models[0].id).toBe("shared-result");
  });

  it("starts a fresh operation when a new caller arrives after the only prior caller cancelled", async () => {
    const controller = new AbortController();
    const reason = new Error("prior metadata cancelled");
    const first = resolveGoogleOAuthModels("gemini-cli", connection(), { signal: controller.signal });
    const firstResult = expect(first).rejects.toBe(reason);
    controller.abort(reason);
    const second = resolveGoogleOAuthModels("gemini-cli", connection());
    await firstResult;
    expect((await second).models[0].id).toBe("synthetic-new-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });
});
