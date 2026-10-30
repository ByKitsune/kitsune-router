#!/usr/bin/env node

const { spawn, exec, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const https = require("https");
const net = require("net");
const os = require("os");

// Poll until the server accepts TCP connections on port, or timeout — avoids blind fixed waits.
function waitServerReady(port, { timeoutMs = 15000, intervalMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryConnect = () => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(tryConnect, intervalMs);
      });
    };
    tryConnect();
  });
}

// Native spinner - no external dependency
function createSpinner(text) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let interval = null;
  let currentText = text;
  return {
    start() {
      if (process.stdout.isTTY) {
        process.stdout.write(`\r${frames[0]} ${currentText}`);
        interval = setInterval(() => {
          process.stdout.write(`\r${frames[i++ % frames.length]} ${currentText}`);
        }, 80);
      }
      return this;
    },
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (process.stdout.isTTY) {
        process.stdout.write("\r\x1b[K");
      }
    },
    succeed(msg) {
      this.stop();
      console.log(`✅ ${msg}`);
    },
    fail(msg) {
      this.stop();
      console.log(`❌ ${msg}`);
    }
  };
}

const pkg = require("./package.json");
const args = process.argv.slice(2);
const APP_NAME = "kitsune-router";
const videoCommand = args[0] === "xai" && args[1] === "video";
// Informational commands never migrate state, install dependencies or create
// secrets. They must work even when the old gateway is still running.
if (!videoCommand && args.some(arg => arg === "--version" || arg === "-v")) {
  console.log(pkg.version);
  process.exit(0);
}
if (!videoCommand && args.some(arg => arg === "--help" || arg === "-h")) {
  console.log(`Usage: ${APP_NAME} [options]

Options:
  -p, --port <port>   Port to run the server (default: 20128)
  -H, --host <host>   Host to bind (default: 0.0.0.0)
  -n, --no-browser    Don't open browser automatically
  -l, --log           Show server logs (default: hidden)
  -t, --tray          Run in system tray mode (background)
  --skip-update      Skip auto-update check
  -h, --help         Show this help message
  -v, --version      Show version

Commands:
  xai video --prompt "..." --output video.mp4
                     Generate a Grok Imagine video via the running gateway
                     (see: ${APP_NAME} xai video --help)`);
  process.exit(0);
}
const { resolveDataDirectory } = require("./hooks/dataDirectory");
// Resolve/migrate before runtime warm-up or secret generation can create an
// empty destination. Migration failures are fatal, not a fresh-install fallback.
try { process.env.DATA_DIR = resolveDataDirectory(); }
catch (error) {
  console.error(`[kitsune-router] State migration stopped: ${error.message}`);
  process.exit(1);
}
const { ensureSqliteRuntime, buildEnvWithRuntime } = require("./hooks/sqliteRuntime");
const { buildSecretsEnv, getSecretsPath } = require("./hooks/runtimeSecrets");
const { resolveHeapFlags } = require("./hooks/nodeFlags");
const { ensureTrayRuntime } = require("./hooks/trayRuntime");
const { stopOwnedServer } = require("./hooks/serverShutdown");

// Subcommands (`kitsune-router xai video …`) run against an already-running gateway
// and bypass the launcher flow (no runtime self-heal, no server spawn).
if (videoCommand) {
  const { run } = require("./src/cli/commands/xaiVideo");
  run(args.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`❌ ${err?.message || err}`);
      process.exit(1);
    });
  return;
}

// Self-heal SQLite runtime deps (sql.js + better-sqlite3) into ~/.kitsune-router/runtime
// so the server can resolve them via NODE_PATH. Best-effort — sql.js is required,
// better-sqlite3 is optional. Logs to stderr only on failure.
try { ensureSqliteRuntime({ silent: true }); } catch {}

// Self-heal tray runtime (systray for macOS/Linux only). Windows skipped.
try { ensureTrayRuntime({ silent: true }); } catch {}

// Auto-setup: generate + persist the runtime secrets (JWT_SECRET, API_KEY_SECRET,
// MACHINE_ID_SALT) in the user data dir on first run, so `npm i -g` is usable
// immediately with no manual .env editing. See hooks/runtimeSecrets.js for why
// the secret cannot live inside the package.
let secretsEnv = {};
try { secretsEnv = buildSecretsEnv(process.env); }
catch (error) {
  console.error(`[kitsune-router] Runtime secrets setup stopped: ${error.message}`);
  process.exit(1);
}

