const fs = require("fs");
const path = require("path");
const { randomUUID } = require("node:crypto");
const { DATA_DIR } = require("./paths");
const { LOG_BLACKLIST_URL_PARTS } = require("./config");

function time() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

const log = (msg) => console.log(`[${time()}] [MITM] ${msg}`);
const err = (msg) => console.error(`[${time()}] ❌ [MITM] ${msg}`);

const DUMP_DIR = path.join(DATA_DIR, "logs", "mitm");

function ensureDumpDir(create = true) {
  try {
    for (const directory of [path.join(DATA_DIR, "logs"), DUMP_DIR]) {
      if (create) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (!fs.lstatSync(directory).isDirectory()) return false;
    }
    return true;
  } catch { return false; }
}

function writePrivateDump(file, contents) {
  const fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try { fs.writeFileSync(fd, contents); } finally { fs.closeSync(fd); }
}

// Clear all files inside DUMP_DIR (called on MITM server start to avoid unbounded growth)
function clearDumpDir() {
  try {
    if (!ensureDumpDir(false)) return;
    for (const entry of fs.readdirSync(DUMP_DIR, { withFileTypes: true })) {
      // Preserve operator files/subdirectories and never traverse a symlink.
      if (!entry.isFile() || !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[a-zA-Z0-9_-]+\.(?:req\.json|res\.txt)$/.test(entry.name)) continue;
      try { fs.unlinkSync(path.join(DUMP_DIR, entry.name)); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

const SENSITIVE_HEADER_RE = /authorization|authentication|api[-_]?key|cookie|token|credential|secret|password|passwd|session|signature|(^|[-_])auth($|[-_])/i;

function slugify(s, max = 80) {
  return String(s).replace(/[^a-zA-Z0-9]/g, "_").substring(0, max);
}

function isBlacklisted(url) {
  if (!url) return false;
  return LOG_BLACKLIST_URL_PARTS.some(part => url.includes(part));
}

function safeUrl(url) {
  if (!url) return "";
  try { return new URL(url, "https://mitm.local").pathname; } catch { return String(url).split("?")[0]; }
}

function maskSensitiveHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const masked = {};
  let count = 0;
  for (const key in headers) {
    const descriptor = Object.getOwnPropertyDescriptor(headers, key);
    if (!descriptor?.enumerable) continue;
    if (count++ >= 40) break;
    const value = "value" in descriptor ? descriptor.value : "[Accessor]";
    const primitive = value == null || ["string", "number", "boolean"].includes(typeof value);
    masked[key.slice(0, 100)] = SENSITIVE_HEADER_RE.test(key) ? "[REDACTED]" : primitive ? String(value).slice(0, 256) : "[Complex header]";
  }
  return masked;
}

function bodyMetadata(body) {
  const bytes = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(String(body || ""), "utf8");
  return { present: bytes > 0, bytes };
}

// Save request metadata without payload content.
function dumpRequest(req, bodyBuffer, tag = "raw") {
  if (isBlacklisted(req.url)) return null;
  try {
    if (!ensureDumpDir()) return null;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const url = safeUrl(req.url);
    const slug = slugify((req.headers?.host || "") + url);
    const file = path.join(DUMP_DIR, `${ts}_${slugify(tag)}_${slug}_${randomUUID()}.req.json`);
    writePrivateDump(file, JSON.stringify({
      method: req.method,
      url,
      host: req.headers?.host,
      headers: maskSensitiveHeaders(req.headers),
      body: bodyMetadata(bodyBuffer)
    }, null, 2));
    return file;
  } catch { return null; }
}

// Response dumper — records response metadata without retaining stream content.
function createResponseDumper(req, tag = "raw") {
  if (isBlacklisted(req.url)) return null;
  if (!ensureDumpDir()) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const url = safeUrl(req.url);
  const slug = slugify((req.headers?.host || "") + url);
  const file = path.join(DUMP_DIR, `${ts}_${slugify(tag)}_${slug}_${randomUUID()}.res.txt`);
  let status = 0;
  let headers = {};
  let responseBytes = 0;
  return {
    writeHeader: (s, h) => { status = s; headers = h || {}; },
    writeChunk: (chunk) => {
      if (chunk == null) return;
      responseBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), "utf8");
    },
    end: () => {
      try {
        const out = `STATUS: ${status}\nURL: ${url}\nHEADERS: ${JSON.stringify(maskSensitiveHeaders(headers), null, 2)}\n---BODY-METADATA---\n${JSON.stringify({ present: responseBytes > 0, bytes: responseBytes })}`;
        writePrivateDump(file, out);
      } catch { /* ignore */ }
    },
    file
  };
}

module.exports = { log, err, dumpRequest, createResponseDumper, clearDumpDir };
