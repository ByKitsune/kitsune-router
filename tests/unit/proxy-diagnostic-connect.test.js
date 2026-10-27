import { createServer, request } from "node:http";
import { createConnection } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testProxyUrl } from "@/lib/network/proxyTest.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

describe("proxy diagnostics through a CONNECT-only proxy", () => {
  let target;
  let proxy;
  let sockets;
  let connects;
  let forwarded;
  let targetRequests;
  let authority;
  let testUrl;
  let proxyUrl;

  beforeEach(async () => {
    sockets = new Set();
    connects = [];
    forwarded = [];
    targetRequests = [];
    const track = (socket) => {
      sockets.add(socket);
      socket.on("error", () => {});
      socket.once("close", () => sockets.delete(socket));
      return socket;
    };

    target = createServer((req, res) => {
      targetRequests.push({
        method: req.method,
        url: req.url,
        userAgent: req.headers["user-agent"],
      });
      res.writeHead(204);
      res.end();
    });
    target.on("connection", track);
    await listen(target);
    const targetPort = target.address().port;
    authority = `127.0.0.1:${targetPort}`;
    testUrl = `http://${authority}/diagnostic?probe=1`;

    proxy = createServer((req, res) => {
      forwarded.push({ method: req.method, url: req.url });
      res.writeHead(405, { Connection: "close" });
      res.end();
    });
    proxy.on("connection", track);
    proxy.on("connect", (req, socket, head) => {
      connects.push({ method: req.method, url: req.url });
      if (req.url !== authority) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        return;
      }

      // Only the fixture's loopback target can receive tunneled traffic.
      const upstream = track(createConnection({ host: "127.0.0.1", port: targetPort }));
      socket.once("close", () => upstream.destroy());
      upstream.once("close", () => socket.destroy());
      upstream.once("error", () => socket.destroy());
      socket.once("error", () => upstream.destroy());
      upstream.once("connect", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
    });
    await listen(proxy);
    proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  });

  afterEach(async () => {
    const serverClosures = [proxy, target]
      .filter((server) => server?.listening)
      .map((server) => new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }));
    const socketClosures = [...sockets].map((socket) => new Promise((resolve) => {
      socket.once("close", resolve);
      socket.destroy();
    }));
    await Promise.all([...serverClosures, ...socketClosures]);
    expect(sockets.size).toBe(0);
  });

  it("sends the diagnostic HEAD and User-Agent through CONNECT and returns the target response", async () => {
    const result = await testProxyUrl({ proxyUrl, testUrl, timeoutMs: 1000 });

    expect({ result, connects, forwarded, targetRequests }).toMatchObject({
      result: { ok: true, status: 204, statusText: "No Content", url: testUrl },
      connects: [{ method: "CONNECT", url: authority }],
      forwarded: [],
      targetRequests: [{ method: "HEAD", url: "/diagnostic?probe=1", userAgent: "Kitsune Router" }],
    });
    expect(result.elapsedMs).toEqual(expect.any(Number));
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("rejects ordinary HTTP forwarding with 405 without contacting the target", async () => {
    const status = await new Promise((resolve, reject) => {
      const req = request(proxyUrl, { method: "HEAD", path: testUrl, agent: false }, (res) => {
        res.resume();
        res.once("end", () => resolve(res.statusCode));
      });
      req.once("error", reject);
      req.setTimeout(1000, () => req.destroy(new Error("Fixture request timed out")));
      req.end();
    });

    expect(status).toBe(405);
    expect(forwarded).toEqual([{ method: "HEAD", url: testUrl }]);
    expect(connects).toEqual([]);
    expect(targetRequests).toEqual([]);
  });

  it("returns 400 for a malformed proxy URL without opening a connection", async () => {
    const result = await testProxyUrl({ proxyUrl: "not a url", testUrl });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(result.error).toMatch(/^Invalid proxy URL:/);
    expect(connects).toEqual([]);
    expect(forwarded).toEqual([]);
    expect(targetRequests).toEqual([]);
    expect(sockets.size).toBe(0);
  });

  it("returns 400 for a missing proxy URL without opening a connection", async () => {
    expect(await testProxyUrl()).toEqual({
      ok: false,
      status: 400,
      error: "proxyUrl is required",
    });
    expect(connects).toEqual([]);
    expect(forwarded).toEqual([]);
    expect(targetRequests).toEqual([]);
    expect(sockets.size).toBe(0);
  });
});