// Preserve a previously opted-in, recognized startup record. This only edits
// files with backups; it never loads launchd, runs VBS or invokes systemctl.
try {
  const manifest = path.join(process.env.DATA_DIR, ".migration.json");
  if (process.env.KITSUNE_ROUTER_MIGRATION !== "skip" && fs.existsSync(manifest)) {
    const metadata = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const sourceName = path.basename(metadata.source || "").replace(/^\./, "");
    if (["zenrouter", "9router"].includes(sourceName)) {
      const { migrateLegacyAutoStart } = require("./src/cli/tray/autostart");
      const migration = migrateLegacyAutoStart(__filename, { sourceName });
      for (const warning of migration.warnings) console.warn(`[kitsune-router] ${warning}`);
    }
  }
} catch (error) {
  console.warn(`[kitsune-router] Auto-start migration needs review: ${error.message}`);
}

// Configuration constants
const INSTALL_CMD_LATEST = `npm i -g ${pkg.name}@latest --prefer-online`;

const DEFAULT_PORT = 20128;
const DEFAULT_HOST = "0.0.0.0";

// First non-internal IPv4 — the address remote peers actually reach when bound to 0.0.0.0.
function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

// Local URL stays "localhost"; warn separately when bound to all interfaces (network-exposed).
function getDisplayHost() {
  return host === DEFAULT_HOST ? "localhost" : host;
}
const MAX_PORT_ATTEMPTS = 10;
// Never treat every next-server/cli.js/node process as ours. Match the actual
// installation or stable package/binary path, with both Node and Bun runtimes.
function isAppCommand(command) {
  const normalized = command.toLowerCase().replaceAll("\\", "/");
  const installation = __dirname.toLowerCase().replaceAll("\\", "/");
  return /(?:node|bun)(?:\.exe)?(?:[\s"/]|$)/.test(normalized)
    && (normalized.includes(`${installation}/cli.js`) || normalized.includes(`${installation}/app/`) || /\/@bykitsune\/router\//.test(normalized) || /\/kitsune-router(?:[\s"]|\/)/.test(normalized))
    && /(?:cli|server)\.js|kitsune-router(?:[\s"]|$)/.test(normalized);
}

// Parse arguments
let port = DEFAULT_PORT;
let host = DEFAULT_HOST;
let noBrowser = false;
let skipUpdate = false;
let showLog = false;
let trayMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" || args[i] === "-p") {
    port = parseInt(args[i + 1], 10) || DEFAULT_PORT;
    i++;
  } else if (args[i] === "--host" || args[i] === "-H") {
    host = args[i + 1] || DEFAULT_HOST;
    i++;
  } else if (args[i] === "--no-browser" || args[i] === "-n") {
    noBrowser = true;
  } else if (args[i] === "--log" || args[i] === "-l") {
    showLog = true;
  } else if (args[i] === "--skip-update") {
    skipUpdate = true;
  } else if (args[i] === "--tray" || args[i] === "-t") {
    trayMode = true;
    process.env.TRAY_MODE = "1";
  }
}

// Auto-relaunch after update: detached process has no TTY → fallback to tray
if (skipUpdate && !trayMode && !process.stdin.isTTY) {
  trayMode = true;
  process.env.TRAY_MODE = "1";
}

// Always use Node.js runtime with absolute path
const RUNTIME = process.execPath;

// Compare semver versions: returns 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (partsA[i] > partsB[i]) return 1;
    if (partsA[i] < partsB[i]) return -1;
  }
  return 0;
}

// Get app data dir (matches app/src/lib/dataDir.js convention)
function getAppDataDir() {
  return process.env.DATA_DIR;
}

// Kill PID from file (best-effort, removes file after)
function killByPidFile(pidFile) {
  try {
    if (!fs.existsSync(pidFile)) return;
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return;
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 });
      } else {
        process.kill(pid, "SIGKILL");
      }
    } catch { }
    try { fs.unlinkSync(pidFile); } catch { }
  } catch { }
  cleanMitmHostsSync();
}

