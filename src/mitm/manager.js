const { exec, spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const https = require("https");
const crypto = require("crypto");
const { addDNSEntry, removeDNSEntry, removeAllDNSEntries, removeAllDNSEntriesSync, checkAllDNSStatus, TOOL_HOSTS, isSudoAvailable, isSudoPasswordRequired } = require("./dns/dnsConfig");
const { isAdmin } = require("./winElevated.js");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const { generateCert } = require("./cert/generate");
const { installCert, uninstallCert } = require("./cert/install");
const { isCertExpired } = require("./cert/rootCA");
const { DATA_DIR, MITM_DIR } = require("./paths");
const { log, err } = require("./logger");
const { LSOF_BIN } = require("./config");

const helperLifecycle = globalThis[Symbol.for("zenrouter.helper.lifecycle")] ??= {
  draining: false,
  scopes: new Map(),
  isStopping() {
    return this.draining || globalThis[Symbol.for("zenrouter.shutdown.lifecycle")]?.draining === true;
  },
  scope(name) {
    if (!this.scopes.has(name)) this.scopes.set(name, { generation: 0, pending: new Map(), wakes: new Set(), children: new Map(), data: {} });
    return this.scopes.get(name);
  },
  active(scope, generation) {
    return !this.isStopping() && scope.generation === generation;
  },
  assert(scope, generation) {
    if (!this.active(scope, generation)) {
      const error = new Error("helper operation cancelled");
      error.code = "HELPER_STOPPED";
      throw error;
    }
  },
  run(scope, key, work) {
    if (this.isStopping()) return Promise.reject(Object.assign(new Error("helper operation cancelled"), { code: "HELPER_STOPPED" }));
    if (scope.pending.has(key)) return scope.pending.get(key);
    const generation = scope.generation;
    const check = () => this.assert(scope, generation);
    const task = Promise.resolve().then(() => { check(); return work(check, generation); });
    scope.pending.set(key, task);
    task.finally(() => { if (scope.pending.get(key) === task) scope.pending.delete(key); }).catch(() => {});
    return task;
  },
  invalidate(scope) {
    scope.generation++;
    for (const wake of [...scope.wakes]) wake();
  },
  delay(scope, ms, check) {
    check();
    return new Promise(resolve => {
      const finish = () => { clearTimeout(timer); scope.wakes.delete(finish); resolve(); };
      const timer = setTimeout(finish, ms);
      scope.wakes.add(finish);
    });
  },
  child(scope, child) {
    const task = new Promise(resolve => { child.once("close", resolve); });
    scope.children.set(child, task);
    task.finally(() => scope.children.delete(child)).catch(() => {});
    return child;
  },
  async drain(scope) {
    while (scope.pending.size || scope.children.size) {
      await Promise.allSettled([...scope.pending.values(), ...scope.children.values()]);
    }
  },
  async probe(url, config, check) {
    check();
    let hostname;
    try { hostname = new URL(url).hostname; } catch { return false; }
    const dns = require("dns");
    const resolver = new dns.promises.Resolver({ timeout: config.dnsTimeoutMs, tries: 1 });
    resolver.setServers(["1.1.1.1", "1.0.0.1", "8.8.8.8"]);
    try { await resolver.resolve4(hostname); }
    catch {
      check();
      try { await dns.promises.resolve4(hostname); } catch { check(); return false; }
    }
    check();
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(config.fetchTimeoutMs) });
      await response.body?.cancel?.();
      check();
      return response.ok;
    } catch { check(); return false; }
  },
  async health(scope, urls, config, check) {
    const candidates = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    if (!candidates.length) throw new Error("Health check requires at least one URL");
    const start = Date.now();
    while (Date.now() - start < config.timeoutMs) {
      for (const url of candidates) {
        check();
        if (await this.probe(url, config, check)) return url;
      }
      await this.delay(scope, config.intervalMs, check);
      check();
    }
    throw new Error(`Health check timeout after ${config.timeoutMs}ms`);
  },
  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.draining = true;
    const scopes = [...this.scopes.values()];
    for (const scope of scopes) this.invalidate(scope);
    for (const scope of scopes) {
      for (const child of [...scope.children.keys()]) {
        try { child.kill(); } catch { /* best effort */ }
      }
    }
    const cleanup = scopes.map(scope => {
      try { return scope.stop?.(); } catch (error) { return Promise.reject(error); }
    });
    this.stopPromise = Promise.allSettled([
      ...cleanup,
      ...scopes.map(scope => this.drain(scope)),
    ]).then(results => {
      const failed = results.find(result => result.status === "rejected");
      if (failed) throw failed.reason;
    });
    return this.stopPromise;
  },
};
const mitmScope = helperLifecycle.scope("mitm");
mitmScope.data.process ??= null;
mitmScope.data.pid ??= null;
const DEFAULT_MITM_ROUTER_BASE = "http://localhost:20128";

function shellQuoteSingle(str) {
  if (str == null || str === "") return "''";
  return `'${String(str).replace(/'/g, "'\\''")}'`;
}

