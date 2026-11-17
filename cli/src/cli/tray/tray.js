const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

let trayInstance = null;
let isWinTray = false;
let cancelTrayReadiness = null;
const TRAY_READY_TIMEOUT_MS = 3000;

function reportTrayError(options, error) {
  const failure = error?.message ? error : new Error(String(error || "Tray startup failed"));
  if (typeof options.onError === "function") options.onError(failure);
  else process.stderr.write(`[kitsunerouter] tray failed to start: ${failure.message}\n`);
}

function ownedTrayProcess(instance) {
  try { return instance._process || (typeof instance.process === "function" ? instance.process() : null); }
  catch { return null; }
}

function watchTrayReadiness(instance, options, promiseReady, windows = false) {
  let settled = false;
  const child = ownedTrayProcess(instance);
  const cleanup = () => {
    clearTimeout(timer);
    child?.off?.("error", fail);
    child?.off?.("exit", exited);
    if (cancelTrayReadiness === cancel) cancelTrayReadiness = null;
  };
  const cancel = () => { settled = true; cleanup(); };
  const ready = () => {
    if (settled) return;
    settled = true;
    cleanup();
    options.onReady?.();
  };
  const fail = error => {
    if (settled) return;
    settled = true;
    cleanup();
    // Failure only owns the native tray resource. The working gateway must
    // continue serving, and a late failure cannot dispose a replacement tray.
    const disposal = trayInstance === instance ? killTray() : disposeTrayInstance(instance, windows);
    Promise.resolve(disposal).catch(() => {});
    reportTrayError(options, error);
  };
  const exited = (code, signal) => fail(new Error(`Tray process exited before startup (${signal || code})`));
  const timer = setTimeout(() => fail(new Error(`No tray startup handshake within ${TRAY_READY_TIMEOUT_MS}ms`)), TRAY_READY_TIMEOUT_MS);
  cancelTrayReadiness = cancel;
  child?.once?.("error", fail);
  child?.once?.("exit", exited);
  if (child && (child.exitCode != null || child.signalCode != null)) {
    exited(child.exitCode, child.signalCode);
    return;
  }
  try {
    if (promiseReady) Promise.resolve(instance.ready()).then(ready, fail);
    else { instance.onReady(ready); instance.onError(fail); }
  } catch (error) { fail(error); }
}

/**
 * Get icon base64 from file — used for systray (mac/linux)
 */
function getIconBase64() {
  const isWin = process.platform === "win32";
  const iconFile = isWin ? "icon.ico" : "icon.png";
  try {
    const iconPath = path.join(__dirname, iconFile);
    if (fs.existsSync(iconPath)) {
      return fs.readFileSync(iconPath).toString("base64");
    }
  } catch (e) {}
  // Fallback: minimal green dot icon (PNG)
  return "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAALEwAACxMBAJqcGAAAAHpJREFUOE9jYBgFgwEwMjIy/Gdg+P8fyP4PxP8ZGBgEcBnGyMjIsICBgSEAhyH/gfgBUNN8XJoZsdkCVL8Ah+b/QPwbqvkBMvk/AwMDAzYX/GdgYAhAN+A/SICRWAMYGfFEJSMjzriEiwDR/xmIa2RkZCSqnZERb3QCAAo3KxzxbKe1AAAAAElFTkSuQmCC";
}

/**
 * Check if system tray is supported on current OS
 * Supported: macOS, Windows, Linux (with GUI)
 */
function isTraySupported() {
  const platform = process.platform;
  if (!["darwin", "win32", "linux"].includes(platform)) {
    return false;
  }
  if (platform === "linux" && !process.env.DISPLAY) {
    return false;
  }
  return true;
}

/**
 * Initialize system tray with menu
 * @param {Object} options - { port, onQuit, onOpenDashboard, onReady, onError }
 * @returns {Object|null} tray instance or null if not supported/failed
 */
function initTray(options) {
  if (!isTraySupported()) {
    reportTrayError(options, new Error("System tray is unavailable without a supported graphical session"));
    return null;
  }

  // Windows uses PowerShell NotifyIcon (AV-safe), others use systray
  if (process.platform === "win32") {
    return initWindowsTray(options);
  }
  return initUnixTray(options);
}

/**
 * Build menu items array shared between platforms
 */
