// Kiro uses camelCase token fields for both AWS OIDC and social grants.
export function isKiroToken(value) {
  return typeof value === "string" && value.length > 0 && !/\s/.test(value);
}

export function isKiroTokenResponse(data) {
  return data !== null && typeof data === "object" && !Array.isArray(data)
    && !data.error && isKiroToken(data.accessToken)
    && (data.refreshToken == null || isKiroToken(data.refreshToken))
    && (data.expiresIn === undefined || (Number.isFinite(data.expiresIn) && data.expiresIn > 0))
    && (data.tokenType === undefined || (typeof data.tokenType === "string" && data.tokenType.toLowerCase() === "bearer"))
    && (data.profileArn == null || typeof data.profileArn === "string");
}

export async function readKiroJson(response, operation) {
  try {
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    // JSON parser errors can include the credential-bearing response text.
    throw new Error(`${operation} returned an invalid JSON response`);
  }
}

export async function readKiroGrant(response, operation) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`${operation} failed (HTTP ${response.status})`);
  }
  const data = await readKiroJson(response, operation);
  if (!isKiroTokenResponse(data)) throw new Error(`${operation} returned an invalid token response`);
  return data;
}

const DEVICE_ERRORS = new Set([
  "authorization_pending", "slow_down", "access_denied", "expired_token",
  "invalid_client", "invalid_grant", "invalid_request", "invalid_scope",
  "unauthorized_client", "unsupported_grant_type", "server_error", "temporarily_unavailable",
]);

export function kiroDeviceError(response, data) {
  const error = response.status === 401 || response.status === 403 ? "access_denied"
    : DEVICE_ERRORS.has(data?.error) ? data.error : "invalid_response";
  return {
    error,
    // Do not forward upstream payloads that may echo device/client credentials.
    error_description: error === "authorization_pending" ? "Waiting for authorization"
      : error === "slow_down" ? "Authorization polling must slow down"
        : `Kiro device authorization failed (${error})`,
  };
}
