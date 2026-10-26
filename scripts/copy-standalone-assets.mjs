import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";

// These entries run outside Next's bundled module graph. Retain their relative
// paths, including imports shared by the raw MITM child and custom server.
export const STANDALONE_RUNTIME_FILES = Object.freeze([
  "custom-server.js",
  "shutdown-lifecycle.cjs",
  "cli/hooks/dataDirectory.js",
  "cli/hooks/runtimeSecrets.js",
  "cli/hooks/containerEntrypoint.js",
  "cli/hooks/nodeFlags.js",
  "cli/hooks/sqliteRuntime.js",
  "cli/hooks/trayRuntime.js",
  "branding/identity.mjs",
  "src/shared/constants/mitmToolHosts.js",
  "open-sse/config/clientVersions.js",
]);

const RUNTIME_STATE_NAMES = new Set([
  ".build-home", ".git", ".npmrc", ".kitsune-router", ".zenrouter", ".9router",
  ".verification", "verification",
  ".sqljs-owner", "secrets.json", "secrets.env", "machine-id", "db.json",
  ".runtime-secrets.lock", ".kitsune-router-migration.lock", ".kitsune-router-migration-incomplete",
]);

export function excludeRuntimeState(source) {
  const name = basename(source);
  return !RUNTIME_STATE_NAMES.has(name)
    && !/^\.env(?:\.|$)/.test(name)
    && !/\.(?:sqlite(?:-(?:wal|shm|journal))?|key|pem|p12|pfx|pid)$/.test(name);
}

export function assertNoRuntimeState(directory) {
  // Includes state that Next's own trace may already have copied before this
  // hook. Abort rather than silently publishing secrets or deleting evidence.
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const source = resolve(directory, entry.name);
    if (!excludeRuntimeState(source)) throw new Error(`Refusing runtime state in application bundle: ${source}`);
    if (entry.isDirectory()) assertNoRuntimeState(source);
  }
}

export function copyStandaloneRuntimeAssets({ projectRoot, standaloneDir } = {}) {
  // Next 16's server trace omits its metadata-route helpers even though the
  // production filesystem router requires them at boot. Preserve that narrow
  // framework closure for source standalone and CLI builds alike, rather than
  // copying the complete development/compiler package into every artifact.
  const metadataSource = resolve(projectRoot, "node_modules/next/dist/lib/metadata");
  if (existsSync(metadataSource)) {
    const destination = resolve(standaloneDir, "node_modules/next/dist/lib/metadata");
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(metadataSource, destination, { recursive: true, force: true, filter: excludeRuntimeState });
  }

  for (const name of STANDALONE_RUNTIME_FILES) {
    const source = resolve(projectRoot, name);
    const destination = resolve(standaloneDir, name);
    if (!existsSync(source)) continue;
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { force: true });
    console.log(`[standalone-assets] Copied ${name} to ${destination}`);
  }

  // Keep the hooks' local CommonJS closure (for example environment aliases)
  // intact as new shared helpers are added. Copy source modules, never state or
  // the install-time hook, into the standalone server.
  const hooksSource = resolve(projectRoot, "cli", "hooks");
  if (existsSync(hooksSource)) {
    for (const entry of readdirSync(hooksSource, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(?:c?js|mjs)$/.test(entry.name) || entry.name === "postinstall.js") continue;
      const destination = resolve(standaloneDir, "cli", "hooks", entry.name);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(resolve(hooksSource, entry.name), destination, { force: true });
    }
  }

  // Never copy locally generated certificates, keys or databases alongside code.
  const mitmSource = resolve(projectRoot, "src", "mitm");
  const mitmDestination = resolve(standaloneDir, "src", "mitm");
  if (existsSync(mitmSource)) {
    cpSync(mitmSource, mitmDestination, { recursive: true, force: true, filter: excludeRuntimeState });
    console.log(`[standalone-assets] Copied MITM sources to ${mitmDestination}`);
  }
}

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
    cpSync(publicSource, publicDestination, { recursive: true, force: true, filter: excludeRuntimeState });
    console.log(`[standalone-assets] Copied public assets to ${publicDestination}`);
  }

  copyStandaloneRuntimeAssets({ projectRoot, standaloneDir });
  assertNoRuntimeState(standaloneDir);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(dirname(fileURLToPath(import.meta.url)), "copy-standalone-assets.mjs")) {
  copyStandaloneAssets();
}
