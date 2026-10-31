import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_CATALOG_MAX_BYTES, MODEL_CATALOG_MAX_CACHE_ENTRIES } from "../../open-sse/config/modelCatalog.js";
import { advanceDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("../../open-sse/services/tokenRefresh.js", () => ({ refreshCopilotToken: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { refreshCopilotToken } from "../../open-sse/services/tokenRefresh.js";
import { clearCopilotModelCache, resolveCopilotModels } from "../../open-sse/services/copilotModels.js";

const account = (token = "synthetic-access") => ({ id: `connection-${token}`, accessToken: token, providerSpecificData: { copilotToken: `copilot-${token}` } });
const json = (id = "available-model", name = id) => Response.json({ data: [{ id, name, policy: { state: "enabled" }, capabilities: { type: "chat", supports: { vision: true }, limits: { max_context_window_tokens: 2000 } } }] });
const unsettled = Symbol("unsettled");

function stalled(status = 200) {
  let controller;
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ start(value) { controller = value; }, cancel }), { status });
  return { response, cancel, close() { try { controller.close(); } catch {} } };
}

async function outcomeAfter(task, milliseconds) {
  const outcome = Promise.race([task, new Promise(resolve => setTimeout(() => resolve(unsettled), milliseconds))]);
  await vi.advanceTimersByTimeAsync(milliseconds);
  return outcome;
}

beforeEach(() => {
  clearCopilotModelCache();
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => json());
  refreshCopilotToken.mockResolvedValue(null);
});
afterEach(() => { clearCopilotModelCache(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Copilot catalog resource lifecycle", () => {
  it("does not dispatch a request after the caller already cancelled", async () => {
    const caller = new AbortController();
    caller.abort(new Error("caller stopped"));
    await resolveCopilotModels(account(), { signal: caller.signal });
    expect(proxyAwareFetch).not.toHaveBeenCalled();
    expect(refreshCopilotToken).not.toHaveBeenCalled();
  });

  it("retains the header deadline when a caller signal is supplied", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    proxyAwareFetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }));
    const task = resolveCopilotModels(account(), { signal: caller.signal });
    try { expect(await outcomeAfter(task, 10_001)).toBeNull(); }
    finally { caller.abort(new Error("test cleanup")); await task; }
  });

  it.each(["caller", "deadline"])("cancels and unlocks stalled catalog bodies on %s", async cause => {
    vi.useFakeTimers();
    const fixture = stalled();
    const caller = new AbortController();
    proxyAwareFetch.mockResolvedValue(fixture.response);
    const task = resolveCopilotModels(account(), { signal: caller.signal });
    await vi.advanceTimersByTimeAsync(0);
    if (cause === "caller") caller.abort(new Error("caller stopped during body"));
    try {
      expect(await outcomeAfter(task, cause === "deadline" ? 10_001 : 1)).toBeNull();
      expect(fixture.cancel).toHaveBeenCalledTimes(1);
      expect(fixture.response.body.locked).toBe(false);
    } finally { fixture.close(); await task; }
  });

  it("cancels a rejected body before attempting a refresh", async () => {
    const fixture = stalled(401);
    proxyAwareFetch.mockResolvedValue(fixture.response);
    await resolveCopilotModels(account());
    expect(fixture.cancel).toHaveBeenCalledTimes(1);
    expect(refreshCopilotToken).toHaveBeenCalledTimes(1);
    fixture.close();
  });

  it("rejects oversized upstream catalogs rather than retaining them", async () => {
    proxyAwareFetch.mockImplementation(async () => json("oversized", "x".repeat(MODEL_CATALOG_MAX_BYTES)));
    expect(Boolean(await resolveCopilotModels(account()))).toBe(false);
  });

  it("bounds fresh cache entries across token rotations and account churn", async () => {
    for (let index = 0; index <= MODEL_CATALOG_MAX_CACHE_ENTRIES; index++) await resolveCopilotModels(account(`bounded-${index}`));
    await resolveCopilotModels(account("bounded-0"));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(MODEL_CATALOG_MAX_CACHE_ENTRIES + 2);
  });

  it("bounds total serialized bytes before the entry-count cap", async () => {
    proxyAwareFetch.mockImplementation(async () => json("large", "x".repeat(5 * 1024 * 1024)));
    for (let index = 0; index < 4; index++) await resolveCopilotModels(account(`large-${index}`));
    await resolveCopilotModels(account("large-0"));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(5);
  });

  it("does not merge distinct connection/refresh proofs sharing the same Copilot token", async () => {
    const first = account("first");
    const second = account("second");
    second.providerSpecificData.copilotToken = first.providerSpecificData.copilotToken;
    await resolveCopilotModels(first);
    await resolveCopilotModels(second);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("does not expose mutable cache objects on first delivery or later hits", async () => {
    const credentials = account();
    const first = await resolveCopilotModels(credentials);
    first.models[0].name = "mutated";
    first.models[0].capabilities.vision = false;
    const second = await resolveCopilotModels(credentials);
    expect(second.models[0]).toMatchObject({ id: "available-model", name: "available-model", capabilities: { vision: true } });
    second.models[0].name = "mutated-again";
    expect((await resolveCopilotModels(credentials)).models[0].name).toBe("available-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("does not publish an older in-flight response after clearing the cache", async () => {
    let release;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const credentials = account();
    const task = resolveCopilotModels(credentials);
    clearCopilotModelCache();
    release(json("stale-model"));
    expect(await task).toBeNull();
    expect((await resolveCopilotModels(credentials)).models[0].id).toBe("available-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("discards an in-flight response if its caller changes the selected account or egress", async () => {
    let release;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const credentials = account();
    const proxyOptions = { enabled: true, url: "http://proxy-a.example" };
    const task = resolveCopilotModels(credentials, { proxyOptions });
    credentials.accessToken = "different-selected-account";
    proxyOptions.url = "http://proxy-b.example";
    release(json("stale-model"));
    expect(await task).toBeNull();
  });

  it("does not refresh after the caller cancels a rejected lookup", async () => {
    const caller = new AbortController();
    proxyAwareFetch.mockImplementation(async () => { caller.abort(new Error("caller stopped")); return new Response(null, { status: 401 }); });
    await resolveCopilotModels(account(), { signal: caller.signal });
    expect(refreshCopilotToken).not.toHaveBeenCalled();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("does not serve a pre-import catalog from the cache", async () => {
    const credentials = account();
    await resolveCopilotModels(credentials);
    advanceDbImportGeneration();
    proxyAwareFetch.mockImplementation(async () => json("post-import-model"));
    expect((await resolveCopilotModels(credentials)).models[0].id).toBe("post-import-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("does not publish a pending catalog fetched before a database import", async () => {
    let release;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const task = resolveCopilotModels(account());
    advanceDbImportGeneration();
    release(json("pre-import-model"));
    expect(await task).toBeNull();
    expect((await resolveCopilotModels(account())).models[0].id).toBe("available-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("does not refresh a rejected pre-import catalog request", async () => {
    proxyAwareFetch.mockImplementation(async () => { advanceDbImportGeneration(); return new Response(null, { status: 401 }); });
    await resolveCopilotModels(account());
    expect(refreshCopilotToken).not.toHaveBeenCalled();
  });

  it("forwards caller cancellation into refresh and skips any later catalog retry", async () => {
    const caller = new AbortController();
    proxyAwareFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    refreshCopilotToken.mockImplementation(async (_token, _log, _proxy, signal) => {
      caller.abort(new Error("caller stopped during refresh"));
      expect(signal.aborted).toBe(true);
      return { token: "fresh-cancelled" };
    });
    await resolveCopilotModels(account(), { signal: caller.signal });
    expect(refreshCopilotToken).toHaveBeenCalledTimes(1);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves a single successful refresh and current account-authorized native IDs", async () => {
    proxyAwareFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    proxyAwareFetch.mockImplementation(async () => json("gpt-5.5"));
    refreshCopilotToken.mockResolvedValue({ token: "fresh-copilot", expiresAt: 12345 });
    const onCredentialsRefreshed = vi.fn();
    const result = await resolveCopilotModels(account(), { onCredentialsRefreshed });
    expect(result.models[0].id).toBe("gpt-5.5");
    expect(onCredentialsRefreshed).toHaveBeenCalledWith({ copilotToken: "fresh-copilot", copilotTokenExpiresAt: 12345 });
    expect(proxyAwareFetch.mock.calls.map(([, options]) => options.headers.Authorization)).toEqual(["Bearer copilot-synthetic-access", "Bearer fresh-copilot"]);
  });
});
