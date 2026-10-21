// Provider responses are metadata, not a credential reveal API. Keep this
// response-only: routing and explicit credential updates still use stored values.
const SECRET_FIELDS = new Set([
  "apikey", "apitoken", "accesstoken", "refreshtoken", "idtoken", "copilottoken",
  "sessiontoken", "authtoken", "bearertoken", "servicetoken", "githubtoken", "gitlabtoken",
  "token", "jwt", "pat", "password", "passwd", "pwd", "clientsecret", "secret",
  "secretkey", "secretaccesskey", "privatekey", "authorization", "proxyauthorization",
  "cookie", "cookies", "cookiejar", "setcookie", "sso", "ssorw", "proto", "constructor", "prototype",
]);

// Unknown custom headers may be credentials, too. Only return known metadata
// headers; do not reuse the request-log filter, which only removes a denylist.
const PUBLIC_HEADERS = new Set([
  "accept", "content-type", "user-agent", "x-request-id", "x-client-version",
  "openai-organization", "openai-project", "anthropic-version", "anthropic-beta",
]);
const CREDENTIAL_METADATA = new Set([
  "expiresat", "expiresin", "expires", "expiry", "expired", "issuedat", "tokentype",
  "scope", "scopes", "region", "provider", "authtype", "authmethod", "clientid", "accountid", "resetat",
]);
const CREDENTIAL_CONTAINERS = new Set([
  "auth", "authentication", "credential", "credentials", "secrets", "tokens", "apikeys",
  "accesstokens", "refreshtokens", "idtokens", "copilottokens", "sessiontokens",
]);
const HEADER_CONTAINERS = new Set(["headers", "requestheaders", "responseheaders", "customheaders", "httpheaders"]);
const normalize = key => key.toLowerCase().replace(/[^a-z0-9]/g, "");
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const PROXY_URL_FIELDS = new Set(["connectionproxyurl", "proxyurl", "vercelrelayurl"]);
export const INVALID_PROXY_URL_DISPLAY = "[invalid proxy URL]";

export function sanitizeProxyUrl(value) {
  if (typeof value !== "string" || !value) return value;
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
    // Shared proxy transport accepts credentialless host:port addresses. Do
    // not turn those healthy legacy values into a display-only error marker.
    if (!hasScheme && value.includes("@")) return INVALID_PROXY_URL_DISPLAY;
    const url = new URL(hasScheme ? value : `http://${value}`);
    if (!url.hostname) return INVALID_PROXY_URL_DISPLAY;
    let changed = !!(url.username || url.password || url.hash);
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const name = normalize(key);
      if (SECRET_FIELDS.has(name) || CREDENTIAL_CONTAINERS.has(name) || name === "key" || name === "signature" || name === "sig" || /(?:token|secret|password|apikey)$/.test(name)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.toString() : value;
  } catch {
    return INVALID_PROXY_URL_DISPLAY;
  }
}

function sanitizeHeaders(headers) {
  if (Array.isArray(headers)) {
    return headers.flatMap(entry => {
      if (Array.isArray(entry)) {
        return PUBLIC_HEADERS.has(String(entry[0]).toLowerCase()) ? [[entry[0], sanitizeProviderResponse(entry[1])]] : [];
      }
      if (isRecord(entry) && PUBLIC_HEADERS.has(String(entry.name).toLowerCase())) {
        return [{ name: entry.name, value: sanitizeProviderResponse(entry.value) }];
      }
      return [];
    });
  }
  if (!isRecord(headers)) return {};
  return Object.fromEntries(Object.entries(headers)
    .filter(([name]) => PUBLIC_HEADERS.has(name.toLowerCase()))
    .map(([name, value]) => [name, sanitizeProviderResponse(value)]));
}

export function sanitizeProviderResponse(value, credentialContainer = false) {
  if (Array.isArray(value)) return value.map(item => sanitizeProviderResponse(item, credentialContainer)).filter(item => item !== undefined);
  if (!isRecord(value)) return credentialContainer && typeof value === "string" ? undefined : value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const name = normalize(key);
    if (SECRET_FIELDS.has(name)) return [];
    if ((typeof item === "string" || Array.isArray(item) || isRecord(item)) && !key.includes("/") && /(?:token|secret|password|privatekey|secretaccesskey|apikey)$/.test(name)) return [];
    if (credentialContainer && name === "key") return [];
    if (credentialContainer && !CREDENTIAL_METADATA.has(name) && typeof item === "string") return [];
    if (PROXY_URL_FIELDS.has(name)) return [[key, sanitizeProxyUrl(item)]];
    if (HEADER_CONTAINERS.has(name)) {
      const headers = sanitizeHeaders(item);
      if (Array.isArray(item) && item.length > 0 && headers.length === 0) return [];
      return [[key, headers]];
    }
    // Numeric quota/model token counts remain metadata. Token maps, unlike
    // usage counters, must not expose credentials stored under arbitrary names.
    const childCredentials = !CREDENTIAL_METADATA.has(name) && (credentialContainer || CREDENTIAL_CONTAINERS.has(name));
    const sanitized = sanitizeProviderResponse(item, childCredentials);
    if (childCredentials && Array.isArray(item) && item.length > 0 && sanitized.length === 0) return [];
    return [[key, sanitized]];
  }));
}

// Redacted metadata may be sent back by the editor. Merge objects recursively
// so omitted nested secrets survive; explicit values (including null) replace.
export function mergeProviderSpecificData(existing, incoming, field = "") {
  if (PROXY_URL_FIELDS.has(normalize(field)) && typeof existing === "string" && incoming === sanitizeProxyUrl(existing)) return existing;
  if (Array.isArray(existing) && Array.isArray(incoming) && incoming.length > 0) {
    // An unchanged redacted array is a metadata echo, not a credential deletion.
    // Explicit []/null and genuinely different arrays still replace as before.
    const publicArray = sanitizeProviderResponse({ [field]: existing })[field];
    if (JSON.stringify(incoming) === JSON.stringify(publicArray)) return existing;
  }
  if (!isRecord(existing) || !isRecord(incoming)) return incoming;
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    merged[key] = mergeProviderSpecificData(existing[key], value, key);
  }
  return merged;
}
