import { getEventListeners } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_CATALOG_MAX_BYTES, MODEL_CATALOG_MAX_CACHE_ENTRIES } from "../../open-sse/config/modelCatalog.js";
import { advanceDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("../../open-sse/services/tokenRefresh.js", () => ({ refreshKiroToken: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { refreshKiroToken } from "../../open-sse/services/tokenRefresh.js";
import { clearKiroModelCache, invalidateKiroModelCache, resolveKiroModels } from "../../open-sse/services/kiroModels.js";

const account = (token = "synthetic-access") => ({ accessToken: token, refreshToken: "synthetic-refresh", providerSpecificData: { clientId: `client-${token}` } });
const json = (id = "available-model") => Response.json({ models: [{ modelId: id, modelName: id, tokenLimits: { maxInputTokens: 2000 } }] });
const unsettled = Symbol("unsettled");

function stalled(status = 200) {
  let controller;
  const cancel = vi.fn();
  const body = new ReadableStream({ start(value) { controller = value; }, cancel });
  return { response: new Response(body, { status }), cancel, close() { try { controller.close(); } catch {} } };
}

async function outcomeAfter(task, milliseconds) {
  const deadline = new Promise(resolve => setTimeout(() => resolve(unsettled), milliseconds));
  const outcome = Promise.race([task, deadline]);
  await vi.advanceTimersByTimeAsync(milliseconds);
  return outcome;
}

beforeEach(() => {
  clearKiroModelCache();
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => json());
  refreshKiroToken.mockResolvedValue(null);
});
afterEach(() => { clearKiroModelCache(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Kiro model catalog resource lifecycle", () => {
  it.each(["success", "failure"])("does not retain caller abort listeners after %s", async outcome => {
    const caller = new AbortController();
    if (outcome === "failure") proxyAwareFetch.mockRejectedValue(new Error("synthetic transport failure"));
    for (let index = 0; index < 3; index++) await resolveKiroModels(account(), { signal: caller.signal, forceRefresh: true });
    expect(getEventListeners(caller.signal, "abort")).toHaveLength(0);
  });

  it("does not dispatch or refresh after caller cancellation before lookup", async () => {
    const caller = new AbortController();
    caller.abort(new Error("caller stopped"));
    await resolveKiroModels(account(), { signal: caller.signal });
    expect(proxyAwareFetch).not.toHaveBeenCalled();
    expect(refreshKiroToken).not.toHaveBeenCalled();
  });

  it.each(["caller", "deadline"])("cancels a stalled response body on %s", async cause => {
    vi.useFakeTimers();
    const fixture = stalled();
    const caller = new AbortController();
    proxyAwareFetch.mockResolvedValue(fixture.response);
    const task = resolveKiroModels(account(), { signal: caller.signal });
    await vi.advanceTimersByTimeAsync(0);
    if (cause === "caller") caller.abort(new Error("caller stopped during body"));
    try {
      expect(await outcomeAfter(task, cause === "deadline" ? 30_001 : 1)).toBeNull();
      expect(fixture.cancel).toHaveBeenCalledTimes(1);
      expect(fixture.response.body.locked).toBe(false);
      expect(refreshKiroToken).not.toHaveBeenCalled();
    } finally { fixture.close(); await task; }
  });

  it("releases an unsuccessful response without waiting for its error body", async () => {
    vi.useFakeTimers();
    const fixture = stalled(503);
    proxyAwareFetch.mockResolvedValue(fixture.response);
    const task = resolveKiroModels(account());
    try {
      expect(await outcomeAfter(task, 1)).toBeNull();
      expect(fixture.cancel).toHaveBeenCalledTimes(1);
    } finally { fixture.close(); await task; }
  });

  it("rejects an oversized catalog before publishing or caching models", async () => {
    proxyAwareFetch.mockResolvedValue(Response.json({ models: [{ modelId: "oversized", description: "x".repeat(MODEL_CATALOG_MAX_BYTES) }] }));
    expect(Boolean(await resolveKiroModels(account()))).toBe(false);
  });

  it("bounds retained account catalogs even while every entry is still fresh", async () => {
    for (let index = 0; index <= MODEL_CATALOG_MAX_CACHE_ENTRIES; index++) await resolveKiroModels(account(`bounded-${index}`));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(MODEL_CATALOG_MAX_CACHE_ENTRIES + 1);
    await resolveKiroModels(account("bounded-0"));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(MODEL_CATALOG_MAX_CACHE_ENTRIES + 2);
  });

  it("also bounds aggregate serialized bytes below the entry-count cap", async () => {
    proxyAwareFetch.mockImplementation(async () => Response.json({ models: [{ modelId: "large-description", description: "x".repeat(1024 * 1024) }] }));
    for (let index = 0; index < 4; index++) await resolveKiroModels(account(`large-${index}`));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(4);
    await resolveKiroModels(account("large-0"));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(5);
  });

  it("does not retain an older catalog when a fresh result exceeds the cache byte budget", async () => {
    const credentials = account();
    await resolveKiroModels(credentials);
    proxyAwareFetch.mockImplementation(async () => Response.json({ models: [{ modelId: "large-description", description: "x".repeat(4 * 1024 * 1024) }] }));
    expect((await resolveKiroModels(credentials, { forceRefresh: true })).models[0].id).toBe("large-description");
    expect((await resolveKiroModels(credentials)).models[0].id).toBe("large-description");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(3);
  });

  it("does not reuse another token's catalog just because both use the same registered client", async () => {
    proxyAwareFetch.mockImplementation(async (_url, options) => json(options.headers.Authorization));
    const first = account("first-account");
    const second = { ...account("second-account"), providerSpecificData: first.providerSpecificData };
    const a = await resolveKiroModels(first);
    const b = await resolveKiroModels(second);
    expect(a.models[0].id).toBe("Bearer first-account");
    expect(b.models[0].id).toBe("Bearer second-account");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("returns independent model/raw objects on both first delivery and cache hits", async () => {
    const credentials = account();
    const first = await resolveKiroModels(credentials);
    first.models[0].name = "mutated";
    first.models[0].capabilities.thinking = true;
    first.rawModels[0].modelId = "mutated-raw";
    const second = await resolveKiroModels(credentials);
    expect(second.models[0]).toMatchObject({ id: "available-model", name: "Kiro available-model", capabilities: { thinking: false } });
    expect(second.rawModels[0].modelId).toBe("available-model");
    second.models[0].name = "mutated-again";
    expect((await resolveKiroModels(credentials)).models[0].name).toBe("Kiro available-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("invalidates every egress-scoped cache entry for the supplied credentials", async () => {
    const credentials = account();
    const policies = [{ url: "http://proxy-a.example", enabled: true }, { url: "http://proxy-b.example", enabled: true }];
    for (const proxyOptions of policies) await resolveKiroModels(credentials, { proxyOptions });
    invalidateKiroModelCache(credentials);
    for (const proxyOptions of policies) await resolveKiroModels(credentials, { proxyOptions });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(4);
  });

  it.each(["clear", "invalidate"])("does not repopulate a %s cache from an older in-flight fetch", async operation => {
    let release;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const credentials = account();
    const task = resolveKiroModels(credentials);
    if (operation === "clear") clearKiroModelCache();
    else invalidateKiroModelCache(credentials);
    release(json("stale-model"));
    expect(await task).toBeNull();
    expect((await resolveKiroModels(credentials)).models[0].id).toBe("available-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("does not refresh a rejected request after the caller cancels", async () => {
    const caller = new AbortController();
    proxyAwareFetch.mockImplementation(async () => { caller.abort(new Error("caller stopped")); return new Response(null, { status: 401 }); });
    await resolveKiroModels(account(), { signal: caller.signal });
    expect(refreshKiroToken).not.toHaveBeenCalled();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it.each(["authMethod", "clientSecret", "region", "tokenEndpoint", "scope"])("does not refresh a rejected lookup after its selected %s binding changed", async field => {
    let release;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const credentials = account();
    credentials.providerSpecificData[field] = "original-binding";
    const task = resolveKiroModels(credentials);
    credentials.providerSpecificData[field] = "replacement-binding";
    release(new Response(null, { status: 401 }));
    expect(await task).toBeNull();
    expect(refreshKiroToken).not.toHaveBeenCalled();
  });

  it("does not serve an earlier catalog cache hit after a database import", async () => {
    const credentials = account();
    await resolveKiroModels(credentials);
    advanceDbImportGeneration();
    proxyAwareFetch.mockImplementation(async () => json("post-import-model"));
    expect((await resolveKiroModels(credentials)).models[0].id).toBe("post-import-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("does not publish an in-flight catalog started before a database import", async () => {
    let release;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const task = resolveKiroModels(account());
    advanceDbImportGeneration();
    release(json("pre-import-model"));
    expect(await task).toBeNull();
    expect((await resolveKiroModels(account())).models[0].id).toBe("available-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("does not refresh a rejected pre-import lookup after the database changes", async () => {
    proxyAwareFetch.mockImplementation(async () => { advanceDbImportGeneration(); return new Response(null, { status: 401 }); });
    await resolveKiroModels(account());
    expect(refreshKiroToken).not.toHaveBeenCalled();
  });

  it("forwards caller cancellation into token refresh and does not retry a cancelled refresh", async () => {
    const caller = new AbortController();
    proxyAwareFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    refreshKiroToken.mockImplementation(async (_token, _specific, _log, _proxy, signal) => {
      caller.abort(new Error("caller stopped during refresh"));
      expect(signal.aborted).toBe(true);
      return { accessToken: "fresh-cancelled" };
    });
    await resolveKiroModels(account(), { signal: caller.signal });
    expect(refreshKiroToken).toHaveBeenCalledTimes(1);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves one authorized refresh and caches under the newly acquired proof", async () => {
    const caller = new AbortController();
    const credentials = account();
    const onCredentialsRefreshed = vi.fn();
    proxyAwareFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    refreshKiroToken.mockResolvedValue({ accessToken: "fresh-proof", refreshToken: "fresh-refresh" });
    const result = await resolveKiroModels(credentials, { signal: caller.signal, onCredentialsRefreshed });
    expect(result.models[0].id).toBe("available-model");
    expect(proxyAwareFetch.mock.calls.map(([, options]) => options.headers.Authorization)).toEqual(["Bearer synthetic-access", "Bearer fresh-proof"]);
    expect(onCredentialsRefreshed).toHaveBeenCalledWith({ accessToken: "fresh-proof", refreshToken: "fresh-refresh" });
    expect(credentials).toMatchObject({ accessToken: "fresh-proof", refreshToken: "fresh-refresh" });
    expect((await resolveKiroModels(credentials)).models[0].id).toBe("available-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    expect(getEventListeners(caller.signal, "abort")).toHaveLength(0);
  });
});
