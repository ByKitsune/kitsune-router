import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http2";

const transport = vi.hoisted(() => ({ origin: "", connects: [] }));
// Only remap the socket destination. The real executor, HTTP/2 session, headers
// and Connect frames still run, so an unauthorized direct dial reaches a trap.
vi.mock("http2", async original => {
  const actual = await original();
  return { ...actual, connect(origin, options, listener) {
    transport.connects.push(String(origin));
    return actual.connect(transport.origin, options, listener);
  } };
});
vi.mock("@/models", () => ({ getProxyPoolById: vi.fn() }));

import { CursorExecutor } from "../../open-sse/executors/cursor.js";
import { resolveConnectionProxyConfig } from "../../src/lib/network/connectionProxy.js";
import { getProxyPoolById } from "@/models";

const credentials = { accessToken: "offline-cursor-egress-fixture", providerSpecificData: { machineId: "a".repeat(64) } };
const END_SUCCESS = Buffer.from("02000000027b7d", "hex");
const proxyEnvKeys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"];
let server, sessions, sockets, requests, tcpConnections;

beforeEach(async () => {
  for (const key of proxyEnvKeys) vi.stubEnv(key, "");
  getProxyPoolById.mockReset();
  transport.connects = [];
  requests = [];
  tcpConnections = 0;
  sessions = new Set();
  sockets = new Set();
  server = createServer();
  server.on("connection", socket => {
    tcpConnections++;
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("session", session => {
    sessions.add(session);
    session.on("error", () => {});
    session.once("close", () => sessions.delete(session));
  });
  server.on("stream", (stream, headers) => {
    let pending = Buffer.alloc(0);
    let replied = false;
    stream.on("error", () => {});
    stream.on("data", chunk => {
      pending = Buffer.concat([pending, chunk]);
      if (replied || pending.length < 5 || pending.length < pending.readUInt32BE(1) + 5) return;
      replied = true;
      requests.push({ headers, frame: Buffer.from(pending) });
      stream.respond({ ":status": 200, "content-type": "application/connect+proto" });
      stream.end(END_SUCCESS);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  transport.origin = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  for (const session of sessions) session.destroy();
  for (const socket of sockets) socket.destroy();
  await new Promise(resolve => server.close(resolve));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function executorFor(hostname = "egress-cursor.invalid") {
  const executor = new CursorExecutor();
  executor.buildUrl = () => `http://${hostname}:${server.address().port}/agent.v1.AgentService/Run`;
  return executor;
}

function execute(proxyOptions = null, { stream = false, hostname } = {}) {
  return executorFor(hostname).execute({
    model: "claude-sonnet-4.6", body: { messages: [{ role: "user", content: "offline egress control" }] },
    credentials, proxyOptions, stream, signal: AbortSignal.timeout(2000),
  });
}

async function expectBlocked(proxyOptions, options) {
  const result = await execute(proxyOptions, options);
  expect(transport.connects, "the native HTTP/2 connect boundary must not be entered").toEqual([]);
  expect(tcpConnections).toBe(0);
  expect(requests, "credentials must not reach direct transport").toEqual([]);
  expect(result.response.status).toBe(500);
  const payload = await result.response.json();
  expect(payload.error).toMatchObject({ type: "connection_error", message: expect.stringMatching(/proxy|relay/i) });
  expect(payload.error.message).not.toMatch(/fixture-user|fixture-password|offline-cursor-egress-fixture/);
}

async function expectDirect(proxyOptions, options) {
  const result = await execute(proxyOptions, options);
  expect(result.response.status).toBe(200);
  await result.response.text();
  expect(transport.connects).toHaveLength(1);
  expect(tcpConnections).toBe(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].headers).toMatchObject({ ":method": "POST", ":path": "/agent.v1.AgentService/Run",
    authorization: "Bearer offline-cursor-egress-fixture" });
  expect(requests[0].frame.length).toBeGreaterThan(5);
}

function projectedPolicy(config) {
  return {
    connectionProxyEnabled: config.connectionProxyEnabled === true,
    connectionProxyUrl: config.connectionProxyUrl || "",
    connectionNoProxy: config.connectionNoProxy || "",
    vercelRelayUrl: config.vercelRelayUrl || "",
    strictProxy: config.strictProxy === true,
  };
}

describe.each([false, true])("Cursor configured non-strict egress before any native dial (stream=%s)", stream => {
  it.each([
    ["empty connection proxy", { connectionProxyEnabled: true, connectionProxyUrl: "", strictProxy: false }],
    ["missing connection URL", { connectionProxyEnabled: true }],
    ["short option aliases", { enabled: true, url: "  ", strictProxy: false }],
    ["pool selection", { proxyPoolId: "missing-pool", connectionProxyEnabled: false, strictProxy: false }],
    ["forwarded pool identity", { connectionProxyPoolId: "inactive-pool", strictProxy: false }],
  ])("blocks %s without leaking credentials", async (_name, policy) => {
    await expectBlocked(policy, { stream });
  });
});

describe("Cursor carries shared pool resolution failures through projected callers", () => {
  it.each([
    ["missing", null],
    ["inactive", { isActive: false, strictProxy: false, proxyUrl: "http://proxy.invalid" }],
    ["blank", { isActive: true, strictProxy: false, proxyUrl: " " }],
    ["inactive relay", { type: "vercel", isActive: false, strictProxy: false, proxyUrl: "http://relay.invalid" }],
  ])("blocks a resolved %s pool before HTTP/2", async (_name, pool) => {
    getProxyPoolById.mockResolvedValue(pool);
    const config = await resolveConnectionProxyConfig({ proxyPoolId: "selected-pool" });
    expect(config.strictProxy).toBe(false);
    await expectBlocked(projectedPolicy(config));
  });

  it("blocks a lookup failure without requiring strictProxy", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getProxyPoolById.mockRejectedValue(new Error("offline pool lookup failure"));
    const config = await resolveConnectionProxyConfig({ proxyPoolId: "selected-pool" });
    expect(config).toMatchObject({ source: "error", strictProxy: false });
    await expectBlocked(projectedPolicy(config));
  });
});

describe("Cursor preserves existing unsupported-transport guards", () => {
  it.each([
    ["configured proxy", { enabled: true, url: "http://fixture-user:fixture-password@proxy.invalid:8080" }],
    ["relay", { vercelRelayUrl: "http://fixture-user:fixture-password@relay.invalid" }],
    ["strict without a URL", { strictProxy: true }],
    ["strict exclusion", { connectionProxyEnabled: true, connectionNoProxy: "*", strictProxy: true }],
  ])("blocks %s without disclosing transport credentials", async (_name, policy) => {
    await expectBlocked(policy);
  });

  it("blocks an effective environment proxy before HTTP/2", async () => {
    vi.stubEnv("HTTP_PROXY", "http://fixture-user:fixture-password@proxy.invalid:8080");
    await expectBlocked();
  });

  it("does not apply an automatic loopback exclusion to an explicitly selected relay", async () => {
    await expectBlocked({ vercelRelayUrl: "http://relay.invalid" }, { hostname: "127.0.0.1" });
  });

  it("does not treat a no_proxy hostname substring as an explicit exclusion", async () => {
    await expectBlocked({ connectionProxyEnabled: true, connectionNoProxy: "egress-cursor.invalid" },
      { hostname: "egress-cursor.invalid.attacker.invalid" });
  });
});

describe("Cursor intentionally direct routes and exclusions match shared fetch policy", () => {
  it.each([
    ["unconfigured", null],
    ["explicit no-pool", { proxyPoolId: "__none__", strictProxy: false }],
    ["disabled legacy URL", { connectionProxyEnabled: false, connectionProxyUrl: "http://proxy.invalid" }],
  ])("retains a real HTTP/2 positive control for %s", async (_name, policy) => {
    await expectDirect(policy);
  });

  it.each([
    { connectionProxyEnabled: true, connectionProxyUrl: "", connectionNoProxy: "egress-cursor.invalid" },
    { enabled: true, noProxy: "  unrelated.invalid, .EGRESS-CURSOR.INVALID  " },
    { proxyPoolId: "missing-pool", connectionNoProxy: "*" },
    { vercelRelayUrl: "http://relay.invalid", connectionNoProxy: ".egress-cursor.invalid" },
  ])("permits an explicit account exclusion even when the route has no usable proxy URL: %j", async policy => {
    await expectDirect(policy);
  });

  it("does not substitute an environment proxy after an explicit account exclusion", async () => {
    vi.stubEnv("HTTP_PROXY", "http://proxy.invalid");
    await expectDirect({ connectionProxyEnabled: true, connectionProxyUrl: "", connectionNoProxy: ".egress-cursor.invalid" });
  });

  it.each(["NO_PROXY", "no_proxy"])("retains an effective environment %s exclusion", async key => {
    vi.stubEnv("HTTP_PROXY", "http://proxy.invalid");
    vi.stubEnv(key, ".egress-cursor.invalid");
    await expectDirect();
  });

  it("retains automatic loopback exclusions for ordinary non-strict connection proxies", async () => {
    vi.stubEnv("HTTP_PROXY", "http://proxy.invalid");
    await expectDirect({ connectionProxyEnabled: true, connectionProxyUrl: "", strictProxy: false }, { hostname: "127.0.0.1" });
  });

  it("does not turn a whitespace-only environment value into a proxy requirement", async () => {
    vi.stubEnv("HTTP_PROXY", "  ");
    await expectDirect();
  });
});