async function resolveMitmRouterBaseUrl() {
  if (!_getSettings) return DEFAULT_MITM_ROUTER_BASE;
  try {
    const s = await _getSettings();
    const raw = s && s.mitmRouterBaseUrl != null ? String(s.mitmRouterBaseUrl).trim() : "";
    if (!raw) return DEFAULT_MITM_ROUTER_BASE;
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return DEFAULT_MITM_ROUTER_BASE;
    return raw.replace(/\/+$/, "");
  } catch {
    return DEFAULT_MITM_ROUTER_BASE;
  }
}

const MITM_PORT = 443;
const MITM_WIN_NODE_PORT = 8443;
const PID_FILE = path.join(MITM_DIR, ".mitm.pid");
const LOCK_FILE = path.join(MITM_DIR, ".mitm.lock");

const MITM_MAX_RESTARTS = 5;
const MITM_RESTART_DELAYS_MS = [5000, 10000, 20000, 30000, 60000];
const MITM_RESTART_RESET_MS = 60000;

mitmScope.data.restartCount ??= 0;
mitmScope.data.lastStartTime ??= 0;

function resolveBundledServerPath() {
  if (process.env.MITM_SERVER_PATH) return process.env.MITM_SERVER_PATH;
  const sibling = path.join(__dirname, "server.js");
  if (fs.existsSync(sibling)) return sibling;
  const fromCwd = path.join(process.cwd(), "src", "mitm", "server.js");
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromNext = path.join(process.cwd(), "..", "src", "mitm", "server.js");
  if (fs.existsSync(fromNext)) return fromNext;
  return fromCwd;
}

// Copy bundled server.js into DATA_DIR so MITM doesn't lock node_modules
// (prevents EBUSY on `npm i -g zenrouter@latest` while MITM is running).
function ensureRuntimeServer(bundledPath) {
  if (helperLifecycle.isStopping()) return bundledPath;
  try {
    if (!bundledPath || !fs.existsSync(bundledPath)) return bundledPath;

    // Dev mode: source file has relative requires (./logger, ./config...),
    // only the bundled file inside node_modules is self-contained + safe to copy.
    if (!bundledPath.includes(`${path.sep}node_modules${path.sep}`)) {
      return bundledPath;
    }

    const runtimeDir = path.join(DATA_DIR, "runtime", "mitm");
    const runtimeServer = path.join(runtimeDir, "server.js");

    // Equal sizes do not establish freshness: security fixes can be same-size.
    if (fs.existsSync(runtimeServer)) {
      try {
        if (fs.statSync(bundledPath).size === fs.statSync(runtimeServer).size &&
            fs.readFileSync(bundledPath).equals(fs.readFileSync(runtimeServer))) return runtimeServer;
      } catch { /* recopy */ }
    }

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.copyFileSync(bundledPath, runtimeServer);
    return runtimeServer;
  } catch (e) {
    try { log(`[MITM] runtime copy failed: ${e.message}`); } catch { /* ignore */ }
    return bundledPath;
  }
}

const SERVER_PATH = ensureRuntimeServer(resolveBundledServerPath());
const ENCRYPT_ALGO = "aes-256-gcm";
// Legacy, read-only derivation. New passwords must never use a machine ID or a
// fixed salt as their encryption key.
const ENCRYPT_SALT = "zenrouter-mitm-pwd";
// Do not follow paths.js's historical HOME fallback if configured DATA_DIR is
// inaccessible: silently relocating an installation key would lose passwords.
const PASSWORD_AUTH_DIR = path.join(process.env.DATA_DIR || DATA_DIR, "auth");
const PASSWORD_KEY_FILE = path.join(PASSWORD_AUTH_DIR, "mitm-password.key");

