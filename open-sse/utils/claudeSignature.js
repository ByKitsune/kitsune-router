// Claude thinking signature validation (ported from CLIProxyAPI internal/signature).
// E-form: single-layer base64, decoded[0] == 0x12 (Claude marker).
// R-form: double-layer base64, outer decoded[0] == 'E', inner decoded[0] == 0x12.
// Cache prefix "...#sig" stripped before validation.

import { isValidBase64 } from "../translator/concerns/thoughtSignature.js";

const MAX_CLAUDE_SIGNATURE_LEN = 32 * 1024 * 1024;
const CLAUDE_SIGNATURE_MARKER = 0x12;

function stripCachePrefix(rawSignature) {
  if (typeof rawSignature !== "string") return "";
  const sig = rawSignature.trim();
  if (!sig) return "";
  const idx = sig.indexOf("#");
  return idx >= 0 ? sig.slice(idx + 1).trim() : sig;
}

export function hasClaudeSignaturePrefix(rawSignature) {
  const sig = stripCachePrefix(rawSignature);
  return sig.length > 0 && (sig[0] === "E" || sig[0] === "R");
}

function decodeSignatureLayer(signature) {
  if (!isValidBase64(signature)) return null;
  const decoded = Buffer.from(signature, "base64");
  // Buffer's decoder silently ignores malformed input and non-zero pad bits.
  // Compare canonical bytes while allowing the existing unpadded wire form.
  if (!decoded.length || decoded.toString("base64").replace(/=+$/, "") !== signature.replace(/=+$/, "")) return null;
  return decoded;
}

// Structural validation only: the upstream verifies authenticity and ownership.
export function isValidClaudeSignature(rawSignature) {
  const sig = stripCachePrefix(rawSignature);
  if (!sig || sig.length > MAX_CLAUDE_SIGNATURE_LEN) return false;

  try {
    if (sig[0] === "E") {
      const decoded = decodeSignatureLayer(sig);
      return decoded?.[0] === CLAUDE_SIGNATURE_MARKER;
    }
    if (sig[0] === "R") {
      const outer = decodeSignatureLayer(sig);
      if (outer?.[0] !== 0x45) return false; // 'E'
      const inner = decodeSignatureLayer(outer.toString("utf8"));
      return inner?.[0] === CLAUDE_SIGNATURE_MARKER;
    }
    return false;
  } catch {
    return false;
  }
}
