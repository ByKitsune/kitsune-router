import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fixture = vi.hoisted(() => ({ settings: {}, requests: [], networkFetch: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => fixture.settings }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("undici/index.js", async (importOriginal) => ({ ...await importOriginal(), fetch: fixture.networkFetch }));

import { POST } from "../../src/app/api/auth/oidc/test/route.js";
import { exchangeOidcCode, verifyOidcIdToken } from "../../src/lib/auth/oidc.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import dns from "node:dns";

const configuredIssuer = "https://8.8.8.8/issuer";
const draftIssuer = "https://1.1.1.1/issuer";
const storedSecret = "stored-oidc-secret-canary";

function metadata(issuer) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
  };
}

function request(body = {}) {
  return new NextRequest("http://localhost:20128/api/auth/oidc/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fixture.settings = {
    requireLogin: false,
    oidcIssuerUrl: configuredIssuer,
    oidcClientId: "configured-client",
    oidcClientSecret: storedSecret,
  };
  fixture.requests = [];
  fixture.networkFetch.mockImplementation(async (url, init = {}) => {
    fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
    if (String(url).endsWith("/.well-known/openid-configuration")) {
      const issuer = String(url).replace(/\/\.well-known\/openid-configuration$/, "");
      return Response.json(metadata(issuer));
    }
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  });
  vi.stubGlobal("fetch", fixture.networkFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function tokenRequests() {
  return fixture.requests.filter(({ method }) => method === "POST");
}

describe("OIDC test stored credential boundary", () => {
  it("does not send the stored secret to a draft issuer without an explicit draft secret", async () => {
    const response = await POST(request({ issuerUrl: draftIssuer }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, discoveryOk: true, clientSecretTested: false });
    expect(tokenRequests()).toEqual([]);
    expect(JSON.stringify(fixture.requests)).not.toContain(storedSecret);
  });

  it("does not reuse the stored secret for a different client ID", async () => {
    const response = await POST(request({ clientId: "draft-client" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ clientSecretTested: false });
    expect(tokenRequests()).toEqual([]);
  });

  it("allows an explicit draft secret without forwarding the stored secret", async () => {
    const response = await POST(request({ issuerUrl: draftIssuer, clientSecret: "explicit-draft-secret" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, clientSecretTested: true, clientSecretValid: true });
    expect(tokenRequests()).toEqual([{
      url: `${draftIssuer}/token`, method: "POST",
      body: expect.stringContaining("client_secret=explicit-draft-secret"),
    }]);
    expect(JSON.stringify(fixture.requests)).not.toContain(storedSecret);
  });

  it("keeps stored-secret probing for the same normalized issuer and client", async () => {
    const response = await POST(request({ issuerUrl: ` ${configuredIssuer}/ `, clientId: " configured-client " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, clientSecretTested: true, clientSecretValid: true });
    expect(tokenRequests()).toEqual([{
      url: `${configuredIssuer}/token`, method: "POST",
      body: expect.stringContaining(`client_secret=${storedSecret}`),
    }]);
  });

  it("rejects a discovery document bound to a different issuer before probing", async () => {
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      return Response.json(metadata(draftIssuer));
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(tokenRequests()).toEqual([]);
  });

  it("cancels an open failed discovery body before returning an error", async () => {
    let cancelled = false;
    fixture.networkFetch.mockImplementation(async () => new Response(new ReadableStream({
      cancel() { cancelled = true; },
    }), { status: 503 }));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(cancelled).toBe(true);
    expect(tokenRequests()).toEqual([]);
  });

  it.each(["authorization_endpoint", "token_endpoint", "jwks_uri"])("rejects private advertised %s before any credential request", async (field) => {
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      return Response.json({ ...metadata(configuredIssuer), [field]: "http://169.254.169.254/latest/meta-data" });
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(tokenRequests()).toEqual([]);
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${configuredIssuer}/.well-known/openid-configuration`]);
  });

  it("rejects an advertised token hostname resolving to a private IP", async () => {
    const lookup = dns.promises.lookup.bind(dns.promises);
    vi.spyOn(dns.promises, "lookup").mockImplementation((host, options) => (
      host === "private-oidc.example" ? Promise.resolve([{ address: "10.0.0.8", family: 4 }]) : lookup(host, options)
    ));
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      return Response.json({ ...metadata(configuredIssuer), token_endpoint: "https://private-oidc.example/token" });
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(tokenRequests()).toEqual([]);
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${configuredIssuer}/.well-known/openid-configuration`]);
  });

  it.each(["file:///etc/passwd", "/relative-token", "https://user:password@8.8.8.8/token"])("rejects invalid advertised endpoint %s", async (tokenEndpoint) => {
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      return Response.json({ ...metadata(configuredIssuer), token_endpoint: tokenEndpoint });
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(tokenRequests()).toEqual([]);
  });

  it("permits a trusted issuer to advertise a token endpoint on a separate public origin", async () => {
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      if (init.method === "POST") return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({ ...metadata(configuredIssuer), token_endpoint: `${draftIssuer}/token` });
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ clientSecretValid: true });
    expect(tokenRequests()).toEqual([{
      url: `${draftIssuer}/token`, method: "POST", body: expect.stringContaining(`client_secret=${storedSecret}`),
    }]);
  });

  it("honors an explicitly empty secret instead of restoring the stored secret", async () => {
    const response = await POST(request({ clientSecret: "" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ clientSecretTested: false });
    expect(tokenRequests()).toEqual([]);
  });

  it("preserves the production code exchange and PKCE at a public token endpoint", async () => {
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      return Response.json({ id_token: "signed-id-token", access_token: "public-access-token" });
    });
    const result = await exchangeOidcCode({
      tokenEndpoint: `${configuredIssuer}/token`, clientId: "configured-client", clientSecret: storedSecret,
      code: "authorization-code-canary", redirectUri: "http://localhost:20128/callback", codeVerifier: "pkce-canary",
    });
    expect(result).toEqual({ id_token: "signed-id-token", access_token: "public-access-token" });
    expect(tokenRequests().map(({ url, body }) => ({ url, fields: Object.fromEntries(new URLSearchParams(body)) }))).toEqual([{
      url: `${configuredIssuer}/token`, fields: {
        grant_type: "authorization_code", client_id: "configured-client", code: "authorization-code-canary",
        redirect_uri: "http://localhost:20128/callback", code_verifier: "pkce-canary", client_secret: storedSecret,
      },
    }]);
  });

  it("rejects a discovery redirect to a private host without contacting it", async () => {
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private-discovery" } });
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${configuredIssuer}/.well-known/openid-configuration`]);
  });

  it("never follows a token redirect carrying the stored secret to another public origin", async () => {
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      if (init.method === "POST") {
        return new Response(null, { status: 307, headers: { location: `${draftIssuer}/stolen` } });
      }
      return Response.json(metadata(configuredIssuer));
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(tokenRequests()).toEqual([{
      url: `${configuredIssuer}/token`, method: "POST", body: expect.stringContaining(`client_secret=${storedSecret}`),
    }]);
  });

  it("does not send a production authorization code or secret to a private token endpoint", async () => {
    await expect(exchangeOidcCode({
      tokenEndpoint: "http://127.0.0.1/token", clientId: "configured-client", clientSecret: storedSecret,
      code: "authorization-code-canary", redirectUri: "http://localhost:20128/callback", codeVerifier: "pkce-canary",
    })).rejects.toThrow(/Blocked URL/);
    expect(fixture.requests).toEqual([]);
  });

  it("blocks a private draft issuer before discovery or secret transmission", async () => {
    const response = await POST(request({ issuerUrl: "http://127.0.0.1/issuer", clientSecret: "explicit-draft-secret" }));
    expect(response.status).toBe(400);
    expect(fixture.requests).toEqual([]);
  });

  it.each(["not-a-url", "file:///etc/passwd", "https://8.8.8.8/issuer?unexpected=query"])("returns a client error for invalid issuer %s", async (issuerUrl) => {
    const response = await POST(request({ issuerUrl }));
    expect(response.status).toBe(400);
    expect(fixture.requests).toEqual([]);
  });

  it("guards remote JWKS redirects while verifying a signed ID token", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const idToken = await new SignJWT({ nonce: "nonce-canary" })
      .setProtectedHeader({ alg: "ES256", kid: "fixture-key" })
      .setIssuer(configuredIssuer).setAudience("configured-client").setExpirationTime("1h").sign(privateKey);
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private-jwks" } });
    });
    await expect(verifyOidcIdToken({
      idToken, issuer: configuredIssuer, audience: "configured-client", jwksUri: `${configuredIssuer}/jwks`, nonce: "nonce-canary",
    })).rejects.toThrow(/Blocked URL/);
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${configuredIssuer}/jwks`]);
  });

  it("still verifies an ID token from a public JWKS endpoint", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    const idToken = await new SignJWT({ nonce: "nonce-canary", sub: "public-user" })
      .setProtectedHeader({ alg: "ES256", kid: "fixture-key" })
      .setIssuer(configuredIssuer).setAudience("configured-client").setExpirationTime("1h").sign(privateKey);
    fixture.networkFetch.mockImplementation(async (url, init = {}) => {
      fixture.requests.push({ url: String(url), method: init.method || "GET", body: String(init.body || "") });
      return Response.json({ keys: [{ ...jwk, kid: "fixture-key", alg: "ES256" }] });
    });
    const payload = await verifyOidcIdToken({
      idToken, issuer: configuredIssuer, audience: "configured-client", jwksUri: `${configuredIssuer}/jwks`, nonce: "nonce-canary",
    });
    expect(payload).toMatchObject({ sub: "public-user", iss: configuredIssuer, aud: "configured-client", nonce: "nonce-canary" });
    expect(fixture.requests.map(({ url }) => url)).toEqual([`${configuredIssuer}/jwks`]);
  });
});
