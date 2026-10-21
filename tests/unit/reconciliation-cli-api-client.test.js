import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const filename = new URL("../../cli/src/cli/api/client.js", import.meta.url);
const source = fs.readFileSync(filename, "utf8");
const MACHINE_ID = "fixture-cli-machine-id";
const CLI_SECRET = "fixture-cli-shared-secret-not-real";

let home;
let server;
let sockets;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "reconciliation-cli-home-"));
  const dataDir = path.join(home, ".zenrouter");
  fs.mkdirSync(path.join(dataDir, "auth"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "machine-id"), MACHINE_ID);
  fs.writeFileSync(path.join(dataDir, "auth", "cli-secret"), CLI_SECRET, { mode: 0o600 });
  sockets = new Set();
});

afterEach(async () => {
  if (server) {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    server = null;
  }
  fs.rmSync(home, { recursive: true, force: true });
});

async function listen(handler) {
  server = http.createServer(handler);
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

function loadClient(port, { onResponse = () => {}, timeoutMs } = {}) {
  const fixtureModule = { exports: {} };
  const settlements = [];
  const timeoutBudgets = [];
  const events = [];
  let closeResponse;
  const responseClosed = new Promise(resolve => { closeResponse = resolve; });
  let endResponse;
  const responseEnded = new Promise(resolve => { endResponse = resolve; });
  let closeRequest;
  const requestClosed = new Promise(resolve => { closeRequest = resolve; });

  // Preserve native Promise behavior while observing whether competing native
  // response/request events try to resolve makeRequest more than once.
  class ObservedPromise extends Promise {
    constructor(executor) {
      super((resolve, reject) => executor(result => {
        settlements.push(result);
        resolve(result);
      }, reject));
    }
    static get [Symbol.species]() { return Promise; }
  }

  const transport = {
    request(options, callback) {
      const req = http.request(options, res => {
        for (const event of ["aborted", "error", "end", "close"]) {
          res.on(event, () => {
            events.push(event);
            if (event === "close") closeResponse(res);
            if (event === "end") endResponse(res);
          });
        }
        callback(res);
        onResponse(res);
      });
      req.on("close", closeRequest);
      const setTimeout = req.setTimeout.bind(req);
      req.setTimeout = ms => {
        timeoutBudgets.push(ms);
        // Only the test clock is shortened; real ClientRequest/socket timeout
        // handling and the production 30-second budget remain under test.
        return setTimeout(timeoutMs ?? ms);
      };
      return req;
    },
  };

  vm.runInNewContext(source, {
    module: fixtureModule,
    exports: fixtureModule.exports,
    Buffer,
    Promise: ObservedPromise,
    process: { env: { HOME: home, DATA_DIR: path.join(home, ".zenrouter") }, platform: process.platform },
    require(name) {
      if (name === "http") return transport;
      if (name === "node:os") return { ...os, homedir: () => home };
      if (name === "node-machine-id") return { machineIdSync() { throw new Error("Host machine ID access forbidden"); } };
      if (["https", "crypto", "node:fs", "node:path"].includes(name)) return require(name);
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: filename.pathname });
  fixtureModule.exports.configure({ host: "127.0.0.1", port, protocol: "http:" });
  return { api: fixtureModule.exports, settlements, events, timeoutBudgets, responseClosed, responseEnded, requestClosed };
}

async function promptly(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => { timer = setTimeout(() => resolve({ pending: "CLI request did not settle within 500ms" }), 500); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe("reconciliation G06: actual CLI API client response lifecycle (#4832)", () => {
  it.each(["partial JSON", "empty body"])("settles promptly after headers and a truncated %s disconnect", async (bodyKind) => {
    let outgoing;
    const port = await listen((_req, res) => {
      outgoing = res;
      res.writeHead(200, { "Content-Type": "application/json", "Content-Length": "100" });
      res.flushHeaders();
      if (bodyKind === "partial JSON") res.write('{"connections":[');
    });
    const fixture = loadClient(port, {
      onResponse(res) {
        // Destroy only after the real client receives headers/body, ensuring
        // this is the incoming-response bug rather than a pre-header failure.
        if (bodyKind === "partial JSON") res.once("data", () => outgoing.destroy());
        else outgoing.destroy();
      },
    });
    const pending = fixture.api.getProviders();
    const incoming = await fixture.responseClosed;

    expect(incoming.complete).toBe(false);
    expect(fixture.events).toContain("aborted");
    expect(fixture.events).toContain("error");
    expect(await promptly(pending)).toMatchObject({ success: false, error: expect.stringMatching(/^Network error: /) });
    expect(fixture.settlements).toHaveLength(1);
    expect(fixture.timeoutBudgets).toEqual([30000]);
  });

  it("preserves successful JSON and local synthetic authentication through a complete response close", async () => {
    let seen;
    const port = await listen((req, res) => {
      seen = { url: req.url, method: req.method, headers: req.headers };
      res.writeHead(200, { "Content-Type": "application/json", Connection: "close" });
      res.end('{"connections":[{"id":"fixture-connection"}]}');
    });
    const fixture = loadClient(port);
    expect(await promptly(fixture.api.getProviders())).toEqual({
      success: true, data: { connections: [{ id: "fixture-connection" }] }, statusCode: 200,
    });
    expect((await fixture.responseClosed).complete).toBe(true);
    expect(fixture.events).toEqual(["end", "close"]);
    expect(fixture.settlements).toHaveLength(1);
    expect(fixture.timeoutBudgets).toEqual([30000]);
    expect(seen).toMatchObject({ method: "GET", url: "/api/providers", headers: { "content-type": "application/json" } });
    expect(seen.headers["x-zen-cli-token"]).toBe("658f6080f5e9bc03");
    expect(seen.headers.authorization).toBeUndefined();
    expect(fs.readFileSync(path.join(home, ".zenrouter", "auth", "cli-secret"), "utf8")).toBe(CLI_SECRET);
  });

  it.each([
    { status: 503, body: '{"error":"fixture unavailable"}', expected: { success: false, error: "fixture unavailable", statusCode: 503 } },
    { status: 429, body: '{}', expected: { success: false, error: "HTTP 429", statusCode: 429 } },
    { status: 200, body: '{"error":"fixture logical error"}', expected: { success: false, error: "fixture logical error", statusCode: 200 } },
    { status: 204, body: '', expected: { success: true, data: {}, statusCode: 204 } },
  ])("preserves complete HTTP $status response semantics for $body", async ({ status, body, expected }) => {
    const port = await listen((_req, res) => res.writeHead(status).end(body));
    const fixture = loadClient(port);
    expect(await promptly(fixture.api.getProviders())).toEqual(expected);
    await fixture.responseClosed;
    expect(fixture.settlements).toHaveLength(1);
  });

  it("keeps invalid complete JSON a parse failure rather than a disconnect", async () => {
    const port = await listen((_req, res) => res.end("not JSON"));
    const fixture = loadClient(port);
    expect(await promptly(fixture.api.getProviders())).toMatchObject({
      success: false, error: expect.stringMatching(/^Failed to parse response: /),
    });
    expect((await fixture.responseClosed).complete).toBe(true);
    expect(fixture.settlements).toHaveLength(1);
  });

  it("preserves a structured network failure for a pre-header disconnect", async () => {
    const port = await listen(req => req.socket.destroy());
    const fixture = loadClient(port);
    expect(await promptly(fixture.api.getProviders())).toMatchObject({ success: false, error: expect.stringMatching(/^Network error: /) });
    expect(fixture.events).toEqual([]);
    expect(fixture.settlements).toHaveLength(1);
  });

  it.each(["before headers", "after headers"])("retains the 30-second inactivity policy and once-settles a timeout %s", async (phase) => {
    const port = await listen((_req, res) => {
      if (phase === "after headers") {
        res.writeHead(200, { "Content-Length": "100" });
        res.write('{"partial":');
      }
    });
    const fixture = loadClient(port, { timeoutMs: 40 });
    expect(await promptly(fixture.api.getProviders())).toEqual({ success: false, error: "Request timeout" });
    await fixture.requestClosed;
    if (phase === "after headers") await fixture.responseClosed;
    expect(fixture.timeoutBudgets).toEqual([30000]);
    expect(fixture.settlements).toHaveLength(1);
  });

  it.each([
    { event: "error", error: "Network error: fixture read failure" },
    { event: "aborted", error: "Network error: response aborted" },
    { event: "close", error: "Network error: response closed before completion" },
  ])("once-settles an isolated incoming $event even if a valid end competes afterward", async ({ event, error }) => {
    let outgoing;
    const port = await listen((_req, res) => {
      outgoing = res;
      res.writeHead(200);
      res.flushHeaders();
    });
    const fixture = loadClient(port, {
      onResponse(res) {
        // Real HTTP supplies the IncomingMessage. Inject only the competing
        // event to independently cover each failure path, then finish normally.
        res.emit(event, ...(event === "error" ? [new Error("fixture read failure")] : []));
        outgoing.end('{"connections":[]}');
      },
    });
    expect(await promptly(fixture.api.getProviders())).toEqual({ success: false, error });
    await fixture.responseEnded;
    expect(fixture.settlements).toHaveLength(1);
  });
});
