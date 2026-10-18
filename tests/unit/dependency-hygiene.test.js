// Dependency-hygiene gate for release readiness.
//
// Two classes of finding are pinned here because both have regressed before:
//
//  1. Phantom production dependencies. `express` was declared in
//     `dependencies` while nothing imported it — it was the sole source of the
//     critical `proxy-addr` advisory (GHSA-jqcg-44mw-7w3h, IP spoofing via
//     IPv4-mapped IPv6 trust subnet). A declared-but-unused production dep is
//     removed, not patched.
//
// The test is deliberately dependency-free (no npm registry access) so it runs
// in CI and offline alike.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build", ".turbo",
  "coverage", "out", "standalone", "mitm-bundle",
]);
const SOURCE_EXTS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]);

// Imports under tests/ do not make a package a PRODUCTION dependency. A
// test-only library (e.g. selfsigned, used to mint a SAML fixture cert) must be
// declared as a devDependency, or `npm ci --omit=dev` still ships it.
const TEST_DIRS = new Set(["tests"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXTS.has(extname(entry))) out.push(full);
  }
  return out;
}

// Module specifiers actually imported/required by production sources.
function importedSpecifiers(files) {
  const found = new Set();
  const patterns = [
    /(?:^|[^\w.])require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
  ];
  for (const file of files) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) found.add(m[1]);
    }
  }
  return found;
}

// Bare package name for a specifier ("node-forge/lib/x" → "node-forge", "@scope/pkg/a" → "@scope/pkg").
function packageOf(spec) {
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:") || spec.startsWith("data:")) return null;
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const files = walk(ROOT);
const isTestFile = (f) => {
  const rel = f.slice(ROOT.length);
  return [...TEST_DIRS].some((dir) => rel === dir || rel.startsWith(`${dir}/`));
};
// Production usage: sources outside tests/ (src, open-sse, cli, scripts, root).
const prodImported = importedSpecifiers(files.filter((f) => !isTestFile(f)));

// Declared without a direct import, on purpose:
//  - react-is is pinned to the exact React version by the stable dependency
//    contract (tests/unit/dependency-engine-contract.test.js) and is consumed
//    transitively by the React ecosystem, not by an import statement.
// Every entry needs a reason; the list must stay tiny.
const INTENTIONAL_PINS = new Map([
  ["react-is", "version-pinned by the stable dependency runtime contract"],
]);

// A specifier counts as used if it is imported directly, or if it is imported
// Build scripts may inline runtime imports into shipped artifacts. Scan those
// sources too rather than counting test-only consumers as production usage.
function isImported(name) {
  if (prodImported.has(name)) return true;
  for (const spec of prodImported) {
    if (packageOf(spec) === name) return true;
  }
  return false;
}

describe("dependency hygiene (release readiness)", () => {
  it("declares no phantom production dependencies", () => {
    const declared = Object.keys(pkg.dependencies || {});
    const unused = declared.filter((name) => !isImported(name) && !INTENTIONAL_PINS.has(name));
    expect(unused, `declared but never imported by production code: ${unused.join(", ")}`).toEqual([]);
  });

  it("keeps the intentional-pin list honest", () => {
    // A pin whose package is actually imported is no longer an exception.
    for (const name of INTENTIONAL_PINS.keys()) {
      expect(pkg.dependencies?.[name], `${name} should stay declared`).toBeTruthy();
    }
  });

  it("keeps the critical proxy-addr advisory out of the tree", () => {
    // proxy-addr only ever entered through express. If it comes back, the
    // critical IP-spoofing advisory comes back with it (unless >= 2.0.8).
    expect(pkg.dependencies?.express, "express must not be a declared dependency").toBeUndefined();
    expect(pkg.devDependencies?.express).toBeUndefined();
    expect(isImported("express")).toBe(false);
  });

  it("keeps the removed certificate and lint advisory chains out of both lockfiles", () => {
    for (const file of ["package-lock.json", "cli/package-lock.json"]) {
      const lock = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
      const forbidden = Object.keys(lock.packages || {}).filter((entry) =>
        /(?:^|\/)node_modules\/(?:node-forge|braces)$/.test(entry));
      expect(forbidden, `${file} must not restore a removed advisory chain`).toEqual([]);
    }
    expect(isImported("node-forge")).toBe(false);
  });

});
