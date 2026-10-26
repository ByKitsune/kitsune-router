import fs from "fs";
import path from "path";
import https from "https";
import os from "os";
import { execSync, spawn } from "child_process";
import { savePid, loadPid, clearPid } from "./pid.js";
import { DATA_DIR } from "@/lib/dataDir.js";
import { getHelperLifecycle } from "@/mitm/manager";

const lifecycle = getHelperLifecycle();
const scope = lifecycle.scope("cloudflared");

const BIN_DIR = path.join(DATA_DIR, "bin");
const BINARY_NAME = "cloudflared";
const IS_WINDOWS = os.platform() === "win32";
const BIN_NAME = IS_WINDOWS ? `${BINARY_NAME}.exe` : BINARY_NAME;
const BIN_PATH = path.join(BIN_DIR, BIN_NAME);
const POWERSHELL_HIDDEN_COMMAND = "powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command";
const DEFAULT_QUICK_TUNNEL_PROTOCOL = "http2";
const QUICK_TUNNEL_PROTOCOLS = new Set(["http2", "quic", "auto"]);

const GITHUB_BASE_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download";

const PLATFORM_MAPPINGS = {
  darwin: {
    x64: "cloudflared-darwin-amd64.tgz",
    arm64: "cloudflared-darwin-arm64.tgz"
  },
  win32: {
    x64: "cloudflared-windows-amd64.exe",
    ia32: "cloudflared-windows-386.exe",
    arm64: "cloudflared-windows-386.exe"
  },
  linux: {
    x64: "cloudflared-linux-amd64",
    arm64: "cloudflared-linux-arm64"
  }
};

// Fallback order: prefer smallest/most-compatible binary per platform
const PLATFORM_FALLBACK = {
  darwin: "cloudflared-darwin-amd64.tgz",
  win32: "cloudflared-windows-386.exe",
  linux: "cloudflared-linux-amd64"
};

function getDownloadUrl() {
  const platform = os.platform();
  const arch = os.arch();

  const platformMapping = PLATFORM_MAPPINGS[platform];
  if (!platformMapping) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const binaryName = platformMapping[arch] || PLATFORM_FALLBACK[platform];
  return `${GITHUB_BASE_URL}/${binaryName}`;
}

// Download state — shared so status API can read it
const dlState = { downloading: false, progress: 0 };

export function getDownloadStatus() {
  return { downloading: dlState.downloading, progress: dlState.progress };
}

function downloadFile(url, dest, check) {
  check();
  return new Promise((resolve, reject) => {
    let file;
    let failure;
    const request = https.get(url, (response) => {
      const next = [301, 302, 303, 307, 308].includes(response.statusCode) ? response.headers.location : null;
      if (next || response.statusCode !== 200) {
        response.resume();
        response.once("end", () => {
          try {
            check();
            if (next) downloadFile(new URL(next, url).href, dest, check).then(resolve, reject);
            else reject(new Error(`Download failed with status ${response.statusCode}`));
          } catch (error) { reject(error); }
        });
        response.once("error", reject);
        return;
      }
      try { check(); }
      catch (error) {
        response.resume();
        response.once("end", () => reject(error));
        response.once("error", reject);
        return;
      }
      file = fs.createWriteStream(dest);
      const totalBytes = parseInt(response.headers["content-length"], 10) || 0;
      let receivedBytes = 0;
      dlState.downloading = true;
      dlState.progress = 0;
      response.on("data", chunk => {
        receivedBytes += chunk.length;
        if (totalBytes > 0) dlState.progress = Math.round((receivedBytes / totalBytes) * 100);
      });
      response.once("error", error => file.destroy(error));
      response.pipe(file);
      response.once("aborted", () => file.destroy(new Error("cloudflared download aborted")));
      file.once("error", error => { failure = error; response.destroy(); });
      file.once("close", () => {
        dlState.downloading = false;
        if (failure) { dlState.progress = 0; reject(failure); }
        else { dlState.progress = 100; resolve(dest); }
      });
    });
    request.once("error", error => {
      if (file) { failure = error; file.destroy(error); }
      else reject(error);
    });
  });
}

