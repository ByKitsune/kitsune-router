import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../..", import.meta.url));
const loader = join(root, "src/lib/db/helpers/optionalNativeSqlite.js");
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "kitsune-optional-sqlite-"));
  directories.push(directory);
  const isolatedLoader = join(directory, "loader.mjs");
  copyFileSync(loader, isolatedLoader);
  return { directory, isolatedLoader };
}

function evaluate(source, directory, environment = {}) {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: directory,
    encoding: "utf8",
    timeout: 15000,
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      DATA_DIR: join(directory, "data"),
      NODE_PATH: "",
      MODEL_CATALOG_SYNC: "off",
      DISABLE_BACKGROUND_TOKEN_REFRESH: "1",
      KITSUNE_ROUTER_DISABLE_MITM: "1",
      ...environment,
    },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

const exerciseDatabase = expression => `
  const Database = ${expression};
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE checks(value TEXT)');
    db.prepare('INSERT INTO checks(value) VALUES (?)').run('native runtime works');
    console.log(db.prepare('SELECT value FROM checks').get().value);
  } finally { db.close(); }
`;

function managedRuntime(directory) {
  const runtimeModules = join(directory, "runtime", "node_modules");
  mkdirSync(runtimeModules, { recursive: true });
  // Exercise the actual locked native addon via the CLI's NODE_PATH lookup,
  // rather than substituting a fake driver or installing a second dependency.
  const installed = dirname(require.resolve("better-sqlite3/package.json"));
  symlinkSync(installed, join(runtimeModules, "better-sqlite3"), "junction");
  return runtimeModules;
}

describe("optional native SQLite loading", () => {
  it("keeps source imports usable without the optional package and fails only when loading it", () => {
    const { directory, isolatedLoader } = fixture();
    const stdout = evaluate(`
      import assert from 'node:assert/strict';
      const { loadBetterSqlite } = await import(${JSON.stringify(pathToFileURL(isolatedLoader).href)});
      assert.equal(typeof loadBetterSqlite, 'function');
      assert.throws(loadBetterSqlite, {code: 'MODULE_NOT_FOUND'});
      console.log('optional import remains lazy');
    `, directory);
    expect(stdout).toContain("optional import remains lazy");
  });

  it("loads the real native addon from the managed CLI NODE_PATH in source mode", () => {
    const { directory, isolatedLoader } = fixture();
    const stdout = evaluate(`
      const { loadBetterSqlite } = await import(${JSON.stringify(pathToFileURL(isolatedLoader).href)});
      ${exerciseDatabase("loadBetterSqlite()")}
    `, directory, { NODE_PATH: managedRuntime(directory) });
    expect(stdout).toContain("native runtime works");
  });

  it("compiles without native resolution and preserves actual runtime NODE_PATH loading", async () => {
    const { directory } = fixture();
    const entry = join(directory, "entry.mjs");
    writeFileSync(entry, 'export { loadBetterSqlite } from "./loader.mjs";\n');
    const { webpack } = require("next/dist/compiled/webpack/webpack");
    const output = join(directory, "output");
    const stats = await new Promise((accept, reject) => {
      const compiler = webpack({
        mode: "production", target: "node", entry,
        optimization: { minimize: false },
        output: { path: output, filename: "loader.cjs", library: { type: "commonjs2" } },
      });
      compiler.run((error, result) => compiler.close(closeError => {
        if (error || closeError) reject(error || closeError);
        else accept(result);
      }));
    });
    expect(stats.hasErrors(), stats.toString({ all: false, errors: true })).toBe(false);
    expect(stats.hasWarnings(), stats.toString({ all: false, warnings: true })).toBe(false);
    const bundle = JSON.stringify(pathToFileURL(join(output, "loader.cjs")).href);
    const missing = evaluate(`
      import assert from 'node:assert/strict';
      const {default: {loadBetterSqlite}} = await import(${bundle});
      assert.throws(loadBetterSqlite, {code: 'MODULE_NOT_FOUND'});
      console.log('bundled optional fallback available');
    `, directory);
    expect(missing).toContain("bundled optional fallback available");
    const installed = evaluate(`
      const {default: {loadBetterSqlite}} = await import(${bundle});
      ${exerciseDatabase("loadBetterSqlite()")}
    `, directory, { NODE_PATH: managedRuntime(directory) });
    expect(installed).toContain("native runtime works");
  }, 15000);

  it("uses the real built-in SQLite fallback after a missing optional package", () => {
    const { directory } = fixture();
    const driver = JSON.stringify(pathToFileURL(resolve(root, "src/lib/db/driver.js")).href);
    const stdout = evaluate(`
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      registerHooks({resolve(specifier, context, next) {
        if (specifier === 'better-sqlite3') {
          const error = new Error('Optional native addon is not installed');
          error.code = 'MODULE_NOT_FOUND';
          throw error;
        }
        return next(specifier, context);
      }});
      const {getAdapter, closeDb} = await import(${driver});
      try {
        const adapter = await getAdapter();
        assert.equal(adapter.driver, 'node:sqlite');
        adapter.exec('CREATE TABLE fallback_probe(value TEXT)');
        adapter.run('INSERT INTO fallback_probe(value) VALUES (?)', ['fallback database works']);
        assert.equal(adapter.get('SELECT value FROM fallback_probe').value, 'fallback database works');
        console.log('fallback database works');
      } finally { await closeDb(); }
    `, directory);
    expect(stdout).toContain("fallback database works");
  });
});
