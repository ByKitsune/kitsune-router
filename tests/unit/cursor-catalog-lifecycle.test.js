import { getEventListeners } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ payload: null, status: 200, automatic: true, sessions: [] }));
vi.mock("http2", async () => {
  const { EventEmitter } = await import("node:events");
  return { default: {
    constants: { NGHTTP2_CANCEL: 8 },
    connect: vi.fn(() => {
      const session = new EventEmitter();
      const request = new EventEmitter();
      session.close = vi.fn();
      session.destroy = vi.fn();
      request.close = vi.fn();
      request.destroy = vi.fn();
      request.end = vi.fn(() => {
        if (!fixture.automatic) return;
        queueMicrotask(() => {
          request.emit("response", { ":status": fixture.status });
          request.emit("data", fixture.payload);
          request.emit("end");
        });
      });
      session.request = vi.fn(() => request);
      fixture.sessions.push({ session, request });
      return session;
    }),
  } };
});
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { clearCursorModelCache, resolveCursorModels } from "../../open-sse/services/cursorModels.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { MODEL_CATALOG_MAX_BYTES, MODEL_CATALOG_MAX_CACHE_ENTRIES } from "../../open-sse/config/modelCatalog.js";
import { advanceDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";

const credentials = (accessToken = "synthetic-cursor-token") => ({ accessToken, providerSpecificData: { machineId: "synthetic-machine" } });
const proxied = { strictProxy: true, vercelRelayUrl: "https://relay.example" };
function field(number, value) {
  const bytes = Buffer.from(value);
  let size = bytes.length;
  const prefix = [number << 3 | 2];
  while (size >= 0x80) { prefix.push(size & 0x7f | 0x80); size >>>= 7; }
  prefix.push(size);
  return Buffer.concat([Buffer.from(prefix), bytes]);
}
const payload = (id = "fixture-model", name = "Fixture") => field(1, Buffer.concat([field(1, id), field(4, name)]));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.clearAllMocks();
  clearCursorModelCache();
  fixture.sessions.length = 0;
  fixture.automatic = true;
  fixture.status = 200;
  fixture.payload = payload();
  proxyAwareFetch.mockImplementation(async () => new Response(fixture.payload));
});
afterEach(() => {
  clearCursorModelCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Cursor catalog resource and cache lifecycle", () => {
  it("does not open or dispatch HTTP2 after a caller has already aborted", async () => {
    const caller = new AbortController();
    const reason = new Error("caller cancelled");
    caller.abort(reason);
    await expect(resolveCursorModels(credentials(), { signal: caller.signal })).rejects.toBe(reason);
    expect(fixture.sessions).toHaveLength(0);
  });

  it("removes the HTTP2 completion subscription from the caller signal", async () => {
    const caller = new AbortController();
    expect((await resolveCursorModels(credentials(), { signal: caller.signal })).models[0].id).toBe("fixture-model");
    expect(getEventListeners(caller.signal, "abort")).toHaveLength(0);
  });

  it.each([
    { enabled: true, url: "http://proxy.example:8080" },
    { proxyPoolId: "configured-pool" },
  ])("honors every configured proxy shape before opening native HTTP2: %j", async (proxyOptions) => {
    expect((await resolveCursorModels(credentials(), { proxyOptions })).models[0].id).toBe("fixture-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(fixture.sessions).toHaveLength(0);
  });

  it("destroys an unfinished HTTP2 stream and session on caller cancellation", async () => {
    fixture.automatic = false;
    const caller = new AbortController();
    const reason = new Error("caller stopped waiting");
    const result = resolveCursorModels(credentials(), { signal: caller.signal });
    await flush();
    caller.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(fixture.sessions[0].request.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.sessions[0].session.destroy).toHaveBeenCalledTimes(1);
    expect(getEventListeners(caller.signal, "abort")).toHaveLength(0);
  });

  it("destroys an unfinished HTTP2 stream at the existing ten-second deadline", async () => {
    vi.useFakeTimers();
    fixture.automatic = false;
    const result = resolveCursorModels(credentials());
    await flush();
    await vi.advanceTimersByTimeAsync(10_001);
    await expect(result).resolves.toBeNull();
    expect(fixture.sessions[0].request.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.sessions[0].session.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps the proxied body deadline when the caller supplies a signal", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    let source;
    const cancel = vi.fn();
    proxyAwareFetch.mockResolvedValue(new Response(new ReadableStream({ start(controller) { source = controller; }, cancel })));
    let settled = false;
    const result = resolveCursorModels(credentials(), { signal: caller.signal, proxyOptions: proxied }).finally(() => { settled = true; });
    try {
      await vi.advanceTimersByTimeAsync(10_001);
      expect(settled).toBe(true);
      await expect(result).resolves.toBeNull();
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      try { source.close(); } catch {}
      await result.catch(() => {});
    }
  });

  it.each(["native", "proxy"])("rejects an oversized complete valid protobuf over %s transport", async (transport) => {
    fixture.payload = payload("too-large", "x".repeat(MODEL_CATALOG_MAX_BYTES));
    const result = await resolveCursorModels(credentials(), transport === "proxy" ? { proxyOptions: proxied } : {});
    expect(result).toBeNull();
    if (transport === "native") expect(fixture.sessions[0].session.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not expose mutable cached model objects", async () => {
    const first = await resolveCursorModels(credentials());
    first.models[0].name = "tampered";
    first.models.push({ id: "injected", name: "Injected" });
    expect(await resolveCursorModels(credentials())).toEqual({ models: [{ id: "fixture-model", name: "Fixture" }] });
    expect(fixture.sessions).toHaveLength(1);
  });

  it("bounds model cache entries and refreshes an evicted credential", async () => {
    for (let i = 0; i <= MODEL_CATALOG_MAX_CACHE_ENTRIES; i++) await resolveCursorModels(credentials(`synthetic-${i}`));
    expect(fixture.sessions).toHaveLength(MODEL_CATALOG_MAX_CACHE_ENTRIES + 1);
    await resolveCursorModels(credentials("synthetic-0"));
    expect(fixture.sessions).toHaveLength(MODEL_CATALOG_MAX_CACHE_ENTRIES + 2);
  });

  it("bounds aggregate cached bytes even before the entry limit is reached", async () => {
    fixture.payload = payload("large-name", "x".repeat(6 * 1024 * 1024));
    for (let i = 0; i < 3; i++) await resolveCursorModels(credentials(`large-${i}`));
    await resolveCursorModels(credentials("large-0"));
    expect(fixture.sessions).toHaveLength(4);
  });

  it("does not republish a response after its cache was cleared", async () => {
    let deliver;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { deliver = resolve; }));
    const result = resolveCursorModels(credentials(), { proxyOptions: proxied });
    await flush();
    clearCursorModelCache();
    deliver(new Response(payload("old", "Old")));
    await expect(result).resolves.toBeNull();
    expect((await resolveCursorModels(credentials(), { proxyOptions: proxied })).models[0].id).toBe("fixture-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it("does not serve a cached account catalog after a committed database import", async () => {
    await resolveCursorModels(credentials());
    advanceDbImportGeneration();
    await resolveCursorModels(credentials());
    expect(fixture.sessions).toHaveLength(2);
  });

  it("rejects a stale credential/proxy binding before queued dispatch", async () => {
    const selected = credentials();
    const proxyOptions = { ...proxied };
    const result = resolveCursorModels(selected, { proxyOptions });
    selected.accessToken = "different-token";
    proxyOptions.vercelRelayUrl = "https://different.example";
    await expect(result).resolves.toBeNull();
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("does not return or cache an in-flight catalog after its proxy scope changes", async () => {
    let deliver;
    proxyAwareFetch.mockImplementationOnce(() => new Promise(resolve => { deliver = resolve; }));
    const proxyOptions = { ...proxied };
    const result = resolveCursorModels(credentials(), { proxyOptions });
    await flush();
    proxyOptions.vercelRelayUrl = "https://different.example";
    deliver(new Response(payload("wrong-scope", "Wrong scope")));
    await expect(result).resolves.toBeNull();
    expect((await resolveCursorModels(credentials(), { proxyOptions })).models[0].id).toBe("fixture-model");
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });
});
