import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_CATALOG_MAX_CACHE_ENTRIES, MODEL_CATALOG_MAX_CACHE_BYTES, MODEL_CATALOG_MAX_BYTES } from "../../open-sse/config/modelCatalog.js";
import { advanceDbImportGeneration } from "../../src/lib/db/helpers/importGeneration.js";

const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: state.fetch }));
let catalog;
const credentials = (token = "synthetic-token", userId = "synthetic-user") => ({ accessToken: token, providerSpecificData: { userId } });
const response = (id = "synthetic-model", extra = {}) => Response.json({ chat: [{ key: id, display_name: id, enable: true, ...extra }] });

beforeEach(async () => {
  vi.resetModules();
  state.fetch.mockReset();
  catalog = await import("../../open-sse/services/qoderModels.js");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Qoder catalog lifecycle and memory bounds", () => {
  it("isolates exact credentials even when tokens share a user identifier", async () => {
    state.fetch.mockResolvedValueOnce(response("first-account-model")).mockResolvedValueOnce(response("second-account-model"));
    expect((await catalog.resolveQoderModels(credentials("first-token"))).models[0].id).toBe("first-account-model");
    expect((await catalog.resolveQoderModels(credentials("second-token"))).models[0].id).toBe("second-account-model");
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it("invalidates all proxy variants for exactly the selected credential", async () => {
    const selected = credentials("selected"), peer = credentials("peer");
    const direct = {}, relay = { strictProxy: true, vercelRelayUrl: "https://relay.example.test" };
    state.fetch.mockImplementation(async () => response());
    await catalog.resolveQoderModels(selected, { proxyOptions: direct });
    await catalog.resolveQoderModels(selected, { proxyOptions: relay });
    await catalog.resolveQoderModels(peer, { proxyOptions: direct });
    catalog.invalidateQoderCatalog(selected);
    await catalog.resolveQoderModels(selected, { proxyOptions: direct });
    await catalog.resolveQoderModels(selected, { proxyOptions: relay });
    await catalog.resolveQoderModels(peer, { proxyOptions: direct });
    expect(state.fetch).toHaveBeenCalledTimes(5);
  });

  it("returns independent nested configs and public model arrays", async () => {
    state.fetch.mockResolvedValue(response("editable", { nested: { limits: [1, 2] } }));
    const selected = credentials();
    const first = await catalog.resolveQoderModels(selected);
    first.models[0].name = "changed";
    first.rawConfigs.get("editable").nested.limits.push(999);
    const second = await catalog.getQoderModelConfig(selected, "editable");
    expect(second.nested.limits).toEqual([1, 2]);
    second.nested.limits.push(123);
    expect((await catalog.resolveQoderModels(selected)).models[0].name).toBe("editable");
    expect((await catalog.getQoderModelConfig(selected, "editable")).nested.limits).toEqual([1, 2]);
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("evicts least-recently-used catalog credentials at the shared entry bound", async () => {
    state.fetch.mockImplementation(async () => response());
    for (let i = 0; i < MODEL_CATALOG_MAX_CACHE_ENTRIES; i++) await catalog.resolveQoderModels(credentials(`token-${i}`, `user-${i}`));
    await catalog.resolveQoderModels(credentials("token-0", "user-0"));
    await catalog.resolveQoderModels(credentials("extra", "extra-user"));
    await catalog.resolveQoderModels(credentials("token-0", "user-0"));
    expect(state.fetch).toHaveBeenCalledTimes(MODEL_CATALOG_MAX_CACHE_ENTRIES + 1);
    await catalog.resolveQoderModels(credentials("token-1", "user-1"));
    expect(state.fetch).toHaveBeenCalledTimes(MODEL_CATALOG_MAX_CACHE_ENTRIES + 2);
  });

  it("bounds aggregate retained catalog bytes as well as entry count", async () => {
    const largeName = "x".repeat(Math.floor(MODEL_CATALOG_MAX_CACHE_BYTES / 5));
    state.fetch.mockImplementation(async () => response("large", { display_name: largeName }));
    for (let i = 0; i < 3; i++) await catalog.resolveQoderModels(credentials(`large-token-${i}`, `large-user-${i}`));
    await catalog.resolveQoderModels(credentials("large-token-0", "large-user-0"));
    expect(state.fetch).toHaveBeenCalledTimes(4);
  });

  it.each(["clear", "invalidate"])("%s prevents a late in-flight result from repopulating the catalog", async mode => {
    let deliver, started;
    const beginning = new Promise(resolve => { started = resolve; });
    state.fetch.mockImplementationOnce(() => { started(); return new Promise(resolve => { deliver = resolve; }); });
    const selected = credentials();
    const pending = catalog.resolveQoderModels(selected);
    await beginning;
    if (mode === "clear") catalog.clearQoderCatalog();
    else catalog.invalidateQoderCatalog(selected);
    deliver(response("stale"));
    expect(await pending).toBeNull();
    state.fetch.mockResolvedValue(response("fresh"));
    expect((await catalog.resolveQoderModels(selected)).models[0].id).toBe("fresh");
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch or return a cached catalog after caller cancellation", async () => {
    state.fetch.mockResolvedValue(response());
    const selected = credentials();
    await catalog.resolveQoderModels(selected);
    const controller = new AbortController();
    const reason = new Error("caller ended request");
    controller.abort(reason);
    await expect(catalog.resolveQoderModels(selected, { signal: controller.signal })).rejects.toBe(reason);
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps its deadline through a stalled response body and cancels the reader", async () => {
    vi.useFakeTimers();
    let reader, headersArrived;
    const cancel = vi.fn();
    const started = new Promise(resolve => { headersArrived = resolve; });
    state.fetch.mockImplementation(async () => {
      const result = new Response(new ReadableStream({ start(controller) { reader = controller; }, cancel }));
      headersArrived();
      return result;
    });
    let settled = false;
    const pending = catalog.resolveQoderModels(credentials()).then(value => { settled = true; return value; });
    await started;
    try {
      await vi.advanceTimersByTimeAsync(15_001);
      expect(settled).toBe(true);
      expect(await pending).toBeNull();
      expect(cancel).toHaveBeenCalled();
    } finally {
      try { reader.enqueue(new TextEncoder().encode('{"chat":[]}')); reader.close(); } catch { /* cancelled reader */ }
      await pending;
    }
  });

  it("rejects oversized metadata without retaining its raw configuration", async () => {
    state.fetch.mockResolvedValue(response("oversized", { description: "x".repeat(MODEL_CATALOG_MAX_BYTES) }));
    expect(await catalog.resolveQoderModels(credentials()) === null, "Oversized metadata must be rejected").toBe(true);
  });

  it("lets one coalesced waiter cancel without aborting another caller", async () => {
    let deliver, notify, transportSignal;
    const started = new Promise(resolve => { notify = resolve; });
    state.fetch.mockImplementationOnce((_url, options) => {
      transportSignal = options.signal;
      notify();
      return new Promise(resolve => { deliver = resolve; });
    });
    const selected = credentials();
    const controller = new AbortController();
    const reason = new Error("first caller left");
    const first = catalog.resolveQoderModels(selected, { signal: controller.signal });
    await started;
    const second = catalog.resolveQoderModels(selected);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const cancelled = expect(first).rejects.toBe(reason);
    controller.abort(reason);
    await cancelled;
    expect(transportSignal.aborted).toBe(false);
    deliver(response("remaining-caller"));
    expect((await second).models[0].id).toBe("remaining-caller");
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts an unobserved transport and disposes of a late ignored-abort response", async () => {
    let deliver, notify, transportSignal;
    const started = new Promise(resolve => { notify = resolve; });
    state.fetch.mockImplementationOnce((_url, options) => {
      transportSignal = options.signal;
      notify();
      return new Promise(resolve => { deliver = resolve; });
    });
    const controller = new AbortController();
    const reason = new Error("last caller left");
    const pending = catalog.resolveQoderModels(credentials(), { signal: controller.signal });
    await started;
    const cancelled = expect(pending).rejects.toBe(reason);
    controller.abort(reason);
    await cancelled;
    expect(transportSignal.aborted).toBe(true);
    const cancel = vi.fn();
    deliver(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    state.fetch.mockResolvedValue(response("after-cancel"));
    expect((await catalog.resolveQoderModels(credentials())).models[0].id).toBe("after-cancel");
  });

  it("never publishes an older force-refresh result after a newer refresh wins", async () => {
    let deliver, notify;
    const started = new Promise(resolve => { notify = resolve; });
    state.fetch.mockImplementationOnce(() => { notify(); return new Promise(resolve => { deliver = resolve; }); });
    const selected = credentials();
    const first = catalog.resolveQoderModels(selected);
    await started;
    state.fetch.mockResolvedValue(response("newer"));
    expect((await catalog.resolveQoderModels(selected, { forceRefresh: true })).models[0].id).toBe("newer");
    deliver(response("older"));
    expect(await first).toBeNull();
    expect((await catalog.resolveQoderModels(selected)).models[0].id).toBe("newer");
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch a mutated caller credential selected before the queued lookup", async () => {
    const selected = credentials();
    const pending = catalog.resolveQoderModels(selected);
    selected.accessToken = "changed-token";
    expect(await pending).toBeNull();
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("cancels rejected bodies and keeps upstream error text out of PAT errors", async () => {
    const cancel = vi.fn();
    state.fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 401 }));
    expect(await catalog.resolveQoderModels(credentials())).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
    state.fetch.mockResolvedValueOnce(new Response("synthetic-sensitive-token-echo", { status: 403 }));
    await expect(catalog.resolveQoderCredentials({ apiKey: "pt-synthetic-secret" })).rejects.toThrow("qoder PAT exchange failed (403)");
    for (const [, options] of state.fetch.mock.calls) expect(options.redirect).toBe("error");
  });

  it("refetches a cached catalog after a committed database import", async () => {
    state.fetch.mockResolvedValueOnce(response("before-import")).mockResolvedValueOnce(response("after-import"));
    const selected = credentials();
    expect((await catalog.resolveQoderModels(selected)).models[0].id).toBe("before-import");
    advanceDbImportGeneration();
    expect((await catalog.resolveQoderModels(selected)).models[0].id).toBe("after-import");
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not return or publish a late pre-import catalog without a following lookup", async () => {
    let deliver, notify;
    const started = new Promise(resolve => { notify = resolve; });
    state.fetch.mockImplementationOnce(() => { notify(); return new Promise(resolve => { deliver = resolve; }); });
    const selected = credentials();
    const pending = catalog.resolveQoderModels(selected);
    await started;
    advanceDbImportGeneration();
    deliver(response("pre-import-late"));
    expect(await pending).toBeNull();
    state.fetch.mockResolvedValue(response("post-import"));
    expect((await catalog.resolveQoderModels(selected)).models[0].id).toBe("post-import");
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it("drops an obsolete strict-proxy lookup when a post-import caller clears old cache state", async () => {
    let deliver, notify;
    const started = new Promise(resolve => { notify = resolve; });
    state.fetch.mockImplementationOnce(() => { notify(); return new Promise(resolve => { deliver = resolve; }); });
    const pending = catalog.resolveQoderModels(credentials(), { proxyOptions: { strictProxy: true } });
    await started;
    advanceDbImportGeneration();
    await catalog.resolveQoderCredentials(credentials("post-import-token"));
    deliver(response("obsolete"));
    expect(await pending).toBeNull();
  });

  it("never warms PAT cache with a pre-import exchange that finishes after fresh credentials", async () => {
    let deliver, notify;
    const started = new Promise(resolve => { notify = resolve; });
    state.fetch
      .mockImplementationOnce(() => { notify(); return new Promise(resolve => { deliver = resolve; }); })
      .mockResolvedValueOnce(Response.json({ token: "jt-after-import" }))
      .mockResolvedValueOnce(Response.json({ id: "post-import-user" }))
      .mockResolvedValueOnce(Response.json({ id: "old-user" }));
    const selected = { apiKey: "pt-import-fixture" };
    const old = catalog.resolveQoderCredentials(selected);
    await started;
    advanceDbImportGeneration();
    expect((await catalog.resolveQoderCredentials(selected)).accessToken).toBe("jt-after-import");
    deliver(Response.json({ token: "jt-before-import" }));
    // A direct credential caller can receive its selected exchange result;
    // the obsolete proof must not overwrite the new database's cached proof.
    expect((await old).accessToken).toBe("jt-before-import");
    expect((await catalog.resolveQoderCredentials(selected)).accessToken).toBe("jt-after-import");
    expect(state.fetch).toHaveBeenCalledTimes(4);
  });

  it("owns a direct PAT deadline when no caller signal is supplied, including stalled headers", async () => {
    vi.useFakeTimers();
    let deliver, notify, signal;
    const started = new Promise(resolve => { notify = resolve; });
    state.fetch.mockImplementationOnce((_url, options) => {
      signal = options.signal;
      notify();
      return new Promise(resolve => { deliver = resolve; });
    });
    let settled = false, outcome;
    const selected = { apiKey: "pt-default-header-deadline" };
    const pending = catalog.resolveQoderCredentials(selected).then(value => { settled = true; outcome = { value }; }, error => { settled = true; outcome = { error }; });
    await started;
    try {
      await vi.advanceTimersByTimeAsync(15_001);
      expect(settled).toBe(true);
      expect(outcome.error.name).toBe("TimeoutError");
      expect(signal.aborted).toBe(true);
    } finally {
      state.fetch.mockResolvedValue(Response.json({ id: "late-user" }));
      deliver(Response.json({ token: "jt-obsolete-deadline" }));
      await pending;
      for (let i = 0; i < 10; i++) await Promise.resolve();
    }
    state.fetch.mockResolvedValueOnce(Response.json({ token: "jt-fresh-deadline" })).mockResolvedValueOnce(Response.json({ id: "fresh-user" }));
    expect((await catalog.resolveQoderCredentials(selected)).accessToken).toBe("jt-fresh-deadline");
    expect(state.fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps a direct PAT default deadline until its stalled exchange body is consumed", async () => {
    vi.useFakeTimers();
    let reader, notify;
    const cancel = vi.fn();
    const started = new Promise(resolve => { notify = resolve; });
    state.fetch.mockImplementationOnce(async () => {
      const result = new Response(new ReadableStream({ start(controller) { reader = controller; }, cancel }));
      notify();
      return result;
    }).mockResolvedValue(Response.json({ id: "late-user" }));
    let settled = false, outcome;
    const pending = catalog.resolveQoderCredentials({ apiKey: "pt-default-body-deadline" }).then(value => { settled = true; outcome = { value }; }, error => { settled = true; outcome = { error }; });
    await started;
    try {
      await vi.advanceTimersByTimeAsync(15_001);
      expect(settled).toBe(true);
      expect(outcome.error.name).toBe("TimeoutError");
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      try { reader.enqueue(new TextEncoder().encode('{"token":"jt-late-body"}')); reader.close(); } catch { /* cancelled reader */ }
      await pending;
    }
  });

  it("bounds retained PAT job tokens and clears them with catalog state", async () => {
    state.fetch.mockImplementation(async url => url.endsWith("/jobToken/exchange")
      ? Response.json({ token: "jt-synthetic" }) : Response.json({ id: "synthetic-user" }));
    for (let i = 0; i <= MODEL_CATALOG_MAX_CACHE_ENTRIES; i++) await catalog.resolveQoderCredentials({ apiKey: `pt-synthetic-${i}` });
    await catalog.resolveQoderCredentials({ apiKey: "pt-synthetic-0" });
    expect(state.fetch).toHaveBeenCalledTimes((MODEL_CATALOG_MAX_CACHE_ENTRIES + 2) * 2);
    catalog.clearQoderCatalog();
    await catalog.resolveQoderCredentials({ apiKey: "pt-synthetic-0" });
    expect(state.fetch).toHaveBeenCalledTimes((MODEL_CATALOG_MAX_CACHE_ENTRIES + 3) * 2);
  });
});


describe("Qoder native model limits remain distinct from raw signing metadata", () => {
  it.each([
    ["missing", undefined], ["null", null], ["true", true], ["false", false],
    ["fraction", 1.5], ["fraction string", "1.5"], ["zero", 0], ["zero string", "0"],
    ["negative", -1], ["negative string", "-1"],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1], ["unsafe string", "9007199254740992"],
    ["Infinity string", "Infinity"], ["negative Infinity string", "-Infinity"],
    ["NaN string", "NaN"], ["overflow string", "1e309"], ["empty string", ""],
    ["whitespace string", "   "], ["object", {}], ["empty array", []], ["array", [123]],
  ])("omits unknown/invalid %s limits without rewriting raw model_config", async (_label, value) => {
    const original = { key: "native-limits", display_name: "Native", enable: true,
      max_input_tokens: value, max_output_tokens: value, is_vl: false, is_reasoning: true,
      unknown_signed_metadata: { markers: ["unchanged", 0, false] } };
    const payload = JSON.stringify({ chat: [original] });
    const published = JSON.parse(payload).chat[0];
    state.fetch.mockResolvedValueOnce(new Response(payload));
    const selected = credentials();
    const result = await catalog.resolveQoderModels(selected);
    expect(result.models[0]).toMatchObject({ id: "native-limits", name: "Native", isVL: false, isReasoning: true });
    expect(result.models[0]).not.toHaveProperty("contextLength");
    expect(result.models[0]).not.toHaveProperty("maxInputTokens");
    expect(result.models[0]).not.toHaveProperty("maxOutputTokens");
    expect(result.rawConfigs.get("native-limits")).toEqual(published);
    expect(await catalog.getQoderModelConfig(selected, "native-limits")).toEqual(published);
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [2048, 512], ["2048", "512"], [Number.MAX_SAFE_INTEGER, 1],
  ])("preserves explicit positive native input/output limits %j/%j independently", async (input, output) => {
    const published = { key: "native-positive", display_name: "Positive", enable: true,
      max_input_tokens: input, max_output_tokens: output, is_vl: true, is_reasoning: false,
      context_window: 999999, contextLength: 999999,
      unknown_signed_metadata: { retain: ["exact", null, false] } };
    state.fetch.mockResolvedValueOnce(Response.json({ chat: [published] }));
    const result = await catalog.resolveQoderModels(credentials());
    expect(result.models[0]).toMatchObject({ id: "native-positive", name: "Positive", isVL: true, isReasoning: false,
      maxInputTokens: Number(input), maxOutputTokens: Number(output) });
    // Native max_input_tokens is not a verified total context window.
    expect(result.models[0]).not.toHaveProperty("contextLength");
    expect(result.rawConfigs.get("native-positive")).toEqual(published);
  });

  it.each(["1e309", "-1e309"])("omits native exponent overflow %s while retaining decoded raw config", async overflow => {
    const payload = `{"chat":[{"key":"overflow","enable":true,"max_input_tokens":${overflow},"max_output_tokens":${overflow},"unknown":"untouched"}]}`;
    const published = JSON.parse(payload).chat[0];
    state.fetch.mockResolvedValueOnce(new Response(payload));
    const result = await catalog.resolveQoderModels(credentials());
    expect(result.models[0]).not.toHaveProperty("contextLength");
    expect(result.models[0]).not.toHaveProperty("maxInputTokens");
    expect(result.models[0]).not.toHaveProperty("maxOutputTokens");
    expect(result.rawConfigs.get("overflow")).toEqual(published);
    const cached = await catalog.resolveQoderModels(credentials());
    expect(cached.rawConfigs.get("overflow")).toEqual(published);
    expect(cached.rawConfigs.get("overflow")).not.toBe(result.rawConfigs.get("overflow"));
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves decoded negative zero and unknown nested config through cache copies", async () => {
    const payload = '{"chat":[{"key":"negative-zero","enable":true,"max_input_tokens":-0,"max_output_tokens":-0,"unknown":{"retained":[-0,"signed-marker"]}}]}';
    const published = JSON.parse(payload).chat[0];
    state.fetch.mockResolvedValueOnce(new Response(payload));
    const selected = credentials();
    const result = await catalog.resolveQoderModels(selected);
    expect(result.models[0]).not.toHaveProperty("contextLength");
    expect(result.models[0]).not.toHaveProperty("maxInputTokens");
    expect(result.models[0]).not.toHaveProperty("maxOutputTokens");
    for (const raw of [result.rawConfigs.get("negative-zero"), await catalog.getQoderModelConfig(selected, "negative-zero")]) {
      expect(raw).toEqual(published);
      expect(Object.is(raw.max_input_tokens, -0)).toBe(true);
      expect(Object.is(raw.unknown.retained[0], -0)).toBe(true);
    }
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("retains exact hidden raw configs without advertising hidden models", async () => {
    const hidden = { key: "hidden-native", enable: false, max_input_tokens: "2048", nested: { untouched: true } };
    state.fetch.mockResolvedValueOnce(Response.json({ chat: [hidden] }));
    const selected = credentials();
    const result = await catalog.resolveQoderModels(selected);
    expect(result.models).toEqual([]);
    expect(result.rawConfigs.get("hidden-native")).toEqual(hidden);
    expect(await catalog.getQoderModelConfig(selected, "hidden-native")).toEqual(hidden);
  });
});