const MIN_BINARY_SIZE = 1024 * 1024; // 1MB - cloudflared is ~30MB+

// Validate binary is executable on current platform and not truncated
function isValidBinary(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < MIN_BINARY_SIZE) return false;
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const magic = buf.toString("hex");
    if (IS_WINDOWS) return magic.startsWith("4d5a"); // PE (MZ)
    if (os.platform() === "darwin") return magic.startsWith("cffaedfe") || magic.startsWith("cefaedfe");
    return magic.startsWith("7f454c46"); // ELF (Linux)
  } catch {
    return false;
  }
}

export function ensureCloudflared() {
  return lifecycle.run(scope, "download", _ensureCloudflared);
}

async function _ensureCloudflared(check) {
  check();
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  // Clean up incomplete downloads from previous runs
  const tmpPath = `${BIN_PATH}.tmp`;
  if (fs.existsSync(tmpPath)) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }

  if (fs.existsSync(BIN_PATH)) {
    if (!isValidBinary(BIN_PATH)) {
      console.log("[cloudflared] Invalid binary detected, re-downloading...");
      fs.unlinkSync(BIN_PATH);
    } else {
      if (!IS_WINDOWS) fs.chmodSync(BIN_PATH, "755");
      return BIN_PATH;
    }
  }

  const url = getDownloadUrl();
  const isArchive = url.endsWith(".tgz");
  const downloadDest = isArchive ? path.join(BIN_DIR, "cloudflared.tgz.tmp") : tmpPath;

  await downloadFile(url, downloadDest, check);
  check();

  if (isArchive) {
    execSync(`tar -xzf "${downloadDest}" -C "${BIN_DIR}"`, { stdio: "pipe", windowsHide: true });
    fs.unlinkSync(downloadDest);
  } else {
    fs.renameSync(downloadDest, BIN_PATH);
  }

  if (!IS_WINDOWS) {
    fs.chmodSync(BIN_PATH, "755");
  }

  return BIN_PATH;
}

scope.stop = () => {
  scope.data.unexpectedExitHandler = null;
  killCloudflared();
};

/** Register a callback to be called when cloudflared exits unexpectedly after connecting */
export function setUnexpectedExitHandler(handler) {
  scope.data.unexpectedExitHandler = handler;
}

function notifyExit(generation) {
  if (!lifecycle.active(scope, generation)) return;
  lifecycle.run(scope, "exit-callback", () => scope.data.unexpectedExitHandler?.()).catch(() => {});
}

export function spawnCloudflared(tunnelToken) {
  const processGeneration = scope.data.processGeneration || 0;
  return lifecycle.run(scope, "spawn", (assert, generation) => {
    const check = () => {
      assert();
      if ((scope.data.processGeneration || 0) !== processGeneration) throw new Error("cloudflared killed");
    };
    return runCloudflared(tunnelToken, check, generation);
  });
}

