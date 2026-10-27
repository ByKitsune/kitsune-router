import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns";
import http from "node:http";

const transport = vi.hoisted(() => ({ lookups: [], agents: [] }));
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
          connect: {
            ...options?.connect,
            lookup(host, opts, callback) {
              // Calibrated socket fixture: only the selected public addresses are
              // mapped to the loopback server. Validation itself is never mocked.
              lookup(host, opts, (error, address, family) => {
                transport.lookups.push({ host, error, address, family });
                if (error) return callback(error);
                if (opts.all) {
                  return callback(null, address.map((entry) => ({ ...entry, address: "127.0.0.1", family: 4 })));
                }
                callback(null, "127.0.0.1", 4);
              });
            },
          },
        });
        transport.agents.push(this);
      }
    },
  };
});

import { assertPublicUrlResolved, fetchPublic } from "../../src/shared/utils/ssrfGuard.js";
import { POST } from "../../src/app/api/cli-tools/cowork-mcp-tools/route.js";

let server;
let base;
let received;
let globalFetch;
let lookup;

beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ path: request.url, method: request.method, headers: request.headers, body: Buffer.concat(chunks).toString() });
    if (request.url.startsWith("/mcp")) {
      const message = JSON.parse(Buffer.concat(chunks).toString());
      if (request.url === "/mcp-metadata-redirect") {
        response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
        response.end();
        return;
      }
      if (request.url === "/mcp-redirect" ||
          (request.url === "/mcp-notification-redirect" && message.method === "notifications/initialized") ||
          (request.url === "/mcp-list-redirect" && message.method === "tools/list")) {
        response.writeHead(307, { location: `http://private.example:${server.address().port}/secret` });
        response.end();
      } else {
        response.writeHead(200, { "content-type": "application/json", "mcp-session-id": "session" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "safe_tool", description: "Public tool" }] } }));
      }
      return;
    }
    if (request.url === "/private-redirect") {
      response.writeHead(302, { location: `http://private.example:${server.address().port}/secret` });
      response.end("redirect");
    } else if (request.url === "/cross-origin") {
      response.writeHead(307, { location: `http://other.example:${server.address().port}/secret` });
      response.end();
    } else if (request.url === "/post-redirect") {
      response.writeHead(302, { location: "/echo" });
      response.end();
    } else if (request.url === "/stream") {
      response.writeHead(200);
      response.write("first");
      const timer = setTimeout(() => response.end("last"), 50);
      response.on("close", () => clearTimeout(timer));
    } else {
      response.end("public response");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://public.example:${server.address().port}`;
});

beforeEach(() => {
  for (const name of ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"]) {
    vi.stubEnv(name, "");
  }
  received = [];
  transport.lookups = [];
  transport.agents = [];
  lookup = vi.spyOn(dns.promises, "lookup").mockImplementation(async (host) => [{ address: host === "private.example" ? "127.0.0.1" : "93.184.216.34", family: 4 }]);
  globalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unpinned global fetch reached"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("public fetch pins the validated DNS snapshot", () => {
  it("uses only the first public DNS answer even when the next lookup is private", async () => {
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const response = await fetchPublic(`${base}/echo`);
    expect(await response.text()).toBe("public response");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
    const selected = transport.lookups.flatMap((entry) => typeof entry.address === "string" ? [{ address: entry.address, family: entry.family }] : entry.address);
    expect(selected).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(received[0].headers.host).toBe(new URL(base).host);
    expect(transport.agents.every((agent) => agent.closed)).toBe(true);
  });

  it("rejects mixed public/private DNS answers before opening a socket", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "::ffff:127.0.0.1", family: 6 }]);
    await expect(fetchPublic(`${base}/secret`)).rejects.toThrow(/Blocked URL/);
    expect(received).toEqual([]);
    expect(transport.lookups).toEqual([]);
  });

  it("fails closed on DNS failure and preserves the void validation API", async () => {
    await expect(assertPublicUrlResolved(base)).resolves.toBeUndefined();
    lookup.mockRejectedValue(new Error("DNS unavailable"));
    await expect(fetchPublic(base)).rejects.toThrow(/Blocked URL/);
    expect(received).toEqual([]);
  });

  it("refuses a redirect resolving privately without dispatching the next request", async () => {
    await expect(fetchPublic(`${base}/private-redirect`)).rejects.toThrow(/Blocked URL/);
    expect(received.map((entry) => entry.path)).toEqual(["/private-redirect"]);
    expect(transport.agents.every((agent) => agent.closed)).toBe(true);
  });

  it("rejects redirects in credential-sensitive maxRedirects zero mode", async () => {
    await expect(fetchPublic(`${base}/private-redirect`, { headers: { authorization: "Bearer secret" } }, { maxRedirects: 0 })).rejects.toThrow(/redirect/);
    expect(received.map((entry) => entry.path)).toEqual(["/private-redirect"]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(transport.agents.every((agent) => agent.closed)).toBe(true);
  });

  it("does not forward a POST body on a cross-origin 307", async () => {
    await expect(fetchPublic(`${base}/cross-origin`, { method: "POST", body: "secret", headers: { authorization: "Bearer secret" } })).rejects.toThrow(/Blocked URL/);
    expect(received.map((entry) => entry.path)).toEqual(["/cross-origin"]);
  });

  it("strips credentials from a cross-origin GET redirect", async () => {
    const response = await fetchPublic(`${base}/cross-origin`, { headers: { authorization: "Bearer secret", cookie: "secret=1" } });
    await response.text();
    expect(received[1].headers.authorization).toBeUndefined();
    expect(received[1].headers.cookie).toBeUndefined();
  });

  it("applies normal POST to GET semantics on a same-origin 302", async () => {
    const response = await fetchPublic(`${base}/post-redirect`, { method: "POST", body: "payload", headers: { "content-type": "text/plain" } });
    await response.text();
    expect(received[1]).toMatchObject({ path: "/echo", method: "GET", body: "" });
    expect(received[1].headers["content-type"]).toBeUndefined();
  });

  it("keeps the response stream alive until consumed, then closes its agent", async () => {
    const response = await fetchPublic(`${base}/stream`);
    expect(transport.agents[0].closed).toBe(false);
    expect(transport.agents[0].destroyed).toBe(false);
    expect(await response.text()).toBe("firstlast");
    expect(transport.agents[0].closed).toBe(true);
  });

  it("releases the agent when the caller cancels a response", async () => {
    const response = await fetchPublic(`${base}/stream`);
    await response.body.cancel();
    expect(transport.agents[0].closed).toBe(true);
  });

  it("destroys the agent when an active response is aborted", async () => {
    const controller = new AbortController();
    const response = await fetchPublic(`${base}/stream`, { signal: controller.signal });
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
    controller.abort();
    await expect(reader.read()).rejects.toThrow();
    expect(transport.agents[0].destroyed).toBe(true);
  });

  it("ignores a caller dispatcher that would bypass the pinned socket", async () => {
    const dispatcher = { dispatch: vi.fn(() => { throw new Error("unsafe dispatcher"); }) };
    const response = await fetchPublic(`${base}/echo`, { dispatcher });
    expect(await response.text()).toBe("public response");
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});

function mcpRequest(url, local = false) {
  return new Request("http://gateway.example/api/cli-tools/cowork-mcp-tools", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(local ? { "x-kitsune-router-real-ip": "127.0.0.1", "x-kitsune-router-peer-token": process.env.KITSUNE_ROUTER_PEER_TOKEN } : {}),
    },
    body: JSON.stringify({ url }),
  });
}

