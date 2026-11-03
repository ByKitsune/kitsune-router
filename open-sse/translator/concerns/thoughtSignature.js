import { createHash } from "node:crypto";
import { LEGACY_THOUGHT_SIGNATURE_SHA256, GOOGLE_MIGRATED_HISTORY_MARKER } from "../../config/thoughtSignatures.js";

const TOOL_SIGNATURE_SEPARATOR = "_TSIG_";
const MAX_SIGNATURE_CACHE = 4000;

export function cacheSignature(rawId, signature, signatures = null) {
  if (!(signatures instanceof Map) || !rawId || !signature) return;
  if (!signatures.has(rawId) && signatures.size >= MAX_SIGNATURE_CACHE) signatures.delete(signatures.keys().next().value);
  signatures.set(rawId, signature);
}

export function getCachedSignature(rawId, signatures = null) {
  return rawId && signatures instanceof Map ? signatures.get(rawId) || null : null;
}

export function clearSignatureCache(signatures = null) {
  signatures?.clear();
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
  return Buffer.from(str, "base64").toString("base64").replace(/=+$/, "") === unpadded;
}

export function isLegacyThoughtSignature(signature) {
  return typeof signature === "string" && LEGACY_THOUGHT_SIGNATURE_SHA256.has(createHash("sha256").update(Buffer.from(signature, "base64")).digest("hex"));
}

export function thoughtSignatureError(param, missing = false) {
  const error = new Error(missing
    ? "The first function call in this Gemini turn is missing its original thought signature. Preserve the provider's original signed history or start a new conversation; the gateway cannot manufacture a signature."
    : "The supplied thought signature is malformed or is a retired gateway fallback. Restore the provider's original signed history or start a new conversation.");
  error.code = missing ? "missing_thought_signature" : "invalid_thought_signature";
  error.param = param;
  return error;
}

export function validateThoughtSignature(signature, param = "thoughtSignature") {
  if (signature === GOOGLE_MIGRATED_HISTORY_MARKER) return signature;
  if (!isValidBase64(signature) || isLegacyThoughtSignature(signature)) throw thoughtSignatureError(param);
  return signature;
}

// Older gateway clients placed signatures inside functionCall or used snake_case.
// Canonicalize those fields without changing signed content or inventing a value.
export function normalizeThoughtSignaturePart(part, param = "part") {
  const signatures = [part.thoughtSignature, part.thought_signature, part.functionCall?.thoughtSignature].filter(value => value !== undefined);
  for (const signature of signatures) validateThoughtSignature(signature, `${param}.thoughtSignature`);
  if (signatures.some(signature => signature !== signatures[0])) throw thoughtSignatureError(`${param}.thoughtSignature`);
  if (!signatures.length || (part.thought_signature === undefined && part.functionCall?.thoughtSignature === undefined)) return part;
  const result = { ...part, thoughtSignature: signatures[0] };
  delete result.thought_signature;
  if (part.functionCall?.thoughtSignature !== undefined) {
    result.functionCall = { ...part.functionCall };
    delete result.functionCall.thoughtSignature;
  }
  return result;
}

// Google's documented Gemini 3 rule validates the first parallel call in every
// step of the current turn. Other parallel calls can legitimately be unsigned.
// Older model histories and image models may omit signatures; supplied opaque
// signatures always remain attached to the exact part that carried them.
export function validateGoogleThoughtSignatures(contents, model, param = "contents") {
  let currentTurn = 0;
  let normalizedContents = contents;
  for (let i = 0; i < (contents || []).length; i++) {
    const turn = contents[i];
    if (turn.role === "user" && !(turn.parts || []).some(part => part.functionResponse)) currentTurn = i;
    let normalizedParts = turn.parts;
    for (let j = 0; j < (turn.parts || []).length; j++) {
      const part = turn.parts[j];
      const normalized = normalizeThoughtSignaturePart(part, `${param}[${i}].parts[${j}]`);
      if (normalized !== part) {
        if (normalizedParts === turn.parts) normalizedParts = [...turn.parts];
        normalizedParts[j] = normalized;
      }
    }
    if (normalizedParts !== turn.parts) {
      if (normalizedContents === contents) normalizedContents = [...contents];
      normalizedContents[i] = { ...turn, parts: normalizedParts };
    }
  }
  if (!/(?:^|\/)gemini-3(?:$|[-.])/i.test(String(model || "")) || /image/i.test(model)) return normalizedContents;
  for (let i = currentTurn; i < (normalizedContents || []).length; i++) {
    const turn = normalizedContents[i];
    if (turn.role !== "model") continue;
    const j = (turn.parts || []).findIndex(part => part.functionCall);
    if (j < 0) continue;
    if (!turn.parts[j].thoughtSignature) throw thoughtSignatureError(`${param}[${i}].parts[${j}].thoughtSignature`, true);
  }
  return normalizedContents;
}

export function buildToolCallId(name, index, thoughtSignature = "", rawId = null, signatures = null) {
  const base = rawId || `${name}-${Date.now()}-${index}`;
  if (!thoughtSignature) return base;
  cacheSignature(base, thoughtSignature, signatures);
  const encoded = Buffer.from(thoughtSignature, "utf8").toString("base64url");
  return `${base}${TOOL_SIGNATURE_SEPARATOR}${encoded}`;
}

function isAcceptedSignature(signature) {
  return signature === GOOGLE_MIGRATED_HISTORY_MARKER || (isValidBase64(signature) && !isLegacyThoughtSignature(signature));
}

export function splitToolCallId(id, signatures = null, { strict = false } = {}) {
  if (typeof id !== "string") return { rawId: id, thoughtSignature: "" };
  const separator = id.indexOf(TOOL_SIGNATURE_SEPARATOR);
  if (separator === -1) {
    // Check if id was partially truncated right at the delimiter (e.g. "_TS", "_TSI")
    const partialDelims = ["_TSIG", "_TSI", "_TS", "_T"];
    for (const partial of partialDelims) {
      const pIdx = id.lastIndexOf(partial);
      if (pIdx > 0 && pIdx + partial.length === id.length) {
        const candidateRawId = id.slice(0, pIdx);
        const cached = getCachedSignature(candidateRawId, signatures);
        if (cached && isAcceptedSignature(cached)) return { rawId: candidateRawId, thoughtSignature: cached };
      }
    }
    const cached = getCachedSignature(id, signatures);
    return { rawId: id, thoughtSignature: (cached && isAcceptedSignature(cached)) ? cached : "" };
  }

  const rawId = id.slice(0, separator);
  const encoded = id.slice(separator + TOOL_SIGNATURE_SEPARATOR.length);
  const cached = getCachedSignature(rawId, signatures);
  if (cached && isAcceptedSignature(cached) && Buffer.from(cached, "utf8").toString("base64url").startsWith(encoded)) {
    return { rawId, thoughtSignature: cached };
  }
  try {
    const decoded = Buffer.from(encoded, "base64url");
    const thoughtSignature = decoded.toString("utf8");
    if (decoded.toString("base64url") === encoded && isAcceptedSignature(thoughtSignature)) {
      return { rawId, thoughtSignature };
    }
  } catch {
    // decode failure
  }

  // Truncation recovery requires an explicitly owned request-local map.
  if (cached && isAcceptedSignature(cached)) {
    return { rawId, thoughtSignature: cached };
  }

  if (strict) throw thoughtSignatureError("messages.tool_calls.id");
  return { rawId, thoughtSignature: "" };
}
