import { OAUTH_REFRESH_ERROR_CODES } from "open-sse/config/oauthErrors.js";
import { MAX_UPSTREAM_ERROR_BYTES } from "open-sse/utils/error.js";
import { readModelCatalogResponse } from "open-sse/utils/modelCatalog.js";

// Token endpoint responses may echo authorization codes, refresh proofs or
// assertions. Retain only authoritative HTTP status and an allowlisted code.
export async function createOAuthEndpointError(response, operation, signal) {
  let oauthErrorCode;
  try {
    const payload = await readModelCatalogResponse(response, signal, { remaining: MAX_UPSTREAM_ERROR_BYTES });
    const code = payload?.error?.code || payload?.error;
    if (OAUTH_REFRESH_ERROR_CODES.has(code)) oauthErrorCode = code;
  } catch {
    signal.throwIfAborted();
  }
  return Object.assign(new Error(`${operation} failed (HTTP ${response.status})`), {
    status: response.status,
    ...(oauthErrorCode ? { oauthErrorCode } : {}),
  });
}
