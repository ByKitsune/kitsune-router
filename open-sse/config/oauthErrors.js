// OAuth 2.0 token-endpoint errors (RFC 6749 section 5.2), plus the explicit
// rotating-token errors consumed by the Codex refresh lifecycle. Only these
// identifiers are safe to include in diagnostics; upstream payloads are private.
export const OAUTH_REFRESH_ERROR_CODES = new Set([
  "invalid_request", "invalid_client", "invalid_grant", "unauthorized_client",
  "unsupported_grant_type", "invalid_scope", "access_denied", "server_error",
  "temporarily_unavailable", "refresh_token_expired", "refresh_token_reused",
  "refresh_token_invalidated",
]);
