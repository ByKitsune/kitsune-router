import { PROVIDERS } from "../config/providers.js";
import { OAUTH_ENDPOINTS, REFRESH_LEAD_MS } from "../config/appConstants.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { dedupRefresh, getRefreshProxyKey } from "./tokenRefresh/dedup.js";
import { setTimeout as delay } from "node:timers/promises";
import {
  refreshXaiToken,
  refreshAccessToken,
  refreshKimiToken,
  refreshClineToken,
  refreshClaudeOAuthToken,
  refreshGoogleToken,
  refreshCodexToken,
  refreshKiroToken,
  refreshIflowToken,
  refreshGitHubToken,
  refreshCopilotToken,
  refreshCodebuddyToken,
  refreshCodebuddyIntlToken,
  refreshTraeToken,
  refreshZedToken,
  refreshWindsurfToken,
  classifyOAuthRefreshError,
} from "./tokenRefresh/providers.js";

// Re-export all provider refresh functions (preserves public API for all consumers)
export {
  refreshAccessToken,
  refreshKimiToken,
  refreshClineToken,
  refreshClaudeOAuthToken,
  refreshGoogleToken,
  refreshCodexToken,
  refreshKiroToken,
  refreshIflowToken,
  refreshGitHubToken,
  refreshCopilotToken,
  refreshCodebuddyToken,
  refreshCodebuddyIntlToken,
  refreshTraeToken,
  refreshZedToken,
  refreshWindsurfToken,
  classifyOAuthRefreshError,
};

export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export function isUnrecoverableRefreshError(result) {
  return (
    result &&
    typeof result === "object" &&
    (result.error === "unrecoverable_refresh_error" ||
      result.error === "refresh_token_reused" ||
      result.error === "invalid_request" ||
      result.error === "invalid_grant")
  );
}

export function getRefreshLeadMs(provider) {
  if (REFRESH_LEAD_MS[provider]) return REFRESH_LEAD_MS[provider];
  // Legacy id after kimi-coding → kimi merge
  if (provider === "kimi-coding" && REFRESH_LEAD_MS.kimi) return REFRESH_LEAD_MS.kimi;
  return TOKEN_EXPIRY_BUFFER_MS;
}