// Kill tunnel processes (cloudflared/tailscale) by their PID files
function killTunnelByPidFile() {
  const tunnelDir = path.join(getAppDataDir(), "tunnel");
  killByPidFile(path.join(tunnelDir, "cloudflared.pid"));
  killByPidFile(path.join(tunnelDir, "tailscale.pid"));
}

// Kill cloudflared whose --url targets this app's port (covers stale PID file case)
function killCloudflaredByAppPort(appPort) {
  if (!appPort) return [];
  const portMatchers = [`localhost:${appPort}`, `127.0.0.1:${appPort}`];
  const pids = [];
  try {
    if (process.platform === "win32") {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Get-WmiObject Win32_Process -Filter 'Name=\\"cloudflared.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`;
      const output = execSync(psCmd, { encoding: "utf8", windowsHide: true, timeout: 5000 });
      const lines = output.split("\n").slice(1).filter(l => l.trim());
      lines.forEach(line => {
        if (portMatchers.some(m => line.includes(m))) {
          const match = line.match(/^"(\d+)"/);
          if (match && match[1]) pids.push(match[1]);
        }
      });
    } else {
      const output = execSync("ps -eo pid,command 2>/dev/null", { encoding: "utf8", timeout: 5000 });
      output.split("\n").forEach(line => {
        if (line.includes("cloudflared") && portMatchers.some(m => line.includes(m))) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[0];
          if (pid && !isNaN(pid)) pids.push(pid);
        }
      });
    }
  } catch { }
  return pids;
}

// Kill Kitsune Router processes only.
function killAllAppProcesses(appPort) {
  return new Promise((resolve) => {
    try {
      // Background: MITM + tunnel/cloudflared run on separate ports/processes —
      // killing them doesn't free the app port, so don't block the critical path.
      // Server-side MITM manager has stale-lock recovery and starts deferred (~3s).
      setImmediate(() => {
        try { killProxyByPidFile(); } catch {}
        try { killTunnelByPidFile(); } catch {}
        try { killCloudflaredByAppPort(appPort); } catch {}
      });

      const platform = process.platform;
      let pids = [];

      if (platform === "win32") {
        // Windows: use WMI to get full CommandLine (tasklist /V doesn't include it)
        try {
          const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Get-WmiObject Win32_Process -Filter 'Name=\\"node.exe\\" OR Name=\\"bun.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`;
          const output = execSync(psCmd, {
            encoding: "utf8",
            windowsHide: true,
            timeout: 5000
          });
          const lines = output.split("\n").slice(1).filter(l => l.trim());
          lines.forEach(line => {
            const cmd = line.toLowerCase();
            const isAppProcess = isAppCommand(cmd);
            if (isAppProcess) {
              const match = line.match(/^"(\d+)"/);
              if (match && match[1] && match[1] !== process.pid.toString()) {
                pids.push(match[1]);
              }
            }
          });
        } catch (e) {
          // No processes found or error - continue
        }
      } else {
        // macOS/Linux: `ps -o pid=,args=` prints the pid first with no header
        // and unwrapped args — immune to the column-shift / line-wrap hazard of
        // parsing `ps aux` by token position (9router #4295). On Linux each
        // candidate is additionally verified against /proc/<pid>/cmdline
        // before any signal is sent.
        try {
          const output = execSync('ps -ww -eo pid=,args= 2>/dev/null', {
            encoding: 'utf8',
            timeout: 5000
          });
          const lines = output.split('\n');

          lines.forEach(line => {
            const m = line.match(/^\s*(\d+)\s+(.*)$/);
            if (!m) return;
            const pid = m[1];
            if (!pid || pid === process.pid.toString()) return;
            const cmd = m[2].toLowerCase();
            const isAppProcess = isAppCommand(cmd);
            if (!isAppProcess) return;
            if (platform !== "win32" && process.platform === "linux") {
              // Verify the pid still belongs to that command: /proc is ground
              // truth, the ps snapshot may be stale or wrapped.
              try {
                const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").toLowerCase();
                const verified = isAppCommand(cmdline);
                if (!verified) return;
              } catch {
                return; // pid gone or unreadable — never kill on doubt
              }
            }
            pids.push(pid);
          });
        } catch (e) {
          // No processes found or error - continue
        }
      }

      // Kill all found processes
      if (pids.length > 0) {
        pids.forEach(pid => {
          try {
            if (platform === "win32") {
              execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore', shell: true, windowsHide: true, timeout: 3000 });
            } else {
              execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore', timeout: 3000 });
            }
          } catch (err) {
            // Process already dead or can't kill - continue
          }
        });

        // Wait for processes to fully terminate
        setTimeout(() => resolve(), 1000);
      } else {
        resolve();
      }
    } catch (err) {
      // Silent fail - continue anyway
      resolve();
    }
  });
}

