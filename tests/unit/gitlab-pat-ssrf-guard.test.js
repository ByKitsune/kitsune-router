import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as realSetTimeout } from "node:timers";

const transport = vi.hoisted(() => ({ agents: [], port: null }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body, init) => Response.json(body, init) },
}));
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Agent: class extends actual.Agent {
      constructor(options) {
        const lookup = options?.connect?.lookup;
        super({
          ...options,
          connect(connection, callback) {
            const connect = () => {
              // Every socket, including rejected metadata/IP-literal regressions,
              // ends at the fixture. Still run the guard's real connector lookup.
              const socket = net.connect({ host: "127.0.0.1", port: transport.port });
              socket.once("connect", () => callback(null, socket));
              socket.once("error", (error) => callback(error));
            };
            if (lookup && !net.isIP(connection.hostname)) {
              lookup(connection.hostname, { all: true }, (error) => error ? callback(error) : connect());
            } else {
              connect();
            }
          },
        });
        transport.agents.push(this);
      }
    },
  };
});

const PAT = "glpat-fixture-only";
const PEER_TOKEN = "pat-fixture-trusted-peer";
const USER = { username: "fixture-user", email: "fixture@example.test", public_email: "public@example.test", name: "Fixture User" };
const UPSTREAM_SECRET = "upstream-user-private";
let server;
let base;
let received;
let tempDir;
let fallbackAgent;
let actualUndici;
let POST;
let getProviderConnections;
let deleteProviderConnectionsByProvider;
let lookup;
let errorLog;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zenrouter-gitlab-pat-"));
  vi.stubEnv("DATA_DIR", tempDir);
  delete global._dbAdapter;
  server = http.createServer((request, response) => {
    received.push({ path: request.url, method: request.method, headers: request.headers });
    if (request.url.startsWith("/redirect-")) {
      const kind = request.url.split("/")[1].slice("redirect-".length);
      const target = {
        public: `http://other.example:${server.address().port}/stolen`,
        private: `http://private.example:${server.address().port}/stolen`,
        metadata: `http://169.254.169.254:${server.address().port}/stolen`,
        same: "/stolen",
      }[kind];
      response.writeHead(307, { location: target });
      response.end();
      return;
    }
    if (request.url.startsWith("/failure-")) {
      response.writeHead(Number(request.url.split("/")[1].slice("failure-".length)), { "content-type": "text/plain" });
      response.end(`${UPSTREAM_SECRET}: ${PAT}`);
      return;
    }
    if (request.url.startsWith("/malformed/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(`${PAT} ${UPSTREAM_SECRET}`);
      return;
    }
    if (request.url.startsWith("/slow/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"username":');
      const timer = realSetTimeout(() => response.end('"slow-user","email":"slow@example.test"}'), 150);
      response.on("close", () => clearTimeout(timer));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(USER));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://public.example:${server.address().port}`;
  transport.port = server.address().port;
  actualUndici = await vi.importActual("undici");
  // The vulnerable route uses global fetch. Calibrate that transport too, so
  // RED can demonstrate unrestricted dispatch/redirects without ever probing an
  // actual private or metadata service. Every connection ends at this fixture.
  fallbackAgent = new actualUndici.Agent({
    connect(_options, callback) {
      const socket = net.connect({ host: "127.0.0.1", port: server.address().port });
      socket.once("connect", () => callback(null, socket));
      socket.once("error", (error) => callback(error));
    },
  });
  ({ POST } = await import("../../src/app/api/oauth/gitlab/pat/route.js"));
  ({ getProviderConnections, deleteProviderConnectionsByProvider } = await import("../../src/lib/db/index.js"));
});

beforeEach(async () => {
  vi.stubEnv("DATA_DIR", tempDir);
  vi.stubEnv("ZENROUTER_PEER_TOKEN", PEER_TOKEN);
  for (const name of ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"]) {
    vi.stubEnv(name, "");
  }
  received = [];
  transport.agents = [];
  lookup = vi.spyOn(dns.promises, "lookup").mockImplementation(async (host) => [{
    address: host === "private.example" ? "10.20.30.40" : "93.184.216.34",
    family: 4,
  }]);
  vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => actualUndici.fetch(url, { ...init, dispatcher: fallbackAgent }));
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  await deleteProviderConnectionsByProvider("gitlab");
});

afterEach(async () => {
  await Promise.all(transport.agents.map((agent) => agent.destroy()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await fallbackAgent?.destroy();
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  global._dbAdapter?.instance?.close?.();
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

function patRequest(baseUrl, { local = false, headers = {} } = {}) {
  return new Request("http://gateway.example/api/oauth/gitlab/pat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(local ? { "x-zen-real-ip": "127.0.0.1", "x-zen-peer-token": PEER_TOKEN } : {}),
      ...headers,
    },
    body: JSON.stringify({ token: `  ${PAT}  `, baseUrl }),
  });
}

async function expectNoConnection() {
  expect(await getProviderConnections({ provider: "gitlab" })).toEqual([]);
}

function loggedErrors() {
  return errorLog.mock.calls.flat().map((value) => value instanceof Error ? value.stack : String(value)).join("\n");
}

describe("GitLab PAT remote network boundary", () => {
  it.each([
    "http://127.0.0.1",
    "http://[::1]",
    "http://10.20.30.40",
    "http://169.254.169.254",
    "http://metadata.google.internal",
  ])("rejects %s before transport or persistence", async (target) => {
    const response = await POST(patRequest(target));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
    expect(received).toEqual([]);
    await expectNoConnection();
  });

  it("rejects a private DNS target before transport or persistence", async () => {
    const response = await POST(patRequest(`http://private.example:${server.address().port}`));
    expect(response.status).toBe(400);
    expect(received).toEqual([]);
    await expectNoConnection();
  });

  it("rejects mixed public/private DNS answers before transport or persistence", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.20.30.40", family: 4 }]);
    const response = await POST(patRequest(base));
    expect(response.status).toBe(400);
    expect(received).toEqual([]);
    await expectNoConnection();
  });

  it("persists the compatible PAT connection only after a pinned public probe", async () => {
    const response = await POST(patRequest(`${base}/gitlab/`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(received).toMatchObject([{ path: "/gitlab/api/v4/user", method: "GET", headers: { "private-token": PAT, accept: "application/json" } }]);
    const connections = await getProviderConnections({ provider: "gitlab" });
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      provider: "gitlab",
      authType: "oauth",
      accessToken: PAT,
      email: "fixture@example.test",
      displayName: "Fixture User",
      testStatus: "active",
      providerSpecificData: { username: "fixture-user", email: "fixture@example.test", name: "Fixture User", baseUrl: `${base}/gitlab`, authKind: "personal_access_token" },
    });
    expect(connections[0].refreshToken ?? null).toBeNull();
    expect(connections[0].expiresAt ?? null).toBeNull();
  });
});

describe("GitLab PAT trusted-local exception", () => {
  it.each(["literal", "dns"])("permits a trusted local private %s server", async (kind) => {
    const target = kind === "literal" ? `http://127.0.0.1:${server.address().port}` : `http://private.example:${server.address().port}`;
    const response = await POST(patRequest(target, { local: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(received).toMatchObject([{ path: "/api/v4/user", headers: { "private-token": PAT } }]);
    expect((await getProviderConnections({ provider: "gitlab" }))[0].providerSpecificData.baseUrl).toBe(target);
  });

  it.each([
    "http://169.254.169.254",
    "http://metadata.google.internal",
    "http://[fe80::a9fe:a9fe]",
    "http://[::ffff:169.254.169.254]",
    "http://[64:ff9b::a9fe:a9fe]",
    "http://[::169.254.169.254]",
    "http://[fd00:ec2::254]",
    "http://100.100.100.200",
  ])("denies metadata at %s even to a trusted local caller", async (target) => {
    const response = await POST(patRequest(target, { local: true }));
    expect(response.status).toBe(400);
    expect(received).toEqual([]);
    await expectNoConnection();
  });

  it.each(["169.254.169.254", "fd00:ec2::254", "100.100.100.200"])("denies a private DNS snapshot containing metadata %s locally", async (address) => {
    lookup.mockResolvedValue([{ address: "10.20.30.40", family: 4 }, { address, family: address.includes(":") ? 6 : 4 }]);
    const response = await POST(patRequest(base, { local: true }));
    expect(response.status).toBe(400);
    expect(received).toEqual([]);
    await expectNoConnection();
  });

  it.each([
    { host: "localhost", "x-forwarded-for": "127.0.0.1", "x-real-ip": "127.0.0.1" },
    { "x-zen-real-ip": "127.0.0.1", "x-zen-peer-token": "forged-peer", host: "localhost" },
    { "x-zen-real-ip": "203.0.113.8", "x-zen-peer-token": PEER_TOKEN, host: "localhost" },
    { "x-zen-real-ip": "127.0.0.1", "x-zen-peer-token": PEER_TOKEN, "x-zen-via-proxy": "1" },
    { "x-zen-real-ip": "127.0.0.1", "x-zen-peer-token": PEER_TOKEN, origin: "https://remote.example" },
  ])("does not grant local access from spoofed or proxied peer evidence %#", async (headers) => {
    const response = await POST(patRequest(`http://private.example:${server.address().port}`, { headers }));
    expect(response.status).toBe(400);
    expect(received).toEqual([]);
    await expectNoConnection();
  });
});

describe("GitLab PAT credential isolation and policy", () => {
  it.each([
    [false, "public"], [false, "private"], [false, "metadata"], [false, "same"],
    [true, "public"], [true, "private"], [true, "metadata"], [true, "same"],
  ])("refuses the redirect (local=%s, target=%s) without forwarding the PAT", async (local, target) => {
    const response = await POST(patRequest(`${base}/redirect-${target}`, { local }));
    expect(response.status).toBe(400);
    expect(received.map((request) => request.path)).toEqual([`/redirect-${target}/api/v4/user`]);
    expect(received[0].headers["private-token"]).toBe(PAT);
    await expectNoConnection();
  });

  it.each([false, true])("fails closed for unsupported configured egress (local=%s)", async (local) => {
    vi.stubEnv("HTTP_PROXY", "http://proxy-user:proxy-secret@proxy.example:8080");
    const response = await POST(patRequest(base, { local }));
    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result.error).toMatch(/proxy|NO_PROXY/i);
    expect(JSON.stringify(result)).not.toContain("proxy-secret");
    expect(received).toEqual([]);
    await expectNoConnection();
  });

  it.each([false, true])("honors an explicit NO_PROXY exemption (local=%s)", async (local) => {
    vi.stubEnv("HTTP_PROXY", "http://proxy.example:8080");
    vi.stubEnv("NO_PROXY", local ? "private.example" : "public.example");
    const target = local ? `http://private.example:${server.address().port}` : base;
    const response = await POST(patRequest(target, { local }));
    expect(response.status).toBe(200);
    expect(received.map((request) => request.path)).toEqual(["/api/v4/user"]);
    expect(await getProviderConnections({ provider: "gitlab" })).toHaveLength(1);
  });

  it.each([401, 500])("redacts the upstream HTTP %s body and persists nothing", async (status) => {
    const response = await POST(patRequest(`${base}/failure-${status}`));
    expect(response.status).toBe(401);
    const result = await response.json();
    expect(result.error).toMatch(/verification failed/i);
    expect(JSON.stringify(result)).not.toContain(UPSTREAM_SECRET);
    expect(JSON.stringify(result)).not.toContain(PAT);
    expect(loggedErrors()).not.toContain(UPSTREAM_SECRET);
    expect(loggedErrors()).not.toContain(PAT);
    await expectNoConnection();
  });

  it("does not expose malformed upstream JSON or PAT-bearing exception details", async () => {
    const response = await POST(patRequest(`${base}/malformed`));
    expect(response.ok).toBe(false);
    const result = JSON.stringify(await response.json());
    expect(result).not.toMatch(/glpat-fixt|upstream-user-private/);
    expect(loggedErrors()).not.toMatch(/glpat-fixt|upstream-user-private/);
    await expectNoConnection();
  });

  it("bounds an unresolved DNS lookup without dispatch or persistence", async () => {
    lookup.mockImplementation(() => new Promise(() => {}));
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) =>
      realSetTimeout(callback, delay >= 1000 && delay <= 60000 ? 5 : delay, ...args));
    const response = await POST(patRequest(base));
    expect(response.status).toBe(504);
    expect((await response.json()).error).toMatch(/timed out/i);
    expect(received).toEqual([]);
    await expectNoConnection();
  });

  it("bounds a response whose headers arrive but whose JSON body stalls", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) =>
      realSetTimeout(callback, delay >= 1000 && delay <= 60000 ? 5 : delay, ...args));
    const response = await POST(patRequest(`${base}/slow`));
    expect(response.status).toBe(504);
    expect((await response.json()).error).toMatch(/timed out/i);
    await expectNoConnection();
    expect(transport.agents.every((agent) => agent.destroyed)).toBe(true);
  });
});
