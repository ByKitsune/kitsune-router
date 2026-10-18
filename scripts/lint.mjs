import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
if (args.length === 0) args.push(".");

function executable(name) {
  const packagePath = require.resolve(`${name}/package.json`);
  const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
  return join(dirname(packagePath), metadata.bin[name]);
}

function run(name, config) {
  const result = spawnSync(process.execPath, [executable(name), "--config", join(root, config), ...args], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${name} terminated by ${result.signal}`);
  return result.status;
}

// Both engines receive the same paths and shared options, including either
// spelling of --max-warnings. Still report ESLint findings if Oxlint finds errors.
try {
  const nativeStatus = run("oxlint", ".oxlintrc.json");
  const eslintStatus = run("eslint", "eslint.config.mjs");
  process.exitCode = Math.max(nativeStatus, eslintStatus);
} catch (error) {
  console.error("Unable to complete composed lint:", error);
  process.exitCode = 2;
}
