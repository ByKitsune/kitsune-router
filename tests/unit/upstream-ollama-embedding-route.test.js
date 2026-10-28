import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ credentials: null, health: [], successes: [], usage: [], accept: null }));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => ({}), isApiKeyRequired: () => false,
  getModelAliases: async () => ({}), getComboByName: async () => null, getProviderNodes: async () => [],
}));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: () => null, isValidApiKey: async () => true,
  getProviderCredentials: async () => state.credentials,
  clearAccountError: async (...args) => { state.successes.push(args); },
  markAccountUnavailable: async (...args) => { state.health.push(args); return { shouldFallback: false }; },
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: async (_provider, credentials) => credentials,
  updateProviderCredentials: async () => true,
}));
vi.mock("@/lib/usageDb.js", () => ({ enqueueRequestUsage: async (entry) => {
  state.usage.push(entry);
  return state.accept ? state.accept(entry) : { accepted: true, eventId: entry.eventId };
} }));
vi.mock("@/lib/rateLimit/inferenceLimit.js", () => ({ withInferenceLimit: async (_request, _key, run) => run() }));

const nativeFetch = globalThis.fetch;
const { POST } = await import("../../src/app/api/v1/embeddings/route.js");
const servers = [];
const allowedPorts = new Set();
let attempts;

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  allowedPorts.add(String(server.address().port));
  return `http://127.0.0.1:${server.address().port}`;
}

function connect(baseUrl) {
  state.credentials = { connectionId: "fixture", apiKey: "synthetic-key", providerSpecificData: { baseUrl } };
}

function request(body = {}, signal) {
  return new Request("http://localhost/v1/embeddings", {
    method: "POST", signal, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "ollama-local/nomic-embed-text", input: "private fixture", ...body }),
  });
}

beforeEach(() => {
  state.credentials = null;
  state.health = [];
  state.successes = [];
  state.usage = [];
  state.accept = null;
  attempts = [];
  vi.stubGlobal("fetch", (url, options) => {
    const parsed = new URL(url);
    if (parsed.hostname !== "127.0.0.1" || !allowedPorts.has(parsed.port)) throw new Error("Test blocked non-loopback network access");
    attempts.push({ url: parsed.href, options });
    return nativeFetch(url, options);
  });
});

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  allowedPorts.clear();
  vi.unstubAllGlobals();
});

