const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function resolveServerInterpreter(env = process.env) {
  if (process.versions.bun) return { command: process.execPath, bun: true };
  const node = { command: process.execPath, bun: false };
  if (env.KITSUNE_ROUTER_RUNTIME === "node") return node;

  const executable = process.platform === "win32" ? "bun.exe" : "bun";
  const probe = spawnSync(executable, ["--no-env-file", "-e", `console.log(process.versions.bun + "\\n" + process.execPath)`], {
    env, encoding: "utf8", timeout: 3000, windowsHide: true,
  });
  if (probe.status !== 0 || !probe.stdout) return node;
  const [version, command] = probe.stdout.trim().split(/\r?\n/);
  if (!/^\d+\.\d+\.\d+$/.test(version) || !command || !path.isAbsolute(command)) return node;
  const [major, minor, patch] = version.split(".").map(Number);
  if (major < 1 || (major === 1 && (minor < 4 || (minor === 4 && patch < 4)))) return node;
  return { command, bun: true };
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

// Published packages carry app/. A source checkout instead uses the completed
// standalone output produced by the root build (including workspace nesting).
// Do not launch the raw source server or silently fall back to development mode.
function resolveServerRuntime(cliDirectory) {
  const project = path.resolve(cliDirectory, "..");
  const packaged = path.join(cliDirectory, "app");
  const candidates = [packaged];
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
    if (metadata.name === "kitsune-router-app" && isFile(path.join(project, "next.config.mjs"))) {
      const standalone = path.join(project, ".next", "standalone");
      // A checkout can retain cli/app from a previous package build. Its fresh
      // root build is authoritative; never let that old bundle shadow it.
      candidates.unshift(standalone, path.join(standalone, path.basename(project)));
    }
  } catch {
    // A published CLI has no source project beside it.
  }
  for (const directory of candidates) {
    if (!isFile(path.join(directory, "server.js"))) continue;
    const buildDirectory = [".next-cli-build", ".next"].find(name =>
      isFile(path.join(directory, name, "BUILD_ID")));
    if (!buildDirectory) continue;
    const custom = path.join(directory, "custom-server.js");
    // Source output is ready only after postbuild copies the custom server's
    // startup closure. Packaged cli/app retains its optional-wrapper contract.
    if (directory !== packaged && ![custom, path.join(directory, "shutdown-lifecycle.cjs"),
      path.join(directory, "cli", "hooks", "dataDirectory.js")].every(isFile)) continue;
    return {
      directory,
      serverPath: isFile(custom) ? custom : path.join(directory, "server.js"),
    };
  }
  throw new Error("Production standalone build not found. In a source checkout run 'bun install --frozen-lockfile && bun run build'; for a packaged CLI reinstall @bykitsune/router.");
}

module.exports = { resolveServerRuntime, resolveServerInterpreter };
