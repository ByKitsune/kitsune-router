import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("native server warning boundary", () => {
  it("keeps Node's warning functions intact when the CommonJS wrapper loads", () => {
    const directory = mkdtempSync(join(tmpdir(), "kitsune-native-server-warnings-"));
    directories.push(directory);
    const server = join(directory, "custom-server.js");
    mkdirSync(join(directory, "cli/hooks"), { recursive: true });
    for (const file of ["custom-server.js", "shutdown-lifecycle.cjs", "cli/hooks/dataDirectory.js"]) {
      copyFileSync(new URL(`../../${file}`, import.meta.url), join(directory, file));
    }
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { createRequire } from "node:module";
      const originalEmit = process.emit;
      const originalEmitWarning = process.emitWarning;
      createRequire(import.meta.url)(${JSON.stringify(server)});
      console.log(JSON.stringify({
        emitUnchanged: process.emit === originalEmit,
        emitWarningUnchanged: process.emitWarning === originalEmitWarning,
      }));
    `], {
      cwd: directory,
      env: {
        PATH: process.env.PATH, HOME: directory, DATA_DIR: join(directory, "state"),
        KITSUNE_ROUTER_MIGRATION: "skip",
      },
      encoding: "utf8",
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ emitUnchanged: true, emitWarningUnchanged: true });
  });
});

describe("native database module boundary", () => {
  it("loads explicit ESM database paths and the CommonJS launcher resolver without reparsing warnings", () => {
    const directory = mkdtempSync(join(tmpdir(), "kitsune-native-db-modules-"));
    directories.push(directory);
    const paths = new URL("../../src/lib/db/paths.js", import.meta.url).href;
    const resolver = new URL("../../cli/hooks/dataDirectory.js", import.meta.url).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { createRequire } from "node:module";
      import { fileURLToPath } from "node:url";
      const resolver = createRequire(import.meta.url)(fileURLToPath(${JSON.stringify(resolver)}));
      const paths = await import(${JSON.stringify(paths)});
      console.log(JSON.stringify({
        dataDirectory: resolver.resolveDataDirectory(),
        database: paths.DATA_FILE,
        initializer: typeof paths.ensureDirs,
      }));
    `], {
      cwd: directory,
      env: {
        PATH: process.env.PATH, HOME: directory, DATA_DIR: join(directory, "state"),
        KITSUNE_ROUTER_MIGRATION: "skip",
      },
      encoding: "utf8",
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      dataDirectory: join(directory, "state"),
      database: join(directory, "state", "db", "data.sqlite"),
      initializer: "function",
    });
  });

  it("opens and closes native SQLite without replacing the process warning/event emitter", () => {
    const directory = mkdtempSync(join(tmpdir(), "kitsune-native-db-emitter-"));
    directories.push(directory);
    const adapter = new URL("../../src/lib/db/adapters/nodeSqliteAdapter.js", import.meta.url).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      const originalEmit = process.emit;
      const { createNodeSqliteAdapter } = await import(${JSON.stringify(adapter)});
      const adapter = await createNodeSqliteAdapter(":memory:");
      adapter.exec("CREATE TABLE fixture (value TEXT)");
      adapter.run("INSERT INTO fixture VALUES (?)", ["synthetic-only"]);
      const row = adapter.get("SELECT value FROM fixture");
      const unchangedWhileOpen = process.emit === originalEmit;
      adapter.close();
      console.log(JSON.stringify({ row, unchangedWhileOpen, unchangedAfterClose: process.emit === originalEmit }));
    `], {
      cwd: directory,
      env: { PATH: process.env.PATH, HOME: directory },
      encoding: "utf8",
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      row: { value: "synthetic-only" }, unchangedWhileOpen: true, unchangedAfterClose: true,
    });
  });
});
