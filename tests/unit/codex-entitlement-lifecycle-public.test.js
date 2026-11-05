import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import, connection revisions, account selection, error classification, core and
// Codex dispatch stay real. Only unrelated persistence/logging and the HTTP edge
// are replaced; upstream responses come from the local fixture server.
const fixture = vi.hoisted(() => ({ origin: "", nativeFetch: null, requests: [], usageReads: [], denied: new Set(), exhausted: new Set(), hold: null }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {},
  saveRequestUsage: async () => {}, enqueueRequestUsage: async entry => ({ accepted: true, eventId: entry.eventId }),
}));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent() {} }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug() {}, info() {}, warn() {}, error() {}, line() {}, errorLine() {},
  nextTag: () => "", tagForSession: () => "", fmtThink: () => "high", maskKey: () => "offline",
}));
vi.mock("open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {}, logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (url, init) => {
    const target = new URL(url);
    if (target.hostname !== "chatgpt.com") throw new Error("Unexpected external fixture destination");
    return fixture.nativeFetch(`${fixture.origin}${target.pathname}${target.search}`, init);
  },
}));

const ASTRA = "gpt-6-astra";
const LUNA = "gpt-6-luna";
const A_OLD = "synthetic-old-account-a";
const A_NEW = "synthetic-new-account-a";
const B = "synthetic-account-b";
const globalKeys = [
  Symbol.for("kitsunerouter.db.importState"), Symbol.for("kitsunerouter.db.lifecycle"),
  "_dbAdapter", "_pendingRequests", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitter", "_statsEmitTimers", "_lastErrorProvider",
];
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let root;
let previousDataDir;
let previousGlobals;
let previousListeners;
let db;
let auth;
let driver;
let handleChat;
let generation;
let server;
let writeSpy;
let warningSpy;
let errorSpy;
let releases;
let pending;

function connection(id, priority, token) {
  return { id, provider: "codex", authType: "oauth", accessToken: token, isActive: true, priority,
    providerSpecificData: { chatgptAccountId: id } };
}
function payload(token = A_OLD, quotaAwareSelection = false) {
  return { settings: { requireApiKey: false, outboundProxyEnabled: false, quotaAwareSelection, fallbackStrategy: "fill-first" },
    providerConnections: [connection("account-a", 1, token), connection("account-b", 2, B)] };
}
function denial(model) {
  return { error: { message: `The '${model}' model is not supported when using Codex with a ChatGPT account.`, type: "invalid_request_error" } };
}
function answer(model) {
  return { id: "resp_lifecycle_fixture", object: "response", status: "completed", model,
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
    usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } };
}
function hold(token, status) {
  let entered;
  let release;
  const reached = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  fixture.hold = { token, status, entered, wait };
  releases.push(release);
  return { reached, release };
}
function call(model = ASTRA, signal) {
  const operation = handleChat(new Request("http://localhost/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ model: `codex/${model}`, stream: false, messages: [{ role: "user", content: "Synthetic lifecycle request" }] }),
  })).then(async response => ({ status: response.status, headers: response.headers, body: await response.json() }));
  pending.push(operation);
  return operation;
}
function resetRecordedTraffic() {
  fixture.requests = [];
  fixture.usageReads = [];
  writeSpy.mockClear();
}
function expectNoAccountWrites() {
  const accountWrites = writeSpy.mock.calls.filter(([sql]) => /^(?:INSERT|UPDATE|DELETE)\b/i.test(sql.trim()) && /\b(?:providerConnections|connectionRuntime)\b/.test(sql));
  expect(accountWrites).toEqual([]);
}
async function seedDenial() {
  expect((await call()).status).toBe(200);
  expect(fixture.requests.map(value => value.token)).toEqual([A_OLD, B]);
  expectNoAccountWrites();
  resetRecordedTraffic();
}

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousGlobals = Object.fromEntries(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  previousListeners = new Map(shutdownEvents.map(event => [event, process.rawListeners(event)]));
  root = await mkdtemp(join(tmpdir(), "kitsune-codex-entitlement-lifecycle-"));
  process.env.DATA_DIR = join(root, "data");
  for (const key of globalKeys) delete globalThis[key];
  vi.resetModules();
  warningSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  releases = [];
  pending = [];
  fixture.nativeFetch = globalThis.fetch;
  fixture.requests = [];
  fixture.usageReads = [];
  fixture.denied = new Set([A_OLD]);
  fixture.exhausted = new Set();
  fixture.hold = null;
  server = createServer((request, response) => {
    const serve = async () => {
      const token = String(request.headers.authorization || "").replace(/^Bearer /, "");
      if (request.url.endsWith("/wham/usage")) {
        fixture.usageReads.push(token);
        const resetAt = Date.now() / 1000 + 3600;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ rate_limit: { secondary_window: { used_percent: fixture.exhausted.has(token) ? 100 : 0, reset_at: resetAt } } }));
        return;
      }
      if (!request.url.endsWith("/codex/responses")) throw new Error("Unexpected loopback request path");
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      fixture.requests.push({ token, account: request.headers["chatgpt-account-id"], model: body.model });
      let status = fixture.denied.has(token) && body.model === ASTRA ? 400 : 200;
      if (fixture.hold?.token === token) {
        const held = fixture.hold;
        fixture.hold = null;
        held.entered();
        await held.wait;
        status = held.status;
      }
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(status === 400 ? denial(body.model) : answer(body.model)));
    };
    serve().catch(error => response.destroy(error));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  fixture.origin = `http://127.0.0.1:${server.address().port}`;
  db = await import("@/lib/db/index.js");
  driver = await import("@/lib/db/driver.js");
  generation = await import("@/lib/db/helpers/importGeneration.js");
  await db.importDb(payload());
  auth = await import("@/sse/services/auth.js");
  auth.clearCodexEntitlementDenials();
  ({ handleChat } = await import("@/sse/handlers/chat.js"));
  writeSpy = vi.spyOn(await driver.getAdapter(), "run");
});

