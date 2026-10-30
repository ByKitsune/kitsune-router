import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { clearCodexModelsCache, parseCodexModels, resolveCodexModels } from "../../open-sse/services/codexModels.js";
import { CODEX_MODELS_URL } from "../../open-sse/config/codexModels.js";
import { CODEX_USER_AGENT } from "../../open-sse/config/clientVersions.js";
import { MODEL_CATALOG_CACHE_TTL_MS, MODEL_CATALOG_MAX_BYTES, MODEL_CATALOG_TIMEOUT_MS } from "../../open-sse/config/modelCatalog.js";
import { advanceDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";

const connection = overrides => ({ id: "fixture", accessToken: "fixture-oauth", providerSpecificData: { chatgptAccountId: "fixture-account" }, ...overrides });
const response = (slug = "fixture-model", fields = {}) => Response.json({ models: [{ slug, display_name: slug, ...fields }] });
const ids = result => result.models.map(model => model.id);

beforeEach(() => {
  vi.clearAllMocks();
  clearCodexModelsCache();
  proxyAwareFetch.mockImplementation(async () => response());
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No direct or paid request is allowed by this fixture"); }));
});
afterEach(() => {
  clearCodexModelsCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("native Codex account catalog metadata and route identities", () => {
  it("preserves typed account metadata and gateway Review aliases on the fixed native endpoint", async () => {
    const raw = {
      slug: "fixture-live", display_name: "Live fixture", type: "model", visibility: "list",
      supported_in_api: false, context_window: 272000, input_modalities: ["text", "image"],
      supported_reasoning_levels: [{ effort: "high", description: "Source-provided effort" }],
      default_reasoning_level: "high", optional_upstream_field: { retained: true },
    };
    proxyAwareFetch.mockResolvedValueOnce(Response.json({ models: [raw] }));
    const selected = connection({ rawHeaders: { authorization: "must-not-forward", "chatgpt-account-id": "wrong-account" } });
    const result = await resolveCodexModels(selected);
    expect(ids(result)).toEqual(["fixture-live", "fixture-live-review"]);
    expect(result.complete).toBe(true);
    expect(result.models[0]).toMatchObject({ ...raw, id: "fixture-live", name: "Live fixture", kind: "llm" });
    expect(result.models[1]).toMatchObject({ upstreamModelId: "fixture-live", quotaFamily: "review" });
    const [url, options, policy] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe(CODEX_MODELS_URL);
    expect(options.redirect).toBe("error");
    expect(options.cache).toBe("no-store");
    expect(policy).toBeNull();
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer fixture-oauth");
    expect(new Headers(options.headers).get("chatgpt-account-id")).toBe("fixture-account");
    expect(new Headers(options.headers).get("user-agent")).toBe(CODEX_USER_AGENT);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows native picker visibility without treating API support as ChatGPT entitlement", async () => {
    const data = { models: [
      { slug: "chatgpt-only", visibility: "list", supported_in_api: false },
      { slug: "hidden-native", visibility: "hide" },
      { slug: "no-picker", visibility: "none" },
      { slug: "legacy-no-visibility" },
      { slug: "codex-auto-review", visibility: "hide" },
    ] };
    expect(ids({ models: parseCodexModels(data) })).toEqual([
      "chatgpt-only", "chatgpt-only-review", "legacy-no-visibility", "legacy-no-visibility-review",
    ]);
    proxyAwareFetch.mockResolvedValueOnce(Response.json({ models: [{ slug: "hidden-only", visibility: "hide" }] }));
    expect(await resolveCodexModels(connection())).toEqual({ models: [], complete: true });
    expect(await resolveCodexModels(connection())).toEqual({ models: [], complete: true });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("does not fabricate duplicate native Review IDs or Review variants of media", () => {
    const models = parseCodexModels({ models: [
      { slug: "fixture-base" }, { slug: "fixture-base-review", name: "Native review", optional: true },
      { slug: "fixture-image", kind: "image" }, { slug: "fixture-embedding", type: "embedding" },
    ] });
    expect(ids({ models })).toEqual(["fixture-base", "fixture-base-review", "fixture-image", "fixture-embedding"]);
    expect(models[1]).toMatchObject({ name: "Native review", optional: true });
    expect(models[1]).not.toHaveProperty("upstreamModelId");
  });

  it("keeps malformed limits or capability strings out of declared public facts", () => {
    const [model] = parseCodexModels({ models: [{
      slug: "fixture-facts", context_window: 2.5, max_input_tokens: Number.MAX_SAFE_INTEGER + 1,
      max_output_tokens: "128", context_length: -1,
      capabilities: { vision: "true", tools: false, reasoning: true, maxOutput: 2.5, contextWindow: "2048", arbitrary: "not-a-fact" },
      caps: { vision: false, maxInput: "1024" },
    }] });
    expect(model).not.toHaveProperty("context_window");
    expect(model).not.toHaveProperty("max_input_tokens");
    expect(model).not.toHaveProperty("context_length");
    expect(model.max_output_tokens).toBe(128);
    expect(model.capabilities).toEqual({ tools: false, reasoning: true, contextWindow: 2048 });
    expect(model.caps).toEqual({ vision: false, maxInput: 1024 });
  });

  it.each([{ models: "not-a-list" }, { models: [{ slug: "ok" }, {}] }, { models: [{ slug: "x", visibility: "unknown" }] }])("does not publish incomplete malformed metadata: %j", async data => {
    proxyAwareFetch.mockResolvedValueOnce(Response.json(data));
    expect(await resolveCodexModels(connection())).toBeNull();
  });

  it("does not send a native OpenAI API key to the ChatGPT account endpoint", async () => {
    expect(await resolveCodexModels({ id: "wrong-product", apiKey: "fixture-api-key" })).toBeNull();
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });
});

describe("Codex model metadata cache scope and lifecycle", () => {
  it("does not dispatch a bearer proof through a proxy changed before the queued fetch begins", async () => {
    const policy = { connectionProxyUrl: "http://selected-fixture.invalid" };
    const pending = resolveCodexModels(connection(), { proxyOptions: policy });
    policy.connectionProxyUrl = "http://replacement-fixture.invalid";
    expect(await pending).toBeNull();
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("separates token/account/connection/proxy policy and protects cached rows from caller mutation", async () => {
    const selected = connection();
    const first = await resolveCodexModels(selected);
    first.models[0].name = "caller mutation";
    expect((await resolveCodexModels(selected)).models[0].name).toBe("fixture-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    await resolveCodexModels(connection({ accessToken: "rotated-proof" }));
    await resolveCodexModels(connection({ id: "other-connection" }));
    await resolveCodexModels(connection({ providerSpecificData: { workspaceId: "other-account" } }));
    const strict = { strictProxy: true, connectionProxyUrl: "http://fixture.invalid" };
    await resolveCodexModels(selected, { proxyOptions: strict });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(5);
    expect(proxyAwareFetch.mock.calls.at(-1)[2]).toBe(strict);
  });

  it("honors force-refresh and expires metadata without renewing failed reads", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const selected = connection();
    await resolveCodexModels(selected);
    await resolveCodexModels(selected, { forceRefresh: true });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    vi.setSystemTime(MODEL_CATALOG_CACHE_TTL_MS + 1);
    proxyAwareFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await resolveCodexModels(selected)).toBeNull();
    await resolveCodexModels(selected);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(4);
  });

  it.each(["import", "clear", "token", "account", "proxy"])("never publishes or warms cache from an invalidated in-flight %s scope", async kind => {
    const selected = connection();
    const policy = { connectionProxyUrl: "http://first-fixture.invalid" };
    let finish;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = resolveCodexModels(selected, { proxyOptions: policy });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    if (kind === "import") advanceDbImportGeneration();
    if (kind === "clear") clearCodexModelsCache();
    if (kind === "token") selected.accessToken = "replacement-proof";
    if (kind === "account") selected.providerSpecificData.chatgptAccountId = "replacement-account";
    if (kind === "proxy") policy.connectionProxyUrl = "http://replacement-fixture.invalid";
    finish(response("stale-model"));
    expect(await pending).toBeNull();
    expect(ids(await resolveCodexModels(selected, { proxyOptions: policy }))).toContain("fixture-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("bounds the aggregate cache by bytes while preserving large optional native fields", async () => {
    const large = "x".repeat(3 * 1024 * 1024);
    proxyAwareFetch.mockImplementation(async () => response("large-model", { optional_template: large }));
    for (const id of ["first", "second", "third"]) await resolveCodexModels(connection({ id }));
    expect((await resolveCodexModels(connection({ id: "first" }))).models[0].optional_template).toHaveLength(large.length);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(4);
  });
});

describe("Codex metadata transport is bounded and read-only", () => {
  it("preserves a caller's ordinary abort reason even when an injected transport ignores its signal", async () => {
    const caller = new AbortController();
    proxyAwareFetch.mockImplementation(() => new Promise(() => {}));
    const pending = resolveCodexModels(connection(), { signal: caller.signal }).then(value => value, error => error);
    await vi.waitFor(() => expect(proxyAwareFetch).toHaveBeenCalledTimes(1));
    const reason = new Error("caller left catalog");
    caller.abort(reason);
    expect(await pending).toBe(reason);
  });

  it("does not dispatch for an already-aborted caller, including a warm cache", async () => {
    await resolveCodexModels(connection());
    const caller = new AbortController();
    const reason = new Error("already left");
    caller.abort(reason);
    await expect(resolveCodexModels(connection(), { signal: caller.signal })).rejects.toBe(reason);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("times out an unsettled header fetch and cancels a late body without caching it", async () => {
    vi.useFakeTimers();
    let finish;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = resolveCodexModels(connection());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TIMEOUT_MS);
    expect(await pending).toBeNull();
    const cancel = vi.fn();
    finish(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(ids(await resolveCodexModels(connection()))).toContain("fixture-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the deadline active after headers even if stream cancellation never resolves", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise(() => {}));
    proxyAwareFetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
    const pending = resolveCodexModels(connection());
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TIMEOUT_MS);
    expect(await pending).toBeNull();
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects oversized and malformed bodies without logging or echoing raw metadata", async () => {
    const cancel = vi.fn();
    proxyAwareFetch.mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(MODEL_CATALOG_MAX_BYTES + 1)); }, cancel,
    })));
    expect(await resolveCodexModels(connection())).toBeNull();
    expect(cancel).toHaveBeenCalled();
    proxyAwareFetch.mockResolvedValueOnce(new Response("private-model-marker { invalid-json"));
    await expect(resolveCodexModels(connection(), { proxyOptions: { strictProxy: true } })).rejects.toThrow("Invalid model catalog JSON");
  });

  it("never masks a strict proxy failure or falls back to another transport", async () => {
    const failure = new Error("strictProxy=true requires the chosen policy");
    proxyAwareFetch.mockRejectedValueOnce(failure);
    await expect(resolveCodexModels(connection(), { proxyOptions: { strictProxy: true } })).rejects.toBe(failure);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes only through the explicitly supplied dashboard policy, once", async () => {
    const selected = connection({ refreshToken: "not-consumed-by-public-catalog" });
    proxyAwareFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(await resolveCodexModels(selected)).toBeNull();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    const onUnauthorized = vi.fn(async signal => {
      expect(signal).toBeInstanceOf(AbortSignal);
      selected.accessToken = "renewed-proof";
      return { accessToken: "renewed-proof" };
    });
    proxyAwareFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    proxyAwareFetch.mockResolvedValueOnce(response("renewed-model"));
    expect(ids(await resolveCodexModels(selected, { onUnauthorized }))).toContain("renewed-model");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(new Headers(proxyAwareFetch.mock.calls.at(-1)[1].headers).get("authorization")).toBe("Bearer renewed-proof");
  });

  it.each(["proxy", "connection", "account"])("does not follow a credential refresh into a changed %s binding", async kind => {
    const selected = connection();
    const policy = { connectionProxyUrl: "http://original-fixture.invalid" };
    proxyAwareFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const onUnauthorized = async () => {
      selected.accessToken = "renewed-proof";
      if (kind === "proxy") policy.connectionProxyUrl = "http://other-fixture.invalid";
      if (kind === "connection") selected.id = "other-connection";
      if (kind === "account") selected.providerSpecificData.chatgptAccountId = "other-account";
      return { accessToken: "renewed-proof" };
    };
    expect(await resolveCodexModels(selected, { proxyOptions: policy, onUnauthorized })).toBeNull();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });
});
