import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "../..");
const directories = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

// Execute the workflow's real shell steps, stopping at the first publication
// phase. Only external commands/install/build side effects are replaced.
function prepublication(name) {
  const text = readFileSync(resolve(root, `.github/workflows/${name}.yml`), "utf8");
  const job = text.split("    steps:\n")[1];
  const steps = job.split(/\n      - /);
  const scripts = [];
  for (const step of steps) {
    if (/name: Recover original tarball|uses: docker\/setup-buildx-action|name: Log in to GHCR/.test(step)) break;
    const block = step.match(/^        run: \|\n((?:          .*\n|\n)*)/m);
    const single = step.match(/^(?:        )?run: (?!\|)(.+)$/m);
    if (block) scripts.push(block[1].replace(/^          /gm, ""));
    else if (single) scripts.push(single[1]);
  }
  return scripts;
}

function fixture(name, scenario = "green") {
  const dir = mkdtempSync(resolve(process.env.RUNNER_TEMP || tmpdir(), "reconciliation-gates-"));
  directories.push(dir);
  const bin = resolve(dir, "bin");
  mkdirSync(bin);
  mkdirSync(resolve(dir, "scripts"));
  cpSync(resolve(root, ".github/workflows"), resolve(dir, ".github/workflows"), { recursive: true });
  for (const [prefix, name] of Object.entries({
    "": "kitsune-router-app", "cli/": "@bykitsune/router",
    "tests/": "kitsune-router-tests", "gitbook/": "kitsune-router-docs",
  })) {
    mkdirSync(resolve(dir, prefix), { recursive: true });
    const bin = prefix === "cli/" ? { "kitsune-router": "./cli.js" } : undefined;
    writeFileSync(resolve(dir, prefix, "package.json"), JSON.stringify({ name, version: "0.9.7", bin }));
    writeFileSync(resolve(dir, prefix, "package-lock.json"), JSON.stringify({ name, version: "0.9.7", packages: { "": { name, version: "0.9.7", bin } } }));
  }
  copyFileSync(resolve(root, "scripts/check-release-version.mjs"), resolve(dir, "scripts/check-release-version.mjs"));
  copyFileSync(resolve(root, "scripts/release-publication-helpers.mjs"), resolve(dir, "scripts/release-publication-helpers.mjs"));
  mkdirSync(resolve(dir, "tests/__baseline__"), { recursive: true });
  copyFileSync(resolve(root, "tests/__baseline__/verify-no-regression.mjs"), resolve(dir, "tests/__baseline__/verify-no-regression.mjs"));
  for (const [path, failure] of [
    ["scripts/generate-provider-identity.mjs", "identity"],
    ["tests/__baseline__/verify-providers.mjs", "providers"],
    ["tests/__baseline__/verify-alias.mjs", "aliases"],
    ["tests/__baseline__/verify-oauth-urls.mjs", "oauth"],
  ]) {
    writeFileSync(resolve(dir, path), `import { appendFileSync } from 'node:fs'; appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({ gate: ${JSON.stringify(failure)} })+'\\n'); if (process.env.SCENARIO === ${JSON.stringify(failure)}) process.exit(1);`);
  }
  writeFileSync(resolve(dir, "cli/cli.js"), `
const assert = require('node:assert/strict');
const fs = require('node:fs');
assert.deepEqual(process.argv.slice(2), ['--check-install']);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({ gate: 'runtime', args: process.argv.slice(2) })+'\\n');
assert(fs.existsSync('fixture-production-build'), 'Runtime verification must follow the production build');
if (process.env.SCENARIO === 'runtime') process.exit(1);
`);
  mkdirSync(resolve(dir, "releases"));
  writeFileSync(resolve(dir, "releases/RELEASE_NOTES_v0.9.7.md"), "offline fixture");
  const log = resolve(dir, "calls.jsonl");
  writeFileSync(log, "");
  const browserCli = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const args = process.argv.slice(2);
assert.deepEqual(args, ['install', '--with-deps', 'chromium']);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({ prerequisite: 'browser-install', args, home: process.env.HOME, data: process.env.DATA_DIR, xdg: process.env.XDG_CONFIG_HOME, xdgData: process.env.XDG_DATA_HOME, refresh: process.env.DISABLE_BACKGROUND_TOKEN_REFRESH, catalog: process.env.MODEL_CATALOG_SYNC, cache: process.env.AG_CACHE_TEST, migration: process.env.KITSUNE_ROUTER_MIGRATION })+'\\n');
if (process.env.SCENARIO === 'browser-install') process.exit(1);
fs.writeFileSync(process.env.FIXTURE_BROWSER_STATE, JSON.stringify({ ready: true }));
`;
  const npm = resolve(bin, "npm");
  writeFileSync(npm, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const browserReady = JSON.parse(fs.readFileSync(process.env.FIXTURE_BROWSER_STATE, 'utf8')).ready;
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({ args, browserReady, home: process.env.HOME, data: process.env.DATA_DIR, xdg: process.env.XDG_CONFIG_HOME, xdgData: process.env.XDG_DATA_HOME, refresh: process.env.DISABLE_BACKGROUND_TOKEN_REFRESH, catalog: process.env.MODEL_CATALOG_SYNC, cache: process.env.AG_CACHE_TEST, migration: process.env.KITSUNE_ROUTER_MIGRATION })+'\\n');
if (args[0] === 'ci' && !args.includes('--prefix')) {
  const browser = path.join('node_modules', 'playwright');
  fs.mkdirSync(browser, { recursive: true });
  if (process.env.SCENARIO !== 'browser-missing') fs.writeFileSync(path.join(browser, 'cli.js'), ${JSON.stringify(browserCli)});
}
if (args[0] === 'exec' && args.includes('playwright')) {
  const result = require('node:child_process').spawnSync(process.execPath, [path.join('node_modules', 'playwright', 'cli.js'), ...args.slice(args.indexOf('playwright') + 1)], { stdio: 'inherit', timeout: 5000 });
  process.exit(result.status ?? 1);
}
if (args[0] === 'test' && !args.includes('--prefix')) {
  const browserFirst = args.includes('tests/unit/upstream-usage-dashboard-browser.test.js');
  if (browserFirst && !browserReady) throw Error('Browser prerequisite was not ready before its test');
  if (browserFirst && process.env.SCENARIO === 'browser-test') process.exit(1);
  const output = args.find(a => a.startsWith('--outputFile='));
  if (output) {
    const report = { success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, numFailedTestSuites: 0, testResults: [{ name: 'fixture.test.js', status: 'passed', assertionResults: [{ fullName: 'works', status: 'passed' }] }] };
    if (process.env.SCENARIO === 'collection') { report.success = false; report.numFailedTestSuites = 1; }
    if (process.env.SCENARIO === 'empty') { report.numTotalTests = report.numPassedTests = 0; report.testResults = []; }
    if (process.env.SCENARIO === 'inconsistent') report.numTotalTests = 2;
    fs.mkdirSync(path.dirname(output.slice(13)), { recursive: true });
    fs.writeFileSync(output.slice(13), JSON.stringify(report));
    if (process.env.SCENARIO === 'test-exit') process.exit(1);
  }
}
if (args.includes('test:compat') && process.env.SCENARIO === 'compat') process.exit(1);
if (args.includes('check:brand') && process.env.SCENARIO === 'brand') process.exit(1);
if (args.includes('lint') && process.env.SCENARIO === 'lint') process.exit(1);
if (args.includes('build') && process.env.SCENARIO === 'build') process.exit(1);
if (args.includes('build')) fs.writeFileSync('fixture-production-build', 'complete');
if (args.includes('build') && process.env.SCENARIO === 'changed-report') fs.writeFileSync(path.join('verification',process.env.GITHUB_SHA,'vitest.json'), JSON.stringify({success:false}));
`);
  chmodSync(npm, 0o755);
  const docker = resolve(bin, "docker");
  writeFileSync(docker, `#!${process.execPath}\nrequire('node:fs').appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({args: process.argv.slice(2)})+'\\n');\n`);
  chmodSync(docker, 0o755);
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw Error(result.stderr);
    return result.stdout.trim();
  };
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
  git("tag", "v0.9.7");
  const sha = git("rev-parse", "HEAD");
  const githubEnv = resolve(dir, "github-env");
  writeFileSync(githubEnv, "");
  const browserState = resolve(dir, "browser-state.json");
  writeFileSync(browserState, JSON.stringify({ ready: false }));
  const env = {
    PATH: `${bin}:${process.env.PATH}`, HOME: resolve(dir, "ambient-home"), DATA_DIR: resolve(dir, "ambient-data"),
    RUNNER_TEMP: resolve(dir, "runner"), GITHUB_ENV: githubEnv, GITHUB_SHA: sha, GITHUB_REF: "refs/tags/v0.9.7",
    RELEASE_TAG: "v0.9.7", GITHUB_OUTPUT: resolve(dir, "output"), GITHUB_REPOSITORY: "ByKitsune/kitsune-router",
    NPM_TOKEN: "offline-fixture", FIXTURE_LOG: log, FIXTURE_BROWSER_STATE: browserState, SCENARIO: scenario, XDG_DATA_HOME: resolve(dir, "ambient-xdg-data"),
  };
  mkdirSync(env.HOME);
  mkdirSync(env.DATA_DIR);
  const scripts = prepublication(name);
  const sourceEnv = `set -a\nsource "$GITHUB_ENV"\nset +a\n`;
  const script = scripts.map(step => `(\n${step}\n)\n${sourceEnv}`).join("\n") + `\n${name === "docker-publish" ? "docker" : "npm"} fixture-publish\n`;
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], { cwd: dir, env, encoding: "utf8", timeout: 15000 });
  return { dir, sha, result, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) };
}

