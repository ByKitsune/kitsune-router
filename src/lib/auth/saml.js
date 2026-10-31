import { SAML } from "@node-saml/node-saml";
import { createHash, randomBytes } from "node:crypto";
import { getSettings } from "../db/repos/settingsRepo.js";

export const SAML_STATE_MAX_AGE_SECONDS = 10 * 60;
const REQUEST_EXPIRATION_MS = SAML_STATE_MAX_AGE_SECONDS * 1000;
const MAX_PENDING_REQUESTS = 4096;
const SAML_CLOCK_SKEW_MS = 60000;
const SAML_BEARER_METHOD = "urn:oasis:names:tc:SAML:2.0:cm:bearer";
// Shared by separately bundled routes and HMR reloads, not by separate processes.
// Multi-process deployments require sticky routing for the start and ACS requests.
const requestCacheKey = Symbol.for("kitsunerouter.saml.pendingRequests");
const pendingRequests = globalThis[requestCacheKey] ||= new Map();

function prunePendingRequests() {
  const now = Date.now();
  for (const [key, item] of pendingRequests) {
    if (now >= item.createdAt + REQUEST_EXPIRATION_MS) pendingRequests.delete(key);
  }
}

function scopedRequestKey(settings, origin, requestId) {
  const scope = createHash("sha256").update(JSON.stringify([
    origin,
    settings?.samlIssuer || "urn:kitsunerouter:sp",
    settings?.samlEntryPoint || "https://example.com/sso",
    formatX509Certificate(settings?.samlCert || ""),
  ])).digest("hex");
  return `${scope}:${requestId}`;
}

function createRequestCacheProvider(settings, origin) {
  return {
    async saveAsync(requestId, value) {
      prunePendingRequests();
      const key = scopedRequestKey(settings, origin, requestId);
      if (pendingRequests.has(key)) return null;
      // Fail closed for evicted requests and bound memory even during a login flood.
      if (pendingRequests.size >= MAX_PENDING_REQUESTS) {
        pendingRequests.delete(pendingRequests.keys().next().value);
      }
      const item = { value, createdAt: Date.now() };
      pendingRequests.set(key, item);
      return item;
    },
    async getAsync(requestId) {
      prunePendingRequests();
      return pendingRequests.get(scopedRequestKey(settings, origin, requestId))?.value || null;
    },
    async consumeAsync(requestId) {
      prunePendingRequests();
      const key = scopedRequestKey(settings, origin, requestId);
      const value = pendingRequests.get(key)?.value || null;
      pendingRequests.delete(key);
      return value;
    },
    async removeAsync(requestId) {
      const key = scopedRequestKey(settings, origin, requestId);
      return pendingRequests.delete(key) ? requestId : null;
    },
  };
}

export function discardSamlRequest(request, expectedRequestId, settings) {
  if (!expectedRequestId) return;
  pendingRequests.delete(scopedRequestKey(settings, getSamlBaseUrl(request, settings), expectedRequestId));
}
/**
 * Formats a raw Base64 string or unformatted X.509 certificate into standard PEM format.
 * @param {string} certStr
 * @returns {string}
 */
