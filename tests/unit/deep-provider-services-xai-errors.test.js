import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const route = vi.hoisted(() => ({ origin: "" }));
vi.mock("../../src/lib/oauth/constants/xai.js", async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, XAI_CONFIG: {
    ...actual.XAI_CONFIG,
    get discoveryUrl() { return `${route.origin}/discovery`; },
    get tokenUrl() { return `${route.origin}/token`; },
  } };
});
const servers = [];
const listen = async handler => {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
beforeEach(() => { vi.resetModules(); });
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
afterAll(async () => { const { closeUpstreamPools } = await import("../../open-sse/utils/proxyFetch.js"); await closeUpstreamPools(); });
const log = () => ({ warn: vi.fn(), error: vi.fn() });
const errorServer = async (status, body) => {
  route.origin = await listen(async (req, res) => {
    for await (const _chunk of req) { /* Synthetic proofs only. */ }
    if (req.url === "/discovery") { res.writeHead(404); res.end(); return; }
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
};

describe("xAI refresh errors retain authoritative OAuth classification", () => {
  it.each([500, 503, 400])("does not revoke credentials from quoted invalid_grant text on HTTP%s", async status => {
    await errorServer(status, { error: "server_error", error_description: "quoted invalid_grant is not the error code" });
    const { refreshTokenByProvider } = await import("../../open-sse/services/tokenRefresh.js");
    expect(await refreshTokenByProvider("xai", { refreshToken: "synthetic-refresh" }, log())).toBeNull();
  });

  it.each(["invalid_grant", "invalid_request"])("retains explicit HTTP400 %s as an unrecoverable grant response", async code => {
    await errorServer(400, { error: code });
    const { refreshTokenByProvider } = await import("../../open-sse/services/tokenRefresh.js");
    expect(await refreshTokenByProvider("xai", { refreshToken: "synthetic-refresh" }, log())).toEqual({ error: "invalid_grant" });
  });

  it("never exposes an echoed refresh proof in the service error message", async () => {
    const secret = "synthetic-private-echoed-proof";
    await errorServer(400, { error: "invalid_grant", error_description: secret });
    const { XaiService } = await import("../../src/lib/oauth/services/xai.js");
    const error = await new XaiService().refreshAccessToken("synthetic-refresh").catch(value => value);
    expect(error).toMatchObject({ status: 400, oauthErrorCode: "invalid_grant" });
    expect(error.message).not.toContain(secret);
  });

  it.each([[307, false], [308, false], [307, true], [308, true]])("refuses refresh HTTP%s (cross origin: %s) without forwarding a proof", async (status, crossOrigin) => {
    let target;
    let intended = 0;
    let forwarded = 0;
    const handler = async (req, res) => {
      for await (const _chunk of req) { /* No real credentials. */ }
      if (req.url === "/discovery") { res.writeHead(404); res.end(); return; }
      if (req.url === "/token") { intended++; res.writeHead(status, { Location: `${target}/target` }); res.end(); return; }
      forwarded++;
      res.setHeader("content-type", "application/json");
      res.end('{"access_token":"synthetic-access","refresh_token":"synthetic-rotated","expires_in":3600}');
    };
    route.origin = await listen(handler);
    target = crossOrigin ? await listen(handler) : route.origin;
    const { refreshTokenByProvider } = await import("../../open-sse/services/tokenRefresh.js");
    await refreshTokenByProvider("xai", { refreshToken: "synthetic-refresh" }, log());
    expect(intended).toBe(1);
    expect(forwarded).toBe(0);
  });
});
