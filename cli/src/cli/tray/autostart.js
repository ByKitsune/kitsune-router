const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const crypto = require("crypto");

const APP_NAME = "kitsune-router";
const APP_LABEL = "com.bykitsune.router.autostart";
const LEGACY_NAMES = ["zenrouter", "9router"];

const escapeXml = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
const unescapeXml = value => value.replace(/&(?:amp|lt|gt|quot|apos);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }[entity]));

function regularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new Error("Auto-start record is not a regular private file");
    return true;
  } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function atomicWrite(file, content) {
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, content, { flag: "wx", mode: 0o600 });
  try { fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

function desktopArgument(value) {
  // desktop Exec is not a shell; both the desktop string and its quoted
  // argument have escaping rules, and percent introduces a field code.
  return `"${String(value).replace(/\\/g, "\\\\\\\\").replace(/["`$]/g, "\\\\$&").replace(/%/g, "%%")}"`;
}

function startupDirectory(platform, home, env) {
  if (platform === "darwin") return path.join(home, "Library", "LaunchAgents");
  if (platform === "linux") return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "autostart");
  if (platform === "win32") {
    if (!env.APPDATA) return null;
    return path.join(env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  }
  return null;
}

function startupName(platform, name = APP_NAME) {
  if (platform === "darwin") return `${name === APP_NAME ? APP_LABEL : `com.${name}.autostart`}.plist`;
  return `${name}.${platform === "win32" ? "vbs" : "desktop"}`;
}

