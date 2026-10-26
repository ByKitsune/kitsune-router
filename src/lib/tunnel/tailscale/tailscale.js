import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execSync, exec, spawn as spawnProcess } from "child_process";
import { promisify } from "util";
import { execWithPassword } from "@/mitm/dns/dnsConfig";
import { DATA_DIR } from "@/lib/dataDir.js";
import { getHelperLifecycle } from "@/mitm/manager";

const lifecycle = getHelperLifecycle();
const scope = lifecycle.scope("tailscale");
const execAsync = promisify(exec);

function spawn(...args) {
  lifecycle.assert(scope, scope.generation);
  return lifecycle.child(scope, spawnProcess(...args));
}

const BIN_DIR = path.join(DATA_DIR, "bin");
const IS_MAC = os.platform() === "darwin";
const IS_LINUX = os.platform() === "linux";
const IS_WINDOWS = os.platform() === "win32";
const TAILSCALE_BIN = path.join(BIN_DIR, IS_WINDOWS ? "tailscale.exe" : "tailscale");

// Custom socket for userspace-networking mode (no root required)
const TAILSCALE_DIR = path.join(DATA_DIR, "tailscale");
export const TAILSCALE_SOCKET = path.join(TAILSCALE_DIR, "tailscaled.sock");
const SOCKET_FLAG = IS_WINDOWS ? [] : ["--socket", TAILSCALE_SOCKET];

// System daemon socket (sudo install: apt/snap/systemd) — read-only status detection
const SYSTEM_TAILSCALE_SOCKET = IS_WINDOWS ? null : "/var/run/tailscale/tailscaled.sock";
const SYSTEM_SOCKET_FLAG = SYSTEM_TAILSCALE_SOCKET ? ["--socket", SYSTEM_TAILSCALE_SOCKET] : [];

// Well-known Windows install path
const WINDOWS_TAILSCALE_BIN = "C:\\Program Files\\Tailscale\\tailscale.exe";

// Common Unix install paths to probe synchronously (system tailscale)
const UNIX_TAILSCALE_CANDIDATES = [
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/usr/sbin/tailscale",   // apt package on Debian/Ubuntu
  "/usr/bin/tailscale",
  "/snap/bin/tailscale",   // Snap package
];

// ─── Cache + background refresh (avoid blocking event loop on dead daemon) ──
const PROBE_TTL_MS = 10000;
const PROBE_TIMEOUT_MS = 1500;

const binCache = scope.data.binCache ??= { value: undefined, fetchedAt: 0 };
const runningCache = scope.data.runningCache ??= { value: false, fetchedAt: 0 };
const loggedInCache = scope.data.loggedInCache ??= { value: false, fetchedAt: 0 };
const funnelUrlCache = scope.data.funnelUrlCache ??= { value: null, port: null, fetchedAt: 0 };
scope.stop = () => {
  for (const child of scope.children.keys()) { try { child.kill(); } catch { /* best effort */ } }
};

function fallbackBin() {
  if (fs.existsSync(TAILSCALE_BIN)) return TAILSCALE_BIN;
  if (IS_WINDOWS && fs.existsSync(WINDOWS_TAILSCALE_BIN)) return WINDOWS_TAILSCALE_BIN;
  if (!IS_WINDOWS) return UNIX_TAILSCALE_CANDIDATES.find((p) => fs.existsSync(p)) || null;
  return null;
}

function refreshCache(name, cache, read) {
  if (lifecycle.isStopping()) return;
  lifecycle.run(scope, name, async check => {
    try { const value = await read(check); check(); cache.value = value; }
    finally { cache.fetchedAt = Date.now(); }
  }).catch(() => {});
}

export function getTailscaleBin() {
  if (Date.now() - binCache.fetchedAt > PROBE_TTL_MS) {
    refreshCache("bin", binCache, async check => {
      const cmd = IS_WINDOWS ? "where tailscale 2>nul" : "which tailscale 2>/dev/null";
      try {
        const { stdout } = await execAsync(cmd, { windowsHide: true, timeout: PROBE_TIMEOUT_MS, env: { ...process.env, PATH: EXTENDED_PATH } });
        check();
        return stdout.trim() || fallbackBin();
      } catch (error) { check(); return fallbackBin(); }
    });
  }
  if (binCache.value === undefined) binCache.value = fallbackBin();
  return binCache.value;
}

