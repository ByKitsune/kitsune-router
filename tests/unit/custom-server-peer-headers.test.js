// custom-server.js is the only thing that makes x-kitsune-router-real-ip trustworthy. Boot a real
// HTTP server through it and confirm a client cannot smuggle its own peer headers in.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

let server;
let baseUrl;
let seenHeaders;
let directory;
let requestDetails;
let checkLock;
let getClientIp;
let recordFail;
let recordSuccess;
let isLocalRequest;

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-router-peer-headers-"));
  vi.stubEnv("HOME", directory);
  vi.stubEnv("DATA_DIR", path.join(directory, "data"));
  vi.stubEnv("NINEROUTER_PEER_TOKEN", undefined);
  vi.stubEnv("KITSUNE_ROUTER_PEER_TOKEN", undefined);
  // custom-server has its own .env loader independent of Vitest's envDir.
  // Exercise its real HTTP wrapper without opening any repository .env file.
  const exists = fs.existsSync;
  const envFile = vi.spyOn(fs, "existsSync").mockImplementation(file =>
    path.basename(String(file)) === ".env" ? false : exists(file));
  try { require("../../custom-server.js"); }
  finally { envFile.mockRestore(); }
  ({ __test__: requestDetails } = await import("@/lib/db/repos/requestDetailsRepo.js"));
  ({ checkLock, getClientIp, recordFail, recordSuccess } = await import("@/lib/auth/loginLimiter.js"));
  ({ isLocalRequest } = await import("@/dashboardGuard.js"));
  server = http.createServer((req, res) => {
    seenHeaders = req.headers;
    res.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
  } finally {
    vi.unstubAllEnvs();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function get(headers = {}) {
  await fetch(baseUrl, { headers });
  return seenHeaders;
}

describe("custom-server peer header sanitizing", () => {
  it("generates only the canonical peer trust token at boot", () => {
    expect(process.env.KITSUNE_ROUTER_PEER_TOKEN).toMatch(/^[0-9a-f]{48}$/);
    expect(process.env.NINEROUTER_PEER_TOKEN).toBeUndefined();
  });

  it("replaces a client-supplied x-kitsune-router-real-ip with the socket address", async () => {
    const headers = await get({ "x-kitsune-router-real-ip": "203.0.113.55" });

    expect(headers["x-kitsune-router-real-ip"]).toMatch(/^(::ffff:)?127\.0\.0\.1$/);
  });

  it("stamps the trust token so downstream can tell the wrapper ran", async () => {
    const headers = await get();

    expect(headers["x-kitsune-router-peer-token"]).toBe(process.env.KITSUNE_ROUTER_PEER_TOKEN);
  });

  it("drops a client-supplied peer trust token", async () => {
    const headers = await get({ "x-kitsune-router-peer-token": "forged-token" });

    expect(headers["x-kitsune-router-peer-token"]).toBe(process.env.KITSUNE_ROUTER_PEER_TOKEN);
    expect(headers["x-kitsune-router-peer-token"]).not.toBe("forged-token");
  });

  it("drops a client-supplied x-kitsune-router-via-proxy marker", async () => {
    const headers = await get({ "x-kitsune-router-via-proxy": "1" });

    expect(headers["x-kitsune-router-via-proxy"]).toBeUndefined();
  });

  it("marks via-proxy and adopts the forwarded IP for a loopback proxy hop", async () => {
    const headers = await get({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });

    expect(headers["x-kitsune-router-via-proxy"]).toBe("1");
    // Rightmost hop: appended by the trusted loopback proxy itself. The
    // leftmost entry is client-controlled and must not key rate limits
    // (a tunnel client could otherwise rotate its bucket at will).
    expect(headers["x-kitsune-router-real-ip"]).toBe("10.0.0.1");
    expect(headers["x-forwarded-for"]).toBeUndefined();
  });

  it("does not trust a lone X-Real-IP or grant a proxy request local privileges", async () => {
    const headers = await get({ "x-real-ip": "203.0.113.42" });
    expect(headers["x-kitsune-router-real-ip"]).toMatch(/^(::ffff:)?127\.0\.0\.1$/);
    expect(headers["x-real-ip"]).toBeUndefined();
    expect(headers["x-kitsune-router-via-proxy"]).toBe("1");
    expect(isLocalRequest(new Request(baseUrl, { headers }))).toBe(false);
  });

  it("keeps login lockout in the same bucket when lone X-Real-IP values rotate", async () => {
    const first = getClientIp(new Request(baseUrl, {
      headers: await get({ "x-real-ip": "203.0.113.50" }),
    }));
    const second = getClientIp(new Request(baseUrl, {
      headers: await get({ "x-real-ip": "203.0.113.51" }),
    }));
    recordSuccess(first);
    recordSuccess(second);
    try {
      for (let attempt = 0; attempt < 5; attempt++) recordFail(first);
      expect(checkLock(second).locked).toBe(true);
    } finally {
      recordSuccess(first);
      recordSuccess(second);
    }
  });

  it("rejects an invalid rightmost forwarded address instead of trusting another field", async () => {
    const headers = await get({
      "x-forwarded-for": "203.0.113.70, not-an-ip",
      "x-real-ip": "203.0.113.71",
    });
    expect(headers["x-kitsune-router-real-ip"]).toMatch(/^(::ffff:)?127\.0\.0\.1$/);
    expect(headers["x-kitsune-router-via-proxy"]).toBe("1");
  });

  it("preserves an IPv6 address appended by the loopback proxy", async () => {
    const headers = await get({ "x-forwarded-for": "203.0.113.80, 2001:db8::80" });
    expect(headers["x-kitsune-router-real-ip"]).toBe("2001:db8::80");
  });

  // chat.js snapshots every client header into the request detail. Anything that grants
  // access must not survive into a record the dashboard renders and cloud sync uploads.
  it("keeps the peer token out of persisted request details", () => {
    const sanitized = requestDetails.sanitizeHeaders({
      "x-kitsune-router-peer-token": "secret",
      "x-kitsune-router-cli-token": "secret",
      "x-kitsune-router-password": "synthetic-export-password",
      "authorization": "Bearer sk-x",
      "x-kitsune-router-real-ip": "127.0.0.1",
    });

    expect(sanitized["x-kitsune-router-peer-token"]).toBeUndefined();
    expect(sanitized["x-kitsune-router-cli-token"]).toBeUndefined();
    expect(sanitized["x-kitsune-router-password"]).toBeUndefined();
    expect(sanitized["authorization"]).toBeUndefined();
    expect(sanitized["x-kitsune-router-real-ip"]).toBe("127.0.0.1");
  });
});
