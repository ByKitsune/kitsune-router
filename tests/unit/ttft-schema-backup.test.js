import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let dataDir;
let previousAdapter;
let previousListeners;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "zenrouter-ttft-schema-"));
  vi.stubEnv("DATA_DIR", dataDir);
  previousAdapter = Object.getOwnPropertyDescriptor(global, "_dbAdapter");
  previousListeners = new Map(shutdownEvents.map((event) => [event, process.rawListeners(event)]));
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(async () => {
  try {
    await global._dbAdapter?.instance?.close();
  } finally {
    for (const event of shutdownEvents) {
      const existing = [...previousListeners.get(event)];
      for (const listener of process.rawListeners(event)) {
        const index = existing.indexOf(listener);
        if (index === -1) process.removeListener(event, listener);
        else existing.splice(index, 1);
      }
    }
    if (previousAdapter) Object.defineProperty(global, "_dbAdapter", previousAdapter);
    else delete global._dbAdapter;
    vi.unstubAllEnvs();
    vi.resetModules();
    const resolved = await realpath(dataDir);
    if (dirname(resolved) !== await realpath(tmpdir()) || !resolved.includes("zenrouter-ttft-schema-")) {
      throw new Error(`Refusing to remove unexpected fixture directory: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

describe("TTFT schema safety backup", () => {
  it("backs up the v0.9.9 schema before adding nullable latency columns", async () => {
    const { TABLES, buildCreateTableSql, SCHEMA_VERSION } = await import("@/lib/db/schema.js");
    const { latestVersion } = await import("@/lib/db/migrations/index.js");
    const dbDir = join(dataDir, "db");
    await mkdir(dbDir, { recursive: true });
    const fixture = new DatabaseSync(join(dbDir, "data.sqlite"));
    try {
      for (const [name, definition] of Object.entries(TABLES)) {
        const columns = { ...definition.columns };
        if (name === "usageHistory") {
          delete columns.ttftMs;
          delete columns.totalMs;
        }
        fixture.exec(buildCreateTableSql(name, { ...definition, columns }));
        for (const index of definition.indexes || []) fixture.exec(index);
      }
      fixture.exec("INSERT INTO _meta(key, value) VALUES ('schemaVersion', '1'), ('backupSchemaVersion', '1'), ('appVersion', '0.9.9')");
      fixture.prepare("INSERT INTO settings(id, data) VALUES (1, ?)").run('{"fixture":"preserved"}');
      fixture.prepare("INSERT INTO usageHistory(timestamp, provider, model, tokens) VALUES (?, ?, ?, ?)")
        .run("2026-10-15T10:00:00.000Z", "fixture", "older-model", '{"prompt_tokens":10,"completion_tokens":2}');
    } finally {
      fixture.close();
    }

    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    const backupRoot = join(dbDir, "backups");
    const backupDirectories = await readdir(backupRoot);

    expect(backupDirectories).toHaveLength(1);
    const backup = new DatabaseSync(join(backupRoot, backupDirectories[0], "data.sqlite"), { readOnly: true });
    try {
      const backupColumns = backup.prepare("PRAGMA table_info(usageHistory)").all().map((column) => column.name);
      expect(backupColumns).not.toContain("ttftMs");
      expect(backupColumns).not.toContain("totalMs");
      expect(backup.prepare("SELECT data FROM settings WHERE id = 1").get().data).toBe('{"fixture":"preserved"}');
      expect(backup.prepare("SELECT COUNT(*) AS n FROM usageHistory").get().n).toBe(1);
      expect(backup.prepare("SELECT timestamp, provider, model, tokens FROM usageHistory").get()).toMatchObject({
        timestamp: "2026-10-15T10:00:00.000Z", provider: "fixture", model: "older-model", tokens: '{"prompt_tokens":10,"completion_tokens":2}',
      });
      expect(backup.prepare("SELECT value FROM _meta WHERE key = 'appVersion'").get().value).toBe("0.9.9");
      expect(backup.prepare("SELECT value FROM _meta WHERE key = 'schemaVersion'").get().value).toBe("1");
      expect(backup.prepare("SELECT value FROM _meta WHERE key = 'backupSchemaVersion'").get().value).toBe("1");
    } finally {
      backup.close();
    }
    expect(db.all("PRAGMA table_info(usageHistory)").map((column) => column.name))
      .toEqual(expect.arrayContaining(["ttftMs", "totalMs"]));
    expect(db.get("SELECT ttftMs, totalMs FROM usageHistory")).toMatchObject({ ttftMs: null, totalMs: null });
    expect(db.get("SELECT value FROM _meta WHERE key = 'backupSchemaVersion'").value).toBe(String(SCHEMA_VERSION));
    expect(db.get("SELECT value FROM _meta WHERE key = 'schemaVersion'").value).toBe(String(latestVersion()));

    db.close();
    delete global._dbAdapter;
    vi.resetModules();
    const { getAdapter: reopen } = await import("@/lib/db/driver.js");
    const reopened = await reopen();
    expect(await readdir(backupRoot)).toEqual(backupDirectories);
    expect(reopened.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(1);
    expect(reopened.get("SELECT value FROM _meta WHERE key = 'schemaVersion'").value).toBe(String(latestVersion()));
    expect(reopened.get("SELECT value FROM _meta WHERE key = 'backupSchemaVersion'").value).toBe(String(SCHEMA_VERSION));
  });
});