describe("workflow source verification actually gates publication", () => {
  it.each(["release", "docker-publish", "ci"])("%s produces strict exact-SHA evidence and isolates installs as well as tests", name => {
    const f = fixture(name);
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(existsSync(resolve(f.dir, `verification/${f.sha}/source.json`))).toBe(true);
    const metadata = JSON.parse(readFileSync(resolve(f.dir, `verification/${f.sha}/source.json`), "utf8"));
    const report = readFileSync(resolve(f.dir, `verification/${f.sha}/vitest.json`));
    expect(metadata).toEqual({ sha: f.sha, ref: "refs/tags/v0.9.7", reportSha256: createHash("sha256").update(report).digest("hex") });
    expect(f.calls.filter(c => c.gate).map(c => c.gate)).toEqual(["identity", "providers", "aliases", "oauth", "runtime"]);
    expect(f.calls.some(c => c.args?.includes("test:compat"))).toBe(true);
    expect(f.calls.some(c => c.args?.includes("check:brand"))).toBe(true);
    const dependencies = f.calls.findIndex(c => c.args?.[0] === "ci");
    const browserInstall = f.calls.findIndex(c => c.prerequisite === "browser-install");
    const browserFirst = f.calls.findIndex(c => c.args?.includes("tests/unit/upstream-usage-dashboard-browser.test.js"));
    const sourceTest = f.calls.findIndex(c => c.args?.some(arg => arg.startsWith("--outputFile=")));
    expect(dependencies).toBeGreaterThan(-1);
    expect(browserInstall).toBeGreaterThan(dependencies);
    expect(f.calls[browserInstall].args).toEqual(["install", "--with-deps", "chromium"]);
    expect(browserFirst).toBeGreaterThan(browserInstall);
    expect(f.calls[browserFirst].browserReady).toBe(true);
    expect(sourceTest).toBeGreaterThan(browserFirst);
    const build = f.calls.findIndex(c => c.args?.includes("build"));
    const runtime = f.calls.findIndex(c => c.gate === "runtime");
    const publish = f.calls.findIndex(c => c.args?.includes("fixture-publish"));
    expect(build).toBeGreaterThan(sourceTest);
    expect(runtime).toBe(build + 1);
    expect(publish).toBeGreaterThan(runtime);
    for (const call of f.calls.filter(c => c.home)) {
      expect(call.home).toBe(resolve(f.dir, "runner/kitsune-router-home"));
      expect(call.data).toBe(resolve(f.dir, "runner/kitsune-router-data"));
      expect(call.xdg).toBe(resolve(f.dir, "runner/kitsune-router-home/.config"));
      expect(call.xdgData).toBe(resolve(f.dir, "runner/kitsune-router-home/.local/share"));
      expect([call.refresh, call.catalog, call.cache]).toEqual(["1", "off", "0"]);
      expect(call.migration).toBe("skip");
    }
  });

  it.each(["release", "docker-publish"].flatMap(name => ["browser-missing", "browser-install", "browser-test"].map(scenario => [name, scenario])))("%s blocks publication when %s prerequisite fails", (name, scenario) => {
    const f = fixture(name, scenario);
    expect(f.result.status, f.result.stdout + f.result.stderr).not.toBe(0);
    expect(f.calls.some(c => c.args?.includes("fixture-publish"))).toBe(false);
    expect(f.calls.some(c => c.args?.some(arg => arg.startsWith("--outputFile=")))).toBe(false);
    expect(existsSync(resolve(f.dir, `verification/${f.sha}/source.json`))).toBe(false);
    if (scenario !== "browser-missing") expect(f.calls.some(c => c.prerequisite === "browser-install")).toBe(true);
    expect(f.calls.some(c => c.args?.includes("tests/unit/upstream-usage-dashboard-browser.test.js"))).toBe(scenario === "browser-test");
  });

  it.each(["release", "docker-publish"].flatMap(name => ["collection", "empty", "inconsistent", "test-exit", "compat", "brand", "identity", "providers", "aliases", "oauth", "lint", "build", "runtime", "changed-report"].map(scenario => [name, scenario])))("%s blocks publication on %s failure", (name, scenario) => {
    const f = fixture(name, scenario);
    expect(f.result.status, f.result.stdout + f.result.stderr).not.toBe(0);
    expect(f.calls.some(c => c.args?.includes("fixture-publish"))).toBe(false);
    expect(existsSync(resolve(f.dir, `verification/${f.sha}/source.json`))).toBe(false);
  });

  it("CI refuses exact-SHA evidence when the production bundle verification fails", () => {
    const f = fixture("ci", "runtime");
    expect(f.result.status, f.result.stdout + f.result.stderr).not.toBe(0);
    expect(f.calls.some(c => c.gate === "runtime")).toBe(true);
    expect(f.calls.some(c => c.args?.includes("fixture-publish"))).toBe(false);
    expect(existsSync(resolve(f.dir, `verification/${f.sha}/source.json`))).toBe(false);
  });
});
