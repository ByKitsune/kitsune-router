import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fixture = vi.hoisted(() => ({ settings: {}, fetch: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => fixture.settings }));
vi.mock("@/lib/headroom/detect", () => ({ DEFAULT_HEADROOM_URL: "http://127.0.0.1:8787" }));

import { GET } from "../../src/app/api/headroom/proxy/[...path]/route.js";

const credentials = {
  "x-kitsune-router-peer-token": "synthetic-router-peer-secret",
  "x-kitsune-router-cli-token": "synthetic-router-cli-secret",
  "x-kitsune-router-password": "synthetic-router-password-secret",
  "x-kitsune-router-real-ip": "192.0.2.10",
  "x-kitsune-router-via-proxy": "1",
};
const apiCredentials = {
  cookie: "auth_token=synthetic-dashboard-secret",
  authorization: "Bearer synthetic-gateway-secret",
  "x-api-key": "synthetic-openai-secret",
  "api-key": "synthetic-azure-secret",
  "x-goog-api-key": "synthetic-google-secret",
};

beforeEach(() => {
  fixture.fetch.mockReset().mockResolvedValue(new Response('{"ok":true}', {
    status: 200, headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fixture.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

function request() {
  return new NextRequest("http://localhost:20128/api/headroom/proxy/stats?period=24h", { headers: {
    ...credentials, ...apiCredentials, accept: "application/json", "x-request-id": "synthetic-request-id",
    "user-agent": "synthetic-ui-client", connection: "keep-alive",
  } });
}

async function dispatch(target) {
  fixture.settings = { headroomUrl: target };
  const response = await GET(request(), { params: Promise.resolve({ path: ["stats"] }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(fixture.fetch).toHaveBeenCalledOnce();
  const [url, init] = fixture.fetch.mock.calls[0];
  expect(url.pathname).toBe("/stats");
  expect(url.search).toBe("?period=24h");
  expect(init.redirect).toBe("manual");
  return init.headers;
}

describe("Headroom reverse-proxy credential boundary", () => {
  it("does not disclose router/CLI credentials or gateway API-key aliases to the configured remote service", async () => {
    const headers = await dispatch("https://compressor.example.invalid:8787");
    for (const name of [...Object.keys(credentials), ...Object.keys(apiCredentials)]) {
      expect(headers.has(name), name).toBe(false);
    }
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-request-id")).toBe("synthetic-request-id");
    expect(headers.get("user-agent")).toBe("synthetic-ui-client");
    expect(headers.has("connection")).toBe(false);
    expect(headers.has("host")).toBe(false);
  });

  it.each(["http://127.0.0.1:8787", "http://localhost:8787", "http://[::1]:8787"])(
    "keeps the existing loopback auth forwarding policy at %s while removing router-private proof headers", async target => {
      const headers = await dispatch(target);
      for (const name of Object.keys(credentials)) expect(headers.has(name), name).toBe(false);
      for (const [name, value] of Object.entries(apiCredentials)) expect(headers.get(name)).toBe(value);
      expect(headers.get("x-request-id")).toBe("synthetic-request-id");
    },
  );
});
