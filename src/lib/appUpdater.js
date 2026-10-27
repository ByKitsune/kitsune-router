import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { UPDATER_CONFIG } from "@/shared/constants/config";
import { DATA_DIR } from "./dataDir.js";

const KILL_TIMEOUT_MS = 5000;
const PROCESS_WAIT_MS = 1500;

// Kill MITM server by PID file (MITM may run as admin/sudo)
function killMitmByPidFile() {
  try {
    const mitmPidFile = path.join(
      DATA_DIR,
      "mitm",
      ".mitm.pid"
    );
    if (!fs.existsSync(mitmPidFile)) return;
    const pid = Number(fs.readFileSync(mitmPidFile, "utf8").trim());
    if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return;

    if (process.platform === "win32") {
      // taskkill first (works if same user); fallback to PowerShell Stop-Process which can kill admin process if our token allows
      try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch {
        try { execSync(`powershell -NonInteractive -WindowStyle Hidden -Command "Stop-Process -Id ${pid} -Force"`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { /* best effort */ }
      }
    } else {
      try {
        execSync(`sudo -n kill -9 ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 3000 });
      } catch {
        try { process.kill(pid, "SIGKILL"); } catch { /* best effort */ }
      }
    }
    try { fs.unlinkSync(mitmPidFile); } catch { /* best effort */ }
  } catch { /* best effort */ }
}

// Collect identified Kitsune Router processes (excluding current).
function isAppCommand(command) {
  const normalized = command.toLowerCase().replaceAll("\\", "/");
  const cwd = process.cwd().toLowerCase().replaceAll("\\", "/");
  return /(?:node|bun)(?:\.exe)?(?:[\s"/]|$)/.test(normalized)
    && (/\/@bykitsune\/router\//.test(normalized) || normalized.includes("/kitsune-router/") || normalized.includes("/kitsune-router ") || normalized.includes(`${cwd}/server.js`))
    && /(?:cli|server)\.js|kitsune-router(?:[\s"]|$)/.test(normalized);
}

function collectAppPids() {
  const pids = [];
  const platform = process.platform;

  if (platform === "win32") {
    try {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Get-WmiObject Win32_Process -Filter 'Name=\\"node.exe\\" OR Name=\\"bun.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`;
      const output = execSync(psCmd, { encoding: "utf8", windowsHide: true, timeout: KILL_TIMEOUT_MS });
      const lines = output.split("\n").slice(1).filter(l => l.trim());
      lines.forEach(line => {
        const lower = line.toLowerCase();
        const isAppProcess = isAppCommand(lower);
        if (isAppProcess) {
          const match = line.match(/^"(\d+)"/);
          if (match && match[1] && match[1] !== process.pid.toString()) pids.push(match[1]);
        }
      });
    } catch { /* no processes */ }

    // Helper teardown belongs to the lifecycle/PID owner, not a global image
    // name search which could kill another installation's tunnel or tray.
  } else {
    try {
      const output = execSync("ps -ww -eo pid=,args= 2>/dev/null", { encoding: "utf8", timeout: KILL_TIMEOUT_MS });
      output.split("\n").forEach(line => {
        const match = line.match(/^\s*(\d+)\s+(.*)$/);
        if (!match || match[1] === process.pid.toString() || !isAppCommand(match[2])) return;
        if (platform === "linux") {
          try { if (!isAppCommand(fs.readFileSync(`/proc/${match[1]}/cmdline`, "utf8").replace(/\0/g, " "))) return; }
          catch { return; }
        }
        pids.push(match[1]);
      });
    } catch { /* no processes */ }
  }

  return pids;
}

// Copy updater.js into DATA_DIR so npm -g can overwrite node_modules safely
function getDataDir() {
  return DATA_DIR;
}

function resolveBundledUpdaterPath() {
  if (process.env.UPDATER_SCRIPT_PATH && fs.existsSync(process.env.UPDATER_SCRIPT_PATH)) {
    return process.env.UPDATER_SCRIPT_PATH;
  }
  // Production standalone: cwd is binAppDir (see bin/cli.js)
  // Dev: cwd is app/
  const fromCwd = path.join(process.cwd(), "src", "lib", "updater", "updater.js");
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromParent = path.join(process.cwd(), "..", "src", "lib", "updater", "updater.js");
  if (fs.existsSync(fromParent)) return fromParent;
  return fromCwd;
}

function ensureRuntimeUpdater(bundledPath) {
  try {
    if (!bundledPath || !fs.existsSync(bundledPath)) return bundledPath;
    const runtimeDir = path.join(getDataDir(), "runtime", "updater");
    const runtimePath = path.join(runtimeDir, "updater.js");
    if (fs.existsSync(runtimePath)) {
      try {
        if (fs.readFileSync(bundledPath).equals(fs.readFileSync(runtimePath))) return runtimePath;
      } catch { /* recopy */ }
    }
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.copyFileSync(bundledPath, runtimePath);
    return runtimePath;
  } catch {
    return bundledPath;
  }
}

// Kill all app-related processes to release file locks (esp. on Windows)
export async function killAppProcesses() {
  killMitmByPidFile();
  const pids = collectAppPids();
  const platform = process.platform;

  pids.forEach(pid => {
    try {
      if (platform === "win32") {
        execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: "ignore", shell: true, windowsHide: true, timeout: 3000 });
      } else {
        execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 3000 });
      }
    } catch { /* already dead */ }
  });

  if (pids.length > 0) {
    await new Promise(r => setTimeout(r, PROCESS_WAIT_MS));
  }
}

