import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import https from "node:https";
import tls from "node:tls";
import selfsigned from "selfsigned";

/**
 * Bug: the MITM DNS bypass branch in `createBypassRequest` returned response
 * headers as a bare Map and omitted `arrayBuffer()`. Downstream code passes
 * the headers straight into `new Response(...)` (github.js, combo.js, codex.js)
 * — Map is not a valid HeadersInit, so the call throws on every Cursor /
 * GitHub Copilot / Antigravity call when DNS bypass is hit. The Cursor
 * executor also calls `response.arrayBuffer()` directly.
 *
 * These tests drive `createBypassRequest` against a local HTTPS server with
 * a self-signed cert. Fixtures opt out per request or inject a trusted fixture CA
 * at the TLS boundary; public-CA verification remains enabled process-wide.
 */

const HOST = "127.0.0.1";

// Throwaway self-signed cert (CN=zenrouter-test-localhost) generated for this
// fixture only. Accepted solely by explicit per-request fixture options;
// never use these files anywhere else.
const TEST_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEugIBADANBgkqhkiG9w0BAQEFAASCBKQwggSgAgEAAoIBAQCW0mdEKSJYE15a
hC7wLYeCvP3M0Q2p5bQCbUeGqZfXdZTF7UrYG7K9MRWOAo0vXACWmzVD7ZRo5Y4n
NIH76+I2Gooayz+UuDwcbPKs4mDPTzCr1PenMEzCMd4wZMMEM/7Sl5RCnwXPrk/d
+iLyHi/JT1wdEpRjac9p5YZYXjdOzVpyumiX1OhRKa8YB+R3Oe7g2NzCPWrYH6x5
0aJL17H5T6ECDtHnId2EMNro+7+jkTXDOsR4/0dYv2Tb+vacUIR4fOPdR3XlMbQY
VrLR7Ws+IRZx1YkFVqpQx+WGZJrkr4IqwqRb5Gj3g4jF82VbyHtr3SYk805pR5Fv
lWG33JR5AgMBAAECgf9mbKu0ov4223LIpCXtJKE/nI3EZUvBnKO6GXf3VCc+kbwH
cfUE85v19yew4vy9gK+NKFN9HTzySktgQf37BRXXSzytbpa6l2gfPjrxuWlnKGm2
wQ/U87JgVIIXDDrrPhCczovFPkLimNbFADrzGxP3Db93Tg+T2ke7tXynnc1KJX2n
8P+Jn/O5037ikx15ZoSwsXkXWrIboF46iYvGeZXZQfeO7oaNBP8mV6/sixVgrhkO
9Z6npKn69uxR3GrfPO9++xgAy2D5ZxHHo9IyIqD4c7swfdViLGr0aqpcNV2LhiUp
Nul9fXnvr76HWf4R3r1sILA8p6JZTSbgfm5XzZkCgYEAxgHNj917UeXAt2sf9gbb
M6YaXl8iYfDGRbde2lu3G8fKCIrxH597PcgxGXUC/Z/Qd6SZRJUVQiJbV78bM5uQ
CUMeZprDNKY5AUs8HXwwMAtrYvyYG/UI88TtheBhfNO8i80QxXPu0ZasGw8qScWA
J0Zu/LmfZat60HRZ7Sa2dnMCgYEAwv6+9XIcOf4hIa22dI0q9syH56c6gwd74TeA
+yYfp3C/v9neY7AJtNmC/ofRocoqP96/ShwY9xhqwK/Fq6YSUGpy0ySyJJ5c7Kfq
jUb4rwxVJJdy23GjdsW9AEPO8KXjMcGkl0u2AIdy6Z9FouQt3Ozk3oIIwr7io7KB
AyhIomMCgYBj5jr5L6xtWHaP08tvTGxBtbcuD99//IN8XxTLJGTQ7k7fWoJnCwaZ
2Cv1hRS6M2xxQKlXccQk9sKRFck6k2zrT2LCL6j3Ijo2jefJlIOXaduHOJvh1xHq
M1wHJHrrCMTi39ZrWJ+QPO2eRVt3lt6ecinC9kAWgprXGyzXuqVqQwKBgA+dVq1Q
9fGu5/hKcNHkfAxHVJq4SXc0ojbmuu1hoCdIYBJ839Ibxqs0v8iiF6ddCQUUUT0e
AuHGksXbTXjxU4YdABToW1uTUt2glKe7hy59TlQfzJLGBtD8BKaAx5F9tzPEzelP
psNkFU+f8XOZ0hJe5fTrdMgjgQKayLn3/9kBAoGAGIMkAIKy36wtY4mpFg53lWlj
EBAY6qL6Cm+iLPCaQLLdmGgdbAKYvP5y9OwIpfiBBgVMM1UuHEi6y6HB5KwifPWn
7OsCNXJYCOJtrmQm8ndYm9fPo+/MvAqkG5ijAHkQmqjHQwNXAOdLKicIvy6jqTza
hW/ml3d8rgLnvp7WAYc=
-----END PRIVATE KEY-----
`;
const TEST_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDIzCCAgugAwIBAgIUDUjm/n2V5y6WvqOHCJbMS0XLWvAwDQYJKoZIhvcNAQEL
BQAwITEfMB0GA1UEAwwWOXJvdXRlci10ZXN0LWxvY2FsaG9zdDAeFw0yNjA4MjUx
MTE1MjNaFw0zNjA4MjIxMTE1MjNaMCExHzAdBgNVBAMMFjlyb3V0ZXItdGVzdC1s
b2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCW0mdEKSJY
E15ahC7wLYeCvP3M0Q2p5bQCbUeGqZfXdZTF7UrYG7K9MRWOAo0vXACWmzVD7ZRo
5Y4nNIH76+I2Gooayz+UuDwcbPKs4mDPTzCr1PenMEzCMd4wZMMEM/7Sl5RCnwXP
rk/d+iLyHi/JT1wdEpRjac9p5YZYXjdOzVpyumiX1OhRKa8YB+R3Oe7g2NzCPWrY
H6x50aJL17H5T6ECDtHnId2EMNro+7+jkTXDOsR4/0dYv2Tb+vacUIR4fOPdR3Xl
MbQYVrLR7Ws+IRZx1YkFVqpQx+WGZJrkr4IqwqRb5Gj3g4jF82VbyHtr3SYk805p
R5FvlWG33JR5AgMBAAGjUzBRMB0GA1UdDgQWBBSUCMODK9/VBKFUZXoZ3ZWd32Nb
TDAfBgNVHSMEGDAWgBSUCMODK9/VBKFUZXoZ3ZWd32NbTDAPBgNVHRMBAf8EBTAD
AQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAhXqKc1IC6Pqmu7fKUG8Wx9fE+p6dudSGb
C6Ysr/AYEgi4RwMTad3Fomm0cW3Uz5d1Cx9V4nCG0I8dHY1877t/vCciBDVojy7G
1A8bDpmUwTlW0QqI/qBOmJpUWSix+cZbpXqrRBF/5ZQmnedQUtIt4+Ulwpa2g5Xg
C8SZ21HmPjTRvGuxMJdTg9SgFDdk7fQhdrGUaXMCIAlkfT9VS2kiggB6WRgr27+O
roAxR0RQMIRrem84F725HvYdEH63AYrHQ45PHpoER2hvhxjuspSOJnIgq6P3Vej8
E7QOq7UAgY3Pgcu/QoIPP3ccbN2MG9IjIVfXoyUjlQqlYx3/YhZ/
-----END CERTIFICATE-----
`;