export function parseVertexSaJson(apiKey) {
  if (typeof apiKey !== "string") return null;
  try {
    const parsed = JSON.parse(apiKey);
    if (parsed.type === "service_account" && parsed.client_email && parsed.private_key && parsed.project_id) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// Cache Vertex tokens by service account email and transport policy { token, expiresAt }
const vertexTokenCache = new Map();

export async function refreshVertexToken(saJson, log, proxyOptions = null, signal = null) {
  signal?.throwIfAborted();
  const cacheKey = JSON.stringify([saJson.client_email, getRefreshProxyKey(proxyOptions)]);
  const cached = vertexTokenCache.get(cacheKey);

  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) {
    return { accessToken: cached.token, expiresAt: cached.expiresAt };
  }

  return dedupRefresh("vertex", cacheKey, async refreshSignal => {
  try {
    const { SignJWT, importPKCS8 } = await import("jose");
    log?.debug?.("TOKEN_REFRESH", `Vertex minting token for ${saJson.client_email}`);
    const privateKey = await importPKCS8(saJson.private_key.replace(/\\n/g, "\n"), "RS256");
    const now = Math.floor(Date.now() / 1000);

    const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/cloud-platform" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(saJson.client_email)
      .setAudience(OAUTH_ENDPOINTS.google.token)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    const res = await proxyAwareFetch(OAUTH_ENDPOINTS.google.token, {
      signal: refreshSignal,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    }, proxyOptions);

    if (!res.ok) {
      const err = await res.text();
      log?.error?.("TOKEN_REFRESH", `Vertex token mint failed: ${err}`);
      return null;
    }

    const { access_token, expires_in } = await res.json();
    const expiresAt = Date.now() + (expires_in ?? 3600) * 1000;

    vertexTokenCache.set(cacheKey, { token: access_token, expiresAt });
    log?.info?.("TOKEN_REFRESH", `Vertex token minted for ${saJson.client_email}`);

    return { accessToken: access_token, expiresAt };
  } catch (error) {
    refreshSignal.throwIfAborted();
    log?.error?.("TOKEN_REFRESH", `Vertex token error: ${error.message}`);
    return null;
  }
  }, log, proxyOptions, signal);
}

function vertexRefreshHandler(c, log, proxyOptions = null, signal = null) {
  signal?.throwIfAborted();
  const saJson = parseVertexSaJson(c.apiKey);
  if (!saJson) return null;
  return refreshVertexToken(saJson, log, proxyOptions, signal);
}

const REFRESH_HANDLERS = {
  "gemini-cli": (c, log, proxyOptions, signal) => refreshGoogleToken(c.refreshToken, PROVIDERS["gemini-cli"].clientId, PROVIDERS["gemini-cli"].clientSecret, log, proxyOptions, signal),
  antigravity: (c, log, proxyOptions, signal) => refreshGoogleToken(c.refreshToken, PROVIDERS.antigravity.clientId, PROVIDERS.antigravity.clientSecret, log, proxyOptions, signal),
  claude: (c, log, proxyOptions, signal) => refreshClaudeOAuthToken(c.refreshToken, log, proxyOptions, signal),
  codex: (c, log, proxyOptions, signal) => refreshCodexToken(c.refreshToken, log, proxyOptions, signal),
  iflow: (c, log, proxyOptions, signal) => refreshIflowToken(c.refreshToken, log, proxyOptions, signal),
  github: (c, log, proxyOptions, signal) => refreshGitHubToken(c.refreshToken, log, proxyOptions, signal),
  kiro: (c, log, proxyOptions, signal) => refreshKiroToken(c.refreshToken, c.providerSpecificData, log, proxyOptions, signal),
  xai: (c, log, proxyOptions, signal) => refreshXaiToken(c.refreshToken, log, proxyOptions, signal),
  // Grok CLI shares xAI OAuth client + token endpoint (device-code tokens refresh the same way)
  "grok-cli": (c, log, proxyOptions, signal) => refreshXaiToken(c.refreshToken, log, proxyOptions, signal),
  gcli: (c, log, proxyOptions, signal) => refreshXaiToken(c.refreshToken, log, proxyOptions, signal),
  "codebuddy-cn": (c, log, proxyOptions, signal) => refreshCodebuddyToken(c.refreshToken, log, proxyOptions, signal),
  "codebuddy-intl": (c, log, proxyOptions, signal) => refreshCodebuddyIntlToken(c.refreshToken, log, proxyOptions, signal),
  trae: (c, log, proxyOptions, signal) => refreshTraeToken(c.refreshToken, c, log, proxyOptions, signal),
  cline: (c, log, proxyOptions, signal) => refreshClineToken(c.refreshToken, log, proxyOptions, signal),
  zed: (c, log, proxyOptions, signal) => refreshZedToken(signal),
  windsurf: (c, log, proxyOptions, signal) => refreshWindsurfToken(c, log, signal),
  // Kimi Code OAuth (merged into id `kimi`); legacy id still routes here
  kimi: (c, log, proxyOptions, signal) => refreshKimiToken(c.refreshToken, c, log, proxyOptions, signal),
  "kimi-coding": (c, log, proxyOptions, signal) => refreshKimiToken(c.refreshToken, c, log, proxyOptions, signal),
  vertex: vertexRefreshHandler,
  "vertex-partner": vertexRefreshHandler
};

export async function getAccessToken(provider, credentials, log, proxyOptions = null, signal = null) {
  signal?.throwIfAborted();
  if (!credentials || !credentials.refreshToken || typeof credentials.refreshToken !== "string") {
    log?.warn?.("TOKEN_REFRESH", `No valid refresh token available for provider: ${provider}`);
    return null;
  }
  return _getAccessTokenInternal(provider, credentials, log, proxyOptions, signal);
}

async function _getAccessTokenInternal(provider, credentials, log, proxyOptions = null, signal = null) {
  if (provider === "gemini") {
    return refreshGoogleToken(credentials.refreshToken, PROVIDERS.gemini.clientId, PROVIDERS.gemini.clientSecret, log, proxyOptions, signal);
  }
  const handler = REFRESH_HANDLERS[provider];
  if (!handler) {
    log?.warn?.("TOKEN_REFRESH", `Unsupported provider for token refresh: ${provider}`);
    return null;
  }
  return handler(credentials, log, proxyOptions, signal);
}

export async function refreshTokenByProvider(provider, credentials, log, proxyOptions = null, signal = null) {
  signal?.throwIfAborted();
  if (!credentials.refreshToken) return null;
  const handler = REFRESH_HANDLERS[provider];
  return handler ? handler(credentials, log, proxyOptions, signal) : refreshAccessToken(provider, credentials.refreshToken, credentials, log, proxyOptions, signal);
}

export function formatProviderCredentials(provider, credentials, log) {
  const config = PROVIDERS[provider];
  if (!config) {
    log?.warn?.("TOKEN_REFRESH", `No configuration found for provider: ${provider}`);
    return null;
  }

  switch (provider) {
    case "gemini":
      return {
        apiKey: credentials.apiKey,
        accessToken: credentials.accessToken,
        projectId: credentials.projectId
      };

    case "claude":
      return {
        apiKey: credentials.apiKey,
        accessToken: credentials.accessToken
      };

    case "codex":
    case "iflow":
    case "openai":
    case "openrouter":
    case "xai":
    case "grok-cli":
      return {
        apiKey: credentials.apiKey,
        accessToken: credentials.accessToken
      };

    case "antigravity":
    case "gemini-cli":
      return {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        projectId: credentials.projectId
      };

    default:
      return {
        apiKey: credentials.apiKey,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken
      };
  }
}

export async function getAllAccessTokens(userInfo, log, signal = null) {
  signal?.throwIfAborted();
  const results = {};

  if (userInfo.connections && Array.isArray(userInfo.connections)) {
    for (const connection of userInfo.connections) {
      if (connection.isActive && connection.provider) {
        const token = await getAccessToken(connection.provider, {
          refreshToken: connection.refreshToken
        }, log, null, signal);

        if (token) {
          results[connection.provider] = token;
        }
      }
    }
  }

  return results;
}

export async function refreshWithRetry(refreshFn, maxRetries = 3, log = null, signal = null) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    signal?.throwIfAborted();
    if (attempt > 0) {
      const delayMs = attempt * 1000;
      log?.debug?.("TOKEN_REFRESH", `Retry ${attempt}/${maxRetries} after ${delayMs}ms`);
      try {
        await delay(delayMs, undefined, { signal: signal || undefined });
      } catch (error) {
        signal?.throwIfAborted();
        throw error;
      }
    }

    try {
      const result = await refreshFn();
      signal?.throwIfAborted();
      if (result) return result;
    } catch (error) {
      signal?.throwIfAborted();
      log?.warn?.("TOKEN_REFRESH", `Attempt ${attempt + 1}/${maxRetries} failed: ${error.message}`);
    }
  }

  log?.error?.("TOKEN_REFRESH", `All ${maxRetries} retry attempts failed`);
  return null;
}
