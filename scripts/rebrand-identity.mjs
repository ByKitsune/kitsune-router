#!/usr/bin/env node
// Read-only identity gate. Old names are allowed only where they describe real
// historical artifacts, upstream evidence, or the migration compatibility seam.
// Never rewrite provenance or cryptographic salts to make this gate pass.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BRAND } from "../branding/identity.mjs";

const root = path.resolve(import.meta.dirname, "..");
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const projects = [
  [".", "kitsune-router-app"], ["cli", BRAND.npmPackage],
  ["tests", "kitsune-router-tests"], ["gitbook", "kitsune-router-docs"],
];
const version = readJson("package.json").version;
for (const [directory, name] of projects) {
  const manifest = readJson(path.join(directory, "package.json"));
  const lock = readJson(path.join(directory, "package-lock.json"));
  check(manifest.name === name, `${directory}: unexpected package name ${manifest.name}`);
  check(manifest.version === version && lock.version === version && lock.packages[""].version === version,
    `${directory}: manifest/lock version differs from ${version}`);
  check(lock.name === name && lock.packages[""].name === name, `${directory}: lockfile package identity drift`);
  if (directory === "cli") {
    check(Object.keys(manifest.bin).join() === BRAND.binary, "CLI executable differs from public identity");
    check(Object.keys(lock.packages[""].bin).join() === BRAND.binary, "CLI lock executable differs from public identity");
    check(manifest.repository.url.replace(/\.git$/, "") === BRAND.repository, "CLI repository differs from public identity");
    check(manifest.publishConfig?.access === "public", "Scoped CLI must declare public publication");
  } else check(manifest.private === true, `${directory}: internal package must be private`);
}

let files;
try {
  files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split("\0").filter(Boolean);
} catch {
  // Source archives may not carry Git metadata. Enumerate source files, never
  // dependency/build/runtime trees or operator .env files.
  files = [];
  const excluded = new Set([".git", "node_modules", ".next", ".next-cli-build", ".verification", "verification", ".build-home", "out", "data", ".taste-skill"]);
  function walk(directory = "") {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (excluded.has(entry.name) || relative === path.join("cli", "app") || entry.name.startsWith(".env")) continue;
      if (entry.isDirectory()) walk(relative);
      else if (entry.isFile()) files.push(relative);
    }
  }
  walk();
}

const archived = (file) => file === "CHANGELOG.md" || file.startsWith("releases/")
  || file.startsWith("docs/audit/") || /^docs\/CHANGELOG_/.test(file)
  || /\/changelog\.md$/.test(file) || file.startsWith("docs/superpowers/");
const migrationFiles = new Set([
  "cli/hooks/dataDirectory.js", "cli/hooks/environment.js", "cli/src/cli/tray/autostart.js",
  "cli/cli.js", "cli/scripts/build-cli.js", "scripts/copy-standalone-assets.mjs",
  "src/mitm/cert/install.js", "docs/MIGRATION.md", "docs/REBRANDING.md",
  "src/lib/db/helpers/brandSettings.js",
  "docs/BRAND.md", ".agents/product-marketing.md", "scripts/rebrand-identity.mjs",
]);
for (const file of [...new Set(files)]) {
  if (!fs.existsSync(path.join(root, file)) || !fs.statSync(path.join(root, file)).isFile()) continue;
  if (archived(file) || file === "LICENSE" || file.endsWith("/LICENSE") || migrationFiles.has(file)
    || file.startsWith("tests/") || file.includes("/providers/metadata/")) continue;
  if (!/\.(?:js|cjs|mjs|json|md|svg|sh|yml|yaml)$/.test(file)) continue;
  const content = fs.readFileSync(path.join(root, file), "utf8");
  for (const [index, line] of content.split("\n").entries()) {
    // Existing operators must be able to follow migration explanations in
    // current-language docs. A historical name here is not an active label.
    if (file.endsWith(".md") && /legacy|histor|migrat|former|old |previous|ZenRouter\/9Router|upstream|~\/\.zenrouter|~\/\.9router|0\.x.*ZenRouter|ZenRouter.*0\.x|artefak ZenRouter|artefact.*ZenRouter|ZenRouter.*(?:产物|历史|過去)/i.test(line)) continue;
    if (/\/tmp\/opencode\/|github\.com\/decolua\/9router|zenrouter-mitm-pwd|zen-cli-auth|zenrouter-account-redaction-v1/.test(line)) continue;
    if (file === "next.config.mjs" && line.includes("Never trace legacy private state")) continue;
    if (/ZenRouter|zenrouter|ZENROUTER|Kitsune Router\/Kitsune Router|https?:\/\/kitsune-router\.(?:com|dev)\b/.test(line)) {
      errors.push(`${file}:${index + 1}: stale or invented current identity`);
    }
    if (/x-zen-(?:real-ip|peer-token|via-proxy|password|cli-token)/i.test(line)) {
      errors.push(`${file}:${index + 1}: stale internal extension header`);
    }
    if (/Usage:\s*kitsunerouter\b|(?:npm (?:i|install) -g|npx)\s+kitsunerouter\b|getSkillRawUrl\("kitsunerouter"\)/.test(line)) {
      errors.push(`${file}:${index + 1}: provider key used as an executable or public skill path`);
    }
  }
}

for (const directory of ["skills", "public/icons"]) {
  for (const name of fs.readdirSync(path.join(root, directory))) {
    check(!/zenrouter/i.test(name), `${directory}/${name}: stale public asset path`);
  }
}
for (const name of ["kitsune-router", "kitsune-router-chat", "kitsune-router-image", "kitsune-router-video", "kitsune-router-tts", "kitsune-router-stt", "kitsune-router-embeddings", "kitsune-router-web-search", "kitsune-router-web-fetch"]) {
  check(fs.existsSync(path.join(root, "skills", name, "SKILL.md")), `Missing current skill path: ${name}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`Identity gate failed: ${errors.length} finding(s)`);
  process.exitCode = 1;
} else console.log(`${BRAND.name} ${version}: package, executable, source, and public asset identity checks passed.`);
