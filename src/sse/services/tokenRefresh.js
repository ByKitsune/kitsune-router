// Re-export from open-sse with local logger
import * as log from "../utils/logger.js";
import { getProviderConnectionById, updateProviderConnection } from "../../lib/localDb.js";
import { resolveConnectionProxyConfig } from "../../lib/network/connectionProxy.js";
import { createRefreshOperation, getAcquiredRefreshResult, waitForRefresh } from "open-sse/services/tokenRefresh/dedup.js";
import {
  getProjectIdForConnection,
  invalidateProjectId,
  removeConnection,
} from "open-sse/services/projectId.js";
import {
  TOKEN_EXPIRY_BUFFER_MS as BUFFER_MS,
  refreshAccessToken as _refreshAccessToken,
  refreshClaudeOAuthToken as _refreshClaudeOAuthToken,
  refreshGoogleToken as _refreshGoogleToken,
  refreshCodexToken as _refreshCodexToken,
  refreshIflowToken as _refreshIflowToken,
  refreshGitHubToken as _refreshGitHubToken,
  refreshCopilotToken as _refreshCopilotToken,
  getAccessToken as _getAccessToken,
  refreshTokenByProvider as _refreshTokenByProvider,
  formatProviderCredentials as _formatProviderCredentials,
  refreshKiroToken as _refreshKiroToken,
  getRefreshLeadMs as _getRefreshLeadMs
} from "open-sse/services/tokenRefresh.js";
import {
  parseTimeMs,
  mergeRefreshedCredentials,
  refreshProviderCredentials as _refreshProviderCredentials,
  shouldRefreshCredentials as _shouldRefreshCredentials,
} from "open-sse/services/oauthCredentialManager.js";

export const TOKEN_EXPIRY_BUFFER_MS = BUFFER_MS;

// ─── Re-exports wrapped with local logger ─────────────────────────────────────

async function refreshProxyOptions(providerSpecificData, proxyOptions, signal) {
  signal?.throwIfAborted();
  const resolved = proxyOptions ?? await resolveConnectionProxyConfig(providerSpecificData || {});
  signal?.throwIfAborted();
  return resolved;
}

export const refreshAccessToken = async (provider, refreshToken, credentials, proxyOptions = null, signal = null) =>
  _refreshAccessToken(provider, refreshToken, credentials, log,
    await refreshProxyOptions(credentials?.providerSpecificData, proxyOptions, signal), signal);

export const refreshClaudeOAuthToken = (refreshToken, proxyOptions = null, signal = null) =>
  _refreshClaudeOAuthToken(refreshToken, log, proxyOptions, signal);

export const refreshGoogleToken = (refreshToken, clientId, clientSecret, proxyOptions = null, signal = null) =>
  _refreshGoogleToken(refreshToken, clientId, clientSecret, log, proxyOptions, signal);

export const refreshCodexToken = (refreshToken, proxyOptions = null, signal = null) =>
  _refreshCodexToken(refreshToken, log, proxyOptions, signal);

export const refreshIflowToken = (refreshToken, proxyOptions = null, signal = null) =>
  _refreshIflowToken(refreshToken, log, proxyOptions, signal);

export const refreshGitHubToken = (refreshToken, proxyOptions = null, signal = null) =>
  _refreshGitHubToken(refreshToken, log, proxyOptions, signal);

export const refreshCopilotToken = (githubAccessToken, proxyOptions = null, signal = null) =>
  _refreshCopilotToken(githubAccessToken, log, proxyOptions, signal);

export const refreshKiroToken = async (refreshToken, providerSpecificData, proxyOptions = null, signal = null) =>
  _refreshKiroToken(refreshToken, providerSpecificData, log,
    await refreshProxyOptions(providerSpecificData, proxyOptions, signal), signal);

