#!/usr/bin/env node
// Single command to bump the project version everywhere it must stay in
// lockstep: root, CLI, tests and gitbook manifests plus their lock metadata.
//
// Usage:
//   node scripts/bump-version.mjs 0.5.57        # explicit version
//   node scripts/bump-version.mjs patch|minor|major
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkReleaseVersion } from "./check-release-version.mjs";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const files = ["", "cli/", "tests/", "gitbook/"].flatMap(prefix => [join(root, prefix, "package.json"), join(root, prefix, "package-lock.json")]);

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/bump-version.mjs <version|patch|minor|major>");
  process.exit(1);
}

function bump(version, level) {
  if (!["patch", "minor", "major"].includes(level)) return level;
  const parts = version.split(".").map(BigInt);
  if (level === "patch") parts[2] += 1n;
  if (level === "minor") { parts[1] += 1n; parts[2] = 0n; }
  if (level === "major") { parts[0] += 1n; parts[1] = 0n; parts[2] = 0n; }
  return parts.join(".");
}

// Validate and prepare every input before writing anything. Existing drift is
// an operator error, not permission to silently choose one package's version.
const current = JSON.parse(readFileSync(files[0], "utf8")).version;
checkReleaseVersion(root, `v${current}`);
const next = bump(current, arg);
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(next) || next.trim() !== next) {
  console.error(`Invalid version: ${next}`);
  process.exit(1);
}
const updates = files.map(file => {
  const original = readFileSync(file, "utf8");
  const pkg = JSON.parse(original);
  pkg.version = next;
  if (file.endsWith("package-lock.json")) pkg.packages[""].version = next;
  return { file, original, content: JSON.stringify(pkg, null, 2) + "\n" };
});
const written = [];
try {
  for (const update of updates) {
    written.push(update);
    writeFileSync(update.file, update.content);
  }
  checkReleaseVersion(root, `v${next}`);
} catch (error) {
  const rollbackErrors = [];
  for (const { file, original } of written.reverse()) {
    try { writeFileSync(file, original); }
    catch (rollbackError) { rollbackErrors.push(rollbackError); }
  }
  if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Version bump failed and rollback encountered errors; inspect all four manifests and locks before retrying");
  throw error;
}
for (const { file } of updates) console.log(`${file}: ${next}`);
console.log(`\nSynchronized four packages and locks to v${next}. Rebuild when ready.`);
