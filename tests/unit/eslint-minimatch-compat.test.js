import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { installLegacyMinimatchCompatibility, isLegacyMinimatchImport } from "../../scripts/eslint/minimatch-compat.mjs";

const require = createRequire(import.meta.url);
const modern = require("minimatch");
const modernKeys = Reflect.ownKeys(modern);
const modernFunction = modern.minimatch;
const modernClass = modern.Minimatch;
const registration = installLegacyMinimatchCompatibility();
const pluginFile = name => join(dirname(require.resolve(`${name}/package.json`)), "lib", "compatibility-fixture.js");
const legacy = createRequire(pluginFile("eslint-plugin-react"))("minimatch");

describe("scoped compatibility for the patched publisher matcher", () => {
  it("uses the pinned patched matcher and preserves modern named exports", () => {
    expect(require("minimatch/package.json").version).toBe("11.0.3");
    expect(typeof modern).toBe("object");
    expect(Reflect.ownKeys(modern)).toEqual(modernKeys);
    expect(modern.minimatch).toBe(modernFunction);
    expect(modern.Minimatch).toBe(modernClass);
    expect(modern.makeRe).toBeUndefined();
    expect(legacy).not.toBe(modernFunction);
    expect(legacy.Minimatch.prototype).toBeInstanceOf(modernClass);
  });

  it.each(["eslint-plugin-react", "eslint-plugin-import", "eslint-plugin-jsx-a11y"])("adapts only a callable consumer within %s", name => {
    const caller = pluginFile(name);
    expect(isLegacyMinimatchImport("minimatch", pathToFileURL(caller).href)).toBe(true);
    expect(createRequire(caller)("minimatch")).toBe(legacy);
  });

  it("leaves ESLint, config-array and application imports on the native modern exports", () => {
    for (const name of ["eslint", "@eslint/config-array"]) {
      const caller = require.resolve(name);
      expect(isLegacyMinimatchImport("minimatch", pathToFileURL(caller).href)).toBe(false);
      expect(createRequire(caller)("minimatch")).toBe(modern);
    }
    const caller = fileURLToPath(new URL("../../src/lint-unrelated-fixture.cjs", import.meta.url));
    expect(createRequire(caller)("minimatch")).toBe(modern);
  });

  it("does not redirect other specifiers or package-name lookalikes", () => {
    const parent = pathToFileURL(pluginFile("eslint-plugin-react")).href;
    expect(isLegacyMinimatchImport("minimatch/package.json", parent)).toBe(false);
    expect(isLegacyMinimatchImport("node:fs", parent)).toBe(false);
    expect(isLegacyMinimatchImport("minimatch", parent.replace("eslint-plugin-react/", "eslint-plugin-react-unrelated/"))).toBe(false);
    expect(isLegacyMinimatchImport("minimatch", undefined)).toBe(false);
  });

  it("registers at most one hook across config reloads", async () => {
    expect(installLegacyMinimatchCompatibility()).toBe(registration);
    const reloaded = await import("../../scripts/eslint/minimatch-compat.mjs?config-reload");
    expect(reloaded.installLegacyMinimatchCompatibility()).toBe(registration);
  });

  it.each([
    ["src/file.js", "**/*.js", {}, true],
    ["src/file.ts", "**/*.js", {}, false],
    ["src/.hidden.js", "**/*.js", {}, false],
    ["src/.hidden.js", "**/*.js", { dot: true }, true],
    ["src/FILE.JS", "**/*.js", { nocase: true }, true],
    ["src/file.js", "*.js", { matchBase: true }, true],
    ["!literal", "!literal", { nonegate: true }, true],
    ["#literal", "#literal", { nocomment: true }, true],
    ["button-primary", "button-@(primary|secondary)", {}, true],
    ["button-danger", "button-{primary,secondary}", {}, false],
  ])("retains callable matching/options for %s against %s", (path, pattern, options, expected) => {
    expect(legacy(path, pattern, options)).toBe(expected);
    expect(legacy(path, pattern, options)).toBe(modern.minimatch(path, pattern, options));
  });

  it("retains class, filter, list, brace expansion and defaults helpers", () => {
    expect(new legacy.Minimatch("*.js", { matchBase: true }).match("src/file.js")).toBe(true);
    expect(["a.js", "b.ts"].filter(legacy.filter("*.js"))).toEqual(["a.js"]);
    expect(legacy.match(["a.js", "b.ts"], "*.js")).toEqual(["a.js"]);
    expect(legacy.braceExpand("{a,b}.js")).toEqual(["a.js", "b.js"]);
    const configured = legacy.defaults({ nocase: true, dot: true });
    expect(configured("SRC/.HIDDEN.JS", "src/**/*.js")).toBe(true);
    expect(configured("SRC/.HIDDEN.JS", "src/**/*.js", { nocase: false })).toBe(false);
    expect(new configured.Minimatch("src/**/*.js").match("SRC/.HIDDEN.JS")).toBe(true);
  });

  it("supports the actual test-only makeRe consumer using the patched matcher", () => {
    const predicate = legacy.makeRe("src/{a,b}/**", { dot: true });
    expect(predicate.test("src/a/.hidden.js")).toBe(true);
    expect(predicate.test("src/c/file.js")).toBe(false);
    expect(Object.isFrozen(predicate)).toBe(true);
    expect(legacy.makeRe("# ignored pattern")).toBe(false);
  });

  it("retains the publisher fix limiting preprocessing amplification", () => {
    const matcher = new legacy.Minimatch("a/**/../".repeat(8) + "z", { optimizationLevel: 2, braceExpandMax: 4 });
    expect(matcher.globParts.length).toBeLessThanOrEqual(4);
    expect(matcher.match("x")).toBe(false);
  });
});
