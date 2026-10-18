import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns";
import http from "node:http";

const transport = vi.hoisted(() => ({ lookups: [] }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body, init) => Response.json(body, init) },
}));
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, Agent: class extends actual.Agent {
    constructor(options) {
      const lookup = options.connect.lookup;
      super({ ...options, connect: { ...options.connect, lookup(host, opts, callback) {
        lookup(host, opts, (error, address, family) => {
          transport.lookups.push({ host, error, address, family });
          if (error) return callback(error);
          // Only the transport destination changes; the real guard must first
          // accept and pin the fixture's public DNS answer.
          if (opts.all) return callback(null, address.map((entry) => ({ ...entry, address: "127.0.0.1", family: 4 })));
          callback(null, "127.0.0.1", 4);
        });
      } } });
    }
  } };
});

import { POST } from "../../src/app/api/provider-nodes/validate/route.js";
import { GET } from "../../src/app/api/providers/suggested-models/route.js";

const TOKEN = "fixture-probe-secret";
const TYPES = ["openai-compatible", "anthropic-compatible", "custom-embedding"];
let server;
let origin;
let received;
let lookup;
let unsafeFetch;

beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume only synthetic request data */ }
    received.push({ path: request.url, headers: request.headers });
    if (request.url.startsWith("/redirect/")) {
      response.writeHead(307, { location: `http://private.example:${server.address().port}/stolen` });
      response.end();
    } else if (request.url === "/fallback/models") {
      response.writeHead(404);
      response.end();
    } else if (request.url === "/error/embeddings") {
      response.writeHead(500);
      response.end(`upstream echoed ${TOKEN}`);
    } else if (request.url === "/large") {
      response.end(JSON.stringify({ data: [], padding: "x".repeat(9 * 1024 * 1024) }));
    } else if (request.url.endsWith("/embeddings")) {
      response.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
    } else {
      response.end(JSON.stringify({ data: [{ id: "fixture", name: "Fixture", pricing: { prompt: "0", completion: "0" }, context_length: 250000 }] }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://public.example:${server.address().port}`;
});

beforeEach(() => {
  for (const name of ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(name, "");
  vi.stubEnv("ZENROUTER_PEER_TOKEN", "fixture-probe-peer");
  received = [];
  transport.lookups = [];
  lookup = vi.spyOn(dns.promises, "lookup").mockImplementation(async (host) => [{ address: host === "private.example" ? "127.0.0.1" : "93.184.216.34", family: 4 }]);
  unsafeFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unpinned global fetch reached"));
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

function headers(local) {
  return { "content-type": "application/json", ...(local ? {
    "x-zen-real-ip": "127.0.0.1", "x-zen-peer-token": "fixture-probe-peer",
  } : {}) };
}
function probe(url, type = TYPES[0], local = false) {
  return POST(new Request("http://gateway.example/api/provider-nodes/validate", {
    method: "POST", headers: headers(local), body: JSON.stringify({ baseUrl: url, apiKey: TOKEN, type, modelId: "fixture" }),
  }));
}
function catalog(url, local = false) {
  return GET(new Request(`http://gateway.example/api/providers/suggested-models?${new URLSearchParams({ url, type: "openrouter-free" })}`, { headers: headers(local) }));
}

describe("provider validation uses a pinned, bounded transport", () => {
  it.each(TYPES)("pins public DNS for %s without a second lookup", async (type) => {
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const response = await probe(origin, type);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ valid: true, ...(type === "custom-embedding" ? { dimensions: 3 } : {}) });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(transport.lookups[0].address).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(received).toHaveLength(1);
    expect(unsafeFetch).not.toHaveBeenCalled();
  });

  it.each(TYPES)("rejects mixed public/private DNS before %s sends credentials", async (type) => {
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "::ffff:127.0.0.1", family: 6 }]);
    expect((await probe(origin, type)).status).toBe(400);
    expect(received).toEqual([]);
    expect(transport.lookups).toEqual([]);
  });

  it.each(TYPES)("rejects redirects for %s before reaching a private host", async (type) => {
    expect((await probe(`${origin}/redirect`, type)).status).toBe(400);
    expect(received).toHaveLength(1);
    expect(received[0].path).not.toBe("/stolen");
  });

  it.each(TYPES.slice(0, 2))("preserves the chat fallback for %s", async (type) => {
    const response = await probe(`${origin}/fallback`, type);
    expect(await response.json()).toMatchObject({ valid: true, method: "chat" });
    expect(received.map((entry) => entry.path)).toEqual(["/fallback/models", "/fallback/chat/completions"]);
    expect(unsafeFetch).not.toHaveBeenCalled();
  });

  it("does not reflect a credential-bearing upstream error body", async () => {
    const response = await probe(`${origin}/error`, "custom-embedding");
    const result = await response.json();
    expect(result.valid).toBe(false);
    expect(result.error).toContain("500");
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("preserves loopback providers only for authenticated local peers", async () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    expect((await probe(url)).status).toBe(400);
    expect((await (await probe(url, TYPES[0], true)).json()).valid).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
    expect(received).toHaveLength(1);
  });

  it("blocks metadata DNS even for an authenticated local peer", async () => {
    lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    expect((await probe(origin, TYPES[0], true)).status).toBe(400);
    expect(received).toEqual([]);
  });
});

describe("suggested catalogs use the same network boundary", () => {
  it("pins a public catalog and retains filtering", async () => {
    const response = await catalog(`${origin}/models`);
    expect(await response.json()).toEqual({ data: [{ id: "fixture", name: "Fixture", contextLength: 250000 }] });
    expect(received).toHaveLength(1);
    expect(transport.lookups).toHaveLength(1);
    expect(unsafeFetch).not.toHaveBeenCalled();
  });

  it.each(["127.0.0.1", "::ffff:127.0.0.1", "169.254.169.254"])("rejects catalog DNS target %s before the socket", async (address) => {
    lookup.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
    expect((await catalog(`${origin}/models`)).status).toBe(400);
    expect(received).toEqual([]);
    expect(transport.lookups).toEqual([]);
  });

  it("blocks a redirect from a public catalog to private DNS", async () => {
    expect((await catalog(`${origin}/redirect/catalog`)).status).toBe(400);
    expect(received.map((entry) => entry.path)).toEqual(["/redirect/catalog"]);
  });

  it("preserves a trusted local catalog while rejecting metadata", async () => {
    expect((await (await catalog(`http://127.0.0.1:${server.address().port}/models`, true)).json()).data).toHaveLength(1);
    lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    expect((await catalog(`${origin}/models`, true)).status).toBe(400);
    expect(received).toHaveLength(1);
  });

  it("refuses oversized catalogs rather than buffering them without limit", async () => {
    const response = await catalog(`${origin}/large`);
    expect(await response.json()).toEqual({ data: [] });
    expect(received).toHaveLength(1);
    expect(unsafeFetch).not.toHaveBeenCalled();
  });
});