async function runCloudflared(tunnelToken, check, generation) {
  const binaryPath = await ensureCloudflared();
  check();

  const child = spawn(binaryPath, ["tunnel", "run", "--dns-resolver-addrs", "1.1.1.1:53", "--token", tunnelToken], {
    detached: false,
    windowsHide: true,
    cwd: os.tmpdir(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  scope.data.process = lifecycle.child(scope, child);
  savePid(child.pid);

  return new Promise((resolve, reject) => {
    let connectionCount = 0;
    let resolved = false;
    const timeout = setTimeout(() => {
      resolved = true;
      resolve(child);
    }, 90000);

    const handleLog = (data) => {
      const msg = data.toString();
      // Count exact occurrences in this chunk (each chunk may contain multiple lines)
      const matches = msg.match(/Registered tunnel connection/g);
      if (matches) {
        connectionCount += matches.length;
        if (connectionCount >= 4 && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(child);
        }
      }
    };

    child.stdout.on("data", handleLog);
    child.stderr.on("data", handleLog);

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on("exit", (code, signal) => {
      const cloudflaredProcess = scope.data.process;
      if (cloudflaredProcess === child) scope.data.process = null;
      clearPid(child.pid);
      const wasConnected = resolved; // true = already connected successfully
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        // Collect stderr output for better error diagnosis
        let stderrOutput = "";
        if (child.stderr && !child.stderr.destroyed) {
          // Try to read any buffered stderr (may not have all output but helps with common errors)
          stderrOutput = " Check cloudflared logs for details.";
        }
        if (code === 1) {
          // Common exit code 1 issues: invalid token, auth failure, network issues
          reject(new Error(`cloudflared exited with code ${code}${stderrOutput} Ensure your tunnel token is valid and network is reachable.`));
        } else if (code === 2) {
          reject(new Error(`cloudflared exited with code ${code}${stderrOutput} Check if required arguments are correct.`));
        } else {
          reject(new Error(`cloudflared exited with code ${code}${stderrOutput}`));
        }
        return;
      }
      if (scope.data.killed?.has(child)) return;
      if (wasConnected) notifyExit(generation);
    });
  });
}

/**
 * Spawn cloudflared quick tunnel (no account needed)
 * Returns the generated trycloudflare.com URL
 */
export function spawnQuickTunnel(localPort, onUrlUpdate, parentCheck = () => {}) {
  const processGeneration = scope.data.processGeneration || 0;
  return lifecycle.run(scope, "spawn", (assert, generation) => {
    const check = () => {
      assert(); parentCheck();
      if ((scope.data.processGeneration || 0) !== processGeneration) throw new Error("cloudflared killed");
    };
    return runQuickTunnel(localPort, onUrlUpdate, check, generation);
  });
}

async function runQuickTunnel(localPort, onUrlUpdate, check, generation) {
  const binaryPath = await ensureCloudflared();
  check();

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudflared-quick-"));
  const configPath = path.join(configDir, "config.yml");
  // Avoid using default ~/.cloudflared/config.yml, which can conflict with quick tunnel behavior.
  fs.writeFileSync(configPath, "# quick-tunnel config placeholder\n", "utf8");

  let isCleaned = false;
  const cleanup = () => {
    if (isCleaned) return;
    isCleaned = true;
    try {
      fs.rmSync(configDir, { recursive: true, force: true });
    } catch (e) { /* ignore */ }
  };

  const requestedProtocol = String(process.env.TUNNEL_TRANSPORT_PROTOCOL || process.env.CLOUDFLARED_PROTOCOL || DEFAULT_QUICK_TUNNEL_PROTOCOL).trim().toLowerCase();
  const tunnelProtocol = QUICK_TUNNEL_PROTOCOLS.has(requestedProtocol) ? requestedProtocol : DEFAULT_QUICK_TUNNEL_PROTOCOL;
  const child = spawn(binaryPath, ["tunnel", "--url", `http://127.0.0.1:${localPort}`, "--config", configPath, "--no-autoupdate", "--retries", "99"], {
    detached: false,
    windowsHide: true,
    cwd: os.tmpdir(),
    env: {
      ...process.env,
      TUNNEL_TRANSPORT_PROTOCOL: tunnelProtocol,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  scope.data.process = lifecycle.child(scope, child);
  savePid(child.pid);

  return new Promise((resolve, reject) => {
    let resolved = false;
    // Keep a small tail of raw cloudflared logs to surface real failure causes
    let logTail = "";

    function getQuickTunnelUrlFromLog(message) {
      // cloudflared logs may contain "api.trycloudflare.com" as well,
      // but that is NOT the quick-tunnel endpoint we need.
      const regex = /https:\/\/([a-z0-9-]+)\.trycloudflare\.com/gi;
      const candidates = [];

      for (const match of message.matchAll(regex)) {
        const host = match[1];
        if (host === "api") continue;
        candidates.push(`https://${host}.trycloudflare.com`);
      }

      if (!candidates.length) return null;
      return candidates[candidates.length - 1];
    }

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error(`Quick tunnel timed out. Last log: ${logTail.slice(-800) || "(empty)"}`));
    }, 90000);

    let lastUrl = null;

    const handleLog = (data) => {
      if (!lifecycle.active(scope, generation)) return;
      try { check(); } catch { return; }
      const msg = data.toString();
      logTail = (logTail + msg).slice(-4000);
      const tunnelUrl = getQuickTunnelUrlFromLog(msg);
      if (!tunnelUrl) return;

      if (!resolved) {
        // First URL — resolve the promise, do NOT call onUrlUpdate (caller handles initial register)
        resolved = true;
        lastUrl = tunnelUrl;
        clearTimeout(timeout);
        cleanup();
        console.log(`[Tunnel] cloudflared URL: ${tunnelUrl}`);
        resolve({ child, tunnelUrl });
        return;
      }

      // URL changed after initial connect — notify caller to re-register
      if (tunnelUrl !== lastUrl) {
        console.log(`[Tunnel] cloudflared URL changed: ${tunnelUrl}`);
        lastUrl = tunnelUrl;
        if (onUrlUpdate) {
          scope.data.nextUrl = tunnelUrl;
          lifecycle.run(scope, "url-callback", async () => {
            while (scope.data.nextUrl) {
              check();
              const url = scope.data.nextUrl;
              scope.data.nextUrl = null;
              try { await onUrlUpdate(url); }
              catch { check(); }
              check();
            }
          }).catch(() => {});
        }
      }
    };

    child.stdout.on("data", handleLog);
    child.stderr.on("data", handleLog);

    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      cleanup();
      reject(err);
    });

    child.on("exit", (code, signal) => {
      const cloudflaredProcess = scope.data.process;
      if (cloudflaredProcess === child) scope.data.process = null;
      clearPid(child.pid);
      // Deliberate kill (restart/disable) — exit silently, no error noise
      if (scope.data.killed?.has(child) || !lifecycle.active(scope, generation)) {
        clearTimeout(timeout);
        cleanup();
        if (!resolved) { resolved = true; reject(new Error("cloudflared killed")); }
        return;
      }
      console.log(`[Tunnel] cloudflared exit code=${code} signal=${signal}`);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        const tail = logTail.slice(-600).trim() || "(empty)";
        if (code === 1) {
          reject(new Error(`cloudflared quick tunnel exited (code 1). Common causes: (1) outbound port 7844 (TCP/UDP) blocked, (2) TryCloudflare service issue, (3) cannot reach 127.0.0.1:${localPort}, (4) protocol (http2/quic) blocked by network. Last log: ${tail}`));
        } else if (code === 2) {
          reject(new Error(`cloudflared exited (code 2). Bad arguments. Last log: ${tail}`));
        } else {
          reject(new Error(`cloudflared exited (code ${code}). Last log: ${tail}`));
        }
        return;
      }
      notifyExit(generation);
      cleanup();
    });
  });
}