function buildMenuItems(port, autostartEnabled) {
  return [
    { title: `Kitsune Router (Port ${port})`, tooltip: "Server is running", enabled: false },
    { title: "Open Dashboard", tooltip: "Open in browser", enabled: true },
    {
      title: autostartEnabled ? "✓ Auto-start Enabled" : "Enable Auto-start",
      tooltip: "Run on OS startup",
      enabled: true
    },
    { title: "Quit", tooltip: "Stop server and exit", enabled: true }
  ];
}

// Menu item indexes
const MENU_INDEX = { STATUS: 0, DASHBOARD: 1, AUTOSTART: 2, QUIT: 3 };

/**
 * Get current autostart state
 */
function getAutostartEnabled() {
  try {
    const { isAutoStartEnabled } = require("./autostart");
    return isAutoStartEnabled();
  } catch (e) {
    return false;
  }
}

/**
 * Handle menu item click (shared logic)
 */
function handleClick(index, options, onAutostartToggle) {
  const { onQuit, onOpenDashboard, port } = options;
  if (index === MENU_INDEX.DASHBOARD) {
    if (onOpenDashboard) onOpenDashboard();
    else openBrowser(`http://localhost:${port}/dashboard`);
  } else if (index === MENU_INDEX.AUTOSTART) {
    const enabled = getAutostartEnabled();
    try {
      const { enableAutoStart, disableAutoStart } = require("./autostart");
      if (enabled) disableAutoStart();
      else enableAutoStart();
      onAutostartToggle(!enabled);
    } catch (e) {}
  } else if (index === MENU_INDEX.QUIT) {
    console.log("\n👋 Shutting down...");
    if (onQuit) onQuit();
    killTray();
    setTimeout(() => process.exit(0), 500);
  }
}

/**
 * Windows tray via PowerShell NotifyIcon
 */
function initWindowsTray(options) {
  const { port } = options;
  try {
    const { initWinTray } = require("./trayWin");
    const iconPath = path.join(__dirname, "icon.ico");
    const autostartEnabled = getAutostartEnabled();
    const items = buildMenuItems(port, autostartEnabled);

    trayInstance = initWinTray({
      iconPath,
      tooltip: `Kitsune Router - Port ${port}`,
      items,
      onClick: (index) => {
        handleClick(index, options, (newEnabled) => {
          const newTitle = newEnabled ? "✓ Auto-start Enabled" : "Enable Auto-start";
          trayInstance.updateItem(MENU_INDEX.AUTOSTART, newTitle, true);
        });
      }
    });

    isWinTray = true;
    if (!trayInstance) throw new Error("Windows tray process did not start");
    watchTrayReadiness(trayInstance, options, true, true);
    return trayInstance;
  } catch (err) {
    reportTrayError(options, err);
    return null;
  }
}

/**
 * macOS/Linux tray via systray binary
 *
 * Prefers `systray2` (active fork of `systray`, ships newer
 * getlantern/systray-portable binaries that work on macOS 14+ and Apple
 * Silicon under Rosetta). Falls back to legacy `systray@1.0.5` if systray2
 * is not available, though that binary's Mach-O headers are rejected by
 * modern dyld and the icon will not appear.
 */
function resolveSystray() {
  let runtimeDir = null;
  try {
    const { getRuntimeNodeModules } = require("../../../hooks/sqliteRuntime");
    runtimeDir = getRuntimeNodeModules();
  } catch (e) {}

  // 1) systray2 in runtime dir (where ensureTrayRuntime installs it)
  if (runtimeDir) {
    try { return { mod: require(path.join(runtimeDir, "systray2")).default, isV2: true }; } catch (e) {}
  }
  // 2) systray2 resolvable from the package's own node_modules / NODE_PATH
  try { return { mod: require("systray2").default, isV2: true }; } catch (e) {}
  // 3) Legacy systray fallback (unlikely to render on modern macOS)
  try { return { mod: require("systray").default, isV2: false }; } catch (e) {}
  if (runtimeDir) {
    try { return { mod: require(path.join(runtimeDir, "systray")).default, isV2: false }; } catch (e) {}
  }
  return null;
}

