#!/usr/bin/env node

// Postinstall: warm-up SQLite deps into ~/.kitsune-router/runtime so the first
// `kitsune-router` start doesn't need network. Failure here is non-fatal —
// cli.js will retry at runtime if anything is missing.
const { ensureSqliteRuntime } = require("./sqliteRuntime");
const { ensureTrayRuntime } = require("./trayRuntime");

// Auto-setup on install: create the data directory and generate the runtime
// secrets up front, so the very first `kitsune-router` run serves the dashboard
// immediately instead of failing login with "JWT_SECRET environment variable
// is required". Idempotent — existing values are never overwritten, and an
// explicitly exported JWT_SECRET still wins.
const fs = require("fs");
const { ensureRuntimeSecrets, getSecretsPath, getDataDir } = require("./runtimeSecrets");

// Never let migration refusal fall through to secret generation and silently
// create a replacement installation. Package installation may be retried once
// the old gateway has stopped; the original files remain untouched.
try {
  process.env.DATA_DIR = getDataDir();
} catch (e) {
  console.error(`[kitsune-router] state migration stopped: ${e.message}`);
  // Installation may complete while the old gateway is still running. Do not
  // create a default dir or secrets: first startup will retry and fail closed.
  process.exit(0);
}

try {
  fs.mkdirSync(getDataDir(), { recursive: true });
  const secrets = ensureRuntimeSecrets(process.env, { silent: false });
  console.log(`[kitsune-router] data dir ready: ${getDataDir()}`);
  console.log(`[kitsune-router] runtime secrets ready: ${getSecretsPath()} (${Object.keys(secrets).length} keys)`);
} catch (e) {
  console.warn(`[kitsune-router] runtime secrets setup stopped: ${e.message}`);
  process.exit(0);
}

try {
  ensureSqliteRuntime({ silent: false });
  console.log("[kitsune-router] runtime SQLite deps ready");
} catch (e) {
  console.warn(`[kitsune-router] runtime warm-up skipped: ${e.message}`);
}

try {
  ensureTrayRuntime({ silent: false });
} catch (e) {
  console.warn(`[kitsune-router] tray runtime skipped: ${e.message}`);
}

process.exit(0);