// Kill cloudflared processes whose command line targets the given port (any host).
// Boundary check ensures :20128 doesn't match :201280 or :202128.
function killCloudflaredByPort(port) {
  if (!port) return;
  try {
    if (IS_WINDOWS) {
      const psCmd = `Get-CimInstance Win32_Process -Filter \\"Name='cloudflared.exe'\\" | Where-Object { $_.CommandLine -match ':${port}(\\D|$)' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
      execSync(`${POWERSHELL_HIDDEN_COMMAND} "${psCmd}"`, { stdio: "ignore", windowsHide: true });
    } else {
      execSync(`pkill -f "cloudflared.*:${port}([^0-9]|$)" 2>/dev/null || true`, { stdio: "ignore", windowsHide: true });
    }
  } catch (e) { /* ignore */ }
}

export function killCloudflared(localPort) {
  scope.data.killed ??= new WeakSet();
  scope.data.processGeneration = (scope.data.processGeneration || 0) + 1;
  if (scope.data.process) {
    scope.data.killed.add(scope.data.process);
    try {
      scope.data.process.kill();
    } catch (e) { /* ignore */ }
    scope.data.process = null;
  }

  const pid = loadPid();
  if (pid) {
    try {
      process.kill(pid);
    } catch (e) { /* ignore */ }
    clearPid();
  }

  killCloudflaredByPort(localPort);
  return Promise.all([...scope.children.values()]).then(() => {});
}

export function isCloudflaredRunning() {
  const pid = loadPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}
