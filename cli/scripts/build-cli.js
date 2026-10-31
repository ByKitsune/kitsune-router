#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const cliDir = path.resolve(__dirname, "..");
const appDir = path.resolve(cliDir, "..");
const rootDir = path.resolve(appDir, "..");
const cliAppDir = process.env.KITSUNE_ROUTER_CLI_APP_DIR || process.env.NINEROUTER_CLI_APP_DIR || path.join(cliDir, "app");
const buildHomeDir = path.join(cliDir, ".build-home");
const buildDistDirName = ".next-cli-build";
const buildDistDir = path.join(appDir, buildDistDirName);

// Exclude patterns for files/folders we don't want to copy
const EXCLUDE_PATTERNS = [
  "@img",           // Sharp image processing (not needed with unoptimized images)
  "sharp",          // Sharp core lib (not needed with unoptimized images)
  "detect-libc",    // Sharp dependency
  path.basename(buildHomeDir), // Generated build HOME can contain identity, database, and telemetry state
  ".env",           // Environment files
  ".env.*",
  ".npmrc",         // May contain registry credentials
  ".git",
  ".kitsune-router",
  ".zenrouter",     // Legacy state must never be published
  ".9router",
  ".sqljs-owner",
  ".runtime-secrets.lock",
  ".kitsune-router-migration.lock",
  ".kitsune-router-migration-incomplete",
  "secrets.json",
  "secrets.env",
  "machine-id",
  "db.json",
  "*.sqlite",
  "*.sqlite-wal",
  "*.sqlite-shm",
  "*.sqlite-journal",
  "*.key",
  "*.pem",
  "*.p12",
  "*.pfx",
  "*.pid",
  "*.log",          // Log files
  "tmp",            // Temp files
  ".DS_Store",      // macOS files
];