export function isTailscaleInstalled() { return getTailscaleBin() !== null; }
function tsArgs(...args) { return [...SOCKET_FLAG, ...args]; }

async function probeStatusAsync(bin, check, sockets = [SOCKET_FLAG, SYSTEM_SOCKET_FLAG]) {
  for (const socketArgs of sockets) {
    check();
    try {
      const { stdout } = await execAsync(`"${bin}" ${socketArgs.join(" ")} status --json`, {
        windowsHide: true, env: { ...process.env, PATH: EXTENDED_PATH }, timeout: PROBE_TIMEOUT_MS,
      });
      check();
      return JSON.parse(stdout);
    } catch { check(); }
  }
  return null;
}

export function isTailscaleLoggedInStrict() {
  return lifecycle.run(scope, "logged-in-strict", async check => {
    const bin = getTailscaleBin();
    if (!bin) return false;
    const json = await probeStatusAsync(bin, check, [SOCKET_FLAG]);
    check();
    loggedInCache.value = !!json && json.BackendState === "Running" && json.Self?.Online === true;
    loggedInCache.fetchedAt = Date.now();
    return loggedInCache.value;
  });
}

export function isTailscaleLoggedIn() {
  if (Date.now() - loggedInCache.fetchedAt > PROBE_TTL_MS) {
    refreshCache("logged-in", loggedInCache, async check => {
      const bin = getTailscaleBin();
      const json = bin && await probeStatusAsync(bin, check);
      return !!json && json.BackendState === "Running" && json.Self?.Online === true;
    });
  }
  return loggedInCache.value;
}

async function readRunning(check) {
  const bin = getTailscaleBin();
  if (!bin) return false;
  try {
    const { stdout } = await execAsync(`"${bin}" ${SOCKET_FLAG.join(" ")} funnel status --json`, { windowsHide: true, timeout: PROBE_TIMEOUT_MS });
    check();
    return Object.keys(JSON.parse(stdout).AllowFunnel || {}).length > 0;
  } catch { check(); return false; }
}

export function isTailscaleRunning() {
  if (Date.now() - runningCache.fetchedAt > PROBE_TTL_MS) refreshCache("running", runningCache, readRunning);
  return runningCache.value;
}

export function isTailscaleRunningStrict() {
  return lifecycle.run(scope, "running-strict", async check => {
    const running = await readRunning(check);
    check();
    runningCache.value = running;
    runningCache.fetchedAt = Date.now();
    return running;
  });
}

export function isSystemDaemonRunning() {
  if (lifecycle.isStopping() || IS_WINDOWS || !SYSTEM_TAILSCALE_SOCKET || !fs.existsSync(SYSTEM_TAILSCALE_SOCKET)) return false;
  const bin = getTailscaleBin();
  if (!bin) return false;
  try {
    const out = execSync(`"${bin}" ${SYSTEM_SOCKET_FLAG.join(" ")} status --json`, {
      encoding: "utf8", windowsHide: true, env: { ...process.env, PATH: EXTENDED_PATH }, timeout: PROBE_TIMEOUT_MS,
    });
    return JSON.parse(out).BackendState === "Running";
  } catch { return false; }
}

function bgRefreshFunnelUrl(port) {
  refreshCache("funnel-url", funnelUrlCache, async check => {
    const bin = getTailscaleBin();
    if (!bin) return null;
    const json = await probeStatusAsync(bin, check, [SOCKET_FLAG]);
    check();
    funnelUrlCache.port = port;
    const dnsName = json?.Self?.DNSName?.replace(/\.$/, "");
    return dnsName ? `https://${dnsName}` : null;
  });
}

/** Get actual funnel URL from Self.DNSName (sync, authoritative — avoids hostname-conflict suffix). */
function getActualFunnelUrl() {
  const bin = getTailscaleBin();
  if (!bin) return null;
  try {
    const out = execSync(`"${bin}" ${SOCKET_FLAG.join(" ")} status --json`, {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PATH: EXTENDED_PATH },
      timeout: 5000,
    });
    const json = JSON.parse(out);
    const dnsName = json.Self?.DNSName?.replace(/\.$/, "");
    return dnsName ? `https://${dnsName}` : null;
  } catch { return null; }
}