function startServer(handler) {
  return new Promise((resolve) => {
    const sockets = new Set();
    // Snakeoil cert — accepted only by this fixture request's TLS options.
    const server = https.createServer({ key: TEST_TLS_KEY, cert: TEST_TLS_CERT }, handler);
    server.on("connection", (sock) => {
      sockets.add(sock);
      sock.on("close", () => sockets.delete(sock));
    });
    server.listen(0, HOST, () => {
      const { port } = server.address();
      resolve({
        port,
        close: () =>
          new Promise((res) => {
            for (const s of sockets) s.destroy();
            server.close(() => res());
          }),
      });
    });
  });
}

describe("proxyFetch MITM bypass — response shape (#3514)", () => {
  let server;
  let __testing;
  let prevEnv;

  beforeAll(async () => {
    prevEnv = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
    };
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET ||= "test-jwt-secret-please-do-not-use-in-prod-0123456789";

    server = await startServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const payload = JSON.stringify({ received: body.length, ok: true });
        res.writeHead(200, {
          "Content-Type": "application/json",
          "X-Custom-Header": "test-value",
          "Set-Cookie": ["a=1", "b=2"],
        });
        res.end(payload);
      });
    });

    const mod = await import("open-sse/utils/proxyFetch.js");
    __testing = mod.__testing;
  });

  afterAll(async () => {
    if (server) await server.close();
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("rejects the self-signed fixture unless explicitly opted out per request", async () => {
    const url = new URL(`https://${HOST}:${server.port}/untrusted`);
    await expect(__testing.createBypassRequest(url, HOST, { method: "POST" }))
      .rejects.toThrow(/self-signed|certificate/i);
  });

  it("returns a real Headers instance usable with `new Response(...)`", async () => {
    const url = new URL(`https://${HOST}:${server.port}/v1/messages`);
    const res = await __testing.createBypassRequest(url, HOST, { method: "POST", body: "ping", rejectUnauthorized: false });

    expect(res.headers).toBeInstanceOf(Headers);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-custom-header")).toBe("test-value");

    // Constructing a Response must not throw — this is the exact shape the
    // GitHub executor / combo.js / codex.js handlers hand back. A bare Map
    // throws "Invalid header object" inside the Response constructor.
    expect(() => new Response("body", { headers: res.headers })).not.toThrow();
    await res.text();
  });

  it("exposes arrayBuffer() for callers like the Cursor executor", async () => {
    const url = new URL(`https://${HOST}:${server.port}/v1/chat`);
    const res = await __testing.createBypassRequest(url, HOST, { method: "POST", body: "hi", rejectUnauthorized: false });
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(JSON.parse(buf.toString())).toEqual({ received: 2, ok: true });
  });

  it("text() and json() agree on the same bytes", async () => {
    const url = new URL(`https://${HOST}:${server.port}/v1/models`);
    const res = await __testing.createBypassRequest(url, HOST, { method: "POST", rejectUnauthorized: false });
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ received: 0, ok: true });
  });

  it("preserves multi-value headers (e.g. Set-Cookie)", async () => {
    const url = new URL(`https://${HOST}:${server.port}/v1/messages`);
    const res = await __testing.createBypassRequest(url, HOST, { method: "POST", rejectUnauthorized: false });
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")];
    expect(cookies).toEqual(expect.arrayContaining(["a=1", "b=2"]));
    await res.text();
  });

  it("honors AbortSignal by destroying the in-flight socket", async () => {
    // Hang the server: never respond.
    const hanging = await startServer(() => { /* hang */ });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const url = new URL(`https://${HOST}:${hanging.port}/hang`);
    await expect(
      __testing.createBypassRequest(url, HOST, {
        method: "POST",
        body: "x",
        signal: controller.signal,
        rejectUnauthorized: false,
      })
    ).rejects.toThrow();

    await hanging.close();
  });

  it("keeps caller cancellation attached through a real pinned-DNS TLS response body", async () => {
    const hanging = await startServer((_req, res) => res.write("first"));
    const ctrl = new AbortController();
    try {
      const response = await __testing.createBypassRequest(new URL(`https://pinned.fixture.invalid:${hanging.port}/stream`), HOST, {
        signal: ctrl.signal, rejectUnauthorized: false,
      });
      const reader = response.body.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
      const pending = expect(reader.read()).rejects.toThrow();
      ctrl.abort(new Error("caller stopped bypass body"));
      await pending;
      reader.releaseLock();
    } finally { await hanging.close(); }
  });

  it("enforces a full-body deadline after headers, not just an idle connect timeout", async () => {
    const hanging = await startServer((_req, res) => res.write("first"));
    try {
      const response = await __testing.createBypassRequest(new URL(`https://${HOST}:${hanging.port}/deadline`), HOST, {
        rejectUnauthorized: false, requestTimeoutMs: 100,
      });
      await expect(response.text()).rejects.toThrow(/deadline/);
    } finally { await hanging.close(); }
  });

  it("rejects a pre-header deadline without an unhandled socket error or pending promise", async () => {
    const hanging = await startServer(() => {});
    try {
      await expect(__testing.createBypassRequest(new URL(`https://${HOST}:${hanging.port}/deadline`), HOST, {
        rejectUnauthorized: false, requestTimeoutMs: 100,
      })).rejects.toThrow(/deadline/);
    } finally { await hanging.close(); }
  });

  it("returns a cancellable standard Response and explicitly reports bypass as unpooled", async () => {
    const hanging = await startServer((_req, res) => res.write("body"));
    const { getUpstreamPoolStats } = await import("open-sse/utils/proxyFetch.js");
    const previousDeadline = Date.now() + 1000;
    while (getUpstreamPoolStats().excluded.mitmBypass.active && Date.now() < previousDeadline) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    try {
      const response = await __testing.createBypassRequest(new URL(`https://${HOST}:${hanging.port}/cancel`), HOST, { rejectUnauthorized: false });
      expect(response).toBeInstanceOf(Response);
      expect(getUpstreamPoolStats().excluded.mitmBypass).toMatchObject({ pooled: false, active: 1 });
      await response.body.cancel();
      const deadline = Date.now() + 1000;
      while (getUpstreamPoolStats().excluded.mitmBypass.active && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      expect(getUpstreamPoolStats().excluded.mitmBypass.active).toBe(0);
    } finally { await hanging.close(); }
  });

  it("pins the dial to the chosen IP but verifies the requested hostname and sends its SNI", async () => {
    const hostname = "pinned.fixture.invalid";
    const pems = await selfsigned.generate([{ name: "commonName", value: hostname }], {
      algorithm: "sha256",
      extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: hostname }] }],
    });
    const received = [];
    const fixture = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
      received.push({ sni: req.socket.servername, host: req.headers.host });
      res.end("verified");
    });
    const sockets = new Set();
    fixture.on("connection", socket => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await new Promise(resolve => fixture.listen(0, HOST, resolve));
    const connect = tls.connect;
    const spy = vi.spyOn(tls, "connect").mockImplementation(options => {
      expect(options.host).toBe(HOST);
      expect(options.rejectUnauthorized).toBeUndefined();
      return connect({ ...options, ca: pems.cert });
    });
    try {
      const response = await __testing.createBypassRequest(new URL(`https://${hostname}:${fixture.address().port}/verified`), HOST);
      expect(await response.text()).toBe("verified");
      await expect(__testing.createBypassRequest(new URL(`https://wrong.fixture.invalid:${fixture.address().port}/rejected`), HOST))
        .rejects.toThrow(/Hostname|altnames|certificate/i);
      expect(received).toEqual([{ sni: hostname, host: `${hostname}:${fixture.address().port}` }]);
    } finally {
      spy.mockRestore();
      const closing = new Promise(resolve => fixture.close(resolve));
      for (const socket of sockets) socket.destroy();
      await closing;
    }
  });
});
