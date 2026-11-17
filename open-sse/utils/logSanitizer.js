import { stripVTControlCharacters } from "node:util";
import { LOG_FORMAT_LIMITS } from "../config/logging.js";

const REDACTED = "[REDACTED]";
const TRUNCATED = "[truncated]";
const SENSITIVE_KEY = /authorization|authentication|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|cookie|password|passwd|credential|signature|(?:^|[-_])(?:token|secret|session|auth)(?:$|[-_])/i;
const CREDENTIAL_ASSIGNMENT = /((?<![a-zA-Z0-9_-])(?:["']?)(?:authorization|proxy-authorization|api[-_]?key|x-api-key|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|passwd|credential|cookie|set-cookie|signature)(?:["']?)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|[^\s,;&)\]}]+)/gi;

export function isSensitiveLogKey(key) {
  return SENSITIVE_KEY.test(key);
}

export function truncateLogText(text, maxBytes = LOG_FORMAT_LIMITS.maxBytes) {
  const bytes = Buffer.from(text);
  if (bytes.length <= maxBytes) return text;
  let end = Math.max(0, maxBytes - Buffer.byteLength(TRUNCATED));
  // Do not split a UTF-8 code point or grow the budget via a replacement char.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString("utf8") + TRUNCATED;
}

function redactText(input) {
  let text = stripVTControlCharacters(input.slice(0, LOG_FORMAT_LIMITS.maxInputChars));
  text = text.replace(/(?:https?|wss?):\/\/[^\s<>"']+/gi, candidate => {
    try {
      const url = new URL(candidate);
      url.username = "";
      url.password = "";
      for (const key of [...url.searchParams.keys()]) {
        if (isSensitiveLogKey(key) || /^(?:code|state)$/i.test(key)) url.searchParams.set(key, REDACTED);
      }
      return url.toString();
    } catch { return "[invalid URL]"; }
  });
  text = text.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`);
  text = text.replace(CREDENTIAL_ASSIGNMENT, `$1${REDACTED}`);
  text = text.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, character => {
    if (character === "\n") return "\\n";
    if (character === "\r") return "\\r";
    if (character === "\t") return "\\t";
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
  return text + (input.length > LOG_FORMAT_LIMITS.maxInputChars ? TRUNCATED : "");
}

function dataProperty(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function projectValue(value, depth, seen) {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return String(value);
  if (typeof value === "function") return "[Function]";
  if (seen.has(value)) return "[Circular]";
  if (depth >= LOG_FORMAT_LIMITS.maxDepth) return Array.isArray(value) ? "[Array]" : "[Object]";
  seen.add(value);
  if (value instanceof Error) {
    const stack = dataProperty(value, "stack");
    const message = dataProperty(value, "message");
    return redactText(typeof stack === "string" ? stack : typeof message === "string" ? message : "Error");
  }
  if (value instanceof Date) {
    try { return Date.prototype.toISOString.call(value); } catch { return "[Invalid Date]"; }
  }
  const array = Array.isArray(value);
  const result = array ? [] : Object.create(null);
  let count = 0;
  // Read descriptors rather than invoking getters or application toJSON hooks.
  for (const key in value) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) continue;
    if (count++ >= LOG_FORMAT_LIMITS.maxEntries) {
      if (array) result.push(TRUNCATED);
      else result[TRUNCATED] = true;
      break;
    }
    const policyFlag = "value" in descriptor && typeof descriptor.value === "boolean"
      && /^(?:require|has|is|enable|disable)/i.test(key);
    const projected = isSensitiveLogKey(key) && !policyFlag ? REDACTED
      : "value" in descriptor ? projectValue(descriptor.value, depth + 1, seen) : "[Accessor]";
    if (array) result.push(projected);
    else result[redactText(key).slice(0, 100)] = projected;
  }
  return result;
}

export function formatLogValue(value, maxBytes = LOG_FORMAT_LIMITS.maxBytes) {
  try {
    const projected = projectValue(value, 0, new WeakSet());
    return truncateLogText(typeof projected === "string" ? projected : JSON.stringify(projected), maxBytes);
  } catch {
    return "[Unformattable diagnostic]";
  }
}

export function formatLogArguments(args) {
  return truncateLogText(args.slice(0, LOG_FORMAT_LIMITS.maxEntries).map(value => formatLogValue(value)).join(" "));
}
