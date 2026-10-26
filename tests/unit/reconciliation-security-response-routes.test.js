import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const globalKeys = [
  Symbol.for("kitsunerouter.db.importState"), "_dbAdapter", "_pendingRequests", "_lastErrorProvider",
  "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers",
];
const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let root;
let previousGlobals;
let previousListeners;
let db;
let adapter;
let guard;
let list;
let detail;
let settings;
let authToken;

function providerData() {
  return {
    copilotToken: "synthetic-secret-copilot",
    copilotTokenExpiresAt: 1900000000,
    copilotTokenInfo: {
      token: "synthetic-secret-copilot-info", token_type: "Bearer", expires_at: 1900000000,
      endpoints: { api: "https://api.example.invalid" },
    },
    oauth: {
      access_token: "synthetic-secret-nested-access", refresh_token: "synthetic-secret-nested-refresh",
      id_token: "synthetic-secret-nested-id", client_secret: "synthetic-secret-client",
      client_id: "public-client-id", expiresAt: "2030-01-01T00:00:00Z", scope: "profile",
    },
    credentials: {
      key: "synthetic-secret-opaque-key", secretAccessKey: "synthetic-secret-aws",
      private_key: "synthetic-secret-private-key", region: "us-test-1",
    },
    tokens: { primary: "synthetic-secret-token-collection", expiresAt: "2030-01-01T00:00:00Z" },
    headers: {
      Authorization: "Bearer synthetic-secret-authorization", "X-Goog-Api-Key": "synthetic-secret-google",
      "X-Custom-Credential": "synthetic-secret-custom-header", Cookie: "session=synthetic-secret-header-cookie",
      "Content-Type": "application/json", "X-Request-Id": "public-request-id",
    },
    nested: [{ label: "public-profile", SessionToken: "synthetic-secret-session", cookie: "synthetic-secret-cookie",
      headers: [["Authorization", "synthetic-secret-array-header"], ["Accept", "application/json"]] }],
    cookies: [{ name: "session", value: "synthetic-secret-cookie-jar" }],
    region: "us-test-1", chatgptAccountId: "public-account-id", baseUrl: "https://provider.example.invalid/v1",
    quota: { usedTokens: 10, total_tokens: 1000, tokens: 1000, remainingTokens: 990 },
    models: [{ id: "fixture-model", maxOutputTokens: 8192, tokenizer: "fixture-tokenizer" }],
    tokenType: "Bearer", tokenExpiresAt: "2030-01-01T00:00:00Z",
  };
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(tmpdir(), "reconciliation-security-responses-"));
  previousGlobals = Object.fromEntries(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  previousListeners = new Map(shutdownEvents.map(event => [event, process.rawListeners(event)]));
  vi.stubEnv("HOME", path.join(root, "home"));
  vi.stubEnv("DATA_DIR", path.join(root, "data"));
  vi.stubEnv("JWT_SECRET", "reconciliation-response-synthetic-jwt-secret-20261021");
  fs.mkdirSync(process.env.HOME, { mode: 0o700 });
  fs.mkdirSync(path.join(process.env.DATA_DIR, "auth"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(process.env.DATA_DIR, "machine-id"), "synthetic-machine", { mode: 0o600 });
  fs.writeFileSync(path.join(process.env.DATA_DIR, "auth", "cli-secret"), "synthetic-cli-secret", { mode: 0o600 });
  for (const key of globalKeys) delete global[key];
  vi.resetModules();
  vi.useFakeTimers();
  db = await import("@/lib/db/index.js");
  adapter = await (await import("@/lib/db/driver.js")).getAdapter();
  guard = await import("@/dashboardGuard.js");
  authToken = await (await import("@/lib/auth/dashboardSession.js")).createDashboardAuthToken();
  list = await import("@/app/api/providers/route.js");
  detail = await import("@/app/api/providers/[id]/route.js");
  settings = await import("@/app/api/settings/route.js");
});

