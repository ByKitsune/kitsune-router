// Redact account identities before they reach any log sink.
//
// Provider connection names are frequently the account's email address
// (`hi.vylra@gmail.com`), and production journald logs carried 589 lines with
// 27 unique email addresses before this helper existed. Email is PII: journald
// is readable by anyone with root, logs are routinely shipped to monitoring and
// backups, and retention is long.
//
// The redacted form must still be useful for debugging: an operator needs to
// tell two accounts apart and grep one account's history. A short, salted hash
// of the identity does exactly that while being non-reversible in practice.
//
// Design notes:
//  - Salt comes from MACHINE_ID_SALT when set, so hashes differ between hosts
//    (a leaked log from one box cannot be rainbow-tabled against another).
//  - A process-stable fallback salt keeps local/test output deterministic
//    instead of reshuffling on every restart.
//  - Output is deliberately short (8 hex chars) — enough to disambiguate the
//    handful of accounts on one gateway, cheap to read in a log line.
import { createHash } from "crypto";

// Preserve pre-rebrand pseudonymous identities so existing log correlation does
// not change merely because the product changed names. This is not UI branding.
const FALLBACK_SALT = "zenrouter-account-redaction-v1";

function salt() {
  const fromEnv = process.env.MACHINE_ID_SALT;
  return typeof fromEnv === "string" && fromEnv.trim() ? fromEnv.trim() : FALLBACK_SALT;
}

// Returns true when the string looks like an email address. Used to decide
// whether a connection label is PII at all.
export function looksLikeEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Stable, non-reversible short id for an account identity.
 * @param {string} identity - email, display name, or connection id
 * @returns {string} 8 hex chars, or "unknown" when there is nothing to hash
 */
export function redactAccount(identity) {
  if (identity == null) return "unknown";
  const raw = String(identity).trim();
  if (!raw) return "unknown";
  return createHash("sha256").update(`${salt()}:${raw}`).digest("hex").slice(0, 8);
}

/**
 * Build a log-safe label for a connection.
 *
 * Non-identifying labels (a human-chosen connection name like "Work account")
 * are kept verbatim — they are operator-authored, not PII, and keeping them
 * makes logs easier to read. Anything that looks like an email address is
 * replaced by `acc_<hash>`; a missing label falls back to the hashed
 * connection id so distinct accounts stay distinguishable.
 *
 * @param {{name?: string, displayName?: string, email?: string, id?: string}|null} connection
 * @returns {string}
 */
export function safeAccountLabel(connection) {
  if (!connection || typeof connection !== "object") return "unknown";
  const candidates = [connection.displayName, connection.name];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() && !looksLikeEmail(candidate)) {
      return candidate.trim().slice(0, 60);
    }
  }
  if (looksLikeEmail(connection.email)) return `acc_${redactAccount(connection.email)}`;
  if (typeof connection.email === "string" && connection.email.trim()) return `acc_${redactAccount(connection.email)}`;
  if (typeof connection.id === "string" && connection.id.trim()) return `acc_${redactAccount(connection.id)}`;
  return "unknown";
}

/**
 * Redact a single account label for logging.
 *
 * Kept separate from safeAccountLabel() because callers frequently hold only
 * the resolved `connectionName` string (credentials.connectionName is built as
 * `displayName || name || email || id`, so it is usually the email address),
 * not the whole connection object.
 *
 * A non-email label is returned as-is: those are operator-authored names like
 * "Work account", which are not PII and are more useful in logs than a hash.
 *
 * @param {string} name - Resolved connection name
 * @param {string} [fallbackId] - Connection id used when name is empty
 * @returns {string}
 */
export function redactAccountName(name, fallbackId) {
  if (typeof name === "string" && name.trim()) {
    const trimmed = name.trim();
    if (!looksLikeEmail(trimmed)) return trimmed.slice(0, 60);
    return `acc_${redactAccount(trimmed)}`;
  }
  if (typeof fallbackId === "string" && fallbackId.trim()) return `acc_${redactAccount(fallbackId)}`;
  return "unknown";
}

/**
 * Redact every email address embedded in a free-form string.
 *
 * Used on text that may quote an upstream error body (upstreams echo the
 * authenticated account back in their error messages). Keeps the rest of the
 * message intact so the log line stays actionable.
 *
 * @param {string} text
 * @returns {string}
 */
export function redactEmailsInText(text) {
  if (typeof text !== "string" || !text) return text;
  return text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, (match) => `acc_${redactAccount(match)}`);
}