// Sleep helper using SharedArrayBuffer wait (sync, no busy-loop)
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* ignore */ }
}

// Wait until process dies or timeout reached
function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return true; }
    sleepSync(100);
  }
  return false;
}

// Clean all MITM tool hosts from system hosts file safely
function cleanMitmHostsSync() {
  try {
    const TOOL_HOSTS = [
      "daily-cloudcode-pa.googleapis.com",
      "cloudcode-pa.googleapis.com",
      "api.individual.githubcopilot.com",
      "runtime.us-east-1.kiro.dev",
      "q.us-east-1.amazonaws.com",
      "codewhisperer.us-east-1.amazonaws.com",
      "api2.cursor.sh"
    ];
    const hostsFile = process.platform === "win32"
      ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts")
      : "/etc/hosts";
    if (!fs.existsSync(hostsFile)) return;
    const content = fs.readFileSync(hostsFile, "utf8");
    const eol = process.platform === "win32" ? "\r\n" : "\n";
    const filtered = content.split(/\r?\n/).filter(l => !TOOL_HOSTS.some(h => l.includes(h))).join(eol);
    const next = filtered.replace(/[\r\n\s]+$/g, "") + eol;
    if (next !== content) {
      try {
        fs.writeFileSync(hostsFile, next, "utf8");
      } catch (e) {
        if (process.platform === "win32") {
          try {
            const ps = `$h='${hostsFile}'; $t=@(${TOOL_HOSTS.map(x => `'${x}'`).join(',')}); $c=(Get-Content -LiteralPath $h | Where-Object { $l=$_; -not ($t | Where-Object { $l -match [regex]::Escape($_) }) }); Set-Content -LiteralPath $h -Value $c; ipconfig /flushdns`;
            const b64 = Buffer.from(ps, "utf16le").toString("base64");
            execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${b64}`, { stdio: "ignore", windowsHide: true });
          } catch { }
        }
      }
      if (process.platform === "win32") {
        try { execSync("ipconfig /flushdns", { stdio: "ignore", windowsHide: true }); } catch { }
      }
    }
  } catch { }
}

// Kill MIT server by PID file (runs privileged, needs special handling)
// Sends SIGTERM first so MIT can clean up host entries before dying.
function killProxyByPidFile() {
  try {
    const pidFile = path.join(getAppDataDir(), "mitm", ".mitm.pid");
    if (!fs.existsSync(pidFile)) return;
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return;

    if (process.platform === "win32") {
      // Graceful first (lets server cleanup hosts), then force
      try { execSync(`taskkill /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 2000 }); } catch { }
      if (!waitForExit(pid, 1500)) {
        try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { }
      }
      // Last-resort: PowerShell Stop-Process (sometimes succeeds where taskkill fails on admin processes)
      if (!waitForExit(pid, 500)) {
        try { execSync(`powershell -NonInteractive -WindowStyle Hidden -Command "Stop-Process -Id ${pid} -Force"`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { }
      }
    } else {
      // SIGTERM via cached sudo token first
      try { execSync(`sudo -n kill -TERM ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 2000 }); }
      catch { try { process.kill(pid, "SIGTERM"); } catch { } }
      if (!waitForExit(pid, 1500)) {
        try { execSync(`sudo -n kill -9 ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 2000 }); }
        catch { try { process.kill(pid, "SIGKILL"); } catch { } }
      }
    }
    try { fs.unlinkSync(pidFile); } catch { }
  } catch { }
}

