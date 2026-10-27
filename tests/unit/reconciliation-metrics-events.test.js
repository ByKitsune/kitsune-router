import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = "/tmp/opencode";
const fixtureGlobals = [
  "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter",
  "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
  "_requestFailureCounts", "__mitmBypassCooldown",
];
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
const secretMarkers = [
  "sk-synthetic-metrics-key-never-publish",
  "synthetic-metrics-account@example.invalid",
  "synthetic-private-prompt-never-publish",
];
let directory;
let previousGlobals;
let previousListeners;
let originalEmit;
let usage;
let db;
let metricsGet;
let createDashboardAuthToken;
let NextRequest;
let server;
let proxyModule;

beforeEach(async () => {
  directory = await mkdtemp(join(fixtureRoot, "reconciliation-metrics-"));
  previousGlobals = new Map(fixtureGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
  previousListeners = new Map(shutdownEvents.map((event) => [event, process.rawListeners(event)]));
  originalEmit = process.emit;
  for (const [name, value] of Object.entries({
    DATA_DIR: join(directory, "data"), HOME: directory, TMPDIR: directory,
    JWT_SECRET: "synthetic-metrics-session-signing-secret-minimum-32-chars",
    JWT_SECRET_OLD: "", JWT_OLD_SECRET: "", JWT_SECRET_PREVIOUS: "",
    API_KEY_SECRET: "synthetic-metrics-api-key-secret",
    MACHINE_ID_SALT: "synthetic-metrics-machine-salt",
    RUN_REAL: "0", RUN_E2E: "0", RUN_LIVE_TESTS: "0", AG_CACHE_TEST: "0",
    MODEL_CATALOG_SYNC: "off", DISABLE_BACKGROUND_TOKEN_REFRESH: "1",
    KITSUNE_ROUTER_DISABLE_MITM: "1", DISABLE_MITM_BYPASS: "1", NEXT_TELEMETRY_DISABLED: "1",
    ENABLE_REQUEST_LOGS: "false", OBSERVABILITY_ENABLED: "false",
    HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", NO_PROXY: "*",
    http_proxy: "", https_proxy: "", all_proxy: "", no_proxy: "*", TZ: "UTC",
  })) vi.stubEnv(name, value);
  for (const key of fixtureGlobals) delete global[key];
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  usage = await import("@/lib/db/repos/usageRepo.js");
  ({ GET: metricsGet } = await import("@/app/api/metrics/route.js"));
  ({ createDashboardAuthToken } = await import("@/lib/auth/dashboardSession.js"));
  ({ NextRequest } = await import("next/server"));
  const { getAdapter } = await import("@/lib/db/driver.js");
  db = await getAdapter();
});

afterEach(async () => {
  try {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (proxyModule) await (await proxyModule.getDefaultAgent())?.close();
    for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
    global._statsEmitter?.removeAllListeners();
    await global._dbAdapter?.instance?.close();
  } finally {
    server = null;
    proxyModule = null;
    process.emit = originalEmit;
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
    const resolved = await realpath(directory);
    if (dirname(resolved) !== await realpath(fixtureRoot) || !resolved.includes("reconciliation-metrics-")) {
      throw new Error(`Refusing to remove unexpected fixture directory: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

async function scrape(authenticated = true) {
  const headers = authenticated ? { cookie: `auth_token=${await createDashboardAuthToken()}` } : {};
  return metricsGet(new NextRequest("http://127.0.0.1/api/metrics", { headers }));
}

function failureSamples(text) {
  return text.split("\n").filter((line) => line.startsWith("kitsunerouter_failures_total{"));
}

function record(overrides = {}) {
  return usage.saveRequestUsage({
    provider: "openai", model: "gpt-4o", timestamp: new Date().toISOString(),
    tokens: { prompt_tokens: 10, completion_tokens: 4, cached_tokens: 3 },
    latency: { ttft: 250, total: 400 }, ...overrides,
  });
}

describe("metrics reconcile terminal events separately from usage/UI logs", () => {
  it("counts real zero-token HTTP and SSE failures through the executor and authenticated GET", async () => {
    const received = [];
    server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      received.push({ path: request.url, stream: body.stream });
      if (body.stream) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(`data: ${JSON.stringify({ error: { message: secretMarkers[2], code: "rate_limit_exceeded", status: 429 } })}\n\ndata: [DONE]\n\n`);
      } else {
        response.writeHead(429, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: secretMarkers[2], type: "rate_limit_error" } }));
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const nativeFetch = globalThis.fetch;
    // Real HTTP only, with an egress guard: no provider or refresh can escape loopback.
    vi.stubGlobal("fetch", (input, options) => {
      const url = new URL(typeof input === "string" ? input : input.url || String(input));
      if (url.origin !== baseUrl) throw new Error("Fixture forbids non-loopback egress");
      return nativeFetch(input, options);
    });
    const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
    proxyModule = await import("../../open-sse/utils/proxyFetch.js");
    for (const stream of [false, true]) {
      const result = await handleChatCore({
        body: { model: "gpt-4o", stream, messages: [{ role: "user", content: secretMarkers[2] }] },
        modelInfo: { provider: "openai-compatible-chat-metrics-fixture", model: "gpt-4o" },
        credentials: { apiKey: secretMarkers[0], providerSpecificData: { baseUrl, apiType: "chat" } },
        connectionId: secretMarkers[1], apiKey: secretMarkers[0], sourceFormatOverride: "openai",
        rtkEnabled: false, headroomEnabled: false, pxpipeEnabled: false,
      });
      expect(result.response.status).toBe(stream ? 200 : 429);
      if (stream) expect(await result.response.text()).toContain("rate_limit_exceeded");
    }

    expect(received).toEqual([
      { path: "/chat/completions", stream: false }, { path: "/chat/completions", stream: true },
    ]);
    expect(db.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(0);
    expect(db.get("SELECT COUNT(*) AS n FROM requestDetails").n).toBe(0);
    expect(await usage.getRecentLogs()).toEqual([]);
    const response = await scrape();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(failureSamples(text)).toEqual(['kitsunerouter_failures_total{status="429"} 2']);
    expect(text).toContain("# TYPE kitsunerouter_failures_total counter\n");
    expect(text).toContain("kitsunerouter_requests_total 0\n");
    for (const marker of secretMarkers) expect(text).not.toContain(marker);
  });

  it("never evicts failures with log retention, time passage, repeated scrapes, or module reloads", async () => {
    for (let index = 0; index < 625; index++) await usage.appendRequestLog({ status: "FAILED 401" });
    for (let index = 0; index < 625; index++) await usage.appendRequestLog({ status: "200 OK" });
    expect(failureSamples(await (await scrape()).text())).toEqual(['kitsunerouter_failures_total{status="401"} 625']);
    expect(failureSamples(await (await scrape()).text())).toEqual(['kitsunerouter_failures_total{status="401"} 625']);
    vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));
    vi.resetModules();
    usage = await import("@/lib/db/repos/usageRepo.js");
    ({ GET: metricsGet } = await import("@/app/api/metrics/route.js"));
    await usage.appendRequestLog({ status: "FAILED 401" });
    expect(failureSamples(await (await scrape()).text())).toEqual(['kitsunerouter_failures_total{status="401"} 626']);
  });

  it("bounds status cardinality and drops identities, arbitrary messages, and non-failures", async () => {
    for (let code = 0; code < 1000; code++) {
      await usage.appendRequestLog({
        status: `FAILED ${code}`, apiKey: secretMarkers[0], connectionId: secretMarkers[1],
        model: secretMarkers[2], provider: `unbounded-provider-${code}`, prompt: secretMarkers[2],
      });
    }
    for (const status of [undefined, null, 429, {}, "PENDING", "200 OK", "ok", "FAILED 4290", "prefix FAILED 401", `FAILED 429 ${secretMarkers[0]}`, "FAILED 500\nprivate"]) {
      await usage.appendRequestLog({ status });
    }
    await usage.appendRequestLog();
    const text = await (await scrape()).text();
    const samples = failureSamples(text);
    expect(samples).toHaveLength(200);
    expect(samples[0]).toBe('kitsunerouter_failures_total{status="400"} 1');
    expect(samples.at(-1)).toBe('kitsunerouter_failures_total{status="599"} 1');
    expect(samples.every((sample) => /^kitsunerouter_failures_total\{status="[45]\d{2}"\} 1$/.test(sample))).toBe(true);
    for (const marker of secretMarkers) expect(text).not.toContain(marker);
    expect(await usage.getRecentLogs()).toEqual([]);
    expect(db.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(0);
    expect(db.get("SELECT COUNT(*) AS n FROM usageDaily").n).toBe(0);
  });

  it("declares rolling usage and TTFT sample counts as gauges when their window shrinks", async () => {
    await record();
    let text = await (await scrape()).text();
    for (const metric of ["requests", "prompt_tokens", "completion_tokens", "cached_tokens", "cost_usd", "model_requests", "ttft_samples"]) {
      expect(text).toContain(`# TYPE kitsunerouter_${metric}_total gauge\n`);
    }
    expect(text).toContain("kitsunerouter_requests_total 1\n");
    expect(text).toContain("kitsunerouter_prompt_tokens_total 10\n");
    expect(text).toContain("kitsunerouter_cached_tokens_total 3\n");
    expect(text).toContain("kitsunerouter_ttft_samples_total 1\n");
    vi.setSystemTime(new Date("2026-10-22T12:00:00.001Z"));
    text = await (await scrape()).text();
    expect(text).toContain("kitsunerouter_requests_total 0\n");
    expect(text).toContain("kitsunerouter_prompt_tokens_total 0\n");
    expect(text).not.toContain("kitsunerouter_ttft_samples_total");
    expect(db.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(1);
  });

  it("sums shared public model IDs into one series without publishing arbitrary private model labels", async () => {
    await record();
    await record({ provider: "synthetic-other-provider" });
    await record({ model: `private-model-${secretMarkers.join("-")}` });
    const text = await (await scrape()).text();
    const samples = text.split("\n").filter((line) => line.startsWith("kitsunerouter_model_requests_total{"));
    expect(samples).toEqual(['kitsunerouter_model_requests_total{model="gpt-4o"} 2']);
    expect(text).toContain("kitsunerouter_requests_total 3\n");
    for (const marker of secretMarkers) expect(text).not.toContain(marker);
  });

  it("keeps the existing newest-first seven-column string UI log contract without fake usage rows", async () => {
    await record({ status: "200 OK", connectionId: "synthetic-log-account" });
    const logs = await usage.getRecentLogs(1);
    expect(logs).toEqual(["21-10-2026 12:00:00 | gpt-4o | OPENAI | syntheti | 10 | 4 | 200 OK"]);
    await usage.appendRequestLog({ status: "FAILED 429", tokens: { prompt_tokens: 0, completion_tokens: 0 } });
    expect(await usage.getRecentLogs(1)).toEqual(logs);
    expect(db.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(1);
    expect((await usage.getUsageStats("24h")).totalRequests).toBe(1);
    expect(failureSamples(await (await scrape()).text())).toEqual(['kitsunerouter_failures_total{status="429"} 1']);
  });

  it("does not disclose failure counts without authentication", async () => {
    await usage.appendRequestLog({ status: "FAILED 401" });
    const response = await scrape(false);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(failureSamples(await (await scrape()).text())).toEqual(['kitsunerouter_failures_total{status="401"} 1']);
  });

  it("continues to report actual failure events when the real SQLite usage query is unavailable", async () => {
    await usage.appendRequestLog({ status: "FAILED 502" });
    await db.close();
    const response = await scrape();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain("kitsunerouter_up 1\n");
    expect(text).toContain("kitsunerouter_metrics_scrape_ok 0\n");
    expect(failureSamples(text)).toEqual(['kitsunerouter_failures_total{status="502"} 1']);
  });

  it("starts fresh in another process rather than claiming restart-durable failure history", async () => {
    const repoUrl = new URL("../../src/lib/db/repos/usageRepo.js", import.meta.url).href;
    const run = (recordFailure) => JSON.parse(execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e", `
      import { appendRequestLog, getRequestFailureCounts } from ${JSON.stringify(repoUrl)};
      if (${recordFailure}) await appendRequestLog({ status: "FAILED 429" });
      console.log(JSON.stringify(getRequestFailureCounts()));
    `], { cwd: fileURLToPath(new URL("../..", import.meta.url)), env: { ...process.env }, encoding: "utf8" }));
    expect(run(true)).toEqual({ 429: 1 });
    expect(run(false)).toEqual({});
  });
});
