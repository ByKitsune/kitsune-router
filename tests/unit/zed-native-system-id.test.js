import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import initSqlJs from "sql.js";
import { execFileSync } from "node:child_process";

let Database = null;
try {
  const NativeDatabase = createRequire(import.meta.url)("better-sqlite3");
  const probe = new NativeDatabase(":memory:");
  probe.close();
  Database = NativeDatabase;
} catch {
  // The native dependency is optional; loading its JS wrapper alone is not
  // enough to establish that its platform-specific binding can open databases.
}
const credentialsUrl = new URL("../../src/lib/oauth/utils/zedCredentials.js", import.meta.url).href;

const fixture = vi.hoisted(() => ({
  home: "",
  SQL: null,
  cliValue: null,
  cliCalls: [],
}));

vi.mock("os", async (importOriginal) => ({
  ...(await importOriginal()),
  homedir: () => fixture.home,
}));

vi.mock("child_process", async (importOriginal) => {
  const execFile = () => {
    throw new Error("Only the promisified sqlite3 fallback is supported in this fixture");
  };
  execFile[Symbol.for("nodejs.util.promisify.custom")] = async (command, args) => {
    fixture.cliCalls.push({ command, args });
    if (fixture.cliValue === null) {
      throw Object.assign(new Error("sqlite3 CLI is unavailable"), { code: "ENOENT" });
    }
    return { stdout: fixture.cliValue, stderr: "" };
  };
  return { ...(await importOriginal()), execFile };
});

import { getZedGlobalDbPaths, readZedSystemId } from "../../src/lib/oauth/utils/zedCredentials.js";

async function createKvStore(path, value, { missingTable = false } = {}) {
  await mkdir(dirname(path), { recursive: true });
  const db = new fixture.SQL.Database();
  try {
    if (!missingTable) {
      db.run("CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT)");
      db.run("INSERT INTO kv_store (key, value) VALUES (?, ?)", ["system_id", value]);
    } else {
      db.run("CREATE TABLE unrelated (value TEXT)");
    }
    await writeFile(path, db.export());
  } finally {
    db.close();
  }
}

describe("Zed native system ID lookup", () => {
  beforeAll(async () => {
    fixture.SQL = await initSqlJs();
  });

  beforeEach(async () => {
    fixture.home = await mkdtemp(join(tmpdir(), "kitsunerouter-zed-native-"));
    fixture.cliCalls = [];
    fixture.cliValue = null;
    vi.stubEnv("LOCALAPPDATA", join(fixture.home, "AppData", "Local"));
    vi.stubEnv("XDG_DATA_HOME", join(fixture.home, ".local", "share"));
  });

  afterEach(async () => {
    await rm(fixture.home, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.skipIf(!Database)("reads the existing native kv_store under ESM without a sqlite3 CLI", async () => {
    const path = getZedGlobalDbPaths()[0];
    await createKvStore(path, "  isolated-native-system-id  ");
    const original = await readFile(path);
    // Vitest can inject CommonJS require into transformed modules, so exercise
    // the public reader in plain Node ESM as well as through the test runner.
    const stdout = execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      `
        import os from "node:os";
        import childProcess from "node:child_process";
        import { syncBuiltinESMExports } from "node:module";
        os.homedir = () => process.env.ZED_TEST_HOME;
        const unavailable = () => { throw new Error("sqlite3 CLI is unavailable"); };
        unavailable[Symbol.for("nodejs.util.promisify.custom")] = async () => {
          throw Object.assign(new Error("sqlite3 CLI is unavailable"), { code: "ENOENT" });
        };
        childProcess.execFile = unavailable;
        syncBuiltinESMExports();
        const { readZedSystemId } = await import(${JSON.stringify(credentialsUrl)});
        console.log(JSON.stringify(await readZedSystemId()));
      `,
    ], {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, ZED_TEST_HOME: fixture.home },
    });
    expect(JSON.parse(stdout.trim())).toBe("isolated-native-system-id");

    expect(await readZedSystemId()).toBe("isolated-native-system-id");
    expect(fixture.cliCalls).toEqual([]);
    const reopened = new Database(path, { readonly: true, fileMustExist: true });
    try {
      expect(reopened.prepare("SELECT value FROM kv_store WHERE key = ?").get("system_id").value)
        .toBe("  isolated-native-system-id  ");
    } finally {
      reopened.close();
    }
    expect(await readFile(path)).toEqual(original);
  });

  it.skipIf(!Database)("closes a native database after a query error and uses the existing CLI fallback", async () => {
    await createKvStore(getZedGlobalDbPaths()[0], null, { missingTable: true });
    const close = vi.spyOn(Database.prototype, "close");
    fixture.cliValue = "  fallback-system-id\n";

    expect(await readZedSystemId()).toBe("fallback-system-id");
    expect(close).toHaveBeenCalledTimes(1);
    expect(fixture.cliCalls.map((call) => call.command)).toEqual(["sqlite3"]);
  });

  it.skipIf(!Database)("tries another channel when native opening fails and the CLI is unavailable", async () => {
    const paths = getZedGlobalDbPaths();
    await mkdir(dirname(paths[0]), { recursive: true });
    await writeFile(paths[0], "not a SQLite database");
    await createKvStore(paths[1], "stable-system-id");

    expect(await readZedSystemId()).toBe("stable-system-id");
  });

  it("uses the CLI fallback when the database cannot be opened natively", async () => {
    const path = getZedGlobalDbPaths()[0];
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "not a SQLite database");
    fixture.cliValue = "  cli-system-id\n";

    expect(await readZedSystemId()).toBe("cli-system-id");
    expect(fixture.cliCalls.map((call) => call.command)).toEqual(["sqlite3"]);
  });
});
