// Preload the same per-key resolver used by the CLI before custom-server.js
// imports application modules. Docker execs this Node process after su-exec;
// there is no wrapper child, inherited NODE_OPTIONS hook or secret in argv.
const { ensureRuntimeSecrets } = require("./runtimeSecrets");

try {
  Object.assign(process.env, ensureRuntimeSecrets(process.env));
} catch {
  // Parser errors may wrap invalid secret-file contents. Never print causes or
  // raw values; the operator can inspect the private files locally.
  console.error("[kitsune-router] Runtime secrets could not be resolved; review the private secrets.json/secrets.env files and explicit overrides. Original keys were not replaced.");
  process.exit(1);
}
