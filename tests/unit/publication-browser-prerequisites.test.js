import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

describe("publication browser prerequisites", () => {
  it.each(["release", "docker-publish"])("%s installs the locked browser in isolated HOME and requires browser coverage before full verification", name => {
    const workflow = readFileSync(resolve(import.meta.dirname, `../../.github/workflows/${name}.yml`), "utf8");
    const blocks = workflow.split(/(?=      - name: )/);
    const install = blocks.find(block => block.includes("- name: Install Chromium for isolated browser checks\n"));
    const first = blocks.find(block => block.includes("- name: Run synthetic Usage browser regressions first\n"));
    expect(workflow).toContain('KITSUNE_REQUIRE_BROWSER_TESTS: "1"');
    expect(install).toContain("run: node node_modules/playwright/cli.js install --with-deps chromium\n");
    expect(first).toContain("run: npm test -- --maxWorkers=1 tests/unit/upstream-usage-dashboard-browser.test.js\n");
    for (const block of [install, first]) {
      expect(block).not.toMatch(/\n        (?:if|continue-on-error):/);
      expect(block).not.toMatch(/\bHOME:|PLAYWRIGHT_BROWSERS_PATH|--skip|--passWithNoTests/);
    }
    const isolated = workflow.indexOf("run: node scripts/release-publication-helpers.mjs isolate\n");
    const dependencies = workflow.indexOf("npm --prefix tests ci\n");
    const browserInstall = workflow.indexOf("- name: Install Chromium for isolated browser checks\n");
    const browserFirst = workflow.indexOf("- name: Run synthetic Usage browser regressions first\n");
    const sourceGate = workflow.indexOf("run: node scripts/release-publication-helpers.mjs verify-source\n");
    expect(isolated).toBeGreaterThan(-1);
    expect(isolated).toBeLessThan(dependencies);
    expect(dependencies).toBeLessThan(browserInstall);
    expect(browserInstall).toBeLessThan(browserFirst);
    expect(browserFirst).toBeLessThan(sourceGate);
  });

  it("recovery conditionally prepares the tagged source's browser while retaining unconditional original source gates", () => {
    const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/container-recovery.yml"), "utf8");
    const blocks = workflow.split(/(?=      - name: )/);
    const detect = blocks.find(block => block.includes("id: source-browser\n"));
    const install = blocks.find(block => block.includes("- name: Install the tagged source's locked Chromium when required\n"));
    const first = blocks.find(block => block.includes("- name: Run required tagged-source Usage browser regressions first\n"));
    const gate = blocks.find(block => block.includes("- name: Verify exact immutable release source with its original gates\n"));
    expect(detect).toContain("if test -f release-source/tests/unit/upstream-usage-dashboard-browser.test.js; then\n");
    expect(detect).toContain("printf 'KITSUNE_REQUIRE_BROWSER_TESTS=1\\n' >> \"$GITHUB_ENV\"");
    for (const block of [install, first]) {
      expect(block).toContain("if: steps.source-browser.outputs.required == 'true'\n");
      expect(block).toContain("working-directory: release-source\n");
      expect(block).not.toMatch(/continue-on-error|--skip|--passWithNoTests/);
    }
    expect(install).toContain("run: node node_modules/playwright/cli.js install --with-deps chromium\n");
    expect(first).toContain("run: npm test -- --maxWorkers=1 tests/unit/upstream-usage-dashboard-browser.test.js\n");
    expect(gate).toContain("run: node release-tools/scripts/recover-container-release.mjs source-gate\n");
    expect(gate).not.toMatch(/\n        if:|GITHUB_SHA:|--skip/);
    const dependencies = workflow.indexOf("- name: Install locked release-source dependencies\n");
    expect(dependencies).toBeGreaterThan(-1);
    expect(dependencies).toBeLessThan(workflow.indexOf("- name: Detect tagged-source browser prerequisite\n"));
    expect(workflow.indexOf(detect)).toBeLessThan(workflow.indexOf(install));
    expect(workflow.indexOf(install)).toBeLessThan(workflow.indexOf(first));
    expect(workflow.indexOf(first)).toBeLessThan(workflow.indexOf(gate));
    expect(workflow).toContain('default: "v1.0.2"');
    expect(workflow).toContain('default: "65c8b97d783becab3f1e1210d2ab9ce67992e13b"');
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("ref: refs/tags/${{ inputs.tag }}");
    expect(workflow).toContain("run: node release-tools/scripts/recover-container-release.mjs validate");
  });

  it.each([false, true])("executes actual recovery detection with tagged-source fixture present=%s, independently of tooling contents", present => {
    const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/container-recovery.yml"), "utf8");
    const detector = workflow.split(/(?=      - name: )/).find(block => block.includes("id: source-browser\n"));
    const script = detector.split("        run: |\n")[1].trimEnd().split("\n").map(line => line.replace(/^          /, "")).join("\n");
    const directory = mkdtempSync(resolve(tmpdir(), "recovery browser prerequisites-"));
    try {
      for (const source of ["release-source", "release-tools"]) mkdirSync(resolve(directory, source, "tests/unit"), { recursive: true });
      // New tooling's fixture alone must not change a historical source's gates.
      const fixture = "tests/unit/upstream-usage-dashboard-browser.test.js";
      writeFileSync(resolve(directory, "release-tools", fixture), "tooling fixture");
      if (present) writeFileSync(resolve(directory, "release-source", fixture), "tagged source fixture");
      const output = resolve(directory, "outputs"), environment = resolve(directory, "environment");
      writeFileSync(output, "");writeFileSync(environment, "existing=unchanged\n");
      const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script], {
        cwd: directory, env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, GITHUB_ENV: environment }, encoding: "utf8", timeout: 5000,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(readFileSync(output, "utf8")).toBe(present ? "required=true\n" : "");
      expect(readFileSync(environment, "utf8")).toBe("existing=unchanged\n" + (present ? "KITSUNE_REQUIRE_BROWSER_TESTS=1\n" : ""));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