export const getAccessToken = async (provider, credentials, proxyOptions = null, signal = null) =>
  _getAccessToken(provider, credentials, log,
    await refreshProxyOptions(credentials?.providerSpecificData, proxyOptions, signal), signal);

export const refreshTokenByProvider = async (provider, credentials, proxyOptions = null, signal = null) =>
  _refreshTokenByProvider(provider, credentials, log,
    await refreshProxyOptions(credentials?.providerSpecificData, proxyOptions, signal), signal);

export const formatProviderCredentials = (provider, credentials) =>
  _formatProviderCredentials(provider, credentials, log);

export const getAllAccessTokens = async (userInfo, signal = null) => {
  signal?.throwIfAborted();
  const results = {};
  for (const connection of userInfo.connections || []) {
    if (!connection.isActive || !connection.provider) continue;
    const token = await getAccessToken(connection.provider, connection, null, signal);
    if (token) results[connection.provider] = token;
  }
  return results;
};

export const shouldRefreshCredentials = (provider, credentials) =>
  _shouldRefreshCredentials(provider, credentials);

// ─── Lifecycle hook ───────────────────────────────────────────────────────────

/**
 * Call this when a connection is fully closed / removed.
 * Aborts any in-flight projectId fetch and evicts its cache entry,
 * preventing the module-level Maps from accumulating stale entries.
 *
 * @param {string} connectionId
 */