// Kill any process on specific port
function killProcessOnPort(port) {
  return new Promise((resolve) => {
    try {
      const platform = process.platform;
      let pid;

      if (platform === "win32") {
        try {
          const output = execSync(`netstat -ano | findstr :${port}`, {
            encoding: 'utf8',
            shell: true,
            windowsHide: true,
            timeout: 5000
          }).trim();
          const lines = output.split('\n').filter(l => l.includes('LISTENING'));
          if (lines.length > 0) {
            pid = lines[0].trim().split(/\s+/).pop();
            execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore', shell: true, windowsHide: true, timeout: 3000 });
          }
        } catch (e) {
          // Port is free or error
        }
      } else {
        // macOS/Linux
        try {
          const pidOutput = execSync(`lsof -ti:${port}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
          }).trim();
          if (pidOutput) {
            pid = pidOutput.split('\n')[0];
            execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore', timeout: 3000 });
          }
        } catch (e) {
          // Port is free or error
        }
      }

      // Wait for port to be released
      setTimeout(() => resolve(), 500);
    } catch (err) {
      // Silent fail - continue anyway
      resolve();
    }
  });
}


// Detect if running in restricted environment (Codespaces, Docker)
function isRestrictedEnvironment() {
  // Check for Codespaces
  if (process.env.CODESPACES === "true" || process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return "GitHub Codespaces";
  }

  // Check for Docker
  if (fs.existsSync("/.dockerenv") || (fs.existsSync("/proc/1/cgroup") && fs.readFileSync("/proc/1/cgroup", "utf8").includes("docker"))) {
    return "Docker";
  }

  return null;
}

// Check if new version available, return latest version or null
function checkForUpdate() {
  return new Promise((resolve) => {
    if (skipUpdate) {
      resolve(null);
      return;
    }

    const spinner = createSpinner("Checking for updates...").start();
    let resolved = false;

    const safetyTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        spinner.stop();
        resolve(null);
      }
    }, 8000);

    const done = (version) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(safetyTimeout);
      spinner.stop();
      resolve(version);
    };

    const req = https.get(`https://registry.npmjs.org/${pkg.name}/latest`, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const latest = JSON.parse(data);
          if (latest.version && compareVersions(latest.version, pkg.version) > 0) {
            done(latest.version);
          } else {
            done(null);
          }
        } catch (e) {
          done(null);
        }
      });
    });

    req.on("error", () => done(null));
    req.on("timeout", () => { req.destroy(); done(null); });
  });
}

// Open browser
function openBrowser(url) {
  const platform = process.platform;
  let cmd;

  if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, { windowsHide: true }, (err) => {
    if (err) {
      console.log(`Open browser manually: ${url}`);
    }
  });
}

// Find standalone server (bundled in bin/app for published package).
// Prefer custom-server.js (injects real socket IP) when present.
const standaloneDir = path.join(__dirname, "app");
const customServerPath = path.join(standaloneDir, "custom-server.js");
const serverPath = fs.existsSync(customServerPath)
  ? customServerPath
  : path.join(standaloneDir, "server.js");

if (!fs.existsSync(serverPath)) {
  console.error("Error: Standalone build not found.");
  console.error("Please run 'npm run build:cli' first.");
  process.exit(1);
}

// Start server immediately; run update check in parallel (not on the critical path).
const updatePromise = checkForUpdate();
killAllAppProcesses(port)
  .then(() => killProcessOnPort(port))
  .then(() => startServer(updatePromise));

