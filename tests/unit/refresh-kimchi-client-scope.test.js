import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: (...args) => state.fetch(...args) }));

import { clearKimchiCatalog, getCachedKimchiModelMetadata, resolveKimchiModels } from "../../open-sse/services/kimchiModels.js";
import { KimchiExecutor } from "../../open-sse/executors/kimchi.js";

const account = (token, extra = {}) => ({ accessToken: token, providerSpecificData: { userId: "same-user", ...extra } });
const model = (provider, slug = "opaque-routing-model") => ({
  slug, provider, display_name: slug, reasoning: true, input_modalities: ["text"],
  limits: { context_window: 200000, max_output_tokens: 32000 },
});

beforeEach(() => {
  clearKimchiCatalog();
  state.fetch.mockReset();
});
afterEach(() => {
  clearKimchiCatalog();
  vi.useRealTimers();
});

describe("Kimchi's published catalog and request identity remain in the same scope", () => {
  it("does not reuse one user's catalog for a different key", async () => {
    state.fetch.mockResolvedValueOnce(Response.json({ models: [model("anthropic")] }))
      .mockResolvedValueOnce(Response.json({ models: [model("openai")] }));
    const first = account("synthetic-key-a"), second = account("synthetic-key-b");
    await resolveKimchiModels(first);
    const result = await resolveKimchiModels(second);
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(result.models[0].provider).toBe("openai");
    expect(getCachedKimchiModelMetadata("opaque-routing-model", first).provider).toBe("anthropic");
    expect(getCachedKimchiModelMetadata("opaque-routing-model", second).provider).toBe("openai");
    expect(getCachedKimchiModelMetadata("opaque-routing-model")).toBeNull();
  });

  it("keeps provider classification request-local when opaque model IDs overlap", async () => {
    const first = account("synthetic-key-a"), second = account("synthetic-key-b");
    state.fetch.mockResolvedValueOnce(Response.json({ models: [model("anthropic")] }))
      .mockResolvedValueOnce(Response.json({ models: [model("openai")] }));
    await resolveKimchiModels(first);
    await resolveKimchiModels(second);
    const executor = new KimchiExecutor();
    const body = () => ({ messages: [{ role: "user", content: "fixture" }], reasoning_effort: "high" });
    expect(executor.transformRequest("opaque-routing-model", body(), true, first)).not.toHaveProperty("reasoning_effort");
    expect(executor.transformRequest("opaque-routing-model", body(), true, second)).toHaveProperty("reasoning_effort", "high");
  });

  it("uses the same explicit key precedence for catalog and inference", async () => {
    const credentials = { ...account("synthetic-oauth-token"), apiKey: "synthetic-api-key" };
    state.fetch.mockResolvedValue(Response.json({ models: [model("openai")] }));
    await resolveKimchiModels(credentials);
    expect(new Headers(state.fetch.mock.calls[0][1].headers).get("authorization")).toBe("Bearer synthetic-api-key");
    expect(new Headers(new KimchiExecutor().buildHeaders(credentials)).get("authorization")).toBe("Bearer synthetic-api-key");
  });

  it("keeps an exact published non-Anthropic classification above a vendor-looking name", async () => {
    const credentials = account("synthetic-key");
    state.fetch.mockResolvedValue(Response.json({ models: [model("openai", "claude-custom-route")] }));
    await resolveKimchiModels(credentials);
    const body = { messages: [{ role: "user", content: "fixture" }], reasoning_effort: "high" };
    expect(new KimchiExecutor().transformRequest("claude-custom-route", body, true, credentials)).toHaveProperty("reasoning_effort", "high");
  });

  it("binds explicit organization identity to discovery, inference and the cache", async () => {
    const first = account("synthetic-key", { organizationId: "org-fixture-a" });
    const second = account("synthetic-key", { organizationId: "org-fixture-b" });
    state.fetch.mockResolvedValueOnce(Response.json({ models: [model("anthropic")] }))
      .mockResolvedValueOnce(Response.json({ models: [model("openai")] }));
    await resolveKimchiModels(first);
    await resolveKimchiModels(second);
    expect(state.fetch).toHaveBeenCalledTimes(2);
    const headers = state.fetch.mock.calls.map(([, options]) => new Headers(options.headers));
    expect(headers[0].get("x-castai-organization-id")).toBe("org-fixture-a");
    expect(headers[1].get("x-castai-organization-id")).toBe("org-fixture-b");
    const executor = new KimchiExecutor();
    expect(new Headers(executor.buildHeaders(first)).get("x-castai-organization-id")).toBe("org-fixture-a");
    expect(new Headers(executor.buildHeaders(account("synthetic-personal-key"))).get("x-castai-organization-id")).toBeNull();
    expect(() => executor.buildHeaders(account("synthetic-key", { organizationId: "bad\r\nheader" }))).toThrow(/organization ID/);
  });

  it("uses one explicit self-hosted endpoint for discovery and chat", async () => {
    const credentials = account("synthetic-key", { kimchiEndpoint: "https://kimchi.example.test/gateway/" });
    state.fetch.mockResolvedValue(Response.json({ models: [model("openai")] }));
    await resolveKimchiModels(credentials);
    expect(state.fetch.mock.calls[0][0]).toBe("https://kimchi.example.test/gateway/v1/models/metadata?include_in_cli=true");
    const executor = new KimchiExecutor();
    expect(executor.buildUrl("opaque-routing-model", true, 0, credentials)).toBe("https://kimchi.example.test/gateway/openai/v1/chat/completions");
    expect(executor.buildUrl("opaque-routing-model", true, 0, account("synthetic-personal-key"))).toBe("https://llm.kimchi.dev/openai/v1/chat/completions");
    expect(() => executor.buildUrl("opaque-routing-model", true, 0, account("synthetic-key", { kimchiEndpoint: "file:///tmp/fixture" }))).toThrow(/Kimchi endpoint/);
  });

  it("does not reuse metadata across origins or invent slash/case aliases", async () => {
    const first = account("synthetic-key", { kimchiEndpoint: "https://one.example.test" });
    const second = account("synthetic-key", { kimchiEndpoint: "https://two.example.test" });
    state.fetch.mockResolvedValueOnce(Response.json({ models: [model("anthropic", "team/Shared")] }))
      .mockResolvedValueOnce(Response.json({ models: [model("openai", "team/Shared")] }));
    await resolveKimchiModels(first);
    await resolveKimchiModels(second);
    expect(getCachedKimchiModelMetadata("team/Shared", first)?.provider).toBe("anthropic");
    expect(getCachedKimchiModelMetadata("team/Shared", second)?.provider).toBe("openai");
    expect(getCachedKimchiModelMetadata("Shared", first)).toBeNull();
    expect(getCachedKimchiModelMetadata("team/shared", first)).toBeNull();
  });

  it("expires reasoning classifications along with the catalog instead of keeping stale global facts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
    const credentials = account("synthetic-key");
    state.fetch.mockResolvedValue(Response.json({ models: [model("anthropic")] }));
    await resolveKimchiModels(credentials);
    expect(getCachedKimchiModelMetadata("opaque-routing-model", credentials)).not.toBeNull();
    vi.setSystemTime(new Date("2026-10-31T00:05:01Z"));
    expect(getCachedKimchiModelMetadata("opaque-routing-model", credentials)).toBeNull();
  });

  it("bounds retained account catalogs without exposing their keys", async () => {
    state.fetch.mockImplementation(() => Promise.resolve(Response.json({ models: [model("openai")] })));
    for (let index = 0; index <= 100; index++) await resolveKimchiModels(account(`synthetic-key-${index}`));
    expect(getCachedKimchiModelMetadata("opaque-routing-model", account("synthetic-key-0"))).toBeNull();
    expect(getCachedKimchiModelMetadata("opaque-routing-model", account("synthetic-key-100"))).not.toBeNull();
  });
});
