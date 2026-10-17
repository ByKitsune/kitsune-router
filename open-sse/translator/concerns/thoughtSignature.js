const TOOL_SIGNATURE_SEPARATOR = "_TSIG_";
const signatureCache = new Map();
const MAX_SIGNATURE_CACHE = 4000;

/**
 * Cache signature keyed by raw tool call ID so we can recover it if a client
 * truncates tool_call_id (e.g. at 40 or 64 characters).
 */
export function cacheSignature(rawId, signature) {
  if (!rawId || !signature) return;
  if (signatureCache.size >= MAX_SIGNATURE_CACHE) {
    const firstKey = signatureCache.keys().next().value;
    signatureCache.delete(firstKey);
  }
  signatureCache.set(rawId, signature);
}

export function getCachedSignature(rawId) {
  if (!rawId) return null;
  return signatureCache.get(rawId) || null;
}

export function clearSignatureCache() {
  signatureCache.clear();
}

/**
 * Validate that a string is valid Base64 for Google Protobuf TYPE_BYTES.
 * Prevents truncated or corrupted thought signatures from causing HTTP 400.
 */
export function isValidBase64(str) {
  if (typeof str !== "string" || !str) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str)) return false;
  const unpadded = str.replace(/=+$/, "");
  // In Base64, 1 character cannot encode any 8-bit byte. Unpadded length % 4 is never 1.
  if (unpadded.length % 4 === 1) return false;
  if (str.includes("=") && str.length % 4 !== 0) return false;
  const padIndex = str.indexOf("=");
  if (padIndex !== -1 && padIndex < str.length - 2) return false;
  return true;
}

export function buildToolCallId(name, index, thoughtSignature = "", rawId = null) {
  const base = rawId || `${name}-${Date.now()}-${index}`;
  if (!thoughtSignature) return base;
  cacheSignature(base, thoughtSignature);
  const encoded = Buffer.from(thoughtSignature, "utf8").toString("base64url");
  return `${base}${TOOL_SIGNATURE_SEPARATOR}${encoded}`;
}

export function splitToolCallId(id) {
  if (typeof id !== "string") return { rawId: id, thoughtSignature: "" };
  const separator = id.indexOf(TOOL_SIGNATURE_SEPARATOR);
  if (separator === -1) {
    // Check if id was partially truncated right at the delimiter (e.g. "_TS", "_TSI")
    const partialDelims = ["_TSIG", "_TSI", "_TS", "_T"];
    for (const partial of partialDelims) {
      const pIdx = id.lastIndexOf(partial);
      if (pIdx > 0 && pIdx + partial.length === id.length) {
        const candidateRawId = id.slice(0, pIdx);
        const cached = getCachedSignature(candidateRawId);
        if (cached && isValidBase64(cached)) return { rawId: candidateRawId, thoughtSignature: cached };
      }
    }
    const cached = getCachedSignature(id);
    return { rawId: id, thoughtSignature: (cached && isValidBase64(cached)) ? cached : "" };
  }

  const rawId = id.slice(0, separator);
  const encoded = id.slice(separator + TOOL_SIGNATURE_SEPARATOR.length);
  try {
    const thoughtSignature = Buffer.from(encoded, "base64url").toString("utf8");
    if (isValidBase64(thoughtSignature)) {
      return { rawId, thoughtSignature };
    }
  } catch {
    // decode failure
  }

  // If encoded was truncated or corrupted by a client length cap, recover from cache
  const cached = getCachedSignature(rawId);
  if (cached && isValidBase64(cached)) {
    return { rawId, thoughtSignature: cached };
  }

  return { rawId, thoughtSignature: "" };
}