// Show interface selection menu
async function showInterfaceMenu(latestVersion) {
  const { selectMenu } = require("./src/cli/utils/input");
  const { clearScreen } = require("./src/cli/utils/display");
  const { getEndpoint } = require("./src/cli/utils/endpoint");

  clearScreen();

  const displayHost = getDisplayHost();

  // Detect tunnel/local mode for server URL display
  let serverUrl;
  try {
    const { endpoint, tunnelEnabled } = await getEndpoint(port);
    serverUrl = tunnelEnabled ? endpoint.replace(/\/v1$/, "") : `http://${displayHost}:${port}`;
  } catch (e) {
    serverUrl = `http://${displayHost}:${port}`;
  }

  const subtitle = `🚀 Server: \x1b[32m${serverUrl}\x1b[0m`;

  const menuItems = [];

  if (latestVersion) {
    menuItems.push({ label: `Update to v${latestVersion} (current: v${pkg.version})`, icon: "⬆" });
  }

  menuItems.push(
    { label: "Web UI (Open in Browser)", icon: "🌐" },
    { label: "Terminal UI (Interactive CLI)", icon: "💻" },
    { label: "Hide to Tray (Background)", icon: "🔔" },
    { label: "Exit", icon: "🚪" }
  );

  const selected = await selectMenu(`Choose Interface (v${pkg.version})`, menuItems, 0, subtitle);

  const offset = latestVersion ? 1 : 0;

  if (latestVersion && selected === 0) return "update";
  if (selected === offset) return "web";
  if (selected === offset + 1) return "terminal";
  if (selected === offset + 2) return "hide";
  return "exit";
}

const MAX_RESTARTS = 2;
const RESTART_RESET_MS = 30000; // Reset counter if alive > 30s