function shouldExclude(name) {
  return EXCLUDE_PATTERNS.some(pattern => {
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      return regex.test(name);
    }
    return name === pattern;
  });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Warning: Source ${src} does not exist`);
    return;
  }
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldExclude(entry.name)) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip broken symlinks (common in workspace setups)
    try {
      fs.accessSync(srcPath);
    } catch {
      continue;
    }

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // Resolve and copy target (avoid linking outside bundle)
      try {
        const real = fs.realpathSync(srcPath);
        if (fs.statSync(real).isDirectory()) {
          copyRecursive(real, destPath);
        } else {
          fs.copyFileSync(real, destPath);
        }
      } catch {}
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch {}
    }
  }
}

function resolveStandaloneBuild(appDir, buildDistDir) {
  const legacyStandaloneRoot = path.join(appDir, ".next", "standalone");
  const resolvedStandaloneRoot = path.join(buildDistDir, "standalone");
  const standaloneRoot = fs.existsSync(resolvedStandaloneRoot)
    ? resolvedStandaloneRoot
    : legacyStandaloneRoot;

  // Next.js 16 nests standalone output under the project name when
  // NEXT_TRACING_ROOT_MODE=workspace, e.g. standalone/kitsune-router/server.js.
  const pkgName = path.basename(appDir);
  const nestedRoot = path.join(standaloneRoot, pkgName);
  let standaloneApp = standaloneRoot;
  if (fs.existsSync(path.join(nestedRoot, "server.js")) && !fs.existsSync(path.join(standaloneRoot, "server.js"))) {
    console.log(`ℹ️  Detected nested standalone output: ${pkgName}/`);
    standaloneApp = nestedRoot;
  } else if (!fs.existsSync(path.join(standaloneRoot, "server.js"))) {
    standaloneApp = path.join(standaloneRoot, "app");
  }

  if (!fs.existsSync(path.join(standaloneApp, "server.js"))) {
    throw new Error(
      "Next.js standalone build not found under .next/standalone; " +
      "expected either .next/standalone/server.js or .next/standalone/app/",
    );
  }

  return { standaloneApp, standaloneRoot };
}

function copyStandaloneBuild(appDir, buildDistDir, cliAppDir) {
  const { standaloneApp, standaloneRoot } = resolveStandaloneBuild(appDir, buildDistDir);
  copyRecursive(standaloneApp, cliAppDir);

  // Nested workspace/legacy layouts may keep hoisted modules at the trace
  // container root, beside the project folder. Preserve that module closure too.
  const standaloneNodeModules = path.join(standaloneRoot, "node_modules");
  if (standaloneApp !== standaloneRoot && fs.existsSync(standaloneNodeModules)) {
    copyRecursive(standaloneNodeModules, path.join(cliAppDir, "node_modules"));
  }
}

function mergeServerArtifacts(buildDistDir, cliAppDir) {
  const serverSrc = path.join(buildDistDir, "server");
  const serverDest = path.join(cliAppDir, buildDistDirName, "server");
  if (!fs.existsSync(serverSrc)) {
    throw new Error(`Complete Next.js server build not found: ${serverSrc}`);
  }
  copyRecursive(serverSrc, serverDest);
}

function assertRequiredApiArtifacts(cliAppDir) {
  const requiredArtifacts = [
    "app/api/v1/chat/completions/route.js",
    "app/api/v1/messages/route.js",
  ];
  const serverDir = path.join(cliAppDir, buildDistDirName, "server");
  const missingArtifacts = requiredArtifacts
    .map((artifact) => path.join(serverDir, artifact))
    .filter((artifact) => !fs.existsSync(artifact));

  if (missingArtifacts.length > 0) {
    throw new Error(
      `Required CLI API route artifact${missingArtifacts.length === 1 ? " is" : "s are"} missing:\n` +
      missingArtifacts.join("\n"),
    );
  }
}

function ensureSqlJsWasm(appDir, rootDir, cliAppDir) {
  const candidates = [path.join(appDir, "node_modules/sql.js"), path.join(rootDir, "node_modules/sql.js")];
  const source = candidates.find((directory) => fs.existsSync(path.join(directory, "package.json")));
  if (!source) throw new Error("sql.js source package is missing; cannot bundle WebAssembly fallback");
  const destination = path.join(cliAppDir, "node_modules/sql.js");
  const sourceWasm = path.join(source, "dist/sql-wasm.wasm");
  const sourceJs = path.join(source, "dist/sql-wasm.js");
  const destinationJs = path.join(destination, "dist/sql-wasm.js");
  if (!fs.existsSync(sourceWasm) || !fs.existsSync(sourceJs)) {
    throw new Error("sql.js source JavaScript or WebAssembly is missing");
  }
  if (!fs.existsSync(path.join(destination, "package.json")) || !fs.existsSync(destinationJs)) {
    throw new Error("sql.js traced package is incomplete");
  }
  const sourceVersion = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8")).version;
  const destinationVersion = JSON.parse(fs.readFileSync(path.join(destination, "package.json"), "utf8")).version;
  if (!sourceVersion || sourceVersion !== destinationVersion || !fs.readFileSync(sourceJs).equals(fs.readFileSync(destinationJs))) {
    throw new Error("sql.js source and traced runtime mismatch");
  }
  // Next's trace can contain the JS but omit its adjacent WebAssembly file.
  // npm pack includes both when they are present under the CLI app directory.
  fs.copyFileSync(sourceWasm, path.join(destination, "dist/sql-wasm.wasm"));
}

async function buildCliPackage() {
  console.log("📦 Building Kitsune Router CLI package with Next.js...\n");

  // Verify every manifest/lock before building. Packaging must never silently
  // rewrite release source to reconcile a stale CLI version.
  console.log("0️⃣  Checking release version and package identities...");
  const cliPkg = JSON.parse(fs.readFileSync(path.join(cliDir, "package.json"), "utf8"));
  execFileSync(process.execPath, [path.join(appDir, "scripts", "check-release-version.mjs"), `v${cliPkg.version}`], {
    cwd: appDir,
    stdio: "inherit",
  });
  const { assertNoRuntimeState, copyStandaloneRuntimeAssets, STANDALONE_RUNTIME_FILES } = await import("../../scripts/copy-standalone-assets.mjs");
  for (const name of STANDALONE_RUNTIME_FILES) {
    if (!fs.existsSync(path.join(appDir, name))) throw new Error(`Required runtime source missing: ${name}`);
  }

  fs.mkdirSync(buildHomeDir, { recursive: true });
  fs.mkdirSync(path.join(buildHomeDir, "AppData", "Roaming"), { recursive: true });
  fs.mkdirSync(path.join(buildHomeDir, "AppData", "Local"), { recursive: true });

  // Step 1: Build app with Next.js (workspace tracing root → traced node_modules in standalone).
  console.log("1️⃣  Building Next.js app...");
  try {
    execSync("npm run build", {
      stdio: "inherit",
      cwd: appDir,
      env: {
        ...process.env,
        HOME: buildHomeDir,
        USERPROFILE: buildHomeDir,
        APPDATA: path.join(buildHomeDir, "AppData", "Roaming"),
        LOCALAPPDATA: path.join(buildHomeDir, "AppData", "Local"),
        DATA_DIR: path.join(buildHomeDir, "data"),
        XDG_CONFIG_HOME: path.join(buildHomeDir, ".config"),
        XDG_DATA_HOME: path.join(buildHomeDir, ".local", "share"),
        XDG_CACHE_HOME: path.join(buildHomeDir, ".cache"),
        XDG_STATE_HOME: path.join(buildHomeDir, ".local", "state"),
        KITSUNE_ROUTER_MIGRATION: "skip",
        NEXT_DIST_DIR: buildDistDirName,
        NEXT_TRACING_ROOT_MODE: "workspace",
      }
    });
    console.log("✅ Next.js build completed\n");
  } catch (error) {
    console.error("❌ Next.js build failed");
    process.exit(1);
  }

  // Step 2: Clean old app/cli/app if exists
  console.log("2️⃣  Cleaning old app/cli/app...");
  if (fs.existsSync(cliAppDir)) {
    fs.rmSync(cliAppDir, { recursive: true, force: true });
  }
  console.log("✅ Cleaned\n");

  // Step 3: Copy Next.js standalone build to app/cli/app.
  // Newer Next.js standalone output writes server.js/package.json plus .next/, src/, and
  // node_modules/ directly under .next/standalone. Older builds may still use a nested app/.
  console.log("3️⃣  Copying Next.js standalone build to app/cli/app...");
  try {
    copyStandaloneBuild(appDir, buildDistDir, cliAppDir);
  } catch (error) {
    console.error("❌ Next.js standalone build not found under .next/standalone");
    console.error("Expected either .next/standalone/server.js or .next/standalone/app/");
    process.exit(1);
  }
  console.log("✅ Copied standalone build\n");

  copyStandaloneRuntimeAssets({ projectRoot: appDir, standaloneDir: cliAppDir });

  // Step 3b: Ensure sql.js (pure JS fallback) bundled in app/cli/app/node_modules.
  // Strip better-sqlite3 (native) — it lives in ~/.kitsune-router/runtime to avoid
  // Windows EBUSY during global CLI updates. node:sqlite (Node ≥22.5) is also
  // available as a no-install middle tier.
  console.log("3️⃣ b Configuring SQLite drivers...");
  function ensureModuleInBundle(pkg) {
    const dest = path.join(cliAppDir, "node_modules", pkg);
    if (fs.existsSync(dest)) {
      console.log(`✅ ${pkg} already bundled`);
      return;
    }
    const candidates = [
      path.join(appDir, "node_modules", pkg),
      path.join(rootDir, "node_modules", pkg),
    ];
    const src = candidates.find((p) => fs.existsSync(p));
    if (!src) {
      console.warn(`⚠️  ${pkg} not found locally — bundle will rely on node:sqlite or runtime install`);
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    copyRecursive(src, dest);
    console.log(`✅ Bundled ${pkg}`);
  }
  ensureModuleInBundle("sql.js");
  ensureSqlJsWasm(appDir, rootDir, cliAppDir);
  // `open` is external (see serverExternalPackages in next.config.mjs), so it must exist in
  // the bundle's node_modules or every importer throws MODULE_NOT_FOUND at runtime. Output
  // tracing normally copies it; this is the same belt-and-braces guard used for sql.js.
  ensureModuleInBundle("open");
  const betterDir = path.join(cliAppDir, "node_modules", "better-sqlite3");
  if (fs.existsSync(betterDir)) {
    fs.rmSync(betterDir, { recursive: true, force: true });
    console.log("✅ Stripped better-sqlite3 (lives in ~/.kitsune-router/runtime)");
  }
  console.log("");

  // Step 4: Copy static files
  console.log("4️⃣  Copying static files...");
  const staticSrc = path.join(appDir, ".next", "static");
  const staticSrcResolved = path.join(buildDistDir, "static");
  const staticDest = path.join(cliAppDir, buildDistDirName, "static");
  if (fs.existsSync(staticSrcResolved) || fs.existsSync(staticSrc)) {
    copyRecursive(fs.existsSync(staticSrcResolved) ? staticSrcResolved : staticSrc, staticDest);
    console.log("✅ Copied static files\n");
  } else {
    console.log("⏭️  No static files found\n");
  }

  // Step 5: Copy public folder if exists
  console.log("5️⃣  Copying public folder...");
  const publicSrc = path.join(appDir, "public");
  const publicDest = path.join(cliAppDir, "public");
  if (fs.existsSync(publicSrc)) {
    copyRecursive(publicSrc, publicDest);
    console.log("✅ Copied public folder\n");
  } else {
    console.log("⏭️  No public folder found\n");
  }

  // Step 6: Copy vendor-chunks (required for production)
  console.log("6️⃣  Copying vendor-chunks...");
  const vendorChunksSrc = path.join(appDir, ".next", "server", "vendor-chunks");
  const vendorChunksSrcResolved = path.join(buildDistDir, "server", "vendor-chunks");
  const vendorChunksDest = path.join(cliAppDir, buildDistDirName, "server", "vendor-chunks");
  if (fs.existsSync(vendorChunksSrcResolved) || fs.existsSync(vendorChunksSrc)) {
    copyRecursive(fs.existsSync(vendorChunksSrcResolved) ? vendorChunksSrcResolved : vendorChunksSrc, vendorChunksDest);
    console.log("✅ Copied vendor-chunks\n");
  } else {
    console.log("⏭️  No vendor-chunks found\n");
  }

  // Step 6b: Merge the complete generated server tree. Next.js standalone output
  // is trace-pruned and can omit route modules or chunks loaded dynamically.
  console.log("6️⃣ b Copying complete server artifacts...");
  mergeServerArtifacts(buildDistDir, cliAppDir);
  assertRequiredApiArtifacts(cliAppDir);
  console.log("✅ Copied complete server artifacts\n");

  // Step 7b: Copy standalone updater (headless Node process for install progress)
  console.log("7️⃣ b Copying updater files...");
  const updaterSrc = path.join(appDir, "src", "lib", "updater");
  const updaterDest = path.join(cliAppDir, "src", "lib", "updater");
  if (fs.existsSync(updaterSrc)) {
    copyRecursive(updaterSrc, updaterDest);
    console.log("✅ Copied updater files\n");
  } else {
    console.log("⏭️  No updater files found\n");
  }

  // Step 8: Build MITM server (config driven - see app/cli/scripts/buildMitm.js)
  console.log("8️⃣  Building MITM server...");
  try {
    execSync("node scripts/buildMitm.js", { stdio: "inherit", cwd: cliDir });
    console.log("✅ MITM server build completed\n");
  } catch (error) {
    console.error("❌ MITM build failed");
    process.exit(1);
  }

  assertNoRuntimeState(cliAppDir);
  assertNoRuntimeState(path.join(cliDir, "hooks"));
  assertNoRuntimeState(path.join(cliDir, "src"));
  console.log("✨ CLI package build completed!");
  console.log(`📁 Output: ${cliAppDir}`);

  try {
    const { execSync: exec } = require("child_process");
    const size = exec(`du -sh "${cliAppDir}"`, { encoding: "utf8" }).trim();
    console.log(`📊 Package size: ${size.split("\t")[0]}`);
  } catch (e) {
    // Silent fail on size check
  }
}

module.exports = {
  assertRequiredApiArtifacts,
  copyStandaloneBuild,
  ensureSqlJsWasm,
  mergeServerArtifacts,
};

if (require.main === module) {
  buildCliPackage().catch(error => {
    console.error("❌ CLI package build failed:", error.message);
    process.exit(1);
  });
}