/** Get funnel URL from tailscale status (cached, non-blocking) */
export function getTailscaleFunnelUrl(port) {
  if (Date.now() - funnelUrlCache.fetchedAt > PROBE_TTL_MS || funnelUrlCache.port !== port) {
    bgRefreshFunnelUrl(port);
  }
  return funnelUrlCache.value;
}

/**
 * Install tailscale.
 * - macOS + brew: brew install tailscale (no sudo needed)
 * - macOS no brew: download .pkg then sudo installer -pkg
 * - Linux: fetch install.sh, pipe to sudo -S sh via stdin
 * - Windows: download MSI via UAC-elevated PowerShell
 */
export function installTailscale(sudoPassword, hostname, onProgress) {
  return lifecycle.run(scope, "install", check => runInstallTailscale(sudoPassword, hostname, onProgress, check));
}

async function runInstallTailscale(sudoPassword, hostname, onProgress, check) {
  check();
  const log = onProgress || (() => {});
  if (IS_WINDOWS) {
    await installTailscaleWindows(log, check);
    check();
    return { success: true };
  }
  if (IS_MAC) await installTailscaleMac(sudoPassword, log, check);
  else await installTailscaleLinux(sudoPassword, log, check);
  check();
  log("Starting daemon...");
  await startDaemonWithPassword(sudoPassword, check);
  check();
  log("Logging in...");
  return startLogin(hostname, check);
}

const EXTENDED_PATH = `/usr/local/bin:/opt/homebrew/bin:/usr/sbin:/usr/bin:/bin:/snap/bin:${process.env.PATH || ""}`;

function hasBrew() {
  try { execSync("which brew", { stdio: "ignore", windowsHide: true, env: { ...process.env, PATH: EXTENDED_PATH } }); return true; } catch { return false; }
}

async function installTailscaleMac(sudoPassword, log, check) {
  check();
  if (hasBrew()) {
    log("Installing via Homebrew...");
    await new Promise((resolve, reject) => {
      const child = spawn("brew", ["install", "tailscale"], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: { ...process.env, PATH: EXTENDED_PATH }
      });
      child.stdout.on("data", (d) => {
        const line = d.toString().trim();
        if (line) log(line);
      });
      child.stderr.on("data", (d) => {
        const line = d.toString().trim();
        if (line) log(line);
      });
      child.on("close", (c) => {
        if (c === 0) resolve();
        else reject(new Error(`brew install failed (code ${c})`));
      });
      child.on("error", reject);
    });
    return;
  }

  // No brew: download .pkg and install via sudo installer
  const pkgUrl = "https://pkgs.tailscale.com/stable/tailscale-latest.pkg";
  const pkgPath = path.join(os.tmpdir(), "tailscale.pkg");

  log("Downloading Tailscale package...");
  await new Promise((resolve, reject) => {
    const child = spawn("curl", ["-fL", "--progress-bar", pkgUrl, "-o", pkgPath], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stderr.on("data", (d) => {
      const line = d.toString().trim();
      if (line) log(line);
    });
    child.on("close", (c) => {
      if (c === 0) resolve();
      else reject(new Error("Download failed"));
    });
    child.on("error", reject);
  });

  check();
  log("Installing package...");
  await new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-S", "installer", "-pkg", pkgPath, "-target", "/"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.stdout.on("data", (d) => {
      const line = d.toString().trim();
      if (line) log(line);
    });
    child.on("close", (c) => {
      try { execSync(`rm -f ${pkgPath}`, { stdio: "ignore", windowsHide: true }); } catch { /* ignore */ }
      if (c === 0) resolve();
      else {
        const msg = (stderr.includes("incorrect password") || stderr.includes("Sorry"))
          ? "Wrong sudo password"
          : stderr || `Exit code ${c}`;
        reject(new Error(msg));
      }
    });
    child.on("error", reject);
    child.stdin.write(`${sudoPassword}\n`);
    child.stdin.end();
  });
}

