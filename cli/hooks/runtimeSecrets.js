// Runtime secrets for the bundled server.
//
// The dashboard signs its session cookie with JWT_SECRET, and
// src/lib/auth/dashboardSession.js deliberately refuses to fall back to a
// default value (a known secret would let anyone forge a session). The
// published CLI package ships no .env, and the standalone server that the CLI
// spawns never loads one — Next only reads .env from its own project root,
// which inside the package is <pkg>/app/. So a fresh `npm i -g` install had no
// way to satisfy the requirement and every login failed with
// "JWT_SECRET environment variable is required".
//
// Generating the secret here is the correct fix: the CLI is the thing that owns
// the install, it must work without the user hand-editing files inside
// node_modules, and it must keep the secret stable across restarts so sessions
// survive (per-user, never a shared default).
//
// The secret lives in the user data dir next to the SQLite database
// (~/.kitsune-router or %APPDATA%\kitsune-router) — user-writable, survives upgrades.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { resolveDataDirectory } = require("./dataDirectory");

const SECRET_FILE = "secrets.json";
const LEGACY_SECRET_FILE = "secrets.env";
const SECRET_KEYS = Object.freeze(["JWT_SECRET", "API_KEY_SECRET", "MACHINE_ID_SALT"]);
const MIN_SECRET_LENGTH = 32;

// The env object is a parameter (not read off process.env directly) so callers
// and tests can resolve the data dir explicitly without mutating global state.
function getDataDir(env = process.env) {
  return resolveDataDirectory({ env });
}

function getSecretsPath(env = process.env) {
  return path.join(getDataDir(env), SECRET_FILE);
}

function readSecretFile(target, parse) {
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new Error("Runtime secrets must be a private regular file");
    const raw = fs.readFileSync(target, "utf8");
    return parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error("Cannot read existing runtime secrets; refusing to replace keys or invalidate migrated settings", { cause: error });
  }
}

function parseJsonSecrets(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.keys(parsed).some(key => !SECRET_KEYS.includes(key))) {
    throw new Error("Invalid runtime secrets document");
  }
  return parsed;
}

// Historical Docker files contain only literal assignments for these three
// keys. This is deliberately NOT a shell/dotenv evaluator: no commands, variable
// expansion, escapes, export statements, unknown keys or inline comments.
// A malformed value is associated with its key so a valid explicit override can
// resolve that key without changing either original persistence file.
function parseLegacySecrets(raw) {
  const parsed = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !SECRET_KEYS.includes(match[1])) throw new Error("Invalid legacy runtime secrets document");
    const [, key, value] = match;
    if (Object.hasOwn(parsed, key)) {
      parsed[key] = null;
      continue;
    }
    if (/^[A-Za-z0-9_./+~:@%=-]+$/.test(value)) parsed[key] = value;
    else if (/^'[^'\\\r\n]*'$/.test(value) || /^"[^"\\$`\r\n]*"$/.test(value)) parsed[key] = value.slice(1, -1);
    else parsed[key] = null;
  }
  return parsed;
}

// Random, per-install, never a shared constant.
function generateSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function isValidSecret(value) {
  return typeof value === "string" && value.trim().length >= MIN_SECRET_LENGTH && !/[\x00-\x1f\x7f]/.test(value);
}

// Write atomically (temp + rename) so a crash mid-write cannot leave a
// truncated file that would silently produce a new secret on next boot and
// invalidate every existing session.
function writeSecrets(secrets, env = process.env) {
  const target = getSecretsPath(env);
  const tmp = `${target}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmp, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(secrets, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, target);
    if (process.platform !== "win32") {
      const directory = fs.openSync(path.dirname(target), fs.constants.O_RDONLY);
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

/**
 * Ensure the runtime secrets exist, generating any that are missing.
 * Returns the resolved secret map (never throws for a missing file).
 * Existing values are preserved so sessions and MACHINE_ID_SALT stay stable.
 *
 * Resolve each key independently: valid explicit env, matching persisted JSON /
 * legacy Docker env, then a generated value. Invalid/conflicting persisted keys
 * require an explicit valid override for that key; never rotate them silently.
 * Existing persisted values (including an overridden value) are not rewritten.
 * Historical Docker-generated 64-character keys meet the same 32-character
 * floor; shorter persisted keys require review rather than silent rotation.
 */
function ensureRuntimeSecrets(env = process.env, { silent = true } = {}) {
  const directory = getDataDir(env);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(directory).isDirectory()) throw new Error("Refusing symbolic-link or non-directory runtime secrets location");
  if (process.platform !== "win32") fs.chmodSync(directory, 0o700);
  const lock = path.join(directory, ".runtime-secrets.lock");
  let fd;
  try { fd = fs.openSync(lock, "wx", 0o600); }
  catch (error) { throw new Error("Runtime secrets are locked; wait for the other startup or review an interrupted setup", { cause: error }); }
  const identity = fs.fstatSync(fd);
  try {
    const target = path.join(directory, SECRET_FILE);
    const secrets = readSecretFile(target, parseJsonSecrets);
    const legacy = readSecretFile(path.join(directory, LEGACY_SECRET_FILE), parseLegacySecrets);
    let changed = false;
    const resolved = {};

    for (const key of SECRET_KEYS) {
      // Preserve explicit bytes: API HMACs and installation identity use them
      // verbatim, even though the dashboard trims its own JWT signing key.
      const fromEnv = isValidSecret(env[key]) ? env[key] : null;
      const persisted = [secrets, legacy].filter(values => Object.hasOwn(values, key));
      if (!fromEnv && persisted.some(values => !isValidSecret(values[key]))) {
        throw new Error(`Existing ${key} is invalid; refusing automatic key replacement`);
      }
      const valid = persisted.map(values => values[key]).filter(isValidSecret);
      if (!fromEnv && new Set(valid).size > 1) {
        throw new Error(`Existing ${key} conflicts between secrets.json and secrets.env; provide an explicit override or reconcile the original files`);
      }
      resolved[key] = fromEnv || valid[0] || generateSecret();
      if (!Object.hasOwn(secrets, key)) {
        // Retain a valid legacy value on disk even when an env override is in
        // effect. Only previously absent keys are added to canonical JSON.
        secrets[key] = valid[0] || resolved[key];
        changed = true;
      }
    }

    if (changed) {
      // Volatile keys are not a safe fallback: later restart would silently
      // rotate JWT signatures, API key derivation and installation identity.
      writeSecrets(secrets, env);
    }
    // Also protect a complete existing JSON file without rewriting its bytes.
    if (process.platform !== "win32") fs.chmodSync(target, 0o600);
    return resolved;
  } catch (error) {
    if (!silent) console.error(`⚠ Runtime secrets setup stopped: ${error.message}`);
    throw error;
  } finally {
    fs.closeSync(fd);
    try {
      const current = fs.lstatSync(lock);
      if (current.dev === identity.dev && current.ino === identity.ino) fs.unlinkSync(lock);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

// Secret values the spawned server must receive. Only returns keys the caller
// has not already provided, so an explicit env always stays authoritative.
function buildSecretsEnv(baseEnv = process.env) {
  const secrets = ensureRuntimeSecrets(baseEnv);
  const out = {};
  for (const [key, value] of Object.entries(secrets)) {
    if (!isValidSecret(baseEnv[key])) out[key] = value;
  }
  return out;
}

module.exports = {
  ensureRuntimeSecrets,
  buildSecretsEnv,
  getSecretsPath,
  getDataDir,
  generateSecret,
  isValidSecret,
};
