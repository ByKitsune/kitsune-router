import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "vite";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
} catch {
  // The repository does not depend on Playwright; CI may supply it separately.
}

const browserDescribe = playwright ? describe : describe.skip;
const root = resolve(import.meta.dirname, "../..");
const sourceRoot = join(root, "src") + "/";

function mockData(count, recent = []) {
  const row = { requests: count, promptTokens: count * 100, completionTokens: count * 50, cachedTokens: 0, cost: count * 0.01, rawModel: "synthetic-model", provider: "synthetic-provider" };
  return {
    totalRequests: count, totalPromptTokens: count * 100, totalCompletionTokens: count * 50,
    totalCachedTokens: 0, totalCost: count * 0.01,
    byModel: count ? { "synthetic-model (synthetic-provider)": row } : {},
    byProvider: {}, byAccount: {}, byApiKey: {}, byEndpoint: {},
    pending: { byModel: {}, byAccount: {} }, activeRequests: [], recentRequests: recent, errorProvider: "",
  };
}

function fixturePlugin(state) {
  const virtual = "\0usage-dashboard-test:";
  const fixtures = {
    entry: `import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import UsageStats from "@/shared/components/UsageStats.js";
      function App() {
        const [period, setPeriod] = useState("today");
        return React.createElement(React.Fragment, null,
          React.createElement("button", { onClick: () => setPeriod("today") }, "Today"),
          React.createElement("button", { onClick: () => setPeriod("7d") }, "7D"),
          React.createElement(UsageStats, { period, setPeriod, hidePeriodSelector: true }));
      }
      createRoot(document.getElementById("root")).render(React.createElement(App));`,
    navigation: `const router = { replace() {} }; export const useRouter = () => router; export const useSearchParams = () => new URLSearchParams();`,
    dynamic: `import React from "react"; export default () => function Topology() { return React.createElement("div", null, "Synthetic topology"); };`,
    topology: `export default function Topology() { return null; }`,
    providers: `export const AI_PROVIDERS = {}; export const FREE_PROVIDERS = {};`,
    recharts: `import React from "react"; import * as Charts from "recharts";
      export const ResponsiveContainer = Charts.ResponsiveContainer;
      export const AreaChart = ({data, ...props}) => React.createElement("div", {"data-testid":"usage-chart", "data-tokens": data.reduce((n, x) => n + x.tokens, 0)}, React.createElement(Charts.AreaChart, {data, ...props}));
      export const Area = Charts.Area; export const XAxis = Charts.XAxis; export const YAxis = Charts.YAxis;
      export const CartesianGrid = Charts.CartesianGrid; export const Tooltip = Charts.Tooltip;`,
  };

  return {
    name: "usage-dashboard-browser-fixture",
    enforce: "pre",
    resolveId(id, importer) {
      if (id === "/usage-fixture.js") return virtual + "entry";
      if (id === "next/navigation") return virtual + "navigation";
      if (id === "next/dynamic") return virtual + "dynamic";
      if (id === "recharts" && importer !== virtual + "recharts") return virtual + "recharts";
      if (id === "@/shared/constants/providers") return virtual + "providers";
      if (id === "@/app/(dashboard)/dashboard/usage/components/ProviderTopology") return virtual + "topology";
      if (id.startsWith("@/")) {
        const target = join(sourceRoot, id.slice(2));
        return existsSync(target) ? target : existsSync(`${target}.js`) ? `${target}.js` : target;
      }
    },
    load(id) {
      if (id.startsWith(virtual)) return fixtures[id.slice(virtual.length)];
    },
    transform(code, id) {
      if (!id.startsWith(sourceRoot) || !id.endsWith(".js")) return;
      return babel.transformSync(code, {
        filename: id, babelrc: false, configFile: false,
        presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
      }).code;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname === "/") {
          res.setHeader("Content-Type", "text/html");
          res.end('<!doctype html><html><body><div id="root"></div><script type="module" src="/usage-fixture.js"></script></body></html>');
          return;
        }
        if (url.pathname === "/api/providers" || url.pathname === "/api/provider-nodes") {
          res.setHeader("Content-Type", "application/json");
          res.end(url.pathname.endsWith("provider-nodes") ? '{"nodes":[]}' : '{"connections":[]}');
          return;
        }
        if (url.pathname === "/api/usage/stream") {
          if (state.streamHandler) {
            const abort = new AbortController();
            res.once("close", () => abort.abort());
            const response = await state.streamHandler({ signal: abort.signal });
            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
            state.streams.add(res);
            const reader = response.body.getReader();
            try {
              while (!res.destroyed) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(Buffer.from(value));
              }
            } finally {
              reader.releaseLock();
              state.streams.delete(res);
              if (!res.writableEnded) res.end();
            }
            return;
          }
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
          res.flushHeaders();
          state.streams.add(res);
          req.on("close", () => state.streams.delete(res));
          if (state.streamGate) await state.streamGate.promise;
          if (!res.destroyed) res.write(`data: ${JSON.stringify(mockData(999, state.recent))}\n\n`);
          return;
        }
        if (url.pathname === "/api/usage/stats" || url.pathname === "/api/usage/chart") {
          const kind = url.pathname.endsWith("stats") ? "stats" : "chart";
          const period = url.searchParams.get("period");
          state.calls.push({ kind, period });
          const aborts = state.aborts;
          res.on("close", () => { if (!res.writableEnded) aborts.push({ kind, period }); });
          const held = state.hold?.period === period ? state.hold.promise : null;
          const count = state.counts[period];
          const fail = state.fail[kind] === period;
          if (held) await held;
          if (res.destroyed) return;
          state.delivered.push({ kind, period });
          res.statusCode = fail ? 500 : 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(fail ? { error: "synthetic failure" } : kind === "stats"
            ? state.statsOverrides?.[period] ?? mockData(count, state.recent)
            : [{ label: "synthetic", tokens: count * 150, cost: count * 0.01 }]));
          return;
        }
        next();
      });
    },
  };
}

