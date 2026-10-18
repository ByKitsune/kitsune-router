import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../__baseline__/verify-no-regression.mjs", import.meta.url));
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function verify(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "zen-verification-gate-"));
  directories.push(directory);
  const report = {
    success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0,
    numPendingTests: 0, numFailedTestSuites: 0,
    testResults: [{ name: "/fixture/tests/unit/example.test.js", status: "passed",
      assertionResults: [{ fullName: "example works", status: "passed" }] }],
    ...overrides,
  };
  const path = join(directory, "report.json");
  writeFileSync(path, JSON.stringify(report));
  return spawnSync(process.execPath, [script, path], { encoding: "utf8" });
}

describe("verification report gate", () => {
  it("accepts a completed run with passing cases", () => {
    expect(verify().status).toBe(0);
  });

  it("rejects collection failures even when no test case failed", () => {
    const result = verify({ success: false, numFailedTestSuites: 1,
      testResults: [{ name: "/fixture/tests/unit/example.test.js", status: "failed", message: "Cannot load module", assertionResults: [] }] });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("suite");
  });

  it("rejects an unsuccessful runner result without an assertion failure", () => {
    expect(verify({ success: false }).status).not.toBe(0);
  });

  it("rejects an empty discovery run instead of reporting no regression", () => {
    expect(verify({ numTotalTests: 0, numPassedTests: 0, testResults: [] }).status).not.toBe(0);
  });

  it("rejects inconsistent summaries that omit discovered test results", () => {
    expect(verify({ numTotalTests: 2, numPassedTests: 2 }).status).not.toBe(0);
  });

  it("rejects a failed assertion even if the runner summary claims success", () => {
    const result = verify({ testResults: [{ name: "/fixture/tests/unit/example.test.js", status: "passed",
      assertionResults: [{ fullName: "example works", status: "failed" }] }] });
    expect(result.status).not.toBe(0);
  });

  it("reports explained skipped cases without treating them as failures", () => {
    expect(verify({ numTotalTests: 2, numPendingTests: 1, testResults: [{
      name: "/fixture/tests/unit/example.test.js", status: "passed", assertionResults: [
        { fullName: "example works", status: "passed" }, { fullName: "live opt-in", status: "pending" },
      ],
    }] }).status).toBe(0);
  });
});
