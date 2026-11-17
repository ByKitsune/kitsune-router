// Failure messages can quote credential-bearing JSON excerpts or request URLs.
export function safeRefreshErrorType(error) {
  return error instanceof SyntaxError ? "SyntaxError" : error instanceof TypeError ? "TypeError" : "Error";
}

// Diagnostic-only normalization: never echo arbitrary provider objects/strings.
// The credential result itself remains untouched for the existing auth layer.
export function safeRefreshExpiry(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