function chmodTrayBin(pkgName) {
  // systray2's npm tarball occasionally lands without +x on the bundled Go
  // binary (observed on macOS). spawn() then fails with EACCES. Best-effort
  // chmod on every init avoids a hard-to-diagnose silent tray failure.
  try {
    const { getRuntimeNodeModules } = require("../../../hooks/sqliteRuntime");
    const binName = process.platform === "darwin" ? "tray_darwin_release" : "tray_linux_release";
    const candidates = [
      path.join(getRuntimeNodeModules(), pkgName, "traybin", binName),
      path.join(__dirname, "..", "..", "..", "node_modules", pkgName, "traybin", binName)
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) fs.chmodSync(p, 0o755);
    }
  } catch (e) {}
}

function initUnixTray(options) {
  const { port } = options;
  try {
    const resolved = resolveSystray();
    if (!resolved) { reportTrayError(options, new Error("System tray dependency is unavailable")); return null; }
    const { mod: SysTray, isV2 } = resolved;

    chmodTrayBin(isV2 ? "systray2" : "systray");

    const autostartEnabled = getAutostartEnabled();
    const items = buildMenuItems(port, autostartEnabled);

    const menu = {
      icon: getIconBase64(),
      // The bundled icon.png is a full-color RGBA logo. Don't mark it as a
      // template icon: macOS would then render it as a solid white square
      // because template mode only uses the alpha channel.
      isTemplateIcon: false,
      title: "",
      tooltip: `Kitsune Router - Port ${port}`,
      items
    };

    trayInstance = new SysTray({ menu, debug: false, copyDir: true });
    isWinTray = false;

    trayInstance.onClick((action) => {
      handleClick(action.seq_id, options, (newEnabled) => {
        trayInstance.sendAction({
          type: "update-item",
          item: {
            title: newEnabled ? "✓ Auto-start Enabled" : "Enable Auto-start",
            tooltip: "Run on OS startup",
            enabled: true
          },
          seq_id: MENU_INDEX.AUTOSTART
        });
      });
    });

    watchTrayReadiness(trayInstance, options, isV2);

    return trayInstance;
  } catch (err) {
    if (trayInstance) void killTray();
    reportTrayError(options, err);
    return null;
  }
}

/**
 * Kill tray, wait Go binary fully exit (returns Promise).
 * Critical for hide-to-tray: macOS must release NSStatusItem before bgProcess
 * spawns a new tray, otherwise the new icon silently fails to register.
 */
function killTray() {
  const instance = trayInstance;
  const wasWin = isWinTray;
  cancelTrayReadiness?.();
  trayInstance = null;
  return disposeTrayInstance(instance, wasWin);
}

function disposeTrayInstance(instance, wasWin) {
  if (!instance) return Promise.resolve();

  if (wasWin) {
    try { return Promise.resolve(instance.kill()).catch(() => {}); }
    catch { return Promise.resolve(); }
  }

  // Unix: get the Go tray child process handle.
  const proc = ownedTrayProcess(instance);

  // Graceful shutdown: send {type:"exit"} via IPC so the Go binary can call
  // systray.Quit() and release NSStatusItem. SIGKILL leaves a ghost icon on
  // the macOS menubar until logout, causing duplicate icons after re-spawn.
  const gracefulQuit = () => { try { instance.kill(true); } catch (e) {} };
  const closeIpc = () => { try { instance.kill(false); } catch (e) {} };

  if (!proc || !proc.pid) {
    gracefulQuit();
    closeIpc();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let done = false;
    let termTimer, killTimer, poll;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(termTimer); clearTimeout(killTimer); clearInterval(poll);
      proc.off?.("exit", finish);
      closeIpc();
      resolve();
    };

    proc.once("exit", finish);
    gracefulQuit();
    if (done) return;

    // Escalate: SIGTERM after 800ms, SIGKILL after 1600ms if still alive.
    termTimer = setTimeout(() => { try { proc.kill("SIGTERM"); } catch (e) {} }, 800);
    killTimer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch (e) {} }, 1600);

    // Fallback poll in case "exit" never fires (detached child, pipe closed)
    const deadline = Date.now() + 3000;
    poll = setInterval(() => {
      try { process.kill(proc.pid, 0); } catch { clearInterval(poll); finish(); return; }
      if (Date.now() > deadline) { clearInterval(poll); finish(); }
    }, 50);
  });
}

/**
 * Open browser
 */
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

  exec(cmd);
}

module.exports = {
  initTray,
  killTray
};