function startServer(updatePromise) {
  // Accept either a Promise (parallel update check) or a resolved value.
  const latestVersionPromise = Promise.resolve(updatePromise);
  const displayHost = getDisplayHost();
  const url = `http://${displayHost}:${port}/dashboard`;
  // Surface real network exposure when bound to all interfaces (default 0.0.0.0).
  if (host === DEFAULT_HOST) {
    const lanIp = getLanIp();
    if (lanIp) console.log(`\x1b[33m⚠ Network-exposed: reachable at http://${lanIp}:${port} (bound 0.0.0.0). Use --host 127.0.0.1 for local-only.\x1b[0m`);
  }

  let restartCount = 0;
  let serverStartTime = Date.now();

  const CRASH_LOG_LINES = 50;
  let crashLog = [];

  function spawnServer() {
    serverStartTime = Date.now();
    crashLog = [];
    const child = spawn(RUNTIME, ["--dns-result-order=ipv4first", ...resolveHeapFlags(process.env), serverPath], {
      cwd: standaloneDir,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      detached: true,
      windowsHide: true,
      env: {
        ...buildEnvWithRuntime(process.env),
        // Generated per-install (persisted in the data dir) so the dashboard can
        // sign session cookies without the user hand-editing a .env inside
        // node_modules. An explicitly exported JWT_SECRET still wins.
        ...secretsEnv,
        PORT: port.toString(),
        HOSTNAME: host
      }
    });

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        if (showLog) {
          process.stdout.write(data);
        }
      });
      child.stdout.on("error", () => {});
    }

    if (child.stderr) {
      child.stderr.on("data", (data) => {
        if (showLog) {
          process.stderr.write(data);
        }
        const lines = data.toString().split("\n").filter(Boolean);
        crashLog.push(...lines);
        if (crashLog.length > CRASH_LOG_LINES) crashLog = crashLog.slice(-CRASH_LOG_LINES);
      });
      child.stderr.on("error", () => {});
    }
    return child;
  }

  let server = spawnServer();
  attachServerEvents();

  let isShuttingDown = false;
  let cleanupPromise = null;
  let restartTimer = null;
  // Wait for HTTP, durable usage and database shutdown before terminating the
  // launcher. Repeated signals/menu callbacks share one bounded cleanup.
  function cleanup() {
    if (cleanupPromise) return cleanupPromise;
    isShuttingDown = true;
    clearTimeout(restartTimer);
    cleanupPromise = (async () => {
      const serverStop = stopOwnedServer(server);
      try {
        const { killTray } = require("./src/cli/tray/tray");
        await killTray();
      } catch {}
      const result = await serverStop;
      // Managed server hooks own helper teardown first; keep legacy cleanup as
      // a best-effort fallback after the server has drained (or timed out).
      try { killProxyByPidFile(); } catch {}
      try { cleanMitmHostsSync(); } catch {}
      try { killTunnelByPidFile(); } catch {}
      return result;
    })();
    return cleanupPromise;
  }
  async function finish(code = 0) {
    const result = await cleanup();
    process.exit(code || result.code || 0);
  }

  // Suppress all errors during shutdown (systray lib throws JSON parse errors)
  process.on("uncaughtException", (err) => {
    if (isShuttingDown) return;
    console.error("Error:", err.message);
  });

  // Handle all exit scenarios
  process.on("SIGINT", () => {
    if (isShuttingDown) return;
    console.log("\nExiting...");
    void finish();
  });
  process.on("SIGTERM", () => {
    if (isShuttingDown) return;
    void finish();
  });
  process.on("SIGHUP", () => {
    if (isShuttingDown) return;
    void finish();
  });

  // Initialize tray icon (runs alongside TUI)
  const initTrayIcon = () => {
    try {
      const { initTray } = require("./src/cli/tray/tray");
      initTray({
        port,
        onQuit: () => {
          console.log("\n👋 Shutting down from tray...");
          void finish();
        },
        onOpenDashboard: () => openBrowser(url)
      });
    } catch (err) {
      // Tray not available - continue without it
    }
  };

  // Tray-only mode: no TUI, just tray icon
  if (trayMode) {
    // Ignore SIGHUP so macOS terminal close doesn't kill the background tray process
    process.removeAllListeners("SIGHUP");
    process.on("SIGHUP", () => {});

    console.log(`\n🚀 ${pkg.name} v${pkg.version}`);
    console.log(`Server: http://${displayHost}:${port}`);

    waitServerReady(port).then(() => {
      if (isShuttingDown) return;
      initTrayIcon();
      console.log("\n💡 Router is now running in system tray. Close this terminal if you want.");
      console.log("   Right-click tray icon to open dashboard or quit.\n");
    });

    return;
  }

  // Wait for server to be ready, then show interface menu loop + tray
  waitServerReady(port).then(async () => {
    // Resolve parallel update check (already running); don't block server start on it.
    const latestVersion = await latestVersionPromise;
    if (isShuttingDown) return;
    // Start tray icon alongside TUI
    initTrayIcon();

    try {
      while (true) {
        const choice = await showInterfaceMenu(latestVersion);
        if (isShuttingDown) return;

        if (choice === "update") {
          const { clearScreen } = require("./src/cli/utils/display");
          clearScreen();
          console.log(`\n⬆  Update v${pkg.version} → v${latestVersion}\n`);
          console.log(`Run this after exit:\n`);
          console.log(`   \x1b[33m${INSTALL_CMD_LATEST}\x1b[0m\n`);
          await finish();
          return;
        } else if (choice === "web") {
          openBrowser(url);
          // Wait for user to come back
          const { pause } = require("./src/cli/utils/input");
          await pause("\nPress Enter to go back to menu...");
        } else if (choice === "terminal") {
          // Start Terminal UI - it will return when user selects Back
          const { startTerminalUI } = require("./src/cli/terminalUI");
          await startTerminalUI(port);
          // Loop continues, show menu again
        } else if (choice === "hide") {
          const { clearScreen } = require("./src/cli/utils/display");
          clearScreen();

          // Autostart is now opt-in via tray menu only (#3628).
          // Previously hide auto-enabled autostart, which made it impossible to
          // disable (deleting the .vbs/plist was undone on next hide).
          // Respect user's explicit choice: do not touch autostart here.

          if (process.platform === "darwin") {
            // macOS: keep current process alive — spawning a detached child puts
            // it outside the login session so NSStatusItem silently fails.
            process.removeAllListeners("SIGHUP");
            process.on("SIGHUP", () => {});

            console.log(`\n⏳ Switching to tray mode... (icon already visible in menu bar)`);
            console.log(`🔔 Kitsune Router is running in tray (PID: ${process.pid})`);
            console.log(`   Server: http://${displayHost}:${port}`);
            console.log(`\n💡 You can close this terminal. Right-click tray icon to quit.\n`);

            // Tray already init'd at startup — just keep event loop alive.
            return;
          }

          // Windows/Linux: spawn detached bgProcess (systray works fine in child)
          console.log(`\n⏳ Starting background process... (tray icon will appear in ~3s)`);

          // Release the old server/tray before the new launcher can discover
          // and replace them. Otherwise its startup cleanup races our drain.
          const stopped = await cleanup();
          if (stopped.code) { process.exit(stopped.code); return; }
          const bgProcess = spawn(process.execPath, ["--dns-result-order=ipv4first", __filename, "--tray", "--skip-update", "-p", port.toString(), "--host", host], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            env: { ...process.env }
          });
          bgProcess.unref();

          console.log(`🔔 Kitsune Router is now running in background (PID: ${bgProcess.pid})`);
          console.log(`   Server: http://${displayHost}:${port}`);
          console.log(`\n💡 You can close this terminal. Right-click tray icon to quit.\n`);

          process.exit(0);
        } else if (choice === "exit") {
          console.log("\nExiting...");
          await finish();
          return;
        }
      }
    } catch (err) {
      console.error("Error:", err.message);
      await finish(1);
    }
  });

  function attachServerEvents() {
    const child = server;
    child.on("error", (err) => {
      if (child !== server) return;
      console.error("Failed to start server:", err.message);
      if (!isShuttingDown) tryRestart();
      // A shutdown caller already owns completion; do not exit underneath it.
    });

    child.on("close", async (code) => {
      if (child !== server) return;
      if (isShuttingDown) return;
      if (code === 0) {
        await finish(code);
        return;
      }
      tryRestart(code);
    });
  }

  function disableMitmInDatabase() {
    const dataDir = getAppDataDir();

    // 1. Legacy db.json
    try {
      const legacyPath = path.join(dataDir, "db.json");
      if (fs.existsSync(legacyPath)) {
        const db = JSON.parse(fs.readFileSync(legacyPath, "utf-8"));
        if (db.settings) db.settings.mitmEnabled = false;
        fs.writeFileSync(legacyPath, JSON.stringify(db, null, 2));
      }
    } catch { /* best effort */ }

    // 2. SQLite data.sqlite (#3755: ensure mitm is disabled in sqlite so server does not loop)
    try {
      const sqlitePath = path.join(dataDir, "db", "data.sqlite");
      if (fs.existsSync(sqlitePath)) {
        let db = null;
        try {
          const { DatabaseSync } = require("node:sqlite");
          db = new DatabaseSync(sqlitePath);
        } catch {}

        if (!db) {
          try {
            const runtimeBetter = path.join(dataDir, "runtime", "node_modules", "better-sqlite3");
            const BetterSqlite = require(fs.existsSync(runtimeBetter) ? runtimeBetter : "better-sqlite3");
            db = new BetterSqlite(sqlitePath);
          } catch {}
        }

        if (db) {
          try {
            const row = db.prepare("SELECT data FROM settings WHERE id = 1").get();
            if (row && row.data) {
              const settings = JSON.parse(row.data);
              settings.mitmEnabled = false;
              db.prepare("UPDATE settings SET data = ? WHERE id = 1").run(JSON.stringify(settings));
            }
            if (typeof db.close === "function") db.close();
          } catch {}
        }
      }
    } catch { /* best effort */ }
  }

  function tryRestart(code) {
    if (isShuttingDown || restartTimer) return;
    const aliveMs = Date.now() - serverStartTime;
    // Reset counter if last run was stable
    if (aliveMs >= RESTART_RESET_MS) restartCount = 0;

    if (restartCount >= MAX_RESTARTS) {
      console.error(`\n⚠️  Server crashed ${MAX_RESTARTS} times. Disabling MITM and restarting...`);
      if (crashLog.length) {
        console.error("\n--- Server crash log ---");
        crashLog.forEach(l => console.error(l));
        console.error("--- End crash log ---\n");
      }
      disableMitmInDatabase();
      process.env.KITSUNE_ROUTER_DISABLE_MITM = "1";
      restartCount = 0;
      server = spawnServer();
      attachServerEvents();
      return;
    }

    restartCount++;
    const delay = Math.min(1000 * restartCount, 10000);
    console.error(`\n⚠️  Server exited (code=${code ?? "unknown"}). Restarting in ${delay / 1000}s... (${restartCount}/${MAX_RESTARTS})`);
    if (crashLog.length) {
      console.error("\n--- Server crash log ---");
      crashLog.forEach(l => console.error(l));
      console.error("--- End crash log ---\n");
    }

    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (isShuttingDown) return;
      server = spawnServer();
      attachServerEvents();
    }, delay);
  }

}
