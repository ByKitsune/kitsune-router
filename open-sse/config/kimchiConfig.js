// Publisher Kimchi v1.25.0 src/models.ts and src/cli.ts. Organization identity
// is supplied explicitly by the operator's credentials; it is never inferred.
export const KIMCHI_API_BASE = "https://llm.kimchi.dev";
export const KIMCHI_ORGANIZATION_HEADER = "X-CastAi-Organization-Id";
export const KIMCHI_CATALOG_CONFIG = Object.freeze({
  fetchTimeoutMs: 20_000,
  ttlMs: 5 * 60 * 1000,
  maxEntries: 100,
});

export function readKimchiToken(credentials) {
  return credentials?.apiKey || credentials?.accessToken || credentials?.providerSpecificData?.apiKey || null;
}

export function readKimchiOrganizationId(credentials) {
  const value = credentials?.providerSpecificData?.organizationId;
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !/^[\x21-\x7e]{1,200}$/.test(value)) {
    throw new TypeError("Invalid Kimchi organization ID");
  }
  return value;
}

export function normalizeKimchiEndpoint(endpoint) {
  const value = endpoint === undefined || endpoint === null ? KIMCHI_API_BASE : endpoint;
  if (typeof value !== "string" || !value.trim()) throw new TypeError("Invalid Kimchi endpoint");
  let url;
  try { url = new URL(value.trim()); } catch { throw new TypeError("Invalid Kimchi endpoint"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError("Invalid Kimchi endpoint");
  }
  return url.href.replace(/\/+$/, "");
}