describe("MCP public network boundary", () => {
  it("blocks an initially private DNS answer without a request", async () => {
    const response = await POST(mcpRequest(`http://private.example:${server.address().port}/mcp`));
    expect((await response.json()).error).toMatch(/Blocked URL|URL not allowed/);
    expect(received).toEqual([]);
  });

  it.each(["/mcp-redirect", "/mcp-notification-redirect", "/mcp-list-redirect"])("guards redirect targets during %s", async (path) => {
    const response = await POST(mcpRequest(`${base}${path}`));
    expect((await response.json()).error).toMatch(/Blocked URL/);
    expect(received.every((entry) => entry.path === path)).toBe(true);
    expect(received.some((entry) => entry.path === "/secret")).toBe(false);
  });

  it("pins every handshake and returns public tools", async () => {
    const response = await POST(mcpRequest(`${base}/mcp`));
    expect(await response.json()).toEqual({ tools: [{ name: "safe_tool", description: "Public tool" }] });
    expect(received.map((entry) => JSON.parse(entry.body).method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(transport.agents.every((agent) => agent.closed)).toBe(true);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("preserves private MCP access for a trusted local peer", async () => {
    vi.stubEnv("KITSUNE_ROUTER_PEER_TOKEN", "fixture-trusted-peer");
    try {
      const response = await POST(mcpRequest(`http://127.0.0.1:${server.address().port}/mcp`, true));
      expect(await response.json()).toEqual({ tools: [{ name: "safe_tool", description: "Public tool" }] });
      expect(received.map((entry) => JSON.parse(entry.body).method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
      expect(lookup).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects metadata targets even for a trusted local peer", async () => {
    vi.stubEnv("KITSUNE_ROUTER_PEER_TOKEN", "fixture-trusted-peer");
    try {
      const response = await POST(mcpRequest("http://169.254.169.254/latest/meta-data", true));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "URL not allowed" });
      expect(received).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects a metadata DNS answer for a trusted local peer before dispatch", async () => {
    vi.stubEnv("KITSUNE_ROUTER_PEER_TOKEN", "fixture-trusted-peer");
    lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    try {
      const response = await POST(mcpRequest(`${base}/mcp`, true));
      const result = await response.json();
      expect(result.error).toBeDefined();
      expect(result.tools).toEqual([]);
      expect(received).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects a metadata redirect from a trusted local MCP server", async () => {
    vi.stubEnv("KITSUNE_ROUTER_PEER_TOKEN", "fixture-trusted-peer");
    try {
      const response = await POST(mcpRequest(`http://127.0.0.1:${server.address().port}/mcp-metadata-redirect`, true));
      expect((await response.json()).error).toMatch(/Blocked URL/);
      expect(received.map((entry) => entry.path)).toEqual(["/mcp-metadata-redirect"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses a configured proxy rather than silently connecting local MCP directly", async () => {
    vi.stubEnv("KITSUNE_ROUTER_PEER_TOKEN", "fixture-trusted-peer");
    vi.stubEnv("HTTP_PROXY", "http://proxy.example:8080");
    const response = await POST(mcpRequest(`${base}/mcp`, true));
    expect((await response.json()).error).toMatch(/configure NO_PROXY/);
    expect(received).toEqual([]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("permits a trusted private MCP DNS target explicitly exempted by NO_PROXY", async () => {
    vi.stubEnv("KITSUNE_ROUTER_PEER_TOKEN", "fixture-trusted-peer");
    vi.stubEnv("HTTP_PROXY", "http://proxy.example:8080");
    vi.stubEnv("NO_PROXY", "private.example");
    const response = await POST(mcpRequest(`http://private.example:${server.address().port}/mcp`, true));
    expect(await response.json()).toEqual({ tools: [{ name: "safe_tool", description: "Public tool" }] });
    expect(received.map((entry) => JSON.parse(entry.body).method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
  });
});
