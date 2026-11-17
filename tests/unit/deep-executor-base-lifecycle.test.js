import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseExecutor } from "../../open-sse/executors/base.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => network.fetch(...args),
}));

beforeEach(() => { network.fetch.mockReset(); });

const credentials = { apiKey: "synthetic-executor-lifecycle-key" };
function executor(config = {}) {
  return new BaseExecutor("lifecycle-fixture", {
    baseUrl: "https://lifecycle.invalid/chat",
    retry: { 429: { attempts: 0 }, 502: { attempts: 0 }, 503: { attempts: 0 } },
    ...config,
  });
}
function execute(instance, extra = {}) {
  return instance.execute({ model: "fixture-model", body: {}, stream: false, credentials, ...extra })
    .then(result => ({ result }), error => ({ error }));
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => { timer = setTimeout(() => resolve({ pending: true }), 300); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function pendingCancellation(status) {
  let release;
  const acknowledged = new Promise(resolve => { release = resolve; });
  const cancel = vi.fn(() => acknowledged);
  return { response: new Response(new ReadableStream({ cancel }), { status }), cancel, release };
}

describe("executor response cleanup never waits for upstream cancellation acknowledgment", () => {
  it("retries a rejected response while its old body cleanup remains pending", async () => {
    const rejected = pendingCancellation(503);
    network.fetch.mockResolvedValueOnce(rejected.response).mockResolvedValueOnce(Response.json({ ok: true }));
    const outcome = execute(executor({ retry: { 503: { attempts: 1, delayMs: 0 } } }));
    try {
      const completed = await bounded(outcome);
      expect(completed.pending).toBeUndefined();
      expect(completed.result?.response.status).toBe(200);
      expect(rejected.cancel).toHaveBeenCalledTimes(1);
      expect(network.fetch).toHaveBeenCalledTimes(2);
    } finally {
      rejected.release();
      await outcome;
    }
  });

  it("moves to a configured alternate URL without waiting for a rejected body cleanup", async () => {
    const rejected = pendingCancellation(429);
    network.fetch.mockResolvedValueOnce(rejected.response).mockResolvedValueOnce(Response.json({ ok: true }));
    const outcome = execute(executor({ baseUrls: ["https://first.invalid/chat", "https://second.invalid/chat"] }));
    try {
      const completed = await bounded(outcome);
      expect(completed.result?.url).toBe("https://second.invalid/chat");
      expect(rejected.cancel).toHaveBeenCalledTimes(1);
      expect(network.fetch).toHaveBeenCalledTimes(2);
    } finally {
      rejected.release();
      await outcome;
    }
  });

  it("preserves a caller's Error abort reason even when late body cancellation never acknowledges", async () => {
    const caller = new AbortController();
    const reason = new Error("synthetic caller left before headers");
    const late = pendingCancellation(200);
    network.fetch.mockImplementation(async () => {
      caller.abort(reason);
      return late.response;
    });
    const outcome = execute(executor(), { signal: caller.signal });
    try {
      const completed = await bounded(outcome);
      expect(completed.error).toBe(reason);
      expect(late.cancel).toHaveBeenCalledTimes(1);
      expect(network.fetch).toHaveBeenCalledTimes(1);
    } finally {
      late.release();
      await outcome;
    }
  });

  it("does not replace the caller's abort reason with a synchronous cancellation failure", async () => {
    const caller = new AbortController();
    const reason = new Error("synthetic caller cancelled");
    const cancel = vi.fn(() => { throw new Error("synthetic cleanup failure"); });
    network.fetch.mockImplementation(async () => {
      caller.abort(reason);
      return { status: 200, headers: new Headers(), body: { locked: false, cancel } };
    });
    const completed = await bounded(execute(executor(), { signal: caller.signal }));
    expect(completed.error).toBe(reason);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it("discards an ignored caller abort even when a custom media transport returns late success", async () => {
    const caller = new AbortController();
    const reason = new Error("synthetic media caller cancelled");
    const late = pendingCancellation(200);
    const fetch = vi.fn(async () => {
      caller.abort(reason);
      return late.response;
    });
    const outcome = execute(executor(), { signal: caller.signal, transport: { fetch } });
    try {
      const completed = await bounded(outcome);
      expect(completed.error).toBe(reason);
      expect(late.cancel).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(network.fetch).not.toHaveBeenCalled();
    } finally {
      late.release();
      await outcome;
    }
  });

  it("does not accept late headers after its connection deadline has already elapsed", async () => {
    const late = pendingCancellation(200);
    network.fetch.mockImplementation((_url, options) => new Promise(resolve => {
      options.signal.addEventListener("abort", () => resolve(late.response), { once: true });
    }));
    const outcome = execute(executor({ timeoutMs: 10 }));
    try {
      const completed = await bounded(outcome);
      expect(completed.error?.message).toBe("fetch connect timeout");
      expect(late.cancel).toHaveBeenCalledTimes(1);
      expect(network.fetch).toHaveBeenCalledTimes(1);
    } finally {
      late.release();
      await outcome;
    }
  });
});

describe("compatible JSON-schema fallback retains borrowed history ownership", () => {
  function compatible() {
    const instance = new DefaultExecutor("openai-compatible-lifecycle-fixture");
    instance.config = { ...instance.config, retry: { 503: { attempts: 1, delayMs: 0 } } };
    return instance;
  }
  function request() {
    return {
      messages: [{ role: "system", content: [{ type: "text", text: "Retain this instruction." }] }, { role: "user", content: "Return a result." }],
      response_format: { type: "json_schema", json_schema: { name: "fixture", schema: { type: "object", properties: { ok: { type: "boolean" } } } } },
    };
  }

  it("can extend a frozen caller-owned system-content array without mutating it", () => {
    const body = request();
    const original = structuredClone(body);
    Object.freeze(body.messages[0].content);
    const transformed = compatible().applyJsonSchemaFallback(body);
    expect(body).toEqual(original);
    expect(transformed.messages[0].content).not.toBe(body.messages[0].content);
    expect(transformed.messages[0].content).toHaveLength(2);
    expect(transformed.messages[0].content[1].text).toContain('"ok"');
    expect(transformed.response_format).toEqual({ type: "json_object" });
  });

  it("sends the same single schema instruction on every actual transport attempt", async () => {
    const sent = [];
    network.fetch.mockImplementation(async (_url, options) => {
      sent.push(JSON.parse(options.body));
      return Response.json({ ok: true }, { status: sent.length === 1 ? 503 : 200 });
    });
    const body = request();
    const original = structuredClone(body);
    const result = await compatible().execute({ model: "fixture", body, stream: false,
      credentials: { ...credentials, providerSpecificData: { baseUrl: "https://compatible.invalid/v1" } } });
    expect(result.response.status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]);
    expect(sent[0].messages[0].content).toHaveLength(2);
    expect(body).toEqual(original);
  });
});