describe("public Ollama embeddings route", () => {
  it("uses the selected connection and preserves the embedding response and exact usage", async () => {
    let received;
    const base = await listen(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      received = { path: req.url, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }], model: "nomic-embed-text", usage: { prompt_tokens: 2, total_tokens: 2 } }));
    });
    connect(`${base}/v1`);
    const response = await POST(request({ input: ["one", "two"], dimensions: 512, encoding_format: "float" }));
    expect(response.status).toBe(200);
    expect((await response.json()).data[0].embedding).toEqual([0.1, 0.2]);
    expect(received).toEqual({ path: "/v1/embeddings", auth: "Bearer synthetic-key", body: {
      model: "nomic-embed-text", input: ["one", "two"], dimensions: 512, encoding_format: "float",
    } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].options.redirect).toBe("error");
    expect(state.successes).toHaveLength(1);
    expect(state.usage[0]).toMatchObject({ provider: "ollama-local", model: "nomic-embed-text", status: "success", tokens: { prompt_tokens: 2, total_tokens: 2 } });
  });

  it.each([
    [404, { error: "model not found" }, 404, "model not found"],
    [200, { error: { message: "invalid dimensions" } }, 502, "invalid dimensions"],
  ])("returns upstream JSON errors instead of successful data (%s)", async (status, payload, expectedStatus, message) => {
    const base = await listen((_req, res) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    });
    connect(base);
    const response = await POST(request());
    expect(response.status).toBe(expectedStatus);
    expect((await response.json()).error.message).toContain(message);
    expect(state.successes).toHaveLength(0);
    expect(attempts).toHaveLength(1);
  });

  it("preserves safe structured diagnostics and incurred usage on a 200 error", async () => {
    const base = await listen((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: { message: "Invalid parameter: dimensions", code: "invalid_parameter", type: "invalid_request_error", param: "dimensions" },
        usage: { prompt_tokens: 2, total_tokens: 2 },
      }));
    });
    connect(base);
    const response = await POST(request({ dimensions: 0 }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ message: "Invalid parameter: dimensions", code: "invalid_parameter", param: "dimensions" });
    expect(state.successes).toHaveLength(0);
    expect(state.health).toHaveLength(0);
    expect(state.usage).toHaveLength(1);
    expect(state.usage[0]).toMatchObject({ status: "error", tokens: { prompt_tokens: 2, total_tokens: 2 } });
  });

  it.each([307, 308])("refuses a loopback %s redirect without forwarding body or authorization", async (status) => {
    let received = 0;
    const sink = await listen((_req, res) => { received++; res.end(); });
    const base = await listen((_req, res) => { res.writeHead(status, { Location: `${sink}/sink` }); res.end(); });
    connect(base);
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(received).toBe(0);
    expect(attempts).toHaveLength(1);
    expect(state.successes).toHaveLength(0);
  });

  it.each([200, 401, 404])("aborts a stalled upstream %s body without retrying or updating account health", async (status) => {
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    const base = await listen((_req, res) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.write(status === 200 ? '{"data":' : '{"error":');
      started();
    });
    connect(base);
    const controller = new AbortController();
    const pending = POST(request({}, controller.signal));
    await ready;
    controller.abort(new Error("caller left"));
    expect((await pending).status).toBe(499);
    expect(attempts).toHaveLength(1);
    expect(state.health).toEqual([]);
    expect(state.successes).toEqual([]);
    expect(state.usage).toEqual([]);
  });

  it("records completed loopback response usage when cancellation follows EOF", async () => {
    const base = await listen((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ embedding: [0.1] }], usage: { prompt_tokens: 3, total_tokens: 3 } }));
    });
    connect(base);
    const caller = new AbortController();
    const guardedFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (...args) => {
      const response = await guardedFetch(...args);
      const getReader = response.body.getReader.bind(response.body);
      response.body.getReader = () => {
        const reader = getReader();
        const read = reader.read.bind(reader);
        reader.read = async () => {
          const result = await read();
          if (result.done) caller.abort(new Error("client left"));
          return result;
        };
        return reader;
      };
      return response;
    });
    expect((await POST(request({}, caller.signal))).status).toBe(499);
    expect(state.usage).toHaveLength(1);
    expect(state.usage[0]).toMatchObject({ status: "aborted", tokens: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 } });
    expect(attempts).toHaveLength(1); expect(state.health).toEqual([]); expect(state.successes).toEqual([]);
  });

  it("durably accepts complete usage as aborted through the public route and recovers it after reopening", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ollama-embedding-outbox-"));
    const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
    const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    let driver;
    try {
      for (const key of globals) delete globalThis[key];
      vi.stubEnv("DATA_DIR", directory);
      vi.resetModules();
      driver = await import("@/lib/db/driver.js");
      const usage = await import("@/lib/db/repos/usageRepo.js");
      let db = await driver.getAdapter();
      expect(db.driver).not.toBe("sql.js");
      let queue = usage.initializeUsagePersistence(db);
      queue.stopped = true; clearTimeout(queue.timer); queue.timer = null;
      state.accept = entry => usage.enqueueRequestUsage(entry);

      const caller = new AbortController();
      const response = Response.json({ data: [{ embedding: [0.1] }], usage: { prompt_tokens: 3, total_tokens: 3 } });
      const getReader = response.body.getReader.bind(response.body);
      response.body.getReader = () => {
        const reader = getReader();
        const read = reader.read.bind(reader);
        reader.read = async () => {
          const result = await read();
          if (!result.done) { await reader.closed; caller.abort(new Error("client left")); }
          return result;
        };
        return reader;
      };
      connect("http://127.0.0.1:1");
      vi.stubGlobal("fetch", vi.fn(async () => response));
      expect((await POST(request({}, caller.signal))).status).toBe(499);
      expect(fetch).toHaveBeenCalledOnce();
      expect(state.usage).toHaveLength(1);
      expect(state.health).toEqual([]); expect(state.successes).toEqual([]);
      expect(response.body.locked).toBe(false);
      const accepted = db.all("SELECT eventId, payload FROM usageOutbox");
      expect(accepted).toHaveLength(1);
      expect(JSON.parse(accepted[0].payload)).toMatchObject({
        status: "aborted", provider: "ollama-local", model: "nomic-embed-text",
        tokens: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 },
      });
      expect(await usage.getUsageHistory()).toEqual([]);

      let pulled;
      const waiting = new Promise(resolve => { pulled = resolve; });
      const cancel = vi.fn();
      const incomplete = new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ data: [], usage: { prompt_tokens: 7, total_tokens: 7 } }))); },
        pull() { pulled(); }, cancel,
      }, { highWaterMark: 0 });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(incomplete)));
      const secondCaller = new AbortController();
      const partial = POST(request({}, secondCaller.signal));
      await waiting;
      secondCaller.abort(new Error("client left"));
      expect((await partial).status).toBe(499);
      expect(cancel).toHaveBeenCalledOnce(); expect(incomplete.locked).toBe(false);
      expect(fetch).toHaveBeenCalledOnce(); expect(state.usage).toHaveLength(1);
      expect(state.health).toEqual([]); expect(state.successes).toEqual([]);
      expect(db.all("SELECT eventId FROM usageOutbox")).toHaveLength(1);

      await driver.closeDb();
      db = await driver.getAdapter();
      queue = usage.initializeUsagePersistence(db);
      queue.stopped = true; clearTimeout(queue.timer); queue.timer = null;
      expect(db.all("SELECT eventId FROM usageOutbox")).toEqual([{ eventId: accepted[0].eventId }]);
      expect((await usage.flushUsageQueue()).drained).toBe(true);
      expect(await usage.getUsageHistory()).toMatchObject([{ status: "aborted", tokens: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 } }]);
    } finally {
      state.accept = null;
      await driver?.closeDb();
      for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
      for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      vi.unstubAllEnvs(); vi.resetModules();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not dial an implicit local server when no connection is active", async () => {
    expect((await POST(request())).status).toBe(400);
    expect(attempts).toEqual([]);
  });

  it("rejects a configured relay before sending data or changing account health", async () => {
    const base = await listen((_req, res) => res.end());
    connect(base);
    state.credentials.providerSpecificData.vercelRelayUrl = `${base}/relay`;
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(attempts).toEqual([]);
    expect(state.health).toEqual([]);
    expect(state.successes).toEqual([]);
  });
});