afterEach(async () => {
  try {
    for (const release of releases || []) release();
    await Promise.allSettled(pending || []);
    auth?.clearCodexEntitlementDenials();
    for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
    for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
    await driver?.closeDb();
    server?.closeAllConnections();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    expect(warningSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    for (const event of shutdownEvents) {
      const existing = [...previousListeners.get(event)];
      for (const listener of process.rawListeners(event)) {
        const index = existing.indexOf(listener);
        if (index === -1) process.removeListener(event, listener);
        else existing.splice(index, 1);
      }
    }
    for (const key of globalKeys) {
      if (previousGlobals[key]) Object.defineProperty(globalThis, key, previousGlobals[key]);
      else delete globalThis[key];
    }
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    vi.resetModules();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("Codex entitlement hints across real import and re-authentication", () => {
  it("selects replacement credentials imported under the same ID when a sibling has exhausted quota", async () => {
    await seedDenial();
    const previousGeneration = generation.getDbImportGeneration();
    await db.importDb(payload(A_NEW, true));
    expect(generation.getDbImportGeneration()).toBeGreaterThan(previousGeneration);
    fixture.exhausted.add(B);
    resetRecordedTraffic();
    expect((await call()).status).toBe(200);
    expect(fixture.usageReads).toContain(A_NEW);
    expect(fixture.requests.map(value => value.token)).toEqual([A_NEW]);
    expectNoAccountWrites();
  });

  it("selects newly authenticated credentials without waiting for an import or denial expiry", async () => {
    await seedDenial();
    const previousGeneration = generation.getDbImportGeneration();
    await db.updateProviderConnection("account-a", { accessToken: A_NEW });
    await db.updateSettings({ quotaAwareSelection: true });
    expect(generation.getDbImportGeneration()).toBe(previousGeneration);
    fixture.exhausted.add(B);
    resetRecordedTraffic();
    expect((await call()).status).toBe(200);
    expect(fixture.requests.map(value => value.token)).toEqual([A_NEW]);
    expectNoAccountWrites();
  });

  it("still asks a denied-but-available account when its non-denied sibling is quota-blocked", async () => {
    await seedDenial();
    await db.updateSettings({ quotaAwareSelection: true });
    fixture.exhausted.add(B);
    resetRecordedTraffic();
    const result = await call();
    expect(result.status).toBe(400);
    expect(result.headers.get("retry-after")).toBeNull();
    expect(fixture.requests.map(value => value.token)).toEqual([A_OLD]);
    expectNoAccountWrites();
  });

  it("does not attach an old in-flight denial to credentials that were re-authenticated meanwhile", async () => {
    const held = hold(A_OLD, 400);
    const oldRequest = call();
    await held.reached;
    await db.updateProviderConnection("account-a", { accessToken: A_NEW });
    writeSpy.mockClear();
    held.release();
    expect((await oldRequest).status).toBe(200);
    resetRecordedTraffic();
    expect((await call()).status).toBe(200);
    expect(fixture.requests.map(value => value.token)).toEqual([A_NEW]);
    expectNoAccountWrites();
  });

  it("does not let an old in-flight success clear the replacement credential's newer denial", async () => {
    const held = hold(A_OLD, 200);
    const oldRequest = call();
    await held.reached;
    await db.updateProviderConnection("account-a", { accessToken: A_NEW });
    fixture.denied.add(A_NEW);
    resetRecordedTraffic();
    expect((await call()).status).toBe(200);
    expect(fixture.requests.map(value => value.token)).toEqual([A_NEW, B]);
    held.release();
    expect((await oldRequest).status).toBe(200);
    resetRecordedTraffic();
    expect((await call()).status).toBe(200);
    expect(fixture.requests.map(value => value.token)).toEqual([B]);
    expectNoAccountWrites();
  });

  it("does not clear an imported account's future lock using an old success and expired-lock snapshot", async () => {
    const lockKey = `modelLock_${ASTRA}`;
    const oldLock = new Date(Date.now() - 60_000).toISOString();
    await db.updateProviderConnection("account-a", {
      [lockKey]: oldLock, testStatus: "unavailable", lastError: "expired synthetic quota", errorCode: 429,
    });
    const held = hold(A_OLD, 200);
    const oldRequest = call();
    await held.reached;

    const futureLock = new Date(Date.now() + 3600_000).toISOString();
    const replacement = payload(A_NEW);
    Object.assign(replacement.providerConnections[0], {
      [lockKey]: futureLock, testStatus: "unavailable", lastError: "replacement synthetic quota", errorCode: 429,
    });
    await db.importDb(replacement);
    expect(await db.getProviderConnectionById("account-a")).toMatchObject({
      accessToken: A_NEW, [lockKey]: futureLock, testStatus: "unavailable", lastError: "replacement synthetic quota", errorCode: 429,
    });
    writeSpy.mockClear();

    held.release();
    expect((await oldRequest).status).toBe(200);
    expect(await db.getProviderConnectionById("account-a")).toMatchObject({
      accessToken: A_NEW, [lockKey]: futureLock, testStatus: "unavailable", lastError: "replacement synthetic quota", errorCode: 429,
    });
    expectNoAccountWrites();
  });

  it("keeps cancellation terminal without learning a denied hint from the abandoned request", async () => {
    const controller = new AbortController();
    const held = hold(A_OLD, 400);
    const abandoned = call(ASTRA, controller.signal);
    await held.reached;
    controller.abort(new Error("Synthetic caller cancellation"));
    held.release();
    expect((await abandoned).status).toBe(499);
    fixture.denied.clear();
    resetRecordedTraffic();
    expect((await call()).status).toBe(200);
    expect(fixture.requests.map(value => value.token)).toEqual([A_OLD]);
    expectNoAccountWrites();
  });

  it("retains per-model routing and never writes denial state into the real account rows", async () => {
    await seedDenial();
    expect((await call(LUNA)).status).toBe(200);
    expect(fixture.requests.map(value => value.token)).toEqual([A_OLD]);
    const accounts = await db.getProviderConnections({ provider: "codex" });
    for (const account of accounts) {
      expect(Object.keys(account).some(key => key.startsWith("modelLock_"))).toBe(false);
      expect(account.lastError).toBeUndefined();
      expect(account.testStatus).toBeUndefined();
    }
    expectNoAccountWrites();
  });
});