browserDescribe("usage dashboard in a synthetic browser fixture", () => {
  let directory;
  let server;
  let browser;
  let page;
  let state;

  beforeAll(async () => {
    directory = await mkdtemp(join(process.env.TMPDIR || "/tmp/opencode", "usage-dashboard-browser-"));
    await symlink(realpathSync(join(root, "node_modules")), join(directory, "node_modules"), "dir");
    state = { streams: new Set() };
    server = await createServer({
      root: directory, configFile: false, cacheDir: join(directory, "vite-cache"),
      logLevel: "error", plugins: [fixturePlugin(state)],
      resolve: { dedupe: ["react", "react-dom"] },
      server: { host: "127.0.0.1", port: 0, fs: { allow: [root, directory, realpathSync(join(root, "node_modules"))] } },
      optimizeDeps: { noDiscovery: true, include: ["react", "react/jsx-runtime", "react-dom/client", "prop-types", "recharts"] },
    });
    await server.listen();
    browser = await playwright.chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      headless: true, args: ["--no-sandbox"],
    });
  }, 30000);

  beforeEach(async () => {
    Object.assign(state, { counts: { today: 0, "7d": 8 }, calls: [], aborts: [], delivered: [], recent: [], fail: {}, hold: null, streamHandler: null, streamGate: null });
    state.statsOverrides = {};
    page = await browser.newPage();
    page.on("pageerror", (error) => console.error("Synthetic browser error:", error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  });

  afterEach(async () => {
    state.hold?.release();
    state.streamGate?.release();
    await page?.close();
    for (const stream of state.streams) stream.end();
    state.streams.clear();
    vi.doUnmock("@/lib/usageDb");
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  const requests = (kind, period) => state.calls.filter((call) => call.kind === kind && call.period === period).length;
  const total = () => page.getByText("Total Requests", { exact: true }).locator("..").locator("span").nth(1).innerText();
  const emit = (event) => { for (const stream of state.streams) stream.write(event); };
  const emitSnapshot = (data) => emit(`data: ${JSON.stringify(data)}\n\n`);
  const waitForInitialRefresh = async () => {
    await expect.poll(() => requests("stats", "today")).toBeGreaterThanOrEqual(2);
    await expect.poll(() => requests("chart", "today")).toBeGreaterThanOrEqual(2);
  };
  const waitForSettled = async (period = "today") => {
    const allDelivered = () => state.delivered.filter(item => item.period === period).length
      === requests("stats", period) + requests("chart", period);
    await expect.poll(allDelivered).toBe(true);
    await page.waitForTimeout(550);
    await expect.poll(allDelivered).toBe(true);
  };
  const setLegacyBaseline = async (snapshot) => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    await waitForSettled();
    const before = requests("stats", "today");
    emitSnapshot(snapshot);
    await expect.poll(() => requests("stats", "today")).toBe(before + 1);
    await waitForSettled();
  };

  it("refreshes zero to nonzero for the selected period, coalescing bursts but not pending events", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    const before = requests("stats", "today");
    state.counts.today = 1;
    state.counts["7d"] = 9;
    state.recent = [{ timestamp: new Date().toISOString(), model: "synthetic-model", provider: "synthetic-provider", promptTokens: 100, completionTokens: 50 }];
    for (let i = 0; i < 6; i++) emit("event: usage-updated\ndata: {}\n\n");
    emit(`data: ${JSON.stringify(mockData(999, state.recent))}\n\n`);
    await expect.poll(total).toBe("1");
    await expect.poll(() => page.getByTestId("usage-chart").getAttribute("data-tokens")).toBe("150");
    await expect.poll(() => page.getByTestId("usage-chart").locator("svg").count()).toBeGreaterThan(0);
    expect(requests("stats", "today")).toBe(before + 1);
    expect(requests("chart", "today")).toBe(before + 1);
    expect(await page.getByText("synthetic-model", { exact: true }).count()).toBeGreaterThan(0);

    emit(`data: ${JSON.stringify(mockData(999, state.recent))}\n\n`);
    await page.waitForTimeout(550);
    expect(requests("stats", "today")).toBe(before + 1);

    await page.getByRole("button", { name: "7D" }).click();
    await expect.poll(total).toBe("9");
    state.counts["7d"] = 10;
    const sevenBefore = requests("stats", "7d");
    emit("event: usage-updated\ndata: {}\n\n");
    await expect.poll(total).toBe("10");
    expect(requests("stats", "7d")).toBe(sevenBefore + 1);
    expect(requests("stats", "today")).toBe(before + 1);
    await expect.poll(() => page.getByTestId("usage-chart").getAttribute("data-tokens")).toBe("1500");
  }, 15000);

  it("refreshes selected-period totals when an older stream sends changed aggregate snapshots", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    await expect.poll(() => state.delivered.filter(item => item.period === "today").length).toBeGreaterThanOrEqual(4);
    const before = requests("stats", "today");

    // A legacy server sends ordinary all-time snapshots, including pending-only
    // messages; they must not overwrite period totals or trigger needless fetches.
    emit(`data: ${JSON.stringify(mockData(999, [{ model: "pending-fixture" }]))}\n\n`);
    await page.waitForTimeout(550);
    expect(requests("stats", "today")).toBe(before);

    state.counts.today = 2;
    emit(`data: ${JSON.stringify(mockData(1000))}\n\n`);
    await expect.poll(total, { timeout: 2500 }).toBe("2");
    await expect.poll(() => page.getByTestId("usage-chart").getAttribute("data-tokens")).toBe("300");
    expect(requests("stats", "today")).toBe(before + 1);
    expect(requests("chart", "today")).toBe(before + 1);
  }, 15000);

  it("refreshes legacy period statistics when providerless zero usage changes a breakdown", async () => {
    const baseline = mockData(0);
    await setLegacyBaseline(baseline);
    const before = requests("stats", "today");
    const row = { requests: 1, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: null, provider: null };
    const committed = {
      ...baseline,
      byModel: { [String(null)]: row },
      byEndpoint: { [String(null)]: { ...row, endpoint: null } },
    };
    state.statsOverrides.today = { ...committed, totalRequests: 1 };

    emitSnapshot(committed);
    await expect.poll(total, { timeout: 2500 }).toBe("1");
    expect(requests("stats", "today")).toBe(before + 1);
    expect(requests("chart", "today")).toBe(before + 1);
  }, 15000);

  it("distinguishes missing and null legacy aggregates without adopting stream totals", async () => {
    const baseline = mockData(0);
    delete baseline.totalCost;
    await setLegacyBaseline(baseline);
    const before = requests("stats", "today");

    state.counts.today = 2;
    emitSnapshot({ ...baseline, totalCost: null, costCoverage: null });
    await expect.poll(total, { timeout: 2500 }).toBe("2");
    expect(requests("stats", "today")).toBe(before + 1);
    expect(requests("chart", "today")).toBe(before + 1);
  }, 15000);

  it("refreshes when a legacy request count becomes unknown or disappears", async () => {
    const baseline = mockData(0);
    await setLegacyBaseline(baseline);
    const before = requests("stats", "today");

    state.counts.today = 2;
    const unknown = { ...baseline, totalRequests: null };
    emitSnapshot(unknown);
    await expect.poll(total, { timeout: 2500 }).toBe("2");
    await waitForSettled();

    state.counts.today = 3;
    delete unknown.totalRequests;
    emitSnapshot(unknown);
    await expect.poll(total, { timeout: 2500 }).toBe("3");
    expect(requests("stats", "today")).toBe(before + 2);
    expect(requests("chart", "today")).toBe(before + 2);
  }, 15000);

  it("ignores volatile fields in otherwise unchanged legacy breakdowns", async () => {
    const row = { requests: 1, promptTokens: 0, completionTokens: 0, cost: 0, rawModel: null, provider: null };
    const baseline = { ...mockData(0), byModel: { [String(null)]: row } };
    await setLegacyBaseline(baseline);
    const before = requests("stats", "today");

    emitSnapshot({
      ...baseline,
      pending: { byModel: {}, byAccount: {}, total: 1 },
      activeRequests: [{ count: 1 }],
      byModel: { [String(null)]: { provider: null, rawModel: null, cost: 0, completionTokens: 0, promptTokens: 0, requests: 1, pending: 1 } },
    });
    emitSnapshot({ pending: { byModel: {}, byAccount: {}, total: 2 }, activeRequests: [{ count: 2 }] });
    await page.waitForTimeout(550);
    expect(requests("stats", "today")).toBe(before);
    expect(requests("chart", "today")).toBe(before);
  }, 15000);

  it("does not log the contents of malformed stream messages", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    await waitForSettled();
    const before = requests("stats", "today");
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const marker = "SYNTHETIC_PRIVATE_MARKER";

    emit(`data: ${marker}\n\n`);
    await expect.poll(() => errors.length).toBeGreaterThan(0);
    expect(errors.every((message) => !message.includes(marker))).toBe(true);
    await page.waitForTimeout(550);
    expect(requests("stats", "today")).toBe(before);
    expect(requests("chart", "today")).toBe(before);
  }, 15000);

  it("refreshes the selected period after a legacy update during a slow period switch", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    await waitForSettled();
    let release;
    state.hold = { period: "7d", promise: new Promise((resolve) => { release = resolve; }), release: () => release() };
    await page.getByRole("button", { name: "7D" }).click();
    await expect.poll(() => requests("stats", "7d")).toBe(1);

    state.counts["7d"] = 9;
    emitSnapshot(mockData(1000));
    emitSnapshot(mockData(1000));
    await page.waitForTimeout(550);
    expect(requests("stats", "7d")).toBe(1);
    state.hold = null;
    release();
    await expect.poll(total).toBe("9");
    expect(requests("stats", "7d")).toBe(2);
    expect(requests("chart", "7d")).toBe(2);
  }, 15000);

  it("does not refetch for a delayed snapshot after a named update", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    await waitForSettled();
    const before = requests("stats", "today");

    state.counts.today = 1;
    emit("event: usage-updated\ndata: {}\n\n");
    await expect.poll(total).toBe("1");
    await expect.poll(() => requests("chart", "today")).toBe(before + 1);
    await waitForSettled();
    emitSnapshot(mockData(1000));
    await page.waitForTimeout(550);
    expect(requests("stats", "today")).toBe(before + 1);
    expect(requests("chart", "today")).toBe(before + 1);
  }, 15000);

  it("resets named-event capability on reconnect so legacy snapshots refresh", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    await waitForSettled();
    state.counts.today = 1;
    emit("event: usage-updated\ndata: {}\n\n");
    await expect.poll(total).toBe("1");
    await waitForSettled();

    state.counts.today = 2;
    for (const stream of state.streams) stream.end();
    await expect.poll(total, { timeout: 10000 }).toBe("2");
    await expect.poll(() => state.streams.size).toBe(1);
    await waitForSettled();
    const before = requests("stats", "today");

    state.counts.today = 3;
    emitSnapshot(mockData(1000));
    await expect.poll(total, { timeout: 2500 }).toBe("3");
    expect(requests("stats", "today")).toBe(before + 1);
    expect(requests("chart", "today")).toBe(before + 1);
  }, 20000);

  it("refreshes when a legacy stream's initial snapshot arrives after the initial fetch", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    await expect.poll(() => state.delivered.filter(item => item.period === "today").length).toBeGreaterThanOrEqual(4);
    const before = requests("stats", "today");
    const delivered = state.delivered.filter(item => item.period === "today").length;
    let release;
    state.streamGate = { promise: new Promise(resolve => { release = resolve; }), release: () => release() };
    await page.reload();
    await expect.poll(() => requests("stats", "today")).toBeGreaterThanOrEqual(before + 2);
    await expect.poll(() => state.delivered.filter(item => item.period === "today").length).toBeGreaterThanOrEqual(delivered + 4);
    expect(await total()).toBe("0");
    state.counts.today = 4;
    state.streamGate.release();
    state.streamGate = null;
    await expect.poll(total, { timeout: 2500 }).toBe("4");
  }, 25000);

  it("refreshes selected-period statistics through the actual stream route after a simulated projection", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    await waitForSettled();
    await page.addInitScript(() => {
      const NativeEventSource = window.EventSource;
      window.EventSource = class extends NativeEventSource {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", () => {
            window.__usageStreamSnapshots = (window.__usageStreamSnapshots || 0) + 1;
          });
        }
      };
    });
    const emitter = new EventEmitter();
    const streamTotal = 999;
    vi.doMock("@/lib/usageDb", () => ({
      statsEmitter: emitter,
      getUsageStats: async () => mockData(streamTotal),
      getActiveRequests: async () => ({ activeRequests: [], recentRequests: [], errorProvider: "" }),
    }));
    const { GET } = await import("@/app/api/usage/stream/route.js");
    state.streamHandler = GET;
    await page.reload();
    await expect.poll(total).toBe("0");
    await expect.poll(() => emitter.listenerCount("update")).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__usageStreamSnapshots || 0)).toBeGreaterThan(0);
    await waitForSettled();
    const before = requests("stats", "today");
    const chartBefore = requests("chart", "today");
    state.counts.today = 3;
    await page.waitForTimeout(550);
    expect(await total()).toBe("0");
    expect(requests("stats", "today")).toBe(before);
    emitter.emit("update");
    await expect.poll(total).toBe("3");
    await expect.poll(() => page.getByTestId("usage-chart").getAttribute("data-tokens")).toBe("450");
    await waitForSettled();
    expect(requests("stats", "today")).toBe(before + 1);
    expect(requests("chart", "today")).toBe(chartBefore + 1);
    await page.close();
    await expect.poll(() => emitter.listenerCount("update")).toBe(0);
  }, 15000);

  it("retains and labels valid data on failure and retries both statistics and chart", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    state.counts.today = 1;
    state.fail.stats = "today";
    emit("event: usage-updated\ndata: {}\n\n");
    await page.getByText(/Could not load Today usage statistics/).waitFor();
    expect(await total()).toBe("0");
    expect(await page.getByText(/Showing last successful Today data/).count()).toBeGreaterThan(0);
    await expect.poll(() => page.getByTestId("usage-chart").getAttribute("data-tokens")).toBe("150");
    state.fail.stats = null;
    await page.getByRole("button", { name: "Retry statistics" }).click();
    await expect.poll(total).toBe("1");

    state.fail.stats = "7d";
    state.fail.chart = "7d";
    await page.getByRole("button", { name: "7D" }).click();
    await page.getByText(/Could not load 7D usage statistics/).waitFor();
    await page.getByText(/Could not load the 7D chart/).waitFor();
    expect(await total()).toBe("1");
    expect(await page.getByText(/Showing last successful Today data/).count()).toBeGreaterThan(0);
    expect(await page.getByTestId("usage-chart").getAttribute("data-tokens")).toBe("150");
    state.fail.stats = null;
    state.fail.chart = null;
    await page.getByRole("button", { name: "Retry chart" }).click();
    await expect.poll(total).toBe("8");
    await expect.poll(() => page.getByTestId("usage-chart").getAttribute("data-tokens")).toBe("1200");
  }, 15000);

  it("shows live requests and actionable errors when both initial requests fail", async () => {
    state.fail = { stats: "today", chart: "today" };
    state.recent = [{ timestamp: new Date().toISOString(), model: "synthetic-live", provider: "synthetic-provider", promptTokens: 12, completionTokens: 3 }];
    await page.reload();
    await page.getByText(/Could not load Today usage statistics/).waitFor();
    await page.getByText(/Could not load the Today chart/).waitFor();
    await page.getByText("synthetic-live", { exact: true }).waitFor();
    expect(await page.getByText("Total Requests", { exact: true }).count()).toBe(0);
    expect(await page.getByText("No data for Today", { exact: true }).count()).toBe(0);
    state.fail = {};
    await page.getByRole("button", { name: "Retry statistics" }).click();
    await expect.poll(total).toBe("0");
    await page.getByText("No data for Today", { exact: true }).waitFor();
  }, 15000);

  it("queues just one follow-up refresh when events arrive during a slow fetch", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    let release;
    state.hold = { period: "today", promise: new Promise((resolve) => { release = resolve; }), release: () => release() };
    const before = requests("stats", "today");
    state.counts.today = 1;
    emit("event: usage-updated\ndata: {}\n\n");
    await expect.poll(() => requests("stats", "today")).toBe(before + 1);
    for (let i = 0; i < 8; i++) emit("event: usage-updated\ndata: {}\n\n");
    await page.waitForTimeout(600);
    expect(requests("stats", "today")).toBe(before + 1);
    expect(requests("chart", "today")).toBe(before + 1);
    state.counts.today = 2;
    state.hold = null;
    release();
    await expect.poll(total).toBe("2");
    expect(requests("stats", "today")).toBe(before + 2);
    expect(requests("chart", "today")).toBe(before + 2);
  }, 15000);

  it("rejects late responses from a previous period", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    let release;
    state.hold = { period: "7d", promise: new Promise((resolve) => { release = resolve; }), release: () => release() };
    await page.getByRole("button", { name: "7D" }).click();
    await expect.poll(() => requests("stats", "7d")).toBe(1);
    state.counts.today = 3;
    await page.getByRole("button", { name: "Today" }).click();
    await expect.poll(total).toBe("3");
    await expect.poll(() => state.aborts.filter((item) => item.period === "7d").length).toBe(2);
    release();
    await page.waitForTimeout(300);
    expect(await total()).toBe("3");
    expect(await page.getByTestId("usage-chart").getAttribute("data-tokens")).toBe("450");
  }, 15000);

  it("ignores stale responses even if a transport does not honor abort", async () => {
    await page.addInitScript(() => {
      const original = window.fetch.bind(window);
      window.fetch = (url, options) => {
        if (String(url).includes("period=7d")) {
          const withoutSignal = { ...options };
          delete withoutSignal.signal;
          return original(url, withoutSignal);
        }
        return original(url, options);
      };
    });
    const previous = requests("stats", "today");
    await page.reload();
    await expect.poll(total).toBe("0");
    await expect.poll(() => requests("stats", "today")).toBeGreaterThanOrEqual(previous + 2);
    let release;
    state.hold = { period: "7d", promise: new Promise((resolve) => { release = resolve; }), release: () => release() };
    await page.getByRole("button", { name: "7D" }).click();
    await expect.poll(() => requests("stats", "7d")).toBe(1);
    state.counts.today = 3;
    await page.getByRole("button", { name: "Today" }).click();
    await expect.poll(total).toBe("3");
    state.hold = null;
    release();
    await expect.poll(() => state.delivered.filter((item) => item.period === "7d").length).toBe(2);
    await page.waitForTimeout(200);
    expect(await total()).toBe("3");
    expect(await page.getByTestId("usage-chart").getAttribute("data-tokens")).toBe("450");
  }, 15000);

  it("aborts in-flight requests and closes the event stream on unmount", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    let release;
    state.hold = { period: "today", promise: new Promise((resolve) => { release = resolve; }), release: () => release() };
    const before = requests("stats", "today");
    emit("event: usage-updated\ndata: {}\n\n");
    await expect.poll(() => requests("stats", "today")).toBe(before + 1);
    await page.close();
    await expect.poll(() => state.aborts.filter((item) => item.period === "today").length).toBe(2);
    await expect.poll(() => state.streams.size).toBe(0);
  }, 15000);

  it("refreshes after an EventSource reconnect even without a new event", async () => {
    await expect.poll(total).toBe("0");
    await waitForInitialRefresh();
    state.counts.today = 4;
    for (const stream of state.streams) stream.end();
    await page.getByText(/Live updates disconnected/).waitFor();
    await expect.poll(total, { timeout: 10000 }).toBe("4");
    expect(await page.getByText(/Live updates disconnected/).count()).toBe(0);
  }, 15000);
});
