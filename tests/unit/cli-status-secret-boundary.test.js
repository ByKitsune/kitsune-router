import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const fixture = vi.hoisted(() => ({
  apiKey: "fixture-host-api-key-canary",
  cliToken: "fixture-privileged-cli-token-canary",
  peerToken: "fixture-validated-peer-token",
  settings: { requireLogin: false },
  fs: { access: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn() },
}));

vi.mock("fs/promises", () => ({ default: fixture.fs }));
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal();
  const overrides = { platform: () => "win32", homedir: () => "C:/fixture-home" };
  return { ...actual, ...overrides, default: { ...actual.default, ...overrides } };
});
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => fixture.settings,
  validateApiKey: async () => false,
}));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: async () => fixture.cliToken }));
vi.mock("../../src/app/api/cli-tools/claude-settings/route", () => ({ GET: async () => NextResponse.json({
  installed: true, hasKitsuneRouter: true, settings: {
    env: { ANTHROPIC_BASE_URL: "http://localhost:20128", ANTHROPIC_AUTH_TOKEN: fixture.apiKey },
  }, config: { apiKey: fixture.apiKey, nested: { headers: { "x-kitsune-router-cli-token": fixture.cliToken } } },
}) }));
vi.mock("../../src/app/api/cli-tools/codex-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/opencode-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/droid-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/openclaw-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/hermes-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/copilot-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/cline-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/kilo-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/deepseek-tui-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/jcode-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/grok-build-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));
vi.mock("../../src/app/api/cli-tools/devin-settings/route", () => ({ GET: async () => NextResponse.json({ installed: false }) }));

import { GET as allStatuses } from "../../src/app/api/cli-tools/all-statuses/route.js";
import { GET as coworkGet, POST as coworkPost, DELETE as coworkDelete } from "../../src/app/api/cli-tools/cowork-settings/route.js";
import { createDashboardAuthToken } from "../../src/lib/auth/dashboardSession.js";

function request(headers = {}, method = "GET", pathname = "cowork-settings") {
  return new NextRequest(`http://localhost:20128/api/cli-tools/${pathname}`, { method, headers });
}

function localHeaders(extra = {}) {
  return { "x-kitsune-router-peer-token": fixture.peerToken, "x-kitsune-router-real-ip": "127.0.0.1", ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("KITSUNE_ROUTER_PEER_TOKEN", fixture.peerToken);
  vi.stubEnv("JWT_SECRET", "fixture-dashboard-signing-secret-32-characters");
  vi.stubEnv("LOCALAPPDATA", "C:/fixture-home/AppData/Local");
  vi.stubEnv("APPDATA", "C:/fixture-home/AppData/Roaming");
  fixture.settings = { requireLogin: false };
  fixture.fs.access.mockResolvedValue(undefined);
  fixture.fs.readFile.mockImplementation(async (file) => {
    if (String(file).endsWith("_meta.json")) return JSON.stringify({ appliedId: "fixture-config" });
    if (String(file).endsWith("fixture-config.json")) return JSON.stringify({
      inferenceProvider: "gateway", inferenceGatewayBaseUrl: "http://localhost:20128/v1",
      inferenceGatewayApiKey: fixture.apiKey, inferenceModels: [{ name: "fixture-model" }],
      managedMcpServers: [{ name: "browsermcp", url: "http://localhost:20128/api/mcp/browsermcp/sse",
        transport: "sse", headers: { "x-kitsune-router-cli-token": fixture.cliToken } }],
    });
    throw Object.assign(new Error("No fixture file"), { code: "ENOENT" });
  });
});
afterEach(() => vi.unstubAllEnvs());

function expectNoSecrets(data) {
  const serialized = JSON.stringify(data);
  expect(serialized).not.toContain(fixture.apiKey);
  expect(serialized).not.toContain(fixture.cliToken);
  expect(serialized).not.toContain("inferenceGatewayApiKey");
  expect(serialized).not.toContain("x-kitsune-router-cli-token");
}

describe("CLI status host-secret boundary", () => {
  it("keeps remote overview public when login is disabled without reading Cowork files or exposing credentials", async () => {
    const response = await allStatuses(request({}, "GET", "all-statuses"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.claude).toMatchObject({ installed: true, hasKitsuneRouter: true });
    expect(data.cowork).toEqual({ error: "Local only: CLI token required" });
    expectNoSecrets(data);
    expect(fixture.fs.access).not.toHaveBeenCalled();
    expect(fixture.fs.readFile).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { host: "localhost", origin: "http://localhost:20128", "x-forwarded-for": "127.0.0.1", "x-kitsune-router-real-ip": "127.0.0.1" },
    { "x-kitsune-router-peer-token": "forged-peer", "x-kitsune-router-real-ip": "127.0.0.1" },
    localHeaders({ "x-kitsune-router-via-proxy": "1" }),
    localHeaders({ origin: "https://attacker.example" }),
    { "x-kitsune-router-cli-token": "forged-cli-token" },
  ])("denies direct Cowork access before filesystem work for untrusted context %j", async (headers) => {
    for (const [method, handler] of [["GET", coworkGet], ["POST", coworkPost], ["DELETE", coworkDelete]]) {
      const response = await handler(request(headers, method));
      expect(response.status).toBe(403);
      expectNoSecrets(await response.json());
    }
    expect(fixture.fs.access).not.toHaveBeenCalled();
    expect(fixture.fs.readFile).not.toHaveBeenCalled();
    expect(fixture.fs.writeFile).not.toHaveBeenCalled();
  });

  it("requires dashboard authentication for a trusted loopback when login is enabled", async () => {
    fixture.settings = { requireLogin: true };
    const denied = await coworkGet(request(localHeaders()));
    expect(denied.status).toBe(403);
    expect(fixture.fs.readFile).not.toHaveBeenCalled();
    const token = await createDashboardAuthToken();
    const response = await coworkGet(request(localHeaders({ cookie: `auth_token=${token}` })));
    expect(response.status).toBe(200);
    expect((await response.json()).hasKitsuneRouter).toBe(true);
  });

  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])("preserves credential-free Cowork details for validated local peer %s", async (peer) => {
    const response = await coworkGet(request(localHeaders({ "x-kitsune-router-real-ip": peer })));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ installed: true, hasKitsuneRouter: true,
      cowork: { baseUrl: "http://localhost:20128/v1", models: ["fixture-model"], localPlugins: ["browsermcp"] } });
    expectNoSecrets(data);
  });

  it("carries validated local context through the aggregate route", async () => {
    const response = await allStatuses(request(localHeaders(), "GET", "all-statuses"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.cowork).toMatchObject({ installed: true, hasKitsuneRouter: true });
    expectNoSecrets(data);
  });

  it("fails closed when an internal caller omits the original request", async () => {
    const response = await coworkGet();
    expect(response.status).toBe(403);
    expect(fixture.fs.readFile).not.toHaveBeenCalled();
  });

  it("preserves explicit valid CLI-token access without returning that token", async () => {
    fixture.settings = { requireLogin: true };
    const response = await coworkGet(request({ "x-kitsune-router-cli-token": fixture.cliToken }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.hasKitsuneRouter).toBe(true);
    expectNoSecrets(data);
  });
});