export function formatX509Certificate(certStr) {
  if (!certStr || typeof certStr !== "string") return "";
  const clean = certStr
    .replace(/-----BEGIN CERTIFICATE-----/gi, "")
    .replace(/-----END CERTIFICATE-----/gi, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");

  if (!clean) return "";

  const lines = clean.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

/**
 * Checks whether SAML configuration has essential parameters (entryPoint & cert).
 * @param {object} settings
 * @returns {boolean}
 */
export function isSamlConfigured(settings) {
  return Boolean(settings?.samlEntryPoint && settings?.samlCert);
}

/**
 * Fetches settings and returns runtime status + settings.
 * @returns {Promise<{ configured: boolean, settings: object }>}
 */
export async function getSamlRuntimeConfig() {
  const settings = await getSettings();
  return {
    configured: isSamlConfigured(settings),
    settings,
  };
}

/**
 * Creates a configured `@node-saml/node-saml` SAML instance with security defaults.
 * @param {object} settings
 * @param {string} origin
 * @returns {SAML}
 */
const DUMMY_FALLBACK_CERT =
  "-----BEGIN CERTIFICATE-----\nMIIC...DUMMY...\n-----END CERTIFICATE-----";

function trimTrailingSlashes(str) {
  return (str || "").replace(/\/+$/, "");
}

/**
 * Resolves the public Base URL / Origin for SAML requests.
 * Respects settings.baseUrl, process.env.BASE_URL, x-forwarded-proto, and x-forwarded-host.
 * @param {Request} request
 * @param {object} settings
 * @returns {string}
 */
export function getSamlBaseUrl(request, settings) {
  const configuredBaseUrl =
    (settings?.baseUrl || "").trim() ||
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "";

  if (configuredBaseUrl) {
    return trimTrailingSlashes(configuredBaseUrl);
  }

  if (request) {
    const forwardedProto = request?.headers?.get?.("x-forwarded-proto") || "";
    const forwardedHost = request?.headers?.get?.("x-forwarded-host") || "";
    const host = forwardedHost || request?.headers?.get?.("host") || "";
    if (host) {
      const protocol = (forwardedProto || new URL(request.url).protocol || "http:").replace(/:$/, "");
      return `${protocol}://${host}`.replace(/\/+$/, "");
    }
    if (request.url) {
      return trimTrailingSlashes(new URL(request.url).origin);
    }
  }

  return "http://localhost:20128";
}

export function createSamlInstance(settings, origin, { cacheProvider, generateUniqueId } = {}) {
  const cert = formatX509Certificate(settings?.samlCert || "") || DUMMY_FALLBACK_CERT;
  const callbackUrl = `${origin}/api/auth/saml/acs`;
  return new SAML({
    entryPoint: settings?.samlEntryPoint || "https://example.com/sso",
    issuer: settings?.samlIssuer || "urn:kitsunerouter:sp",
    idpCert: cert,
    cert: cert,
    callbackUrl: callbackUrl,
    acceptedClockSkewMs: SAML_CLOCK_SKEW_MS,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    validateInResponseTo: "always",
    requestIdExpirationPeriodMs: REQUEST_EXPIRATION_MS,
    cacheProvider: cacheProvider || createRequestCacheProvider(settings, origin),
    ...(generateUniqueId ? { generateUniqueId } : {}),
  });
}

/**
 * Builds SAML AuthnRequest redirect URL and returns { authorizeUrl, requestId }.
 * @param {Request} request
 * @param {object} settings
 * @returns {Promise<{ authorizeUrl: string, requestId: string }>}
 */
export async function buildSamlAuthorizeUrl(request, settings) {
  const origin = getSamlBaseUrl(request, settings);
  const requestId = `_${randomBytes(20).toString("hex")}`;
  const samlInstance = createSamlInstance(settings, origin, {
    generateUniqueId: () => requestId,
  });
  const authorizeUrl = await samlInstance.getAuthorizeUrlAsync("", undefined, {});

  return { authorizeUrl, requestId };
}

function hasCorrelatedBearer(profile, requestId, callbackUrl) {
  if (typeof profile.getAssertion !== "function") return false;
  // This public accessor is the assertion parsed from signature-verified bytes.
  // Do not reparse getSamlResponseXml(), which can include unsigned material.
  const confirmations = profile.getAssertion()?.Assertion?.Subject?.[0]?.SubjectConfirmation;
  if (!Array.isArray(confirmations)) return false;
  const now = Date.now();
  // Keep the application's first-timely-confirmation policy. A later matching
  // alternative cannot rescue the confirmation selected by native validation.
  const selected = confirmations.find(confirmation => {
    const data = confirmation?.SubjectConfirmationData?.[0]?.$;
    if (!data) return false;
    const before = data.NotBefore ? Date.parse(data.NotBefore) : null;
    const after = data.NotOnOrAfter ? Date.parse(data.NotOnOrAfter) : null;
    return (before === null || Number.isFinite(before) && now + SAML_CLOCK_SKEW_MS >= before)
      && (after === null || Number.isFinite(after) && now - SAML_CLOCK_SKEW_MS < after);
  });
  const data = selected?.SubjectConfirmationData?.[0]?.$;
  if (selected?.$?.Method !== SAML_BEARER_METHOD || data?.InResponseTo !== requestId
    || !Number.isFinite(Date.parse(data.NotOnOrAfter))) return false;
  try { return new URL(data.Recipient).href === new URL(callbackUrl).href; }
  catch { return false; }
}

/**
 * Validates SAML POST response from IdP ACS callback and returns user profile.
 * @param {Request} request
 * @param {object} body - Parsed form body or object containing SAMLResponse
 * @param {string} expectedRequestId - Request ID stored in saml_state cookie
 * @param {object} settings
 * @returns {Promise<object>}
 */
export async function validateSamlResponse(request, body, expectedRequestId, settings) {
  if (typeof expectedRequestId !== "string" || !expectedRequestId) {
    throw new Error("Missing SAML request state");
  }

  const origin = getSamlBaseUrl(request, settings);
  const key = scopedRequestKey(settings, origin, expectedRequestId);
  prunePendingRequests();
  const pending = pendingRequests.get(key);
  // Claim synchronously before any await: concurrent callbacks cannot share state.
  // All outcomes consume the request, including malformed XML and invalid signatures.
  pendingRequests.delete(key);
  if (!pending) throw new Error("SAML request state is invalid or expired");

  if (!settings?.samlCert) {
    throw new Error("IdP X.509 Certificate (samlCert) is missing or not configured");
  }

  let cachedInstant = pending.value;
  const readCachedInstant = requestId => requestId === expectedRequestId && cachedInstant
    && Date.now() < pending.createdAt + REQUEST_EXPIRATION_MS ? cachedInstant : null;
  const samlInstance = createSamlInstance(settings, origin, {
    // Node-SAML checks both Response and signed SubjectConfirmation using this
    // callback-local cache. A different response ID cannot access another request.
    cacheProvider: {
      async saveAsync() { return null; },
      async getAsync(requestId) {
        return readCachedInstant(requestId);
      },
      async consumeAsync(requestId) {
        const value = readCachedInstant(requestId);
        if (requestId === expectedRequestId) cachedInstant = null;
        return value;
      },
      async removeAsync(requestId) {
        if (requestId !== expectedRequestId || !cachedInstant) return null;
        cachedInstant = null;
        return requestId;
      },
    },
  });
  const container = typeof body === "object" && body !== null ? body : { SAMLResponse: body };
  if (typeof container.SAMLResponse !== "string" || !container.SAMLResponse) {
    throw new Error("Missing SAMLResponse parameter in assertion POST body");
  }

  const { profile, loggedOut } = await samlInstance.validatePostResponseAsync({
    SAMLResponse: container.SAMLResponse,
  });
  if (!profile || loggedOut || profile.inResponseTo !== expectedRequestId) {
    throw new Error("Invalid SAML authentication response");
  }
  // Node-SAML 5.2 also consumes a request after validation; counting cache reads
  // no longer proves SubjectConfirmation correlation. Check the documented,
  // verified assertion instead, after the dependency validates its signatures.
  if (!hasCorrelatedBearer(profile, expectedRequestId, `${origin}/api/auth/saml/acs`)) {
    throw new Error("SAML subject confirmation does not match request state");
  }
  return profile;
}

/**
 * Generates standard SP XML Metadata.
 * @param {string} origin
 * @param {object} settings
 * @returns {string}
 */
export function generateSamlMetadata(origin, settings) {
  const samlInstance = createSamlInstance(settings, origin);
  return samlInstance.generateServiceProviderMetadata();
}

/**
 * Extracts email claim from SAML profile assertion.
 * @param {object} profile
 * @param {object} settings
 * @returns {string}
 */
export function pickSamlEmail(profile = {}, settings = {}) {
  if (!profile) return "";

  // 1. Configured custom attribute
  const customAttr = settings.samlAttributeEmail;
  if (customAttr && profile[customAttr]) {
    const val = profile[customAttr];
    return Array.isArray(val) ? val[0] : String(val);
  }

  // 2. Common email claims
  const emailKeys = [
    "email",
    "emailAddress",
    "mail",
    "nameID",
    "nameId",
    "upn",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
  ];

  for (const key of emailKeys) {
    if (profile[key]) {
      const val = profile[key];
      return Array.isArray(val) ? val[0] : String(val);
    }
  }

  // 3. Fallback: check attributes object if present
  if (profile.attributes) {
    for (const key of emailKeys) {
      if (profile.attributes[key]) {
        const val = profile.attributes[key];
        return Array.isArray(val) ? val[0] : String(val);
      }
    }
  }

  return "";
}

/**
 * Extracts display name claim from SAML profile assertion.
 * @param {object} profile
 * @param {object} settings
 * @returns {string}
 */
export function pickSamlDisplayName(profile = {}, settings = {}) {
  if (!profile) return "";

  // 1. Configured custom attribute
  const customAttr = settings.samlAttributeName;
  if (customAttr && profile[customAttr]) {
    const val = profile[customAttr];
    return Array.isArray(val) ? val[0] : String(val);
  }

  // 2. Common name claims
  const nameKeys = [
    "displayName",
    "name",
    "cn",
    "commonName",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
  ];

  for (const key of nameKeys) {
    if (profile[key]) {
      const val = profile[key];
      return Array.isArray(val) ? val[0] : String(val);
    }
  }

  // 3. Combined givenName + surname
  if (profile.givenName || profile.sn || profile.surname) {
    const given = profile.givenName || "";
    const surname = profile.sn || profile.surname || "";
    const combined = `${given} ${surname}`.trim();
    if (combined) return combined;
  }

  // 4. Fallback to email
  return pickSamlEmail(profile, settings);
}