// Resolve the npx binary + package to relaunch after update (cross-platform)
function resolveRelaunchCommand() {
  const isWin = process.platform === "win32";
  // Prefer `npx @bykitsune/router` — works regardless of global bin path changes after npm i -g
  const npx = isWin ? "npx.cmd" : "npx";
  return { cmd: npx, args: [UPDATER_CONFIG.npmPackageName] };
}

// Spawn detached headless updater (Node process) then exit current server
export function spawnUpdaterAndExit(packageName = UPDATER_CONFIG.npmPackageName) {
  const updaterPath = ensureRuntimeUpdater(resolveBundledUpdaterPath());
  const isTray = process.env.TRAY_MODE === "1";
  const relaunch = resolveRelaunchCommand();
  // Relaunch matching original env: tray stays tray, foreground stays foreground
  const relaunchArgs = isTray
    ? [...relaunch.args, "--tray", "--skip-update"]
    : [...relaunch.args, "--skip-update"];

  spawn(process.execPath, [updaterPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      // The copied updater cannot import application hooks after npm replaces
      // the package. Inherit the already migrated, authoritative location.
      DATA_DIR,
      UPDATER_PKG_NAME: packageName,
      UPDATER_PORT: String(UPDATER_CONFIG.statusPort),
      UPDATER_TAIL_LINES: String(UPDATER_CONFIG.statusLogTailLines),
      UPDATER_RETRIES: String(UPDATER_CONFIG.installRetries),
      UPDATER_RETRY_DELAY_MS: String(UPDATER_CONFIG.installRetryDelayMs),
      UPDATER_LINGER_MS: String(UPDATER_CONFIG.lingerAfterDoneMs),
      UPDATER_WAIT_MIN_MS: String(UPDATER_CONFIG.waitForExitMinMs),
      UPDATER_WAIT_MAX_MS: String(UPDATER_CONFIG.waitForExitMaxMs),
      UPDATER_WAIT_CHECK_MS: String(UPDATER_CONFIG.waitForExitCheckMs),
      UPDATER_APP_PORT: String(UPDATER_CONFIG.appPort),
      UPDATER_RELAUNCH: "1",
      UPDATER_RELAUNCH_CMD: relaunch.cmd,
      UPDATER_RELAUNCH_ARGS: JSON.stringify(relaunchArgs),
    },
  }).unref();

  setTimeout(() => process.exit(0), UPDATER_CONFIG.exitDelayMs);
}