afterEach(() => {
  try {
    adapter?.close();
  } finally {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    for (const event of shutdownEvents) {
      for (const listener of process.rawListeners(event)) {
        if (!previousListeners.get(event).includes(listener)) process.removeListener(event, listener);
      }
    }
    for (const key of globalKeys) {
      if (previousGlobals[key]) Object.defineProperty(global, key, previousGlobals[key]);
      else delete global[key];
    }
    vi.unstubAllEnvs();
    vi.resetModules();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function request(url, method = "GET", body) {
  return new NextRequest(`http://localhost:20128${url}`, {
    method, headers: { cookie: `auth_token=${authToken}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function dispatch(handler, url, method = "GET", body, id) {
  const req = request(url, method, body);
  expect((await guard.proxy(req)).headers.get("x-middleware-next")).toBe("1");
  return handler(req, { params: Promise.resolve({ id }) });
}

async function seedConnection() {
  return db.createProviderConnection({
    provider: "openai", authType: "apikey", name: "Synthetic provider", apiKey: "synthetic-secret-top-key",
    accessToken: "synthetic-secret-top-access", refreshToken: "synthetic-secret-top-refresh",
    idToken: "synthetic-secret-top-id", providerSpecificData: providerData(), defaultModel: "fixture-model",
  });
}

function expectPublicConnection(connection) {
  expect(JSON.stringify(connection)).not.toContain("synthetic-secret-");
  expect(connection).toMatchObject({
    name: "Synthetic provider", provider: "openai", defaultModel: "fixture-model",
    providerSpecificData: {
      copilotTokenExpiresAt: 1900000000,
      copilotTokenInfo: { token_type: "Bearer", expires_at: 1900000000, endpoints: { api: "https://api.example.invalid" } },
      oauth: { client_id: "public-client-id", expiresAt: "2030-01-01T00:00:00Z", scope: "profile" },
      credentials: { region: "us-test-1" },
      tokens: { expiresAt: "2030-01-01T00:00:00Z" },
      headers: { "Content-Type": "application/json", "X-Request-Id": "public-request-id" },
      nested: [{ label: "public-profile", headers: [["Accept", "application/json"]] }],
      region: "us-test-1", chatgptAccountId: "public-account-id", baseUrl: "https://provider.example.invalid/v1",
      quota: { usedTokens: 10, total_tokens: 1000, tokens: 1000, remainingTokens: 990 },
      models: [{ id: "fixture-model", maxOutputTokens: 8192, tokenizer: "fixture-tokenizer" }],
      tokenType: "Bearer", tokenExpiresAt: "2030-01-01T00:00:00Z",
    },
  });
}

describe("provider response credential boundary with real SQLite and authorization", () => {
  it("redacts recursive secrets in list responses without mutating the cached credential graph", async () => {
    const saved = await seedConnection();
    const cached = await db.getProviderConnections();
    const before = structuredClone(cached);
    const response = await dispatch(list.GET, "/api/providers");
    expect(response.status).toBe(200);
    expectPublicConnection((await response.json()).connections[0]);
    expect(cached).toEqual(before);
    expect(await db.getProviderConnectionById(saved.id)).toMatchObject({ providerSpecificData: providerData() });
  });

  it("redacts recursive secrets from a connection detail response", async () => {
    const saved = await seedConnection();
    const response = await dispatch(detail.GET, `/api/providers/${saved.id}`, "GET", undefined, saved.id);
    expect(response.status).toBe(200);
    expectPublicConnection((await response.json()).connection);
  });

  it("does not echo newly submitted credentials in create responses", async () => {
    const response = await dispatch(list.POST, "/api/providers", "POST", {
      provider: "openai", name: "Synthetic provider", apiKey: "synthetic-secret-top-key",
      defaultModel: "fixture-model", providerSpecificData: providerData(),
    });
    expect(response.status).toBe(201);
    const { connection } = await response.json();
    expectPublicConnection(connection);
    expect(await db.getProviderConnectionById(connection.id)).toMatchObject({
      apiKey: "synthetic-secret-top-key", providerSpecificData: providerData(),
    });
  });

  it("accepts explicit secret updates but excludes them from update responses", async () => {
    const saved = await seedConnection();
    const response = await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", {
      apiKey: "synthetic-secret-rotated-key",
      providerSpecificData: { copilotToken: "synthetic-secret-rotated-copilot" },
    }, saved.id);
    expect(response.status).toBe(200);
    expectPublicConnection((await response.json()).connection);
    expect(await db.getProviderConnectionById(saved.id)).toMatchObject({
      apiKey: "synthetic-secret-rotated-key", providerSpecificData: { copilotToken: "synthetic-secret-rotated-copilot" },
    });
  });

  it("preserves omitted nested credentials when metadata is edited and supports explicit nested rotation", async () => {
    const saved = await seedConnection();
    const response = await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", {
      providerSpecificData: { oauth: { client_id: "new-public-client-id" } },
    }, saved.id);
    expect(response.status).toBe(200);
    expect(await db.getProviderConnectionById(saved.id)).toMatchObject({
      providerSpecificData: { oauth: { client_id: "new-public-client-id", client_secret: "synthetic-secret-client", access_token: "synthetic-secret-nested-access" } },
    });
    const rotated = await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", {
      providerSpecificData: { oauth: { client_secret: "synthetic-secret-rotated-client" } },
    }, saved.id);
    expect(JSON.stringify(await rotated.json())).not.toContain("synthetic-secret-");
    expect(await db.getProviderConnectionById(saved.id)).toMatchObject({
      providerSpecificData: { oauth: { client_id: "new-public-client-id", client_secret: "synthetic-secret-rotated-client" } },
    });
    await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", { providerSpecificData: { oauth: null } }, saved.id);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.oauth).toBeNull();
  });

  it("preserves credential-bearing arrays when the editor echoes unchanged public metadata", async () => {
    const saved = await seedConnection();
    const read = await dispatch(detail.GET, `/api/providers/${saved.id}`, "GET", undefined, saved.id);
    const publicData = (await read.json()).connection.providerSpecificData;
    await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", {
      providerSpecificData: { ...publicData, region: "eu-test-1" },
    }, saved.id);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.nested).toEqual(providerData().nested);
  });

  it.each([
    { field: "customHeaders", value: [["X-Api-Key", "synthetic-secret-only-header"]] },
    { field: "tokens", value: ["synthetic-secret-only-token"] },
  ])("omits a fully redacted nonempty $field array so GET/PUT echoes preserve it and explicit [] still clears it", async ({ field, value }) => {
    const saved = await seedConnection();
    await db.updateProviderConnection(saved.id, { providerSpecificData: { ...providerData(), [field]: value } });
    const read = await dispatch(detail.GET, `/api/providers/${saved.id}`, "GET", undefined, saved.id);
    const publicData = (await read.json()).connection.providerSpecificData;
    expect(publicData).not.toHaveProperty(field);
    expect(JSON.stringify(publicData)).not.toContain("synthetic-secret-");
    const echo = await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", {
      providerSpecificData: { ...publicData, region: "eu-test-1" },
    }, saved.id);
    expect(echo.status).toBe(200);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData[field]).toEqual(value);
    const clear = await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", { providerSpecificData: { [field]: [] } }, saved.id);
    expect(clear.status).toBe(200);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData[field]).toEqual([]);
    expect((await clear.json()).connection.providerSpecificData[field]).toEqual([]);
  });

  it.each(["nested", "top-level", "omitted"])("masks proxy URL credentials and preserves them on a %s metadata echo while allowing explicit rotation/clear", async mode => {
    const saved = await seedConnection();
    const originalUrl = "http://synthetic-secret-user:synthetic-secret-password@proxy.example.invalid:8080/gateway?region=public&token=synthetic-secret-query";
    const publicUrl = "http://proxy.example.invalid:8080/gateway?region=public";
    await db.updateProviderConnection(saved.id, { providerSpecificData: {
      ...providerData(), connectionProxyEnabled: true, connectionProxyUrl: originalUrl,
    } });
    const read = await dispatch(detail.GET, `/api/providers/${saved.id}`, "GET", undefined, saved.id);
    const publicData = (await read.json()).connection.providerSpecificData;
    expect(publicData.connectionProxyUrl).toBe(publicUrl);
    expect(JSON.stringify(publicData)).not.toContain("synthetic-secret-");
    const all = await dispatch(list.GET, "/api/providers");
    expect((await all.json()).connections[0].providerSpecificData.connectionProxyUrl).toBe(publicUrl);
    const echoBody = mode === "nested"
      ? { providerSpecificData: { ...publicData, region: "eu-test-1" } }
      : mode === "omitted" ? { connectionNoProxy: "localhost" }
        : { connectionProxyEnabled: true, connectionProxyUrl: publicUrl, connectionNoProxy: "localhost" };
    expect((await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", echoBody, saved.id)).status).toBe(200);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.connectionProxyUrl).toBe(originalUrl);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.connectionProxyEnabled).toBe(true);
    const rotatedUrl = "http://synthetic-secret-new-user:synthetic-secret-new-password@proxy.example.invalid:8080/gateway?region=public";
    const rotated = await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", {
      connectionProxyEnabled: true, connectionProxyUrl: rotatedUrl,
    }, saved.id);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.connectionProxyUrl).toBe(rotatedUrl);
    expect((await rotated.json()).connection.providerSpecificData.connectionProxyUrl).toBe(publicUrl);
    const cleared = await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", { clearConnectionProxyCredentials: true }, saved.id);
    expect(cleared.status).toBe(200);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.connectionProxyUrl).toBe(publicUrl);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData).not.toHaveProperty("clearConnectionProxyCredentials");
  });

  it("does not reveal opaque malformed proxy credentials and preserves their stored value on metadata echo", async () => {
    const saved = await seedConnection();
    const originalUrl = "synthetic-secret-user:synthetic-secret-password@proxy.example.invalid:8080";
    await db.updateProviderConnection(saved.id, { providerSpecificData: { connectionProxyUrl: originalUrl } });
    const read = await dispatch(detail.GET, `/api/providers/${saved.id}`, "GET", undefined, saved.id);
    const publicData = (await read.json()).connection.providerSpecificData;
    expect(publicData.connectionProxyUrl).toBe("[invalid proxy URL]");
    await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", { providerSpecificData: publicData }, saved.id);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.connectionProxyUrl).toBe(originalUrl);
  });

  it.each(["127.0.0.1:7890", "[::1]:7890"])("does not corrupt a credentialless supported proxy address when clearing credentials: %s", async address => {
    const saved = await seedConnection();
    await db.updateProviderConnection(saved.id, { providerSpecificData: { connectionProxyEnabled: true, connectionProxyUrl: address } });
    const response = await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", { clearConnectionProxyCredentials: true }, saved.id);
    expect(response.status).toBe(200);
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.connectionProxyUrl).toBe(address);
    expect((await response.json()).connection.providerSpecificData.connectionProxyUrl).toBe(address);
  });

  it("never persists a display-only invalid URL marker during an explicit credential clear", async () => {
    const saved = await seedConnection();
    const originalUrl = "invalid synthetic-secret-proxy address";
    await db.updateProviderConnection(saved.id, { providerSpecificData: { connectionProxyEnabled: true, connectionProxyUrl: originalUrl } });
    const response = await dispatch(detail.PUT, `/api/providers/${saved.id}`, "PUT", { clearConnectionProxyCredentials: true }, saved.id);
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("synthetic-secret");
    expect((await db.getProviderConnectionById(saved.id)).providerSpecificData.connectionProxyUrl).toBe(originalUrl);
  });

  it("redacts credential variants and header entry objects without erasing token quotas", async () => {
    const saved = await seedConnection();
    await db.updateProviderConnection(saved.id, { providerSpecificData: {
      awsSessionToken: "synthetic-secret-aws-session", gitlabClientSecret: "synthetic-secret-gitlab-client",
      rsaPrivateKey: "synthetic-secret-rsa", auth: "synthetic-secret-auth", cookieJar: "synthetic-secret-jar",
      tokens: ["synthetic-secret-token-array"],
      apiKeys: ["synthetic-secret-api-key-array"], azureAccessToken: ["synthetic-secret-token-values"],
      credentials: "synthetic-secret-opaque-credentials",
      responseHeaders: [
        { name: "Set-Cookie", value: "synthetic-secret-set-cookie" },
        { name: "Content-Type", value: "application/json" },
      ],
      quota: { tokens: { used: 10, remaining: 990, resetAt: "2030-01-01T00:00:00Z" } },
      catalog: { "fixture/token": { id: "fixture/token", maxOutputTokens: 8192 } },
      supportsApiKey: true, tokenExpiresAt: "2030-01-01T00:00:00Z",
    } });
    const response = await dispatch(list.GET, "/api/providers");
    const { connections } = await response.json();
    expect(JSON.stringify(connections)).not.toContain("synthetic-secret-");
    expect(connections[0].providerSpecificData).toMatchObject({
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      quota: { tokens: { used: 10, remaining: 990, resetAt: "2030-01-01T00:00:00Z" } },
      catalog: { "fixture/token": { id: "fixture/token", maxOutputTokens: 8192 } },
      supportsApiKey: true, tokenExpiresAt: "2030-01-01T00:00:00Z",
    });
  });
});

describe("settings secret response boundary", () => {
  it.each(["GET", "PATCH"])("omits MITM ciphertext from %s while retaining public settings and stored secrets", async method => {
    await db.updateSettings({
      mitmSudoEncrypted: "synthetic-secret-mitm-ciphertext", password: "synthetic-secret-password-hash",
      oidcClientSecret: "synthetic-secret-oidc", oidcIssuerUrl: "https://issuer.example.invalid", oidcClientId: "public-client",
      mitmEnabled: true, providerThinking: { openai: { mode: "high" } },
    });
    const handler = method === "GET" ? settings.GET : settings.PATCH;
    const response = await dispatch(handler, "/api/settings", method, method === "PATCH" ? { rtkEnabled: false } : undefined);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("synthetic-secret-");
    expect(body).toMatchObject({ mitmEnabled: true, oidcConfigured: true, providerThinking: { openai: { mode: "high" } } });
    expect(await db.exportSettings()).toMatchObject({ mitmSudoEncrypted: "synthetic-secret-mitm-ciphertext", oidcClientSecret: "synthetic-secret-oidc" });
  });

  it("keeps verified password replacement working without returning either password hash or MITM ciphertext", async () => {
    await db.updateSettings({ password: bcrypt.hashSync("synthetic-current-password", 4), mitmSudoEncrypted: "synthetic-secret-mitm-ciphertext" });
    // bcrypt schedules asynchronous work; do not drain recurring checkpoint timers.
    vi.useRealTimers();
    const response = await dispatch(settings.PATCH, "/api/settings", "PATCH", {
      currentPassword: "synthetic-current-password", newPassword: "synthetic-new-password",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("mitmSudoEncrypted");
    expect(bcrypt.compareSync("synthetic-new-password", (await db.getSettings()).password)).toBe(true);
  });
});