export function releaseConnection(connectionId) {
  if (!connectionId) return;
  removeConnection(connectionId);
  log.debug("TOKEN_REFRESH", "Released connection resources", { connectionId });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute an ISO expiry timestamp from a relative expiresIn (seconds).
 * @param {number} expiresIn
 * @returns {string}
 */
function toExpiresAt(expiresIn) {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function normalizeExpiresAt(expiresAt) {
  const ms = parseTimeMs(expiresAt);
  if (ms === null) return null;
  return new Date(ms).toISOString();
}

/**
 * Providers that carry a real Google project ID.
 * @param {string} provider
 * @returns {boolean}
 */
function needsProjectId(provider) {
  return provider === "antigravity" || provider === "gemini-cli";
}

/**
 * Non-blocking: fetch the project ID for a connection after a token refresh and
 * persist it to localDb.  Invalidates the stale cached value first so the fetch
 * always retrieves a fresh one.
 *
 * @param {string} provider
 * @param {string} connectionId
 * @param {string} accessToken
 * @param {object|null} proxyOptions
 */
function _refreshProjectId(provider, connectionId, accessToken, proxyOptions = null, signal = null) {
  if (signal?.aborted || !needsProjectId(provider) || !connectionId || !accessToken) return;

  // Evict the stale cached entry so getProjectIdForConnection does a real fetch
  invalidateProjectId(connectionId);

  getProjectIdForConnection(connectionId, accessToken, provider, proxyOptions, signal)
    .then((projectId) => {
      if (!projectId || signal?.aborted) return;
      updateProviderCredentials(connectionId, { projectId }).catch((err) => {
        log.debug("TOKEN_REFRESH", "Failed to persist refreshed projectId", {
          connectionId,
          error: err?.message ?? err,
        });
      });
    })
    .catch((err) => {
      if (signal?.aborted) return;
      log.debug("TOKEN_REFRESH", "Failed to fetch projectId after token refresh", {
        connectionId,
        error: err?.message ?? err,
      });
    });
}

// ─── Local-specific: persist credentials to localDb ──────────────────────────

/**
 * Persist updated credentials for a connection to localDb.
 * Only fields that are present in `newCredentials` are written.
 *
 * @param {string} connectionId
 * @param {object} newCredentials
 * @returns {Promise<boolean>}
 */
export async function updateProviderCredentials(connectionId, newCredentials) {
  try {
    const updates = {};

    if (newCredentials.accessToken)         updates.accessToken  = newCredentials.accessToken;
    if (newCredentials.refreshToken)        updates.refreshToken = newCredentials.refreshToken;
    if (newCredentials.idToken)             updates.idToken = newCredentials.idToken;
    if (newCredentials.lastRefreshAt)       updates.lastRefreshAt = newCredentials.lastRefreshAt;
    if (newCredentials.expiresAt)           updates.expiresAt = newCredentials.expiresAt;
    if (newCredentials.expiresIn) {
      updates.expiresAt = toExpiresAt(newCredentials.expiresIn);
      updates.expiresIn = newCredentials.expiresIn;
    } else if (newCredentials.expiresAt) {
      const expiresAt = normalizeExpiresAt(newCredentials.expiresAt);
      if (expiresAt) {
        updates.expiresAt = expiresAt;
        const expiresMs = parseTimeMs(expiresAt);
        if (expiresMs) updates.expiresIn = Math.max(1, Math.floor((expiresMs - Date.now()) / 1000));
      }
    }
    if (newCredentials.providerSpecificData) {
      updates.providerSpecificData = {
        ...(newCredentials.existingProviderSpecificData || {}),
        ...newCredentials.providerSpecificData,
      };
    }
    if (newCredentials.copilotToken || newCredentials.copilotTokenExpiresAt) {
      updates.providerSpecificData = {
        ...(updates.providerSpecificData || newCredentials.existingProviderSpecificData || {}),
        ...(newCredentials.copilotToken ? { copilotToken: newCredentials.copilotToken } : {}),
        ...(newCredentials.copilotTokenExpiresAt ? { copilotTokenExpiresAt: newCredentials.copilotTokenExpiresAt } : {}),
      };
    }
    if (newCredentials.projectId)            updates.projectId = newCredentials.projectId;

    const result = await updateProviderConnection(connectionId, updates);
    log.info("TOKEN_REFRESH", "Credentials updated in localDb", {
      connectionId,
      success: !!result
    });
    return !!result;
  } catch (error) {
    log.error("TOKEN_REFRESH", "Error updating credentials in localDb", {
      connectionId,
      error: error.message,
    });
    return false;
  }
}

// ─── Local-specific: proactive token refresh ─────────────────────────────────

const proactiveRefreshTails = new Map();

/**
 * Check whether the provider token (and, for GitHub, the Copilot token) is
 * about to expire and refresh it proactively.
 *
 * @param {string} provider
 * @param {object} credentials
 * @param {{ force?: boolean, proxyOptions?: object, signal?: AbortSignal }} [options]  force=true skips the on-request lead check
 *   (used by background scheduler which applies a larger lead). Request path omits this.
 * @returns {Promise<object>} updated credentials object
 */
export async function checkAndRefreshToken(provider, credentials, options = {}) {
  options.signal?.throwIfAborted();
  const creds = { ...credentials };
  if (!creds.connectionId && creds.id) {
    creds.connectionId = creds.id;
  }

  if (!creds.connectionId) {
    return waitForRefresh(createRefreshOperation(signal => checkAndRefreshTokenInternal(provider, creds, { ...options, signal, projectSignal: options.signal })), options.signal);
  }

  const connectionId = creds.connectionId;
  const previous = proactiveRefreshTails.get(connectionId);
  // Queue each caller's own operation, including its DB reread and persistence.
  // A failed predecessor must not reject the following caller's operation.
  // A queued caller also subscribes to its predecessor. Cancelling the first
  // HTTP request therefore cannot abort a refresh still needed by a follower.
  // Retain the tail until actual settlement, including acquired token commits.
  let predecessor;
  const operation = createRefreshOperation(async signal => {
    if (previous) {
      try { await predecessor; }
      catch { /* Cancellation releases a caller, not an acquired-token commit. */ }
      await previous.barrier;
    }
    signal.throwIfAborted();
    return checkAndRefreshTokenInternal(provider, creds, { ...options, signal, projectSignal: options.signal });
  });
  if (previous) {
    // Subscribe synchronously, before this queued caller can cancel its parent.
    predecessor = waitForRefresh(previous, operation.controller.signal);
    predecessor.catch(() => {});
  }
  // A cancelled tail may settle before a predecessor's persistence finishes.
  // Carry that barrier forward separately so no later request can reread stale
  // rotating credentials, even after the lower ten-second result cache expires.
  operation.barrier = (previous?.barrier || Promise.resolve())
    .then(() => operation.promise).catch(() => {});
  proactiveRefreshTails.set(connectionId, operation);
  const cleanup = () => {
    if (proactiveRefreshTails.get(connectionId) === operation) {
      proactiveRefreshTails.delete(connectionId);
    }
  };
  operation.barrier.then(cleanup, cleanup);
  return waitForRefresh(operation, options.signal);
}

async function checkAndRefreshTokenInternal(provider, creds, options) {
  const signal = options.signal;
  signal?.throwIfAborted();

  // Adopt newer persisted token state even when the refresh token did not rotate.
  if (creds.connectionId) {
    const latest = await getProviderConnectionById(creds.connectionId).catch(() => null);
    signal?.throwIfAborted();
    const latestRefreshMs = Date.parse(latest?.lastRefreshAt || "");
    const credsRefreshMs = Date.parse(creds.lastRefreshAt || "");
    const dbIsNewer = Number.isFinite(latestRefreshMs)
      && (!Number.isFinite(credsRefreshMs) || latestRefreshMs > credsRefreshMs);
    if (dbIsNewer) {
      creds = {
        ...creds,
        refreshToken: latest.refreshToken || creds.refreshToken,
        accessToken: latest.accessToken || creds.accessToken,
        expiresAt: latest.expiresAt || latest.tokenExpiresAt || creds.expiresAt,
        lastRefreshAt: latest.lastRefreshAt || creds.lastRefreshAt,
      };
    }

    // Copilot service-token freshness is independent of the GitHub OAuth grant.
    // Adopt only token fields; the caller's proxy and other metadata stay intact.
    if (provider === "github" && latest?.providerSpecificData?.copilotToken) {
      const latestSpecific = latest.providerSpecificData;
      const currentSpecific = creds.providerSpecificData;
      const latestExpiryMs = parseTimeMs(latestSpecific.copilotTokenExpiresAt);
      const currentExpiryMs = parseTimeMs(currentSpecific?.copilotTokenExpiresAt);
      if (latestExpiryMs !== null && (
        !currentSpecific?.copilotToken || currentExpiryMs === null || latestExpiryMs > currentExpiryMs
      )) {
        creds.providerSpecificData = {
          ...currentSpecific,
          copilotToken: latestSpecific.copilotToken,
          copilotTokenExpiresAt: latestSpecific.copilotTokenExpiresAt,
        };
      }
    }
  }

  const proxyOptions = await refreshProxyOptions(creds.providerSpecificData, options.proxyOptions, signal);

  const force = options?.force === true;

  // ── 1. Regular access-token expiry ────────────────────────────────────────
  if (force || _shouldRefreshCredentials(provider, creds)) {
    const expiresAt = parseTimeMs(creds.expiresAt);
    const remaining = expiresAt ? expiresAt - Date.now() : null;
    const refreshLead = _getRefreshLeadMs(provider);

    log.info("TOKEN_REFRESH", "Refreshing provider credentials proactively", {
      provider,
      expiresIn: remaining === null ? null : Math.round(remaining / 1000),
      refreshLeadMs: refreshLead,
      lastRefreshAt: creds.lastRefreshAt || null,
    });

    let newCreds;
    try {
      newCreds = await _refreshProviderCredentials(provider, creds, log, proxyOptions, signal);
    } catch (error) {
      if (provider !== "kiro" || !signal?.aborted) throw error;
      // Kiro can acquire a rotating grant before optional profile discovery.
      // Finish committing any such result; never initiate another refresh after
      // cancellation, and retain the existing per-connection commit barrier.
      const acquired = await getAcquiredRefreshResult("kiro", creds.refreshToken, proxyOptions);
      if (!acquired) throw error;
      newCreds = mergeRefreshedCredentials(provider, creds, acquired);
    }
    if (newCreds?.accessToken || newCreds?.apiKey || newCreds?.copilotToken) {
      const mergedCreds = {
        ...newCreds,
        existingProviderSpecificData: creds.providerSpecificData,
      };

      // Keep following proactive callers behind this credential commit.
      await updateProviderCredentials(creds.connectionId, mergedCreds);

      creds = {
        ...creds,
        ...newCreds,
        expiresAt: newCreds.expiresIn
          ? toExpiresAt(newCreds.expiresIn)
          : normalizeExpiresAt(newCreds.expiresAt) || newCreds.expiresAt || creds.expiresAt,
        providerSpecificData: newCreds.providerSpecificData
          ? { ...creds.providerSpecificData, ...newCreds.providerSpecificData }
          : creds.providerSpecificData,
      };

      // Non-blocking: refresh projectId with the new access token
      if (!signal?.aborted) _refreshProjectId(provider, creds.connectionId, creds.accessToken, proxyOptions, options.projectSignal || signal);
    }
  }
  signal?.throwIfAborted();

  // ── 2. GitHub Copilot token expiry ────────────────────────────────────────
  if (provider === "github") {
    const copilotToken = creds.providerSpecificData?.copilotToken;
    if (copilotToken) creds.copilotToken = copilotToken;
    const copilotExpiresAt = creds.providerSpecificData?.copilotTokenExpiresAt
      ? creds.providerSpecificData.copilotTokenExpiresAt * 1000
      : 0;
    const now              = Date.now();
    const remaining        = copilotExpiresAt - now;

    if (!copilotToken || remaining < TOKEN_EXPIRY_BUFFER_MS) {
      log.info("TOKEN_REFRESH", "Copilot token expiring soon or missing, refreshing proactively", {
        provider,
        expiresIn: copilotToken ? Math.round(remaining / 1000) : "missing",
      });

      const copilotTokenResult = await refreshCopilotToken(creds.accessToken, proxyOptions, signal);
      if (copilotTokenResult) {
        const updatedSpecific = {
          ...creds.providerSpecificData,
          copilotToken:          copilotTokenResult.token,
          copilotTokenExpiresAt: copilotTokenResult.expiresAt,
        };

        await updateProviderCredentials(creds.connectionId, {
          providerSpecificData: updatedSpecific,
        });

        creds.providerSpecificData = updatedSpecific;
        creds.copilotToken = copilotTokenResult.token;
      }
    }
  }

  return creds;
}

// ─── Local-specific: combined GitHub + Copilot refresh ───────────────────────

/**
 * Refresh the GitHub OAuth token and immediately exchange it for a fresh
 * Copilot token.
 *
 * @param {object} credentials  – must contain `refreshToken`
 * @returns {Promise<object|null>} merged credentials or the raw GitHub credentials on Copilot failure
 */
export async function refreshGitHubAndCopilotTokens(credentials, proxyOptions = null, signal = null) {
  proxyOptions = await refreshProxyOptions(credentials.providerSpecificData, proxyOptions, signal);
  const newGitHubCreds = await refreshGitHubToken(credentials.refreshToken, proxyOptions, signal);
  if (!newGitHubCreds?.accessToken) return newGitHubCreds;

  const copilotToken = await refreshCopilotToken(newGitHubCreds.accessToken, proxyOptions, signal);
  if (!copilotToken) return newGitHubCreds;

  return {
    ...newGitHubCreds,
    providerSpecificData: {
      copilotToken:          copilotToken.token,
      copilotTokenExpiresAt: copilotToken.expiresAt,
    },
  };
}
