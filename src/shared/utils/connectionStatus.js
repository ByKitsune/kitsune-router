// Connection status → UI badge variant.
//
// `needs_reauth` is a first-class status: the credential was revoked or
// rejected by provider policy, so no cooldown will heal it and the operator
// must re-authenticate. It must render as an error (not fall through to the
// neutral default) or a dead account looks healthy in the dashboard.
const ERROR_STATUSES = new Set(["error", "expired", "unavailable", "needs_reauth"]);
const SUCCESS_STATUSES = new Set(["active", "success"]);

export function getStatusVariant(isActive, effectiveStatus) {
  if (isActive === false) return "default";
  if (SUCCESS_STATUSES.has(effectiveStatus)) return "success";
  if (ERROR_STATUSES.has(effectiveStatus)) return "error";
  return "default";
}

// True when the status means "a human must re-authenticate this credential".
export function requiresReauth(status) {
  return status === "needs_reauth";
}

// Human-readable label for a connection status badge.
const STATUS_LABELS = {
  needs_reauth: "re-auth required",
};

export function getStatusLabel(status) {
  if (!status) return "unknown";
  return STATUS_LABELS[status] || status;
}
