import crypto from "node:crypto";
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import { getSettings } from "@/lib/localDb";
import { assertPublicUrlAsync, fetchPublic } from "@/shared/utils/ssrfGuard";

export const OIDC_COOKIE_NAMES = {
  state: "oidc_state",
  nonce: "oidc_nonce",
  verifier: "oidc_code_verifier",
};

const DEFAULT_SCOPES = "openid profile email";
const DEFAULT_LOGIN_LABEL = "Sign in with OIDC";

function trimTrailingSlashes(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

function normalizeScopes(value) {
  return (value || DEFAULT_SCOPES).trim() || DEFAULT_SCOPES;
}

export function getPublicOrigin(request) {
  const configuredBaseUrl =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "";

  if (configuredBaseUrl) {
    return trimTrailingSlashes(configuredBaseUrl);
  }

  const forwardedProto = request?.headers?.get?.("x-forwarded-proto") || "";
  const forwardedHost = request?.headers?.get?.("x-forwarded-host") || "";
  const host = forwardedHost || request?.headers?.get?.("host") || "";
  if (host) {
    const protocol = (forwardedProto || new URL(request.url).protocol || "http:").replace(/:$/, "");
    return `${protocol}://${host}`.replace(/\/+$/, "");
  }

  return trimTrailingSlashes(new URL(request.url).origin);
}

export function isOidcConfigured(settings) {
  return !!(
    trimTrailingSlashes(settings?.oidcIssuerUrl) &&
    (settings?.oidcClientId || "").trim() &&
    (settings?.oidcClientSecret || "").trim()
  );
}

export async function getOidcRuntimeConfig() {
  const settings = await getSettings();
  if (!["oidc", "both"].includes(settings.authMode) || !isOidcConfigured(settings)) return null;

  const issuerUrl = trimTrailingSlashes(settings.oidcIssuerUrl);
  return {
    issuerUrl,
    clientId: settings.oidcClientId.trim(),
    clientSecret: settings.oidcClientSecret.trim(),
    scopes: normalizeScopes(settings.oidcScopes),
    loginLabel: (settings.oidcLoginLabel || DEFAULT_LOGIN_LABEL).trim() || DEFAULT_LOGIN_LABEL,
  };
}

export class OidcRequestError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "OidcRequestError";
  }
}

export function normalizeOidcIssuerUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("Issuer URL must be an HTTP(S) URL without credentials, query, or fragment");
    }
    return trimTrailingSlashes(url.toString());
  } catch (error) {
    throw new OidcRequestError(error.message || "Invalid OIDC issuer URL", { cause: error });
  }
}

async function validateOidcEndpoint(value, field) {
  try {
    if (typeof value !== "string" || !value) throw new Error(`OIDC discovery is missing ${field}`);
    const url = new URL(value);
    if (url.username || url.password || url.hash) throw new Error(`Invalid OIDC ${field}`);
    await assertPublicUrlAsync(url.toString());
  } catch (error) {
    throw new OidcRequestError(error.message || `Invalid OIDC ${field}`, { cause: error });
  }
}

async function fetchOidcPublic(url, init, options) {
  try {
    return await fetchPublic(url, init, options);
  } catch (error) {
    throw new OidcRequestError(error.message || "OIDC endpoint request failed", { cause: error });
  }
}

export async function fetchOidcDiscovery(issuerUrl) {
  const expectedIssuer = normalizeOidcIssuerUrl(issuerUrl);
  if (!expectedIssuer) throw new OidcRequestError("Issuer URL is required");
  const discoveryUrl = `${expectedIssuer}/.well-known/openid-configuration`;
  const res = await fetchOidcPublic(discoveryUrl, { cache: "no-store" });
  if (!res.ok) {
    await res.body?.cancel();
    throw new OidcRequestError(`Failed to load OIDC discovery document from ${discoveryUrl}`);
  }
  let discovery;
  try {
    discovery = await res.json();
  } catch (error) {
    throw new OidcRequestError("Invalid OIDC discovery document", { cause: error });
  }
  if (typeof discovery?.issuer !== "string" || normalizeOidcIssuerUrl(discovery.issuer) !== expectedIssuer) {
    throw new OidcRequestError("OIDC discovery issuer does not match the requested issuer");
  }
  // Providers may advertise endpoints on different public origins. Validate all
  // of them before returning metadata, and guard every subsequent network hop.
  for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri"]) {
    await validateOidcEndpoint(discovery[field], field);
  }
  return discovery;
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createOidcState() {
  return crypto.randomBytes(16).toString("base64url");
}

export function createOidcNonce() {
  return crypto.randomBytes(16).toString("base64url");
}

export function buildOidcAuthorizationUrl({
  authorizationEndpoint,
  clientId,
  redirectUri,
  scopes = DEFAULT_SCOPES,
  state,
  nonce,
  codeChallenge,
}) {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", normalizeScopes(scopes));
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeOidcCode({
  tokenEndpoint,
  clientId,
  clientSecret,
  code,
  redirectUri,
  codeVerifier,
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  const res = await fetchOidcPublic(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, { maxRedirects: 0 });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error_description || data?.error || `OIDC token exchange failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

export async function probeOidcClientSecret({
  tokenEndpoint,
  clientId,
  clientSecret,
  redirectUri,
}) {
  if (!clientSecret) {
    return {
      tested: false,
      valid: null,
      message: "No client secret was provided, so secret validation was skipped.",
    };
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: "__oidc_test_invalid_code__",
    redirect_uri: redirectUri,
    code_verifier: "__oidc_test_invalid_verifier__",
  });

  const res = await fetchOidcPublic(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, { maxRedirects: 0 });

  const data = await res.json().catch(() => ({}));
  const error = (data?.error || "").toLowerCase();
  const errorDescription = data?.error_description || data?.error || "";

  if (res.ok) {
    return {
      tested: true,
      valid: true,
      message: "Client secret was accepted by the token endpoint.",
      raw: data,
    };
  }

  if (error === "invalid_client" || error === "unauthorized_client" || /client.*(invalid|failed|mismatch)/i.test(errorDescription)) {
    return {
      tested: true,
      valid: false,
      message: errorDescription || "Client secret is not valid.",
      raw: data,
    };
  }

  if (error === "invalid_grant" || error === "invalid_code" || /grant|code/i.test(errorDescription)) {
    return {
      tested: true,
      valid: true,
      message: "Client secret was accepted; the token exchange failed only because the test authorization code is invalid.",
      raw: data,
    };
  }

  return {
    tested: true,
    valid: null,
    message: errorDescription || `Token endpoint responded with ${res.status}`,
    raw: data,
  };
}

export async function verifyOidcIdToken({
  idToken,
  issuer,
  audience,
  jwksUri,
  nonce,
}) {
  if (typeof nonce !== "string" || !nonce) {
    throw new OidcRequestError("OIDC login nonce is required");
  }
  const jwks = createRemoteJWKSet(new URL(jwksUri), {
    [customFetch]: (url, options) => fetchOidcPublic(url, options),
  });
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience,
  });
  // jose validates generic JWT claims, not the OIDC nonce extension. Compare
  // only after signature/issuer/audience verification, against this login's
  // server-held nonce; a token from another login must not create a session.
  if (payload.nonce !== nonce) {
    throw new OidcRequestError("OIDC ID token nonce does not match the login request");
  }
  return payload;
}

export function pickOidcDisplayName(payload = {}) {
  return payload.preferred_username || payload.email || payload.name || payload.given_name || payload.sub || "OIDC user";
}

export function pickOidcEmail(payload = {}) {
  return payload.email || "";
}
