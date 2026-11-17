import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_CATALOG_MAX_BYTES, MODEL_CATALOG_TIMEOUT_MS } from "../../open-sse/config/modelCatalog.js";

const refresh = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../../open-sse/services/oauthCredentialManager.js", () => ({ refreshProviderCredentials: refresh.run }));
import { parseGrokCliModels, resolveGrokCliModels } from "../../open-sse/services/grokCliModels.js";

const credentials = () => ({ accessToken: "synthetic-access", refreshToken: "synthetic-refresh", id: "synthetic-grok" });
const json = models => Response.json({ data: models });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
beforeEach(() => { refresh.run.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Grok account catalog request ownership", () => {
  it("rejects a pre-aborted caller before sending credentials", async () => {
    const caller = new AbortController();
    const reason = new Error("caller left");
    caller.abort(reason);
    const fetchFn = vi.fn(async () => json([{ id: "synthetic-model" }]));
    await expect(resolveGrokCliModels(credentials(), { fetchFn, signal: caller.signal })).rejects.toBe(reason);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns promptly on caller abort and cancels a late transport body", async () => {
    const gate = deferred();
    const fetchFn = vi.fn(() => gate.promise);
    const caller = new AbortController();
    const reason = new Error("caller left pending headers");
    const pending = resolveGrokCliModels(credentials(), { fetchFn, signal: caller.signal }).catch(error => error);
    await Promise.resolve();
    caller.abort(reason);
    const cancel = vi.fn();
    let source;
    try {
      const outcome = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("still waiting"), 50))]);
      expect(outcome).toBe(reason);
    } finally {
      gate.resolve(new Response(new ReadableStream({
        start(controller) { source = controller; controller.enqueue(new TextEncoder().encode('{"data":[]}')); }, cancel,
      })));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      if (!cancel.mock.calls.length) { try { source.close(); } catch { /* Already disposed. */ } }
      await pending;
      await Promise.resolve();
    }
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("keeps its deadline active until a complete catalog body arrives", async () => {
    vi.useFakeTimers();
    let source;
    const cancelled = vi.fn();
    const body = new ReadableStream({ start(controller) { source = controller; }, cancel: cancelled });
    const fetchFn = vi.fn(async () => new Response(body));
    const pending = resolveGrokCliModels(credentials(), { fetchFn });
    try {
      await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TIMEOUT_MS + 1);
      const outcome = await Promise.race([pending, Promise.resolve("still waiting")]);
      expect(outcome).toMatchObject({ models: [], warning: expect.stringMatching(/timed out/i) });
      expect(cancelled).toHaveBeenCalledTimes(1);
    } finally {
      try { source.error(new Error("fixture cleanup")); } catch { /* Already cancelled. */ }
      await pending;
    }
  });

  it("bounds catalog bytes before decoding or publishing model metadata", async () => {
    const fetchFn = vi.fn(async () => json([{ id: "synthetic-model", name: "a".repeat(MODEL_CATALOG_MAX_BYTES) }]));
    expect(await resolveGrokCliModels(credentials(), { fetchFn })).toMatchObject({ models: [], warning: expect.any(String) });
  });

  it("refuses redirects and preserves an immutable selected policy", async () => {
    const policy = { proxyPoolId: "selected", vercelRelayUrl: "https://selected.invalid", strictProxy: true };
    const gate = deferred();
    const fetchFn = vi.fn(() => gate.promise);
    const pending = resolveGrokCliModels(credentials(), { fetchFn, proxyOptions: policy });
    await Promise.resolve();
    policy.proxyPoolId = "changed";
    policy.vercelRelayUrl = "https://changed.invalid";
    gate.resolve(json([{ id: "synthetic-model" }]));
    await pending;
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
    expect(fetchFn.mock.calls[0][2]).toMatchObject({ proxyPoolId: "selected", vercelRelayUrl: "https://selected.invalid" });
  });

  it("does not rotate a pooled refresh proof for a public read-only catalog", async () => {
    const fetchFn = vi.fn(async () => Response.json({ error: "expired" }, { status: 401 }));
    refresh.run.mockResolvedValue({ accessToken: "rotated-access", refreshToken: "rotated-proof" });
    const result = await resolveGrokCliModels(credentials(), { fetchFn, allowRefresh: false });
    expect(result.models).toEqual([]);
    expect(refresh.run).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("disposes the rejected body before refresh and persists a rotation before cancellation stops retry", async () => {
    const rejected = new Response(new ReadableStream({ cancel: vi.fn() }), { status: 401 });
    const dispose = vi.spyOn(rejected.body, "cancel");
    const fetchFn = vi.fn().mockResolvedValueOnce(rejected).mockResolvedValue(json([{ id: "unexpected-retry" }]));
    refresh.run.mockResolvedValue({ accessToken: "rotated-access", refreshToken: "rotated-proof" });
    const caller = new AbortController();
    const reason = new Error("left after credential commit");
    const persist = vi.fn(async () => {
      expect(dispose).toHaveBeenCalledTimes(1);
      caller.abort(reason);
    });
    await expect(resolveGrokCliModels(credentials(), { fetchFn, signal: caller.signal, onCredentialsRefreshed: persist })).rejects.toBe(reason);
    expect(persist).toHaveBeenCalledWith({ accessToken: "rotated-access", refreshToken: "rotated-proof" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(refresh.run.mock.calls[0][4]).toBeInstanceOf(AbortSignal);
  });

  it("does not echo a rejected upstream body's credentials in a public warning", async () => {
    const secret = "synthetic-private-upstream-value";
    const fetchFn = vi.fn(async () => Response.json({ error: secret, access_token: secret }, { status: 503 }));
    const result = await resolveGrokCliModels(credentials(), { fetchFn });
    expect(result.warning).toContain("503");
    expect(result.warning).not.toContain(secret);
  });

  it("does not echo an arbitrary transport error message in a public warning", async () => {
    const secret = "synthetic-private-transport-value";
    const fetchFn = vi.fn(async () => { throw new Error(secret); });
    expect((await resolveGrokCliModels(credentials(), { fetchFn })).warning).not.toContain(secret);
  });

  it("keeps authoritative empty catalogs distinct from a failed lookup", async () => {
    expect(await resolveGrokCliModels(credentials(), { fetchFn: async () => json([]) })).toMatchObject({ models: [], complete: true });
    expect(await resolveGrokCliModels(credentials(), { fetchFn: async () => Response.json({ error: "not a catalog" }) })).not.toHaveProperty("complete", true);
  });

  it("does not fabricate string IDs or positive model limits from invalid fields", () => {
    expect(parseGrokCliModels({ data: [{ id: { arbitrary: "object" } }, { id: "valid", context_length: true, max_output_tokens: 3.5 }] }))
      .toEqual([{ id: "valid", name: "valid", context_length: true, max_output_tokens: 3.5 }]);
  });
});