async function installTailscaleLinux(sudoPassword, log, check) {
  check();
  // Reject password containing newline → prevents stdin command injection
  if (typeof sudoPassword !== "string" || sudoPassword.includes("\n")) {
    throw new Error("Invalid sudo password");
  }
  log("Downloading install script...");
  return new Promise((resolve, reject) => {
    const curlChild = spawn("curl", ["-fsSL", "https://tailscale.com/install.sh"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let scriptContent = "";
    let curlErr = "";
    curlChild.stdout.on("data", (d) => { scriptContent += d.toString(); });
    curlChild.stderr.on("data", (d) => { curlErr += d.toString(); });
    curlChild.on("exit", (code) => {
      try { check(); } catch (error) { reject(error); return; }
      if (code !== 0) return reject(new Error(`Failed to download install script: ${curlErr}`));
      log("Running install script...");
      // Persist script to temp file → exec by path (NOT via stdin) → sh never reads attacker-controlled stdin
      const tmpScript = path.join(os.tmpdir(), `tailscale-install-${crypto.randomBytes(8).toString("hex")}.sh`);
      try {
        fs.writeFileSync(tmpScript, scriptContent, { mode: 0o700 });
      } catch (e) {
        return reject(new Error(`Failed to write install script: ${e.message}`));
      }
      const cleanup = () => { try { fs.unlinkSync(tmpScript); } catch {} };
      const child = spawn("sudo", ["-S", "sh", tmpScript], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      let stderr = "";
      child.stdout.on("data", (d) => {
        const line = d.toString().trim();
        if (line) log(line);
      });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("close", (c) => {
        cleanup();
        if (c === 0) resolve();
        else {
          const msg = (stderr.includes("incorrect password") || stderr.includes("Sorry"))
            ? "Wrong sudo password"
            : stderr || `Exit code ${c}`;
          reject(new Error(msg));
        }
      });
      child.on("error", (e) => { cleanup(); reject(e); });
      child.stdin.write(`${sudoPassword}\n`);
      child.stdin.end();
    });
    curlChild.on("error", reject);
  });
}

async function installTailscaleWindows(log, check) {
  check();
  const msiUrl = "https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi";
  const msiPath = path.join(os.tmpdir(), "tailscale-setup.msi");

  // Download MSI via curl.exe (built-in on Win10+) — no PowerShell window, streams progress
  log("Downloading Tailscale installer...");
  await new Promise((resolve, reject) => {
    const child = spawn("curl.exe", ["-L", "-#", "-o", msiPath, msiUrl], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    // curl outputs progress to stderr with -# flag
    let lastPct = "";
    child.stderr.on("data", (d) => {
      const text = d.toString();
      const match = text.match(/(\d+\.\d)%/);
      if (match && match[1] !== lastPct) {
        lastPct = match[1];
        log(`Downloading... ${lastPct}%`);
      }
    });
    child.on("close", (c) => c === 0 ? resolve() : reject(new Error("Download failed")));
    child.on("error", reject);
  });

  check();
  // Install MSI with UAC elevation via PowerShell Start-Process -Verb RunAs
  log("Installing Tailscale (UAC prompt may appear)...");
  await new Promise((resolve, reject) => {
    const args = `'/i','${msiPath}','TS_NOLAUNCH=true','/quiet','/norestart'`;
    const child = spawn("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      `Start-Process msiexec -ArgumentList ${args} -Verb RunAs -Wait`
    ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stderr.on("data", (d) => { const l = d.toString().trim(); if (l) log(l); });
    child.on("close", (c) => {
      try { fs.unlinkSync(msiPath); } catch { /* ignore */ }
      c === 0 ? resolve() : reject(new Error(`msiexec failed (code ${c})`));
    });
    child.on("error", reject);
  });

  // Verify tailscale.exe exists after install
  log("Verifying installation...");
  const maxWait = 10000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (fs.existsSync(WINDOWS_TAILSCALE_BIN)) {
      log("Installation complete.");
      return;
    }
    await lifecycle.delay(scope, 1000, check);
    check();
  }
  throw new Error("Installation finished but tailscale.exe not found");
}

// Self-heal: if state dir/files were previously created by root (e.g. legacy sudo daemon),
// reclaim ownership recursively so the user-mode daemon can read/write state files.
async function ensureUserOwnedDir(dir, check) {
  check();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      return;
    }
    const uid = process.getuid();
    const gid = process.getgid();

    // Walk dir + all entries to find any non-user-owned items
    const needsChown = (() => {
      const stack = [dir];
      while (stack.length) {
        const cur = stack.pop();
        try {
          const st = fs.statSync(cur);
          if (st.uid !== uid) return true;
          if (st.isDirectory()) {
            for (const name of fs.readdirSync(cur)) stack.push(path.join(cur, name));
          }
        } catch { /* ignore */ }
      }
      return false;
    })();

    if (!needsChown) return;

    // Try direct chown first (works if already owned). Fallback to passwordless sudo.
    try {
      await execAsync(`chown -R ${uid}:${gid} "${dir}"`, { timeout: 3000 });
      check();
    } catch {
      check();
      try { await execAsync(`sudo -n chown -R ${uid}:${gid} "${dir}"`, { timeout: 3000 }); } catch { /* ignore */ }
      check();
    }
  } catch { check(); }
}

/** Check if running daemon uses TUN mode (Funnel TLS requires TUN). */
function isDaemonTunMode() {
  try {
    const ps = execSync(`pgrep -af "tailscaled.*${TAILSCALE_SOCKET}"`, { encoding: "utf8", timeout: 2000 }).trim();
    if (!ps) return null;
    return !ps.includes("--tun=userspace-networking");
  } catch { return null; }
}

/** Daemon process alive (independent of funnel state) — mirrors cloudflared PID check semantic. */
export function isDaemonAlive() {
  return isDaemonTunMode() !== null;
}

/**
 * Start tailscaled.
 * - With sudoPassword: TUN mode (root) → Funnel TLS works
 * - Without: userspace-networking fallback (no sudo, but Funnel TLS unstable)
 * State always lives in ~/.kitsune-router/tailscale/ via --statedir.
 */
export function startDaemonWithPassword(sudoPassword, parentCheck = () => {}) {
  return lifecycle.run(scope, "daemon", async assert => {
    const check = () => { assert(); parentCheck(); };
    return runDaemon(sudoPassword, check);
  });
}

async function runDaemon(sudoPassword, check) {
  check();
  if (IS_WINDOWS) {
    // Windows: tailscale runs as a Windows Service. Start it then poll BackendState
    // until daemon finishes init (avoids "NoState" errors when calling funnel/up too early).
    const bin = getTailscaleBin();
    console.log("[Tailscale] win: net start Tailscale");
    try { execSync("net start Tailscale", { stdio: "ignore", windowsHide: true, timeout: 10000 }); }
    catch { /* may need admin, or already running */ }
    if (!bin) return;
    // Poll up to ~10s for backend to leave NoState
    for (let i = 0; i < 20; i++) {
      try {
        const out = execSync(`"${bin}" status --json`, { encoding: "utf8", windowsHide: true, timeout: 2000 });
        const j = JSON.parse(out);
        if (j.BackendState && j.BackendState !== "NoState") {
          console.log(`[Tailscale] win: BackendState=${j.BackendState} after ${i*500}ms`);
          return;
        }
      } catch { /* daemon not ready */ }
      await lifecycle.delay(scope, 500, check);
      check();
    }
    console.log("[Tailscale] win: BackendState still NoState after poll");
    return;
  }

  const currentMode = isDaemonTunMode(); // true=TUN, false=userspace, null=not running
  // No password but a healthy TUN daemon already runs → keep TUN, never downgrade-kill it.
  const wantTun = sudoPassword ? true : currentMode === true;

  // Daemon already running in correct mode → reuse
  if (currentMode !== null && currentMode === wantTun) {
    try {
      const bin = getTailscaleBin() || "tailscale";
      execSync(`"${bin}" ${SOCKET_FLAG.join(" ")} status --json`, {
        stdio: "ignore", windowsHide: true,
        env: { ...process.env, PATH: EXTENDED_PATH }, timeout: 3000
      });
      return;
    } catch { /* unresponsive, restart below */ }
  }

  // Mode mismatch or unresponsive → kill all daemons on our socket
  try { execSync(`pkill -9 -f "tailscaled.*${TAILSCALE_SOCKET}"`, { stdio: "ignore", timeout: 3000 }); } catch { /* ignore */ }
  if (sudoPassword) {
    try { await execWithPassword(`pkill -9 -f "tailscaled.*${TAILSCALE_SOCKET}"`, sudoPassword); } catch { /* ignore */ }
  } else {
    try { execSync(`sudo -n pkill -9 -f "tailscaled.*${TAILSCALE_SOCKET}"`, { stdio: "ignore", timeout: 3000 }); } catch { /* ignore */ }
  }
  check();
  await lifecycle.delay(scope, 1500, check);
  check();

  // Reclaim folder ownership (previous root daemon may have locked it)
  await ensureUserOwnedDir(TAILSCALE_DIR, check);
  check();

  const tailscaledBin = IS_MAC ? "/usr/local/bin/tailscaled" : "tailscaled";
  const daemonArgs = [
    `--socket=${TAILSCALE_SOCKET}`,
    `--statedir=${TAILSCALE_DIR}`,
  ];
  if (!wantTun) daemonArgs.push("--tun=userspace-networking");

  if (wantTun) {
    // TUN mode: spawn via sudo, password via stdin. Detached so it survives parent exit.
    const child = spawn("sudo", ["-S", tailscaledBin, ...daemonArgs], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      cwd: os.tmpdir(),
      env: { ...process.env, PATH: EXTENDED_PATH },
    });
    child.stdin.write(`${sudoPassword}\n`);
    child.stdin.end();
    child.unref();
  } else {
    const child = spawn(tailscaledBin, daemonArgs, {
      detached: true,
      stdio: "ignore",
      cwd: os.tmpdir(),
      env: { ...process.env, PATH: EXTENDED_PATH },
    });
    child.unref();
  }

  // Wait for socket ready
  await lifecycle.delay(scope, 3000, check);
  check();
}

/** Read AuthURL from `tailscale status --json` (Win exposes it there, not stdout). */
function getAuthUrlFromStatus() {
  const bin = getTailscaleBin();
  if (!bin) return null;
  try {
    const out = execSync(`"${bin}" ${SOCKET_FLAG.join(" ")} status --json`, {
      encoding: "utf8", windowsHide: true, timeout: 2000
    });
    const j = JSON.parse(out);
    if (j.AuthURL) return j.AuthURL;
    return null;
  } catch { return null; }
}

/**
 * Run `tailscale up` and capture the auth URL for browser login.
 * Resolves with { authUrl } or { alreadyLoggedIn: true }.
 * On Windows, AuthURL comes from `status --json` (not stdout) — must poll status.
 */
export function startLogin(hostname, parentCheck = () => {}) {
  return lifecycle.run(scope, "login", async assert => {
    const check = () => { assert(); parentCheck(); };
    try { await startDaemonWithPassword("", check); } catch { check(); }
    check();
    const bin = getTailscaleBin();
    if (!bin) throw new Error("Tailscale not installed");
    if (isTailscaleLoggedIn()) return { alreadyLoggedIn: true };
    const args = tsArgs("up", "--accept-routes");
    if (hostname) args.push(`--hostname=${hostname}`);
    return runTailscaleChild(bin, args, 15000, check, (output, ended) => {
      const url = output.match(/https:\/\/login\.tailscale\.com\/a\/[a-zA-Z0-9]+/)?.[0] || getAuthUrlFromStatus();
      if (url) return { authUrl: url };
      if (ended && isTailscaleLoggedIn()) return { alreadyLoggedIn: true };
    });
  });
}

export function cancelTailscaleCommands() {
  const commands = [...(scope.data.commands?.entries() || [])];
  const closed = commands.map(([child]) => scope.children.get(child));
  for (const [child, cancel] of commands) {
    cancel();
    try { child.kill(); } catch { /* best effort */ }
  }
  return Promise.all(closed).then(() => {});
}

function runTailscaleChild(bin, args, timeoutMs, check, inspect) {
  check();
  const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  scope.data.commands ??= new Map();
  return new Promise((resolve, reject) => {
    let done = false, closing = false, closed = false, failure;
    let output = "";
    const release = () => {
      clearTimeout(timeout);
      clearInterval(poll);
      scope.wakes.delete(cancel);
      child.stdout.removeListener("data", data);
      child.stderr.removeListener("data", data);
    };
    const finish = (error, value) => {
      if (done) return;
      done = true;
      release();
      if (error) reject(error); else resolve(value);
    };
    const abort = error => {
      if (done || closing) return;
      closing = true;
      failure = error;
      release();
      if (closed) finish(error);
      else { try { child.kill(); } catch { /* best effort */ } }
    };
    const cancel = () => {
      try { check(); } catch (error) { abort(error); }
    };
    const inspectOutput = (ended = false) => {
      if (done || closing) return;
      try {
        check();
        const value = inspect(output, ended);
        if (value) finish(null, value);
        else if (ended) abort(new Error(`Tailscale command did not complete: ${output.trim()}`));
      } catch (error) { abort(error); }
    };
    const poll = setInterval(() => inspectOutput(), 500);
    const timeout = setTimeout(() => {
      inspectOutput(true);
      if (!closing && !closed) { try { child.kill(); } catch { /* best effort */ } }
    }, timeoutMs);
    scope.wakes.add(cancel);
    scope.data.commands.set(child, () => abort(Object.assign(new Error("helper operation cancelled"), { code: "HELPER_STOPPED" })));
    const data = chunk => { if (!done && !closing) { output = (output + chunk.toString()).slice(-65536); inspectOutput(); } };
    child.stdout.on("data", data);
    child.stderr.on("data", data);
    child.once("error", abort);
    child.once("close", () => {
      closed = true;
      scope.data.commands.delete(child);
      if (closing) finish(failure); else inspectOutput(true);
    });
  });
}

/** Start tailscale funnel for the given port */
export function startFunnel(port, parentCheck = () => {}) {
  return lifecycle.run(scope, "funnel", async assert => {
    const check = () => { assert(); parentCheck(); };
    const bin = getTailscaleBin();
    if (!bin) throw new Error("Tailscale not installed");
    check();
    try { execSync(`"${bin}" ${SOCKET_FLAG.join(" ")} funnel --bg reset`, { stdio: "ignore", windowsHide: true }); } catch { /* best effort */ }
    return runTailscaleChild(bin, tsArgs("funnel", "--bg", `${port}`), 30000, check, output => {
      if (output.includes("Funnel is not enabled")) {
        const enableUrl = output.match(/https:\/\/login\.tailscale\.com\/[^\s]+/)?.[0];
        if (enableUrl) return { funnelNotEnabled: true, enableUrl };
      }
      const url = getActualFunnelUrl() || getTailscaleFunnelUrl(port);
      if (url) return { tunnelUrl: url };
    });
  });
}

/** Provision TLS cert for funnel domain (required before Funnel serves HTTPS). Best-effort. */
export function provisionCert(hostname) {
  return lifecycle.run(scope, "cert", async check => {
    const bin = getTailscaleBin();
    if (!bin || !hostname) return;
    const certsDir = path.join(TAILSCALE_DIR, "certs");
    fs.mkdirSync(certsDir, { recursive: true });
    const certFile = path.join(certsDir, `${hostname}.crt`);
    const keyFile = path.join(certsDir, `${hostname}.key`);
    check();
    try {
      await execAsync(`"${bin}" ${SOCKET_FLAG.join(" ")} cert --cert-file "${certFile}" --key-file "${keyFile}" "${hostname}"`,
        { windowsHide: true, env: { ...process.env, PATH: EXTENDED_PATH }, timeout: 30000 });
    } catch (error) { check(); console.warn(`[Tailscale] cert provision failed (non-fatal): ${error.message}`); }
  });
}

/** Stop tailscale funnel */
export function stopFunnel() {
  if (lifecycle.isStopping()) return;
  const bin = getTailscaleBin();
  if (!bin) return;
  try { execSync(`"${bin}" ${SOCKET_FLAG.join(" ")} funnel --bg reset`, { stdio: "ignore", windowsHide: true }); } catch (e) { /* ignore */ }
}

/** Kill tailscaled daemon (runs as root, needs sudo) */
export function stopDaemon(sudoPassword) {
  return lifecycle.run(scope, "stop-daemon", async check => {
    try { execSync("pkill -x tailscaled", { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { /* ignore */ }
    try { execSync("pgrep -x tailscaled", { stdio: "ignore", windowsHide: true, timeout: 2000 }); } catch { return; }
    if (!IS_WINDOWS) {
      try { await execWithPassword("pkill -x tailscaled", sudoPassword || ""); } catch { /* ignore */ }
      check();
    }
    try { if (fs.existsSync(TAILSCALE_SOCKET)) fs.unlinkSync(TAILSCALE_SOCKET); } catch { /* ignore */ }
  });
}
