const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");

// PowerShell-based tray for Windows (AV-safe, zero binary deps)

let psProcess = null;

/**
 * Send JSON command to PowerShell tray process via stdin
 */
function sendCommand(cmd, child = psProcess) {
  if (child && child.stdin.writable) {
    child.stdin.write(`${JSON.stringify(cmd)}\n`, "utf8");
  }
}

/**
 * Initialize Windows tray using PowerShell NotifyIcon
 * @param {Object} options - { iconPath, tooltip, items, onClick }
 *   items: [{ title, enabled }]
 * @returns {Object|null} controller with sendAction/kill
 */
function initWinTray(options) {
  const { iconPath, tooltip, items, onClick } = options;
  const clickHandler = onClick;

  const scriptPath = path.join(__dirname, "tray.ps1");

  try {
    psProcess = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-InputFormat", "Text",
        "-OutputFormat", "Text",
        "-File", scriptPath,
        "-IconPath", iconPath,
        "-Tooltip", tooltip
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch (err) {
    return null;
  }

  const child = psProcess;
  let killPromise = null;
  let settled = false, resolveReady, rejectReady;
  const readiness = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // A caller may only use the legacy controller methods; keep a native startup
  // failure handled even when it never subscribes to the new readiness API.
  readiness.catch(() => {});
  const fail = error => { if (!settled) { settled = true; rejectReady(error); } };
  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    try {
      const evt = JSON.parse(line);
      if (!settled && (evt.type === "started" || evt.type === "ready")) {
        settled = true;
        resolveReady();
      } else if (evt.type === "error") {
        fail(new Error(evt.message || "Windows tray startup failed"));
      }
      if (evt.type === "click" && clickHandler) {
        clickHandler(evt.index);
      }
    } catch (e) {}
  });

  child.on("error", fail);
  child.once("exit", (code, signal) => {
    fail(new Error(`Windows tray process exited before startup (${signal || code})`));
    rl.close();
    if (psProcess === child) psProcess = null;
  });
  child.stdin.on("error", fail);
  child.stderr.on("data", () => {});

  // Send initial menu items
  items.forEach((item, index) => {
    sendCommand({ action: "add-item", index, title: item.title, enabled: item.enabled }, child);
  });

  return {
    ready() { return readiness; },
    process() { return child; },
    updateItem(index, title, enabled) {
      sendCommand({ action: "update-item", index, title, enabled }, child);
    },
    setTooltip(text) {
      sendCommand({ action: "set-tooltip", text }, child);
    },
    kill() {
      if (killPromise) return killPromise;
      killPromise = new Promise(resolve => {
        let done = false, termTimer, deadline;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(termTimer); clearTimeout(deadline);
          child.off("exit", finish);
          rl.close();
          if (psProcess === child) psProcess = null;
          resolve();
        };
        if (child.exitCode != null || child.signalCode != null) { finish(); return; }
        child.once("exit", finish);
        try { sendCommand({ action: "kill" }, child); } catch {}
        if (done) return;
        termTimer = setTimeout(() => {
          if (!child.killed && child.exitCode == null && child.signalCode == null) {
            try { child.kill(); } catch {}
          }
        }, 300);
        deadline = setTimeout(finish, 1000);
      });
      return killPromise;
    }
  };
}

module.exports = { initWinTray };
