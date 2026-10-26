import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dataDir;
let previousDataDir;
let previousListeners;
let previousGlobals;
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const fixtureGlobals = [
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
];
let getSettings;
let updateSettings;
let validateApiKey;
let createApiKey;
let updateApiKey;
let deleteApiKey;
let getProviderConnections;
let createProviderConnection;
let updateProviderConnection;
let deleteProviderConnection;
let getProviderCredentials;
let createSSEStream;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousListeners = new Map(
    shutdownEvents.map((event) => [event, process.rawListeners(event)])
  );
  previousGlobals = new Map(
    fixtureGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)])
  );
  dataDir = await mkdtemp(join(tmpdir(), "kitsunerouter-performance-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  for (const key of fixtureGlobals) delete global[key];
  ({ getSettings, updateSettings } = await import("@/lib/db/repos/settingsRepo.js"));
  ({ validateApiKey, createApiKey, updateApiKey, deleteApiKey } = await import("@/lib/db/repos/apiKeysRepo.js"));
  ({ getProviderConnections, createProviderConnection, updateProviderConnection, deleteProviderConnection } = await import("@/lib/db/repos/connectionsRepo.js"));
  ({ getProviderCredentials } = await import("@/sse/services/auth.js"));
  ({ createSSEStream } = await import("open-sse/utils/stream.js"));
});

