import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function checkReleaseVersion(root, tag) {
  const match = typeof tag === "string" && /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  assert(match && match[0] === tag, "Invalid stable release tag; expected vMAJOR.MINOR.PATCH");
  const version = tag.slice(1);
  const read = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const names = {
    "": "kitsune-router-app",
    "cli/": "@bykitsune/router",
    "tests/": "kitsune-router-tests",
    "gitbook/": "kitsune-router-docs",
  };
  for (const [prefix, name] of Object.entries(names)) {
    const manifest = read(prefix + "package.json");
    const lock = read(prefix + "package-lock.json");
    for (const [label, value] of [["manifest", manifest.version], ["lock", lock.version], ["lock root", lock.packages?.[""]?.version]]) {
      assert.equal(value, version, `Version mismatch: ${prefix || "root/"}${label}`);
    }
    for (const [label, value] of [["manifest", manifest.name], ["lock", lock.name], ["lock root", lock.packages?.[""]?.name]]) {
      assert.equal(value, name, `Identity mismatch: ${prefix || "root/"}${label}`);
    }
  }
  const normalizeBin = bin => Object.fromEntries(Object.entries(bin || {}).map(([name, file]) => [name, file.replace(/^\.\//, "")]));
  const expectedBin = { "kitsune-router": "cli.js" };
  assert.deepEqual(normalizeBin(read("cli/package.json").bin), expectedBin, "Unexpected published CLI binary");
  assert.deepEqual(normalizeBin(read("cli/package-lock.json").packages[""].bin), expectedBin, "Unexpected locked CLI binary");
  return { tag, version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const tag = process.argv[2] || `v${JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version}`;
  console.log(JSON.stringify(checkReleaseVersion(root, tag)));
}
