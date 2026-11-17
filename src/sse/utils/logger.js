// Logger utility for cloud
import { formatLogValue, truncateLogText } from "open-sse/utils/logSanitizer.js";

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase?.()] ?? LOG_LEVELS.INFO;

function formatTime() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// Colored-dot tags to correlate request lines by session (same session → same color)
const REQ_TAGS = ["🟢", "🔵", "🟣", "🟡", "🟠", "🔴", "⚪", "🟤"];
let tagCursor = 0;

// Allocate next rotating tag (fallback when no session seed available)
export function nextTag() {
  const tag = REQ_TAGS[tagCursor % REQ_TAGS.length];
  tagCursor++;
  return tag;
}

// Stable tag derived from a session/connection seed: same seed always maps to the same color
export function tagForSession(seed) {
  if (!seed) return nextTag();
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return REQ_TAGS[Math.abs(h) % REQ_TAGS.length];
}

// Print one correlated line: [time] tag symbol message
export function line(tag, symbol, message) {
  if (LEVEL > LOG_LEVELS.INFO) return;
  console.log(truncateLogText(`[${formatTime()}] ${formatLogValue(tag)} ${formatLogValue(symbol)} ${formatLogValue(message)}`));
}

// Like line() but always printed regardless of LOG_LEVEL (errors must never be hidden)
export function errorLine(tag, symbol, message) {
  console.log(truncateLogText(`[${formatTime()}] ${formatLogValue(tag)} ${formatLogValue(symbol)} ${formatLogValue(message)}`));
}

// Format thinking intent for the request line ("high(10k)" / "off" / "auto")
export function fmtThink(intent) {
  if (!intent || !intent.mode) return null;
  if (intent.mode === "none") return "off";
  if (intent.mode === "auto") return "auto";
  if (intent.mode === "budget") {
    const k = intent.budget >= 1000 ? `${Math.round(intent.budget / 1000)}k` : `${intent.budget}`;
    return k;
  }
  if (intent.mode === "level") return intent.level;
  return null;
}

function formatData(data) {
  return data === undefined ? "" : ` ${formatLogValue(data)}`;
}

function diagnostic(prefix, message, data) {
  return truncateLogText(`${prefix} ${formatLogValue(message)}${formatData(data)}`);
}

export function debug(tag, message, data) {
  if (LEVEL <= LOG_LEVELS.DEBUG) {
    console.log(diagnostic(`[${formatTime()}] 🔍 [${formatLogValue(tag)}]`, message, data));
  }
}

export function info(tag, message, data) {
  if (LEVEL <= LOG_LEVELS.INFO) {
    console.log(diagnostic(`[${formatTime()}] ℹ️  [${formatLogValue(tag)}]`, message, data));
  }
}

export function warn(tag, message, data) {
  if (LEVEL <= LOG_LEVELS.WARN) {
    console.warn(diagnostic(`[${formatTime()}] ⚠️  [${formatLogValue(tag)}]`, message, data));
  }
}

export function error(tag, message, data) {
  if (LEVEL <= LOG_LEVELS.ERROR) {
    console.log(diagnostic(`[${formatTime()}] ❌ [${formatLogValue(tag)}]`, message, data));
  }
}

export function request(method, path, extra) {
  console.log(`\x1b[36m${truncateLogText(`[${formatTime()}] 📥 ${formatLogValue(method)} ${formatLogValue(path)}${formatData(extra)}`)}\x1b[0m`);
}

export function response(status, duration, extra) {
  const icon = status < 400 ? "📤" : "💥";
  console.log(truncateLogText(`[${formatTime()}] ${icon} ${formatLogValue(status)} (${formatLogValue(duration)}ms)${formatData(extra)}`));
}

export function stream(event, data) {
  console.log(diagnostic(`[${formatTime()}] 🌊 [STREAM]`, event, data));
}

// Mask sensitive data
export function maskKey(key) {
  if (!key || key.length < 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