function startupContent(platform, script, executable = process.execPath) {
  if ([script, executable].some(value => /[\r\n\0]/.test(value))) throw new Error("Unsafe auto-start executable path");
  if (platform === "win32") {
    if ([script, executable].some(value => /["%]/.test(value))) throw new Error("Auto-start path cannot contain quotes or environment expansion");
    return `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run """${executable}"" ""${script}"" --tray --skip-update", 0, False\n`;
  }
  if (platform === "linux") return `[Desktop Entry]\nType=Application\nName=Kitsune Router\nComment=Kitsune Router API Proxy\nExec=${desktopArgument(executable)} ${desktopArgument(script)} --tray --skip-update\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n`;
  const launchPath = `${path.dirname(executable)}:/usr/local/bin:/usr/bin:/bin`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${APP_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${escapeXml(executable)}</string>
        <string>${escapeXml(script)}</string>
        <string>--tray</string>
        <string>--skip-update</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${escapeXml(launchPath)}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/kitsune-router.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/kitsune-router.error.log</string>
</dict>
</plist>`;
}

// Intentionally conservative: only the exact direct-node records shipped by
// the old application are migrated. Never interpret shell commands, customized
// flags, disabled entries, system services or arbitrary VBS/plist code.
function recognizedLegacy(content, platform, name) {
  const text = content.replace(/\r\n/g, "\n").trim();
  const oldScript = script => /(?:^|[\\/])(?:zenrouter|9router)[\\/]cli\.js$/i.test(script);
  const runtime = executable => /(?:^|[\\/])(?:node|bun)(?:\.exe)?$/i.test(executable);
  if (platform === "linux") {
    const lines = text.split("\n");
    const keys = new Set(["Type", "Name", "Comment", "Exec", "Hidden", "NoDisplay", "X-GNOME-Autostart-enabled"]);
    const values = {};
    if (lines.shift() !== "[Desktop Entry]") return false;
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (!match || !keys.has(match[1]) || match[1] in values) return false;
      values[match[1]] = match[2];
    }
    const match = values.Exec?.match(/^(\S+) (\S+) --tray --skip-update$/);
    return values.Type === "Application" && ["ZenRouter", "9Router"].includes(values.Name)
      && values.Comment === `${values.Name} API Proxy` && values.Hidden === "false" && values.NoDisplay === "false"
      && values["X-GNOME-Autostart-enabled"] === "true" && !!match && runtime(match[1]) && oldScript(match[2]);
  }
  if (platform === "win32") {
    const match = text.match(/^Set WshShell = CreateObject\("WScript\.Shell"\)\nWshShell\.Run """([^"\r\n]+)"" ""([^"\r\n]+)"" --tray --skip-update", 0, False$/);
    return !!match && runtime(match[1]) && oldScript(match[2]);
  }
  const strings = [...text.matchAll(/<string>([^<]*)<\/string>/g)].map(match => unescapeXml(match[1]));
  if (strings.length !== 8 || strings[0] !== `com.${name}.autostart` || !runtime(strings[1]) || !oldScript(strings[2])) return false;
  // Compare the whole normalized record, not just trusted-looking substrings.
  const expected = startupContent("darwin", strings[2], strings[1])
    .replaceAll(APP_LABEL, `com.${name}.autostart`).replaceAll("/tmp/kitsune-router", `/tmp/${name}`);
  return text === expected.trim();
}

function migrateLegacyAutoStart(cliPath, { platform = process.platform, home = os.homedir(), env = process.env, sourceName } = {}) {
  const result = { migrated: false, warnings: [] };
  const directory = startupDirectory(platform, home, env);
  const script = getCliJsPath(cliPath);
  if (!directory || !script) return result;
  const target = path.join(directory, startupName(platform));
  const sources = LEGACY_NAMES.filter(name => !sourceName || name === sourceName).map(name => ({ name, file: path.join(directory, startupName(platform, name)) })).filter(record => regularFile(record.file));
  if (!sources.length) return result;
  // Never merge/replace an already configured Kitsune Router record.
  if (regularFile(target)) { result.warnings.push("Existing and legacy auto-start records both retained; review them to avoid duplicate startup."); return result; }
  if (sources.length > 1) { result.warnings.push("Multiple legacy auto-start records retained; select one manually."); return result; }
  const source = sources[0];
  const identity = fs.lstatSync(source.file);
  const original = fs.readFileSync(source.file, "utf8");
  if (!recognizedLegacy(original, platform, source.name)) {
    result.warnings.push("Customized or disabled legacy auto-start retained unchanged; review it manually.");
    return result;
  }
  const backup = `${source.file}.kitsune-router-backup`;
  if (regularFile(backup)) { result.warnings.push("A legacy auto-start backup already exists; review the interrupted migration."); return result; }
  // File-only migration. A launchd job may remain registered until next login;
  // do not unload/load it and accidentally launch or kill a gateway here.
  fs.copyFileSync(source.file, backup, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backup, 0o600);
  const backupFd = fs.openSync(backup, "r+");
  try { fs.fsyncSync(backupFd); } finally { fs.closeSync(backupFd); }
  const unchanged = () => {
    regularFile(source.file);
    const current = fs.lstatSync(source.file);
    return current.dev === identity.dev && current.ino === identity.ino && fs.readFileSync(source.file, "utf8") === original;
  };
  if (!unchanged()) throw new Error("Legacy auto-start changed during migration; backup retained");
  const content = startupContent(platform, script);
  const staged = `${target}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(staged, content, { flag: "wx", mode: 0o600 });
  const fd = fs.openSync(staged, "r+");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  // A hard link publishes a complete file with atomic no-replace semantics.
  // Unlike rename it cannot overwrite a record created by a concurrent user.
  try { fs.linkSync(staged, target); }
  finally { fs.unlinkSync(staged); }
  if (!unchanged()) {
    result.warnings.push("Legacy auto-start changed during publication; both records retained for manual review.");
    return result;
  }
  fs.unlinkSync(source.file);
  result.migrated = true;
  result.warnings.push("Legacy auto-start backed up and updated for the next login; no startup service was executed.");
  return result;
}

/**
 * Resolve the absolute path to this package's cli.js.
 *
 * Order of preference:
 *   1. Explicit `cliPath` argument — cleanest, used when called from running
 *      cli.js with `__filename`.
 *   2. `process.argv[1]` if it's our cli.js — true when kitsune-router is currently
 *      running and the tray menu fires this code path.
 *   3. Compute relative to this file's own location. autostart.js lives at
 *      `<pkg>/src/cli/tray/autostart.js`, so cli.js is three levels up.
 *      This works for any global install layout (nvm, Volta, asdf, Homebrew,
 *      /usr/local, etc.) without depending on `npm bin -g` (removed in npm 9)
 *      or a hardcoded `/usr/local/...` path.
 *
 * Returns null if no candidate exists — callers should not write an autostart
 * entry pointing at a non-existent script.
 */
function getCliJsPath(cliPath) {
  if (cliPath) {
    const resolved = path.resolve(cliPath);
    if (fs.existsSync(resolved)) return resolved;
  }
  if (process.argv[1]) {
    const resolved = path.resolve(process.argv[1]);
    if (path.basename(resolved) === "cli.js" && fs.existsSync(resolved)) {
      return resolved;
    }
  }
  const computed = path.resolve(__dirname, "..", "..", "..", "cli.js");
  if (fs.existsSync(computed)) return computed;
  return null;
}

/**
 * Enable auto startup on OS boot
 * @param {string} cliPath - Optional path to cli.js (defaults to auto-detect)
 * @returns {boolean} success
 */
function enableAutoStart(cliPath) {
  const platform = process.platform;

  if (!["darwin", "win32", "linux"].includes(platform)) return false;
  if (platform === "linux" && !process.env.DISPLAY) return false;

  try {
    if (platform === "darwin") return enableMacOS(cliPath);
    if (platform === "win32") return enableWindows(cliPath);
    if (platform === "linux") return enableLinux(cliPath);
  } catch (err) {
    // Silent fail — autostart is optional
  }
  return false;
}

/**
 * Disable auto startup
 * @returns {boolean} success
 */
function disableAutoStart() {
  const platform = process.platform;
  try {
    if (platform === "darwin") return disableMacOS();
    if (platform === "win32") return disableWindows();
    if (platform === "linux") return disableLinux();
  } catch (err) {}
  return false;
}

/**
 * Check if autostart is enabled.
 *
 * On macOS, both the plist file and the launchd registration must be present —
 * otherwise the tray menu would lie about the state (showing "✓ Enabled" even
 * when launchd has the agent in a failed state or hasn't loaded it).
 */
function isAutoStartEnabled() {
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${APP_LABEL}.plist`);
      if (!fs.existsSync(plistPath)) return false;
      try {
        execFileSync("launchctl", ["list", APP_LABEL], {
          stdio: ["ignore", "ignore", "ignore"],
          timeout: 3000
        });
        return true;
      } catch (e) {
        return false;
      }
    } else if (platform === "win32") {
      const directory = startupDirectory(platform, os.homedir(), process.env);
      return directory ? regularFile(path.join(directory, startupName(platform))) : false;
    } else if (platform === "linux") {
      const directory = startupDirectory(platform, os.homedir(), process.env);
      return regularFile(path.join(directory, startupName(platform)));
    }
  } catch (e) {}
  return false;
}

// ============ macOS ============

/**
 * Returns true when the current Node process IS the running instance that
 * launchd is managing under our agent label.
 *
 * `launchctl unload <plist>` (and `load`) for an Aqua user-domain agent sends
 * SIGTERM to the running process. When the running kitsune-router cli.js was itself
 * spawned by the autostart launchd agent (i.e. user enabled autostart at
 * some point, then rebooted, then clicked the tray icon's "Disable
 * Auto-start" menu item), an unload would kill the very process executing
 * the click handler — and the tray icon would disappear instead of the menu
 * label flipping back to "Enable Auto-start". This helper lets the enable
 * and disable paths sidestep that by skipping launchctl when we'd otherwise
 * be killing ourselves.
 */
function isAgentSelfMacOS() {
  try {
    const output = execFileSync("launchctl", ["list", APP_LABEL], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000
    });
    const match = output.match(/"PID"\s*=\s*(\d+)/);
    return !!(match && parseInt(match[1], 10) === process.pid);
  } catch (e) {
    return false;
  }
}

function enableMacOS(cliPath) {
  const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
  const plistPath = path.join(launchAgentsDir, `${APP_LABEL}.plist`);

  if (!fs.existsSync(launchAgentsDir)) {
    fs.mkdirSync(launchAgentsDir, { recursive: true });
  }

  const routerScript = getCliJsPath(cliPath);
  // Don't write a broken plist that references a non-existent script.
  if (!routerScript) return false;

  if (fs.existsSync(plistPath)) regularFile(plistPath);
  atomicWrite(plistPath, startupContent("darwin", routerScript));

  // If we're the running agent already, launchctl unload/load would send
  // ourselves SIGTERM. Skip it — the plist file is updated on disk and
  // launchd will pick it up at next login. isAutoStartEnabled() will still
  // return true because launchctl already has the agent loaded.
  if (isAgentSelfMacOS()) {
    return true;
  }

  // Register with launchd in the current session. Without this, the agent
  // only takes effect on the next user login and the user has no signal that
  // anything actually happened. `unload` first defends against re-enable
  // replacing an existing plist.
  try {
    execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
  } catch (e) {}
  try {
    execFileSync("launchctl", ["load", "-w", plistPath], { stdio: "ignore" });
  } catch (e) {
    // Even if load fails, the plist is on disk and will be picked up at next
    // login; report success based on the file write.
  }
  return true;
}

function disableMacOS() {
  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${APP_LABEL}.plist`);

  // Don't kill ourselves: when the current process is the running agent,
  // `launchctl unload` would send SIGTERM and the user clicking
  // "Disable Auto-start" from the tray menu would lose their tray icon
  // instead of just flipping the menu label. Skip the unload — removing the
  // plist file is enough to prevent the agent from starting on next login.
  if (!isAgentSelfMacOS()) {
    try {
      execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
    } catch (e) {}
  }

  if (fs.existsSync(plistPath)) {
    fs.unlinkSync(plistPath);
  }
  return true;
}

// ============ Windows ============

function enableWindows(cliPath) {
  const startupDir = startupDirectory("win32", os.homedir(), process.env);
  if (!startupDir) return false;
  const vbsPath = path.join(startupDir, `${APP_NAME}.vbs`);

  if (!fs.existsSync(startupDir)) return false;

  const routerScript = getCliJsPath(cliPath);
  if (!routerScript) return false;

  if (fs.existsSync(vbsPath)) regularFile(vbsPath);
  atomicWrite(vbsPath, startupContent("win32", routerScript));
  return true;
}

function disableWindows() {
  const directory = startupDirectory("win32", os.homedir(), process.env);
  if (!directory) return false;
  const vbsPath = path.join(directory, startupName("win32"));
  if (fs.existsSync(vbsPath)) {
    fs.unlinkSync(vbsPath);
  }
  return true;
}

// ============ Linux ============

function enableLinux(cliPath) {
  const autostartDir = startupDirectory("linux", os.homedir(), process.env);
  const desktopPath = path.join(autostartDir, `${APP_NAME}.desktop`);

  if (!fs.existsSync(autostartDir)) {
    try { fs.mkdirSync(autostartDir, { recursive: true }); }
    catch (e) { return false; }
  }

  const routerScript = getCliJsPath(cliPath);
  if (!routerScript) return false;

  if (fs.existsSync(desktopPath)) regularFile(desktopPath);
  atomicWrite(desktopPath, startupContent("linux", routerScript));
  return true;
}

function disableLinux() {
  const desktopPath = path.join(startupDirectory("linux", os.homedir(), process.env), `${APP_NAME}.desktop`);
  if (fs.existsSync(desktopPath)) {
    fs.unlinkSync(desktopPath);
  }
  return true;
}

module.exports = {
  enableAutoStart,
  disableAutoStart,
  isAutoStartEnabled,
  migrateLegacyAutoStart,
};
