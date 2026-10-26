import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export function copyStandaloneAssets({ projectRoot = process.cwd(), distDir = process.env.NEXT_DIST_DIR || ".next" } = {}) {
  if (process.env.NEXT_TRACING_ROOT_MODE === "workspace") {
    console.log("[standalone-assets] Skipping workspace-traced CLI build; CLI packaging handles assets");
    return;
  }

  const buildDir = resolve(projectRoot, distDir);
  const standaloneDir = resolve(buildDir, "standalone");

  if (!existsSync(standaloneDir)) {
    console.log(`[standalone-assets] No standalone build found at ${standaloneDir}`);
    return;
  }

  const staticSource = resolve(buildDir, "static");
  const staticDestination = resolve(standaloneDir, distDir, "static");
  if (existsSync(staticSource)) {
    cpSync(staticSource, staticDestination, { recursive: true, force: true });
    console.log(`[standalone-assets] Copied static assets to ${staticDestination}`);
  }

  const publicSource = resolve(projectRoot, "public");
  const publicDestination = resolve(standaloneDir, "public");
  if (existsSync(publicSource)) {
    cpSync(publicSource, publicDestination, { recursive: true, force: true });
    console.log(`[standalone-assets] Copied public assets to ${publicDestination}`);
  }

  for (const name of ["custom-server.js", "shutdown-lifecycle.cjs"]) {
    const source = resolve(projectRoot, name);
    const destination = resolve(standaloneDir, name);
    if (existsSync(source)) {
      cpSync(source, destination, { force: true });
      console.log(`[standalone-assets] Copied ${name} to ${destination}`);
    }
  }

  // The MITM child is spawned directly, outside Next's module graph.
  const mitmSource = resolve(projectRoot, "src", "mitm");
  const mitmDestination = resolve(standaloneDir, "src", "mitm");
  if (existsSync(mitmSource)) {
    cpSync(mitmSource, mitmDestination, { recursive: true, force: true });
    console.log(`[standalone-assets] Copied MITM sources to ${mitmDestination}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(dirname(fileURLToPath(import.meta.url)), "copy-standalone-assets.mjs")) {
  copyStandaloneAssets();
}
