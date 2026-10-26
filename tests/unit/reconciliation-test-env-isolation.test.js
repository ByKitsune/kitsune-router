import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const directories = [];
const envFiles = [".env", ".env.local", ".env.test", ".env.test.local"];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function runFixture({ files = envFiles, fromTests = false, explicit = false } = {}) {
  const directory = mkdtempSync(resolve(process.env.RUNNER_TEMP || tmpdir(), "reconciliation-test-env-"));
  directories.push(directory);
  for (const path of ["tests/unit", "src", "open-sse", "home", "tmp", "xdg"]) mkdirSync(resolve(directory, path), { recursive: true });
  writeFileSync(resolve(directory, "package.json"), '{"type":"module"}\n');
  writeFileSync(resolve(directory, "tests/package.json"), '{"type":"module"}\n');
  copyFileSync(resolve(root, "tests/vitest.config.js"), resolve(directory, "tests/vitest.config.js"));
  symlinkSync(resolve(root, "tests/node_modules"), resolve(directory, "tests/node_modules"), "dir");
  writeFileSync(resolve(directory, "src/env-fixture.js"), 'export default "source alias resolved";\n');
  writeFileSync(resolve(directory, "open-sse/env-fixture.js"), 'export default "engine alias resolved";\n');
  const fileDataDir = resolve(directory, "file-selected-data");
  const fileContents = [
    "RECONCILIATION_ENV_FILE_MARKER=synthetic-file-marker", "VITE_RECONCILIATION_ENV_FILE_MARKER=synthetic-vite-file-marker",
    `DATA_DIR=${fileDataDir}`, "RUN_REAL=1", "RUN_E2E=1", "RUN_LIVE_TESTS=1", "AG_CACHE_TEST=1",
    "MODEL_CATALOG_SYNC=on", "JWT_SECRET=synthetic-file-jwt-never-a-real-credential", "KITSUNE_ROUTER_PEER_TOKEN=synthetic-file-peer-token",
  ].join("\n") + "\n";
  for (const file of files) writeFileSync(resolve(directory, file), fileContents);
  const evidence = resolve(directory, "observed.json");
  writeFileSync(resolve(directory, "tests/unit/env-probe.test.js"), `
import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import sourceAlias from '@/env-fixture.js';
import engineAlias from 'open-sse/env-fixture.js';
it('discovers the fixture and records its actual environment without starting providers', () => {
  writeFileSync(process.env.FIXTURE_EVIDENCE, JSON.stringify({
    aliases: [sourceAlias, engineAlias],
    values: {
      marker: process.env.RECONCILIATION_ENV_FILE_MARKER ?? null,
      dataDir: process.env.DATA_DIR ?? null,
      runReal: process.env.RUN_REAL ?? null,
      runE2e: process.env.RUN_E2E ?? null,
      runLiveTests: process.env.RUN_LIVE_TESTS ?? null,
      agCacheTest: process.env.AG_CACHE_TEST ?? null,
      catalogSync: process.env.MODEL_CATALOG_SYNC ?? null,
      jwt: process.env.JWT_SECRET ?? null,
      peer: process.env.KITSUNE_ROUTER_PEER_TOKEN ?? null,
    },
    viteMarker: import.meta.env.VITE_RECONCILIATION_ENV_FILE_MARKER ?? null,
  }));
  expect(true).toBe(true);
});
`);
  // Forward no ambient credentials or test opt-ins. Any observed file marker
  // must have come through the copied production config/Vite env loading.
  const env = {
    PATH: process.env.PATH, HOME: resolve(directory, "home"), TMPDIR: resolve(directory, "tmp"),
    XDG_CONFIG_HOME: resolve(directory, "xdg"), XDG_DATA_HOME: resolve(directory, "xdg"),
    XDG_CACHE_HOME: resolve(directory, "xdg"), XDG_STATE_HOME: resolve(directory, "xdg"),
    NODE_ENV: "test", FIXTURE_EVIDENCE: evidence,
  };
  if (explicit) Object.assign(env, {
    RECONCILIATION_ENV_FILE_MARKER: "explicit-synthetic-process-marker", DATA_DIR: resolve(directory, "explicit-data"),
    RUN_REAL: "0", RUN_E2E: "0", RUN_LIVE_TESTS: "0", AG_CACHE_TEST: "0", MODEL_CATALOG_SYNC: "off",
    JWT_SECRET: "explicit-synthetic-process-jwt", KITSUNE_ROUTER_PEER_TOKEN: "explicit-synthetic-process-peer",
  });
  const report = resolve(directory, "vitest.json");
  const result = spawnSync(process.execPath, [
    resolve(root, "tests/node_modules/vitest/vitest.mjs"), "run", "--config", fromTests ? "vitest.config.js" : "tests/vitest.config.js",
    "--maxWorkers=1", "--reporter=json", `--outputFile=${report}`,
  ], { cwd: fromTests ? resolve(directory, "tests") : directory, env, encoding: "utf8", timeout: 15000 });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const results = JSON.parse(readFileSync(report, "utf8"));
  expect(results.success).toBe(true);
  expect(results.numPassedTests).toBe(1);
  expect(results.numFailedTestSuites).toBe(0);
  const observed = JSON.parse(readFileSync(evidence, "utf8"));
  expect(observed.aliases).toEqual(["source alias resolved", "engine alias resolved"]);
  return { directory, observed };
}

describe("automated test environment isolation through the actual Vitest config", () => {
  it.each([
    ["root .env", { files: [".env"] }],
    ["root .env.local", { files: [".env.local"] }],
    ["all conventional test env files", {}],
    ["env files when invoked from tests/", { fromTests: true }],
  ])("does not implicitly load %s", (_name, options) => {
    const { observed } = runFixture(options);
    expect(observed.values).toEqual({
      marker: null, dataDir: null, runReal: null, runE2e: null, runLiveTests: null,
      agCacheTest: null, catalogSync: null, jwt: null, peer: null,
    });
    expect(observed.viteMarker).toBe(null);
  }, 20000);

  it("keeps explicitly supplied synthetic process configuration without enabling file-backed live flags", () => {
    const { directory, observed } = runFixture({ explicit: true, fromTests: true });
    expect(observed.values).toEqual({
      marker: "explicit-synthetic-process-marker", dataDir: resolve(directory, "explicit-data"),
      runReal: "0", runE2e: "0", runLiveTests: "0", agCacheTest: "0", catalogSync: "off",
      jwt: "explicit-synthetic-process-jwt", peer: "explicit-synthetic-process-peer",
    });
    expect(observed.viteMarker).toBe(null);
  }, 20000);
});
