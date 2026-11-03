import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizePlaywrightColorEnvironment } from "../../scripts/playwright-environment.mjs";

const require = createRequire(import.meta.url);
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Playwright color environment", () => {
  it("preserves a requested plain reporter without contradictory child color flags", () => {
    expect(normalizePlaywrightColorEnvironment({ NO_COLOR: "1", PATH: "/fixture" }))
      .toEqual({ FORCE_COLOR: "0", DEBUG_COLORS: "0", PATH: "/fixture" });
  });

  it.each(["0", "1", "3"])("preserves explicit FORCE_COLOR=%s precedence", forceColor => {
    expect(normalizePlaywrightColorEnvironment({ NO_COLOR: "1", FORCE_COLOR: forceColor }))
      .toEqual({ FORCE_COLOR: forceColor });
  });

  it("preserves default color detection and explicit debug preferences", () => {
    expect(normalizePlaywrightColorEnvironment({ NO_COLOR: "" })).toEqual({});
    expect(normalizePlaywrightColorEnvironment({ PATH: "/fixture" })).toEqual({ PATH: "/fixture" });
    expect(normalizePlaywrightColorEnvironment({ NO_COLOR: "1", DEBUG_COLORS: "false" }))
      .toEqual({ FORCE_COLOR: "0", DEBUG_COLORS: "false" });
  });

  it("runs an actual worker with a plain reporter and no Node color warnings", () => {
    const directory = mkdtempSync(join(tmpdir(), "kitsune-playwright-color-"));
    directories.push(directory);
    const playwright = pathToFileURL(require.resolve("@playwright/test")).href;
    const normalizer = new URL("../../scripts/playwright-environment.mjs", import.meta.url).href;
    const config = join(directory, "playwright.config.mjs");
    writeFileSync(config, `
      import { normalizePlaywrightColorEnvironment } from ${JSON.stringify(normalizer)};
      normalizePlaywrightColorEnvironment(process.env);
      export default { testDir: ${JSON.stringify(directory)}, workers: 1, reporter: "list" };
    `);
    writeFileSync(join(directory, "color.spec.mjs"), `
      import playwright from ${JSON.stringify(playwright)};
      const { test, expect } = playwright;
      test("native worker executes", async () => { expect(1 + 1).toBe(2); });
    `);
    const result = spawnSync(process.execPath, [require.resolve("@playwright/test/cli"), "test", "--config", config], {
      cwd: directory,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: undefined, DEBUG_COLORS: undefined },
      encoding: "utf8",
      timeout: 30000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("1 passed");
    expect(result.stdout).not.toContain("\u001b[");
  }, 35000);
});