afterEach(async () => {
  try {
    for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
    global._statsEmitter?.removeAllListeners();
    await global._dbAdapter?.instance?.close();
  } finally {
    for (const event of shutdownEvents) {
      const existing = [...previousListeners.get(event)];
      for (const listener of process.rawListeners(event)) {
        const index = existing.indexOf(listener);
        if (index === -1) process.removeListener(event, listener);
        else existing.splice(index, 1);
      }
    }
    for (const key of fixtureGlobals) {
      const descriptor = previousGlobals.get(key);
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
    vi.resetModules();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  }
});

// Kitsune Router port of upstream PR #3629 perf tests, hardened for Zen's diverged
// implementations (2s TTL raw settings cache, object-identity usage dedup,
// arg-less GET /v1/models).

describe("Performance Optimizations (Kitsune Router hardened port of #3629)", () => {

  describe("Settings Repository raw TTL cache", () => {
    it("returns equal values on consecutive reads within TTL", async () => {
      const first = await getSettings();
      expect(first).toBeDefined();
      const second = await getSettings();
      expect(second).toEqual(first);
    });

    it("invalidates TTL cache on updateSettings", async () => {
      const initial = await getSettings();
      const prev = initial.stickyRoundRobinLimit;
      const updated = await updateSettings({ stickyRoundRobinLimit: 7 });
      expect(updated.stickyRoundRobinLimit).toBe(7);
      const readAfter = await getSettings();
      expect(readAfter.stickyRoundRobinLimit).toBe(7);
      await updateSettings({ stickyRoundRobinLimit: prev });
    });
  });

  describe("API Keys Repository L1 cache", () => {
    it("caches validated keys and invalidates on update/delete", async () => {
      const tag = `perf-${Date.now()}`;
      const created = await createApiKey("Test Perf Key", `perf-machine-${tag}`);
      expect(created.key).toBeDefined();

      expect(await validateApiKey(created.key)).toBe(true);
      expect(await validateApiKey(created.key)).toBe(true);

      await updateApiKey(created.id, { isActive: false });
      expect(await validateApiKey(created.key)).toBe(false);

      await deleteApiKey(created.id);
      expect(await validateApiKey(created.key)).toBe(false);
    });

    it("returns false immediately for empty keys", async () => {
      expect(await validateApiKey("")).toBe(false);
      expect(await validateApiKey(null)).toBe(false);
      expect(await validateApiKey(undefined)).toBe(false);
    });
  });

  describe("Connections Repository L1 cache", () => {
    it("caches provider connections by filter (same reference)", async () => {
      const first = await getProviderConnections({ provider: "openai", isActive: true });
      const second = await getProviderConnections({ provider: "openai", isActive: true });
      expect(second).toBe(first);
    });

    it("keeps separate cache entries per filter", async () => {
      const a = await getProviderConnections({ provider: "openai" });
      const b = await getProviderConnections({ provider: "anthropic" });
      expect(a).not.toBe(b);
    });

    it("invalidates on create/update/delete", async () => {
      const tag = `Perf ${Date.now()}`;
      const created = await createProviderConnection({
        provider: "anthropic",
        authType: "apikey",
        name: tag,
        apiKey: "sk-ant-test-perf",
        isActive: true,
      });
      expect(created.id).toBeDefined();

      const listed = await getProviderConnections({ provider: "anthropic" });
      expect(listed.some((c) => c.id === created.id)).toBe(true);

      await updateProviderConnection(created.id, { name: `${tag} Updated` });
      const refreshed = await getProviderConnections({ provider: "anthropic" });
      expect(refreshed.find((c) => c.id === created.id)?.name).toBe(`${tag} Updated`);

      await deleteProviderConnection(created.id);
      const afterDelete = await getProviderConnections({ provider: "anthropic" });
      expect(afterDelete.some((c) => c.id === created.id)).toBe(false);
    });
  });

  describe("Auth Service per-provider mutex", () => {
    it("resolves distinct providers in parallel", async () => {
      const start = Date.now();
      const [a, b, c] = await Promise.all([
        getProviderCredentials("openai"),
        getProviderCredentials("anthropic"),
        getProviderCredentials("deepseek"),
      ]);
      expect(Date.now() - start).toBeLessThan(5000);
      for (const r of [a, b, c]) expect(r === null || typeof r === "object").toBe(true);
    });
  });

  describe("Streaming SSE chunk-array accumulation", () => {
    async function runPassthrough(chunks) {
      let completed = null;
      const stream = createSSEStream({
        mode: "passthrough",
        provider: "openai",
        model: "gpt-4o",
        onStreamComplete: (accumulated) => { completed = accumulated; },
      });
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      const readPromise = (async () => {
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
      })();
      const encoder = new TextEncoder();
      for (const chunk of chunks) await writer.write(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      await writer.close();
      await readPromise;
      return completed;
    }

    it("joins content + thinking without string-mutation loss", async () => {
      const completed = await runPassthrough([
        'data: {"id":"1","choices":[{"delta":{"content":"Hello "}}]}\n\n',
        'data: {"id":"2","choices":[{"delta":{"content":"World!"}}]}\n\n',
        'data: {"id":"3","choices":[{"delta":{"reasoning_content":"Thinking steps"}}]}\n\n',
        "data: [DONE]\n\n",
      ]);
      expect(completed.content).toBe("Hello World!");
      expect(completed.thinking).toBe("Thinking steps");
    });

    it("handles payloads split across TCP packets", async () => {
      const encoder = new TextEncoder();
      const completed = await runPassthrough([
        encoder.encode('data: {"id":"1","choices":[{"delta":{"con'),
        encoder.encode('tent":"Distributed Line"}}]}\n\ndata: [DONE]\n\n'),
      ]);
      expect(completed.content).toBe("Distributed Line");
    });

    it("joins many tiny chunks exactly once", async () => {
      const parts = Array.from({ length: 50 }, (_, i) => `p${i}-`);
      const chunks = parts.map((p, i) => `data: {"id":"${i}","choices":[{"delta":{"content":"${p}"}}]}\n\n`);
      chunks.push("data: [DONE]\n\n");
      const completed = await runPassthrough(chunks);
      expect(completed.content).toBe(parts.join(""));
    });
  });

  describe("GET /v1/models cache headers", () => {
    it("returns Cache-Control and a stable list across TTL", async () => {
      const { GET } = await import("@/app/api/v1/models/route.js");
      const res1 = await GET();
      expect(res1.status).toBe(200);
      expect(res1.headers.get("cache-control")).toContain("public, max-age=30");
      const body1 = await res1.json();
      expect(body1.object).toBe("list");
      expect(Array.isArray(body1.data)).toBe(true);

      const res2 = await GET();
      const body2 = await res2.json();
      expect(body2.data.length).toBe(body1.data.length);

    });
  });

  describe("Usage object-identity dedup (Zen hardening)", () => {
    it("treats same-object retry as idempotent, distinct objects as separate rows", async () => {
      const { saveRequestUsage, getUsageHistory } = await import("@/lib/db/repos/usageRepo.js");
      const uniq = `perf-${Date.now()}`;
      const before = (await getUsageHistory({ model: uniq })).length;

      const entry = {
        timestamp: new Date().toISOString(),
        provider: "openai",
        model: uniq,
        connectionId: "conn-perf-1",
        apiKey: "sk-perf-1",
        endpoint: "/v1/chat/completions",
        status: "200 OK",
        tokens: { prompt_tokens: 15, completion_tokens: 25 },
      };
      await saveRequestUsage(entry);
      await saveRequestUsage(entry); // same object retry → no duplicate
      const afterRetry = (await getUsageHistory({ model: uniq })).length;
      expect(afterRetry - before).toBe(1);

      await saveRequestUsage({
        timestamp: new Date().toISOString(),
        provider: "openai",
        model: uniq,
        connectionId: "conn-perf-1",
        apiKey: "sk-perf-1",
        endpoint: "/v1/chat/completions",
        status: "200 OK",
        tokens: { prompt_tokens: 15, completion_tokens: 25 },
      });
      const afterDistinct = (await getUsageHistory({ model: uniq })).length;
      expect(afterDistinct - afterRetry).toBe(1);
    });
  });
});
