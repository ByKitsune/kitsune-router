import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const fixture = vi.hoisted(() => ({ settings: {}, token: "", jwk: null, cookies: null, fetch: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => fixture.settings }));
vi.mock("next/headers", () => ({ cookies: async () => fixture.cookies }));
vi.mock("@/shared/utils/ssrfGuard", () => ({
  assertPublicUrlAsync: vi.fn(),
  fetchPublic: (...args) => fixture.fetch(...args),
}));

import { verifyOidcIdToken } from "../../src/lib/auth/oidc.js";
import { GET as callback } from "../../src/app/api/auth/oidc/callback/route.js";

const issuer = "https://identity.example.invalid";
const audience = "synthetic-router-client";
const loginNonce = "synthetic-current-login-nonce";
let privateKey;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  fixture.jwk = { ...await exportJWK(pair.publicKey), kid: "synthetic-oidc-key", alg: "ES256" };
});

beforeEach(() => {
  vi.stubEnv("BASE_URL", "http://localhost:20128");
  vi.stubEnv("JWT_SECRET", "synthetic-oidc-nonce-binding-secret-20261031");
  fixture.settings = {
    authMode: "oidc", oidcIssuerUrl: issuer, oidcClientId: audience,
    oidcClientSecret: "synthetic-oidc-client-secret",
  };
  const values = new Map([
    ["oidc_state", "synthetic-login-state"], ["oidc_nonce", loginNonce],
    ["oidc_code_verifier", "synthetic-pkce-verifier"],
  ]);
  fixture.cookies = {
    get: name => values.has(name) ? { value: values.get(name) } : undefined,
    set: vi.fn(), delete: vi.fn(),
  };
  fixture.fetch.mockReset().mockImplementation(async url => {
    if (String(url).endsWith("/.well-known/openid-configuration")) return Response.json({
      issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
    });
    if (String(url).endsWith("/token")) return Response.json({ id_token: fixture.token });
    if (String(url).endsWith("/jwks")) return Response.json({ keys: [fixture.jwk] });
    throw new Error("Unexpected synthetic OIDC request");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function signedToken(nonce, overrides = {}) {
  return new SignJWT({ sub: "synthetic-user", ...(nonce === undefined ? {} : { nonce }), ...overrides })
    .setProtectedHeader({ alg: "ES256", kid: "synthetic-oidc-key" })
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime("5m").sign(privateKey);
}

function verify(idToken, nonce = loginNonce) {
  return verifyOidcIdToken({ idToken, issuer, audience, jwksUri: `${issuer}/jwks`, nonce });
}

function callbackRequest() {
  return new NextRequest("http://localhost:20128/api/auth/oidc/callback?code=synthetic-code&state=synthetic-login-state");
}

describe("OIDC ID tokens are bound to the initiating login nonce", () => {
  it("accepts a correctly signed token with the exact current-login nonce", async () => {
    expect(await verify(await signedToken(loginNonce))).toMatchObject({ sub: "synthetic-user", nonce: loginNonce });
  });

  it.each([
    ["another login", "synthetic-previous-login-nonce"], ["absent", undefined], ["empty", ""],
    ["null", null], ["numeric", 123], ["array", [loginNonce]], ["object", { nonce: loginNonce }],
  ])("rejects a validly signed token with %s nonce", async (_label, nonce) => {
    await expect(verify(await signedToken(nonce))).rejects.toThrow(/nonce/i);
  });

  it.each(["", null, 123])("requires a nonempty string login nonce (%s)", async nonce => {
    await expect(verify(await signedToken(loginNonce), nonce)).rejects.toThrow(/nonce/i);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it("does not set a dashboard session for a token bound to another login", async () => {
    fixture.token = await signedToken("synthetic-previous-login-nonce");
    const response = await callback(callbackRequest());
    expect(response.status).toBe(307);
    const destination = new URL(response.headers.get("location"));
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("error")).toMatch(/nonce/i);
    expect(destination.search).not.toContain(loginNonce);
    expect(destination.search).not.toContain("synthetic-previous-login-nonce");
    expect(fixture.cookies.set).not.toHaveBeenCalled();
    for (const name of ["oidc_state", "oidc_nonce", "oidc_code_verifier"]) {
      expect(fixture.cookies.delete).toHaveBeenCalledWith(name);
    }
  });

  it("still establishes a dashboard session after a matching signed token", async () => {
    fixture.token = await signedToken(loginNonce);
    const response = await callback(callbackRequest());
    expect(new URL(response.headers.get("location")).pathname).toBe("/dashboard");
    expect(fixture.cookies.set).toHaveBeenCalledWith("auth_token", expect.any(String), expect.objectContaining({
      httpOnly: true, sameSite: "lax", path: "/",
    }));
  });
});
