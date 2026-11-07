const fs = require("node:fs");
const path = require("node:path");

// Published packages carry app/. A source checkout instead uses the completed
// standalone output produced by the root build (including workspace nesting).
// Do not launch the raw source server or silently fall back to development mode.
function resolveServerRuntime(cliDirectory) {
  const project = path.resolve(cliDirectory, "..");
  const candidates = [path.join(cliDirectory, "app")];
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
    if (metadata.name === "kitsune-router-app" && fs.existsSync(path.join(project, "next.config.mjs"))) {
      const standalone = path.join(project, ".next", "standalone");
      // A checkout can retain cli/app from a previous package build. Its fresh
      // root build is authoritative; never let that old bundle shadow it.
      candidates.unshift(standalone, path.join(standalone, path.basename(project)));
    }
  } catch {
    // A published CLI has no source project beside it.
  }
  for (const directory of candidates) {
    if (!fs.existsSync(path.join(directory, "server.js"))) continue;
    const buildDirectory = [".next-cli-build", ".next"].find(name =>
      fs.existsSync(path.join(directory, name, "BUILD_ID")));
    if (!buildDirectory) continue;
    const custom = path.join(directory, "custom-server.js");
    return {
      directory,
      serverPath: fs.existsSync(custom) ? custom : path.join(directory, "server.js"),
    };
  }
  throw new Error("Production standalone build not found. In a source checkout run 'npm ci && npm run build'; for a packaged CLI reinstall @bykitsune/router.");
}

module.exports = { resolveServerRuntime };
