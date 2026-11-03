import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runFixture({ invalidRoot = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "kitsune-fixture-lifecycle-"));
  directories.push(directory);
  const fixtureRoot = join(directory, "kitsune-router-test-fixtures");
  if (invalidRoot) writeFileSync(fixtureRoot, "synthetic non-directory fixture");
  const report = join(directory, "vitest.json");
  const child = spawnSync(process.execPath, [
    resolve(root, "tests/node_modules/vitest/vitest.mjs"), "run",
    "tests/unit/reconciliation-metrics-cost-coverage.test.js", "--config", "tests/vitest.config.js",
    "--maxWorkers=1", "--no-file-parallelism", "--testNamePattern=reports wholly unpriced usage",
    "--reporter=json", `--outputFile=${report}`,
  ], {
    cwd: root, encoding: "utf8", timeout: 20000,
    env: {
      PATH: process.env.PATH, HOME: directory, TMPDIR: directory,
      NODE_ENV: "test", RUN_REAL: "0", RUN_E2E: "0", RUN_LIVE_TESTS: "0", AG_CACHE_TEST: "0",
      MODEL_CATALOG_SYNC: "off", DISABLE_BACKGROUND_TOKEN_REFRESH: "1",
      KITSUNE_ROUTER_DISABLE_MITM: "1", KITSUNE_ROUTER_MIGRATION: "skip",
    },
  });
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  expect(existsSync(report), child.stdout + child.stderr).toBe(true);
  return { child, report: JSON.parse(readFileSync(report, "utf8")), fixtureRoot };
}

describe("database fixture setup and cleanup in an actual worker", () => {
  it("creates its missing temporary parent before initializing and cleaning the database", () => {
    const { child, report, fixtureRoot } = runFixture();
    expect(child.status, child.stdout + child.stderr).toBe(0);
    expect(report.success).toBe(true);
    expect(report.numPassedTests).toBe(1);
    expect(existsSync(fixtureRoot)).toBe(true);
    expect(child.stderr).toBe("");
  }, 25000);

  it("reports the original setup filesystem error without corrupting the worker's process emitter", () => {
    const { child, report } = runFixture({ invalidRoot: true });
    expect(child.status).toBe(1);
    expect(report.success).toBe(false);
    expect(report.numFailedTests).toBe(1);
    const failures = report.testResults.flatMap(suite => suite.assertionResults)
      .flatMap(test => test.failureMessages || []).join("\n");
    expect(failures).toMatch(/EEXIST|ENOTDIR/);
    expect(failures).toContain("mkdir");
    expect(child.stdout + child.stderr + failures).not.toMatch(/process\.emit is not a function|Worker exited unexpectedly/);
  }, 25000);
});
