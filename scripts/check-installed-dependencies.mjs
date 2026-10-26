import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const GROUPS = ["dependencies", "devDependencies", "optionalDependencies"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function checkInstalledDependencies(directory) {
  const root = resolve(directory);
  const manifest = readJson(resolve(root, "package.json"));
  const lock = readJson(resolve(root, "package-lock.json"));
  const lockedRoot = lock.packages?.[""];
  const issues = [];
  if (!lockedRoot) issues.push("package-lock.json has no root package entry");
  if (manifest.version !== lock.version || manifest.version !== lockedRoot?.version) {
    issues.push("package version differs between the manifest and lockfile");
  }
  for (const group of GROUPS) {
    const requested = manifest[group] || {};
    const locked = lockedRoot?.[group] || {};
    for (const name of new Set([...Object.keys(requested), ...Object.keys(locked)])) {
      if (requested[name] !== locked[name]) issues.push(`${group}.${name} differs between the manifest and lockfile`);
    }
  }

  const dependencies = Object.assign({}, ...GROUPS.map(group => manifest[group]));
  let checked = 0;
  let optionalSkipped = 0;
  for (const name of Object.keys(dependencies).sort()) {
    const expected = lock.packages?.[`node_modules/${name}`]?.version;
    if (!expected) {
      issues.push(`${name}: missing locked package version`);
      continue;
    }
    let installed;
    try {
      // Resolve inside this project's own install. A package in a parent
      // node_modules must not hide an incomplete/stale project installation.
      installed = readJson(resolve(root, "node_modules", name, "package.json"));
    } catch (error) {
      if (error.code === "ENOENT" && Object.hasOwn(manifest.optionalDependencies || {}, name)) {
        optionalSkipped++;
        continue;
      }
      issues.push(`${name}: ${error.code === "ENOENT" ? "not installed" : "unreadable installed package metadata"}`);
      continue;
    }
    if (installed.version !== expected) issues.push(`${name}: installed ${installed.version}, locked ${expected}`);
    checked++;
  }
  if (issues.length) {
    throw new Error(`Dependency installation mismatch in ${manifest.name || root}:\n- ${issues.join("\n- ")}\nRun npm ci in that project before testing or building. Do not weaken the lockfile to match stale node_modules.`);
  }
  return { project: manifest.name, version: manifest.version, checked, optionalSkipped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const directories = process.argv.slice(2);
    console.log(JSON.stringify((directories.length ? directories : [process.cwd()]).map(checkInstalledDependencies)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