function getProcessUsingPort443() {
  try {
    if (IS_WIN) {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command ` +
        `"$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess } else { 0 }"`;
      const pidStr = execSync(psCmd, { encoding: "utf8", windowsHide: true }).trim();
      const pid = parseInt(pidStr, 10);
      if (pid && pid > 4) {
        const tasklistResult = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8", windowsHide: true });
        const processMatch = tasklistResult.match(/"([^"]+)"/);
        if (processMatch) return processMatch[1].replace(".exe", "");
      }
    } else {
      const result = execSync(`${LSOF_BIN} -i :443`, { encoding: "utf8", windowsHide: true });
      const lines = result.trim().split("\n");
      if (lines.length > 1) return lines[1].split(/\s+/)[0];
    }
  } catch {
    return null;
  }
  return null;
}

function getCachedPassword() { return globalThis.__mitmSudoPassword || null; }
function setCachedPassword(pwd) { globalThis.__mitmSudoPassword = pwd; }

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EACCES";
  }
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (error, stdout) => { if (error) reject(error); else resolve(stdout); });
  });
}

async function killProcess(pid, force = false, sudoPassword = null, check = () => {}) {
  check();
  if (IS_WIN) {
    await runCommand(`taskkill ${force ? "/F " : ""}/PID ${pid}`).catch(() => {});
  } else {
    const sig = force ? "SIGKILL" : "SIGTERM";
    const cmd = `pkill -${sig} -P ${pid} 2>/dev/null; kill -${sig} ${pid} 2>/dev/null`;
    if (sudoPassword || isSudoAvailable()) {
      const { execWithPassword } = require("./dns/dnsConfig");
      try { await execWithPassword(cmd, sudoPassword || ""); }
      catch { check(); await runCommand(cmd).catch(() => {}); }
    } else {
      await runCommand(cmd).catch(() => {});
    }
  }
}

function checkPasswordKeyOwner(stat) {
  if (!IS_WIN && typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error("MITM password key must belong to the current user");
  }
}

function ensurePasswordAuthDir(create = false) {
  if (create) fs.mkdirSync(PASSWORD_AUTH_DIR, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(PASSWORD_AUTH_DIR);
  if (!stat.isDirectory()) throw new Error("Invalid MITM password key directory");
  checkPasswordKeyOwner(stat);
  if (!IS_WIN) {
    if ((stat.mode & 0o700) !== 0o700) throw new Error("MITM password key directory is inaccessible");
    if ((stat.mode & 0o7777) !== 0o700) fs.chmodSync(PASSWORD_AUTH_DIR, 0o700);
  }
}

function readPasswordKey() {
  ensurePasswordAuthDir();
  if (!fs.lstatSync(PASSWORD_KEY_FILE).isFile()) throw new Error("Invalid MITM password key file");
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
  const fd = fs.openSync(PASSWORD_KEY_FILE, flags);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size !== 32) throw new Error("Invalid MITM password key file");
    checkPasswordKeyOwner(stat);
    if (!IS_WIN) {
      // Even a privileged runtime must not treat an unreadable key as missing
      // or silently repair owner access after an operator has revoked it.
      if (!(stat.mode & 0o400)) throw new Error("MITM password key is unreadable");
      if ((stat.mode & 0o7777) !== 0o600) fs.fchmodSync(fd, 0o600);
    }
    const key = fs.readFileSync(fd);
    if (key.length !== 32 || key.every(byte => byte === 0)) throw new Error("Invalid MITM password key file");
    return key;
  } finally {
    fs.closeSync(fd);
  }
}

function getPasswordKey(allowCreate = false) {
  try {
    return readPasswordKey();
  } catch (e) {
    // Permission, corruption and I/O errors are never absence. In particular,
    // v2 reads/writes cannot replace a lost key with a newly generated one.
    if (!allowCreate || e.code !== "ENOENT") throw e;
  }

  ensurePasswordAuthDir(true);
  const temporary = path.join(PASSWORD_AUTH_DIR, `.mitm-password-key-${crypto.randomBytes(16).toString("hex")}.tmp`);
  let fd;
  let created = false;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    created = true;
    fs.writeFileSync(fd, crypto.randomBytes(32));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    try {
      // Unlike rename/writeFile, linking publishes complete bytes atomically
      // without replacing a concurrent creator's key (EEXIST selects winner).
      fs.linkSync(temporary, PASSWORD_KEY_FILE);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    if (!IS_WIN) {
      const directoryFd = fs.openSync(PASSWORD_AUTH_DIR, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    }
    return readPasswordKey();
  } finally {
    try {
      if (fd !== undefined) fs.closeSync(fd);
    } finally {
      // Only remove the temporary file we exclusively created, never a key or
      // another process's temporary file, including after failed persistence.
      if (created) fs.unlinkSync(temporary);
    }
  }
}

function parsePasswordCiphertext(stored) {
  if (typeof stored !== "string") return null;
  const parts = stored.split(":");
  const v2 = parts.length === 4 && parts[0] === "v2";
  if (v2) parts.shift();
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, dataHex] = parts;
  if (!/^[a-f0-9]{24}$/i.test(ivHex) || !/^[a-f0-9]{32}$/i.test(tagHex) ||
      !/^(?:[a-f0-9]{2})+$/i.test(dataHex)) return null;
  return { v2, iv: Buffer.from(ivHex, "hex"), tag: Buffer.from(tagHex, "hex"), data: Buffer.from(dataHex, "hex") };
}

function decryptWithPasswordKey(envelope, key) {
  const decipher = crypto.createDecipheriv(ENCRYPT_ALGO, key, envelope.iv);
  decipher.setAuthTag(envelope.tag);
  return Buffer.concat([decipher.update(envelope.data), decipher.final()]).toString("utf8");
}

function encryptPassword(plaintext, previousStored) {
  const previous = previousStored ? parsePasswordCiphertext(previousStored) : null;
  if (previousStored && !previous) throw new Error("Invalid stored MITM password");
  const key = getPasswordKey(!previous?.v2);
  // Detect same-size key corruption or an imported ciphertext/key mismatch
  // before overwriting the existing DB value. Recovery requires an explicit
  // password clear or restoration of the matching installation key.
  if (previous?.v2) decryptWithPasswordKey(previous, key);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPT_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPassword(stored) {
  try {
    const envelope = parsePasswordCiphertext(stored);
    if (!envelope) return null;
    if (envelope.v2) return decryptWithPasswordKey(envelope, getPasswordKey());

    // Only a well-formed, unversioned legacy value may try historical keys.
    // A working machine ID may have become available since a fallback write.
    try {
      const { machineIdSync } = require("node-machine-id");
      const key = crypto.createHash("sha256").update(machineIdSync() + ENCRYPT_SALT).digest();
      return decryptWithPasswordKey(envelope, key);
    } catch { /* Try the historical fixed-salt key for this legacy read only. */ }
    return decryptWithPasswordKey(envelope, crypto.createHash("sha256").update(ENCRYPT_SALT).digest());
  } catch {
    return null;
  }
}

let _getSettings = null;
let _updateSettings = null;

function initDbHooks(getSettingsFn, updateSettingsFn) {
  _getSettings = getSettingsFn;
  _updateSettings = updateSettingsFn;
}

async function saveMitmSettings(enabled, password, check = () => {}) {
  check();
  if (!_updateSettings) return;
  try {
    const updates = { mitmEnabled: enabled };
    if (password) {
      // Establish whether v2 state already exists before allowing first-key
      // creation. Missing/unreadable DB hooks must not mean a fresh install.
      if (!_getSettings) throw new Error("MITM settings reader unavailable");
      const settings = await _getSettings();
      check();
      if (!settings || typeof settings !== "object") throw new Error("MITM settings unavailable");
      updates.mitmSudoEncrypted = encryptPassword(password, settings.mitmSudoEncrypted);
    }
    check();
    await _updateSettings(updates);
  } catch {
    // Storage/DB errors can contain secret values. Never log their messages.
    err("Failed to save MITM settings: password key or persistence unavailable");
  }
}

function clearEncryptedPassword() {
  return helperLifecycle.run(mitmScope, "clear-password", async check => {
    if (!_updateSettings) return;
    check();
    try { await _updateSettings({ mitmSudoEncrypted: null }); }
    catch { err("Failed to clear encrypted password: persistence unavailable"); }
  });
}

function loadEncryptedPassword() {
  return helperLifecycle.run(mitmScope, "password", async check => {
    if (!_getSettings) return null;
    try {
      const settings = await _getSettings();
      check();
      if (!settings.mitmSudoEncrypted) return null;
      return decryptPassword(settings.mitmSudoEncrypted);
    } catch (error) { check(); return null; }
  });
}

async function saveDnsToolState(tool, enabled, check) {
  check();
  if (!_updateSettings || !_getSettings) return;
  try {
    const s = await _getSettings();
    check();
    const next = { ...(s.dnsToolEnabled || {}), [tool]: enabled };
    await _updateSettings({ dnsToolEnabled: next });
  } catch (e) {
    err(`Failed to save DNS state: ${e.message}`);
  }
}

async function loadDnsToolState() {
  if (!_getSettings) return {};
  try {
    const s = await _getSettings();
    return s.dnsToolEnabled || {};
  } catch {
    return {};
  }
}

/**
 * Re-apply DNS for tools previously enabled — called on app startup after MITM running.
 */
function restoreToolDNS(sudoPassword) {
  return runDnsMutation(async check => {
    const status = await getMitmStatus();
    check();
    if (!status?.running) {
      try { removeAllDNSEntriesSync(); } catch { /* ignore */ }
      return;
    }
    const state = await loadDnsToolState();
    check();
    const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
    check();
    for (const [tool, enabled] of Object.entries(state)) {
      check();
      if (!enabled || !TOOL_HOSTS[tool]) continue;
      try { await addDNSEntry(tool, password); }
      catch (error) { check(); err(`DNS ${tool}: restore failed — ${error.message}`); }
    }
  });
}

/**
 * Check if user has privilege to mutate hosts file.
 * Win: needs admin. Mac/Linux: root OR cached/encrypted sudo password.
 */
async function hasDnsPrivilege() {
  if (IS_WIN) return isAdmin();
  if (isAdmin()) return true;
  if (!isSudoPasswordRequired()) return true;
  const pwd = getCachedPassword() || await loadEncryptedPassword();
  return !!pwd;
}

function checkPort443Free() {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve("in-use");
      else resolve("no-permission");
    });
    tester.once("listening", () => { tester.close(() => resolve("free")); });
    tester.listen(MITM_PORT, "127.0.0.1");
  });
}

async function getPort443Owner(_sudoPassword, check = () => {}) {
  check();
  const command = IS_WIN
    ? `powershell -NonInteractive -WindowStyle Hidden -Command "$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess } else { 0 }"`
    : `${LSOF_BIN} -nP -iTCP:443 -sTCP:LISTEN -t`;
  const output = await runCommand(command).catch(() => "");
  check();
  const pid = parseInt(output.trim().split("\n")[0], 10);
  if (!pid || (IS_WIN && pid <= 4)) return null;
  const detail = await runCommand(IS_WIN ? `tasklist /FI "PID eq ${pid}" /FO CSV /NH` : `ps -p ${pid} -o comm=`).catch(() => "");
  check();
  return { pid, name: IS_WIN ? detail.match(/"([^"]+)"/)?.[1] || "unknown" : detail.trim() || "unknown" };
}

async function killLeftoverMitm(sudoPassword, check) {
  check();
  if (mitmScope.data.process && !mitmScope.data.process.killed) {
    try { mitmScope.data.process.kill("SIGKILL"); } catch { /* ignore */ }
    mitmScope.data.process = null;
    mitmScope.data.pid = null;
  }
  try {
    if (fs.existsSync(PID_FILE)) {
      const savedPid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (savedPid && isProcessAlive(savedPid)) {
        await killProcess(savedPid, true, sudoPassword, check);
        check();
        await helperLifecycle.delay(mitmScope, 500, check);
        check();
      }
      fs.unlinkSync(PID_FILE);
    }
  } catch { check(); }
  if (!IS_WIN && SERVER_PATH) {
    const escaped = SERVER_PATH.replace(/'/g, "'\\''");
    check();
    if (sudoPassword || isSudoAvailable()) {
      const { execWithPassword } = require("./dns/dnsConfig");
      await execWithPassword(`pkill -SIGKILL -f "${escaped}" 2>/dev/null || true`, sudoPassword || "").catch(() => {});
    } else {
      await runCommand(`pkill -SIGKILL -f "${escaped}" 2>/dev/null || true`).catch(() => {});
    }
    check();
    await helperLifecycle.delay(mitmScope, 500, check);
    check();
  }
}

async function pollMitmHealth(timeoutMs, port = MITM_PORT, check = () => {}) {
  check();
  const health = await new Promise(resolve => {
    let request, response, timer, settled = false, size = 0;
    const chunks = [];
    const finish = (value = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      mitmScope.wakes.delete(cancel);
      response?.removeListener("data", data);
      response?.destroy?.();
      request?.destroy?.();
      resolve(value);
    };
    const cancel = () => finish();
    const data = chunk => {
      size += Buffer.byteLength(chunk);
      if (size > 16384) finish();
      else chunks.push(Buffer.from(chunk));
    };
    mitmScope.wakes.add(cancel);
    timer = setTimeout(cancel, timeoutMs);
    try {
      request = https.request(
        { hostname: "127.0.0.1", port, path: "/_mitm_health", method: "GET", rejectUnauthorized: false },
        incoming => {
          response = incoming;
          if (settled) { response.destroy?.(); return; }
          response.on("data", data);
          response.once("error", cancel);
          response.once("aborted", cancel);
          response.once("close", cancel);
          response.once("end", () => {
            try { const value = JSON.parse(Buffer.concat(chunks).toString()); finish(value.ok === true ? { ok: true, pid: value.pid || null } : null); }
            catch { finish(); }
          });
        });
      request.once("error", cancel);
      request.end();
    } catch { finish(); }
  });
  check();
  return health;
}

/**
 * Get full MITM status including per-tool DNS status
 */
function getMitmStatus() {
  return helperLifecycle.run(mitmScope, "status", readMitmStatus);
}

async function readMitmStatus(check) {
  check();
  let running = mitmScope.data.process !== null && !mitmScope.data.process.killed;
  let pid = mitmScope.data.pid;

  if (!running) {
    try {
      if (fs.existsSync(PID_FILE)) {
        const savedPid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
        if (savedPid && isProcessAlive(savedPid)) {
          running = true;
          pid = savedPid;
        } else {
          fs.unlinkSync(PID_FILE);
        }
      }
    } catch { /* ignore */ }
  }

  const dnsStatus = checkAllDNSStatus();
  const rootCACertPath = path.join(MITM_DIR, "rootCA.crt");
  const certExists = fs.existsSync(rootCACertPath);
  const { checkCertInstalled } = require("./cert/install");
  const certTrusted = certExists ? await checkCertInstalled(rootCACertPath) : false;
  check();
  return { running, pid, certExists, certTrusted, dnsStatus };
}

function scheduleMitmRestart(apiKey) {
  if (helperLifecycle.isStopping() || mitmScope.data.disabled) return Promise.resolve();
  return helperLifecycle.run(mitmScope, "restart", async check => {
    if (Date.now() - mitmScope.data.lastStartTime >= MITM_RESTART_RESET_MS) mitmScope.data.restartCount = 0;
    while (mitmScope.data.restartCount < MITM_MAX_RESTARTS) {
      const delay = MITM_RESTART_DELAYS_MS[Math.min(mitmScope.data.restartCount++, MITM_RESTART_DELAYS_MS.length - 1)];
      await helperLifecycle.delay(mitmScope, delay, check);
      check();
      const settings = _getSettings ? await _getSettings() : null;
      check();
      if (settings && !settings.mitmEnabled) return;
      const password = getCachedPassword() || await loadEncryptedPassword();
      check();
      if (!password && !IS_WIN) return;
      try {
        await startServer(apiKey, password);
        check();
        mitmScope.data.restartCount = 0;
        return;
      } catch (error) {
        check();
        err(`Restart attempt ${mitmScope.data.restartCount}/${MITM_MAX_RESTARTS} failed: ${error.message}`);
      }
    }
    err("Max restart attempts reached. Giving up.");
  });
}

/**
 * Start MITM server only (cert + server, no DNS)
 */
async function killPort443Owner(owner, sudoPassword, check = () => {}) {
  check();
  if (!owner || !owner.pid) return;
  if (IS_WIN) {
    try {
      execSync(`powershell -NonInteractive -WindowStyle Hidden -Command "Stop-Process -Id ${owner.pid} -Force -ErrorAction SilentlyContinue"`, { windowsHide: true });
    } catch { /* best effort */ }
  } else {
    try {
      const { execWithPassword } = require("./dns/dnsConfig");
      if (sudoPassword || isSudoAvailable()) {
        await execWithPassword(`kill -9 ${owner.pid}`, sudoPassword || "");
      } else {
        execSync(`kill -9 ${owner.pid}`, { windowsHide: true });
      }
    } catch { /* best effort */ }
  }
  check();
  await helperLifecycle.delay(mitmScope, 800, check);
  check();
}

async function cleanupMitmDNS(sudoPassword) {
  let password = sudoPassword || getCachedPassword();
  if (!password && !isAdmin() && _getSettings) {
    const settings = await _getSettings();
    if (settings?.mitmSudoEncrypted) password = decryptPassword(settings.mitmSudoEncrypted);
  }
  if (IS_WIN && !isAdmin()) {
    const { runElevatedPowerShell, quotePs } = require("./winElevated.js");
    const hostsFile = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts");
    const hostsList = Object.values(TOOL_HOSTS).flat().map(quotePs).join(",");
    await runElevatedPowerShell(`
      $hosts = @(${hostsList})
      $lines = Get-Content -LiteralPath ${quotePs(hostsFile)}
      $filtered = $lines | Where-Object {
        $line = $_
        -not ($hosts | Where-Object { $line -match [regex]::Escape($_) })
      }
      Set-Content -LiteralPath ${quotePs(hostsFile)} -Value $filtered
      ipconfig /flushdns | Out-Null
    `);
  }
  await removeAllDNSEntries(password || "", { strict: true });
}

mitmScope.stop = async () => {
  mitmScope.data.disabled = true;
  for (const child of mitmScope.children.keys()) { try { child.kill(); } catch { /* best effort */ } }
  await helperLifecycle.drain(mitmScope);
  await cleanupMitmDNS();
};

function startServer(apiKey, sudoPassword, forceKillPort443 = false) {
  if (mitmScope.pending.has("stop")) return mitmScope.pending.get("stop").then(() => startServer(apiKey, sudoPassword, forceKillPort443));
  if (!helperLifecycle.isStopping()) mitmScope.data.disabled = false;
  return helperLifecycle.run(mitmScope, "start", check => runStartServer(apiKey, sudoPassword, forceKillPort443, check));
}

async function runStartServer(apiKey, sudoPassword, forceKillPort443, check) {
  check();
  if (!mitmScope.data.process || mitmScope.data.process.killed) {
    await Promise.all([...mitmScope.children.values()]);
    check();
    let savedPid;
    try { savedPid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10); } catch { /* absent */ }
    if (savedPid && isProcessAlive(savedPid)) {
      mitmScope.data.pid = savedPid;
      await saveMitmSettings(true, sudoPassword, check);
      check();
      if (sudoPassword) setCachedPassword(sudoPassword);
      return { running: true, pid: savedPid };
    }
    try { fs.unlinkSync(PID_FILE); } catch { /* absent */ }
  }
  if (mitmScope.data.process && !mitmScope.data.process.killed) throw new Error("MITM server is already running");
  try { fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    let pid;
    try { pid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim(), 10); } catch { /* stale */ }
    if (pid && isProcessAlive(pid)) throw new Error("MITM server is already starting (lock contention)");
    try { fs.unlinkSync(LOCK_FILE); } catch { /* absent */ }
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" });
  }
  try {
    await killLeftoverMitm(sudoPassword, check);
    check();
    if (!IS_WIN) {
      const portStatus = await checkPort443Free();
      check();
      if (portStatus === "in-use" || portStatus === "no-permission") {
        const owner = await getPort443Owner(sudoPassword, check);
        check();
        if (owner) {
          if (!forceKillPort443) {
            const name = owner.name.includes("/") ? owner.name.split("/").filter(Boolean).pop() : owner.name;
            throw Object.assign(new Error(`Port 443 is already in use by "${name}" (PID ${owner.pid}).`), { code: "PORT_443_BUSY", portOwner: { pid: owner.pid, name } });
          }
          await killPort443Owner(owner, sudoPassword, check);
          check();
        }
      }
    }
    const rootCACertPath = path.join(MITM_DIR, "rootCA.crt");
    const rootCAKeyPath = path.join(MITM_DIR, "rootCA.key");
    const certExists = fs.existsSync(rootCACertPath) && fs.existsSync(rootCAKeyPath);
    if (!certExists || isCertExpired(rootCACertPath)) {
      if (certExists) {
        const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
        check();
        try { await uninstallCert(password, rootCACertPath); } catch { /* best effort */ }
        check();
      }
      await generateCert();
      check();
    }
    const { checkCertInstalled } = require("./cert/install");
    const trusted = await checkCertInstalled(rootCACertPath);
    check();
    if (!trusted) {
      const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
      check();
      if (IS_WIN || IS_MAC || isSudoAvailable()) {
        if (!password && isSudoPasswordRequired()) throw new Error("Sudo password required to install Root CA certificate");
        try { await installCert(password, rootCACertPath, { check }); }
        catch (error) { check(); throw new Error(`Failed to trust certificate: ${error.message}`); }
        check();
      } else {
        log(`Cert: skipping system trust (no sudo). Install ${rootCACertPath} as a trusted CA on machines that use this proxy.`);
      }
    }
    let effectiveServerPath = SERVER_PATH;
    if (!effectiveServerPath || !fs.existsSync(effectiveServerPath)) {
      effectiveServerPath = ensureRuntimeServer(resolveBundledServerPath());
      if (!effectiveServerPath || !fs.existsSync(effectiveServerPath)) throw new Error(`MITM server.js not found at ${effectiveServerPath}. Reinstall zenrouter.`);
    }
    const mitmRouterBase = await resolveMitmRouterBaseUrl();
    check();
    if (IS_WIN) {
      const owner = await getPort443Owner(sudoPassword, check);
      check();
      if (owner) {
        if (!forceKillPort443) throw Object.assign(new Error(`Port 443 is already in use by "${owner.name}" (PID ${owner.pid}).`), { code: "PORT_443_BUSY", portOwner: owner });
        await killPort443Owner(owner, sudoPassword, check);
        check();
      }
    }
    if (!IS_WIN && isSudoAvailable()) {
      const inlineCmd = [
        `HOME=${shellQuoteSingle(os.homedir())}`, `ROUTER_API_KEY=${shellQuoteSingle(apiKey)}`,
        `MITM_ROUTER_BASE=${shellQuoteSingle(mitmRouterBase)}`, "NODE_ENV=production",
        shellQuoteSingle(process.execPath), shellQuoteSingle(effectiveServerPath),
      ].join(" ");
      mitmScope.data.process = spawn("sudo", ["-S", "-E", "sh", "-c", inlineCmd], { detached: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      mitmScope.data.process.stdin.write(`${sudoPassword}\n`);
      mitmScope.data.process.stdin.end();
    } else {
      mitmScope.data.process = spawn(process.execPath, [effectiveServerPath], {
        detached: false, windowsHide: true, cwd: os.tmpdir(), stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ROUTER_API_KEY: apiKey, NODE_ENV: "production", MITM_ROUTER_BASE: mitmRouterBase },
      });
    }
    const child = helperLifecycle.child(mitmScope, mitmScope.data.process);
    const generation = mitmScope.generation;
    mitmScope.data.pid = child.pid;
    fs.writeFileSync(PID_FILE, String(mitmScope.data.pid));
    mitmScope.data.lastStartTime = Date.now();
    let startError;
    child.stdout.on("data", data => process.stdout.write(data));
    child.stderr.on("data", data => {
      if (!helperLifecycle.active(mitmScope, generation)) return;
      const message = data.toString().trim();
      if (message && (IS_WIN || (!message.includes("Password:") && !message.includes("password for")))) { err(message); startError = message; }
      if (!IS_WIN && /incorrect password|no password was provided/.test(message)) {
        setCachedPassword(null);
        clearEncryptedPassword().catch(() => {});
        mitmScope.data.disabled = true;
      }
    });
    child.on("close", code => {
      if (mitmScope.data.process !== child) return;
      mitmScope.data.process = null;
      mitmScope.data.pid = null;
      try { fs.unlinkSync(PID_FILE); } catch { /* absent */ }
      try { fs.unlinkSync(LOCK_FILE); } catch { /* absent */ }
      if (!helperLifecycle.active(mitmScope, generation)) return;
      try { removeAllDNSEntriesSync(); } catch { /* best effort */ }
      if (code !== 0 && !mitmScope.data.disabled) scheduleMitmRestart(apiKey).catch(() => {});
    });
    if (IS_MAC || IS_WIN) {
      const command = IS_MAC ? `launchctl setenv NODE_EXTRA_CA_CERTS "${rootCACertPath}"` : `setx NODE_EXTRA_CA_CERTS "${rootCACertPath}"`;
      await runCommand(command).catch(() => {});
      check();
    }
    const health = await pollMitmHealth(8000, MITM_PORT, check);
    check();
    if (!health) {
      try { removeAllDNSEntriesSync(); } catch { /* best effort */ }
      try { child.kill(); } catch { /* best effort */ }
      throw new Error(`MITM server failed to start. ${startError || "Check sudo password or port 443 access."}`);
    }
    if (_updateSettings) await _updateSettings({ mitmCertInstalled: true }).catch(() => {});
    check();
    await saveMitmSettings(true, sudoPassword, check);
    check();
    if (sudoPassword) setCachedPassword(sudoPassword);
    try { fs.unlinkSync(LOCK_FILE); } catch { /* absent */ }
    return { running: true, pid: mitmScope.data.pid };
  } catch (error) {
    try { fs.unlinkSync(LOCK_FILE); } catch { /* absent */ }
    throw error;
  }
}

/**
 * Stop MITM server and remove all tool DNS entries.
 */
function stopServer(sudoPassword) {
  if (mitmScope.pending.has("stop")) return mitmScope.pending.get("stop");
  if (helperLifecycle.isStopping()) return helperLifecycle.run(mitmScope, "stop", () => {});
  helperLifecycle.invalidate(mitmScope);
  mitmScope.data.disabled = true;
  const previous = [...mitmScope.pending.values()];
  return helperLifecycle.run(mitmScope, "stop", async check => {
    await Promise.allSettled(previous);
    check();
    return runStopServer(sudoPassword, check);
  });
}

async function runStopServer(sudoPassword, check) {
  mitmScope.data.restartCount = 0;
  check();

  // Kill server process
  const proc = mitmScope.data.process;
  const pidToKill = proc && !proc.killed
    ? proc.pid
    : (() => { try { return parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10); } catch { return null; } })();

  if (pidToKill && isProcessAlive(pidToKill)) {
    log(`Killing server (PID: ${pidToKill})...`);
    await killProcess(pidToKill, false, sudoPassword, check);
    check();
    await helperLifecycle.delay(mitmScope, 1000, check);
    check();
    if (isProcessAlive(pidToKill)) await killProcess(pidToKill, true, sudoPassword, check);
    check();
  }
  await Promise.all([...mitmScope.children.values()]);
  check();
  mitmScope.data.process = null;
  mitmScope.data.pid = null;

  await cleanupMitmDNS(sudoPassword);
  check();
  if (IS_MAC) await runCommand("launchctl unsetenv NODE_EXTRA_CA_CERTS").catch(() => {});
  else if (IS_WIN) await runCommand("reg delete HKCU\\Environment /F /V NODE_EXTRA_CA_CERTS").catch(() => {});
  check();
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
  await saveMitmSettings(false, null, check);
  check();

  return { running: false, pid: null };
}

/**
 * Enable DNS for a specific tool (requires server running)
 */
function runDnsMutation(work) {
  if (mitmScope.pending.has("stop")) return Promise.reject(Object.assign(new Error("MITM server is stopping"), { code: "HELPER_STOPPED" }));
  const capacity = Object.keys(TOOL_HOSTS).length * 2 + 1;
  let key;
  for (let slot = 0; slot < capacity; slot++) {
    if (!mitmScope.pending.has(`dns-${slot}`)) { key = `dns-${slot}`; break; }
  }
  if (!key) return Promise.reject(Object.assign(new Error("Too many pending DNS operations"), { code: "HELPER_BUSY" }));
  const previous = mitmScope.data.dnsTail;
  const task = helperLifecycle.run(mitmScope, key, async check => {
    await previous?.catch(() => {});
    check();
    return work(check);
  });
  mitmScope.data.dnsTail = task;
  task.finally(() => { if (mitmScope.data.dnsTail === task) mitmScope.data.dnsTail = null; }).catch(() => {});
  return task;
}

function enableToolDNS(tool, sudoPassword) {
  if (!Object.hasOwn(TOOL_HOSTS, tool)) return Promise.reject(new Error(`Unknown tool: ${tool}`));
  return runDnsMutation(async check => {
    const status = await getMitmStatus();
    check();
    if (!status.running) throw new Error("MITM server is not running. Start the server first.");
    const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
    check();
    await addDNSEntry(tool, password);
    check();
    await saveDnsToolState(tool, true, check);
    return { success: true };
  });
}

/**
 * Disable DNS for a specific tool
 */
function disableToolDNS(tool, sudoPassword) {
  if (!Object.hasOwn(TOOL_HOSTS, tool)) return Promise.reject(new Error(`Unknown tool: ${tool}`));
  return runDnsMutation(async check => {
    const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
    check();
    await removeDNSEntry(tool, password);
    check();
    await saveDnsToolState(tool, false, check);
    return { success: true };
  });
}

/**
 * Install Root CA to system trust store (standalone, no server start)
 */
function trustCert(sudoPassword) {
  return helperLifecycle.run(mitmScope, "trust-cert", async check => {
    const rootCACertPath = path.join(MITM_DIR, "rootCA.crt");
    if (!fs.existsSync(rootCACertPath)) throw new Error("Root CA not found. Start server first to generate it.");
    if (!IS_WIN && !IS_MAC && !isSudoAvailable()) return;
    const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
    check();
    if (!password && isSudoPasswordRequired()) throw new Error("Sudo password required to trust certificate");
    await installCert(password, rootCACertPath, { check });
    check();
    if (password) setCachedPassword(password);
  });
}

// Legacy aliases for backward compatibility
const startMitm = startServer;
const stopMitm = stopServer;

module.exports = {
  getHelperLifecycle: () => helperLifecycle,
  getMitmStatus,
  startServer,
  stopServer,
  enableToolDNS,
  disableToolDNS,
  trustCert,
  // Legacy
  startMitm,
  stopMitm,
  getCachedPassword,
  setCachedPassword,
  loadEncryptedPassword,
  clearEncryptedPassword,
  isSudoPasswordRequired,
  initDbHooks,
  restoreToolDNS,
  hasDnsPrivilege,
  removeAllDNSEntriesSync,
};
