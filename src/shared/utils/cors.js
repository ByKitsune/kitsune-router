// Shared CORS policy for the client-facing API surface.
//
// Previously every route sent `Access-Control-Allow-Headers: *`, which is more
// permissive than the surface needs. This is not a cookie-authenticated API —
// clients pass a bearer token explicitly — so a wildcard header allowlist is not
// directly exploitable, but a wildcard still lets any browser page send
// arbitrary custom headers to the gateway, and it hides which headers the API
// actually understands.
//
// The list below is derived from the headers the handlers really read
// (verified by grepping `headers.get(...)` across src/sse, src/app/api/v1 and
// open-sse/handlers):
//   authorization     bearer / API key
//   x-api-key         Anthropic-style key
//   content-type      JSON / multipart
//   accept            SSE vs JSON negotiation
//   x-connection-id   opt-in account pinning
//   idempotency-key   retry-safe client retries
//   anthropic-beta    Claude beta flags (1M context, interleaving)
//   anthropic-version Anthropic API versioning
//   x-zen-*           provenance headers set by the client SDKs
// `*` is intentionally NOT included.
export const API_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Authorization",
    "Content-Type",
    "Accept",
    "X-API-Key",
    "X-Connection-Id",
    "Idempotency-Key",
    "Anthropic-Beta",
    "Anthropic-Version",
    "OpenAI-Beta",
    "X-Stainless-Lang",
    "X-Stainless-Package-Version",
    "X-Stainless-Os",
    "X-Stainless-Arch",
    "X-Stainless-Runtime",
    "X-Stainless-Runtime-Version",
    "X-Stainless-Retry-Count",
    "X-Stainless-Timeout",
  ].join(", "),
  "Access-Control-Max-Age": "86400",
  "Access-Control-Expose-Headers": "x-request-id, x-should-retry, Retry-After",
};

export function corsHeaders(extra = {}) {
  return { ...API_CORS_HEADERS, ...extra };
}
