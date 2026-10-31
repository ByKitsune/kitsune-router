import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSqlJsAdapter } from "../../src/lib/db/adapters/sqljsAdapter.js";

const directories = [];
const adapters = [];
async function open(file) {
  const adapter = await createSqlJsAdapter(file);
  adapters.push(adapter);
  return adapter;
}
function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-sqljs-export-"));
  directories.push(directory);
  return path.join(directory, "synthetic.sqlite");
}
afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.close();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("sql.js upgraded export contract at the real adapter", () => {
  it("persists main data without losing cursors, callbacks, PRAGMAs or temporary state", async () => {
    const file = temporaryDatabase();
    const adapter = await open(file);
    adapter.exec("CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
    adapter.run("INSERT INTO records(value) VALUES (?)", ["before\0after"]);
    adapter.run("INSERT INTO records(value) VALUES (?)", ["second"]);
    adapter.raw.create_function("synthetic_label", value => `checked:${value}`);
    adapter.raw.exec("CREATE TEMP TABLE runtime_only(value TEXT); INSERT INTO runtime_only VALUES ('temporary')");
    adapter.raw.exec("PRAGMA cache_size=-512");
    const cursor = adapter.raw.prepare("SELECT value FROM records ORDER BY id");
    try {
      expect(cursor.step()).toBe(true);
      expect(cursor.getAsObject()).toEqual({ value: "before\0after" });
      const changed = adapter.raw.getRowsModified();
      adapter.flushDurable();
      expect(adapter.get("SELECT synthetic_label(?) AS value", ["kept"])).toEqual({ value: "checked:kept" });
      expect(adapter.get("SELECT value FROM runtime_only")).toEqual({ value: "temporary" });
      expect(adapter.get("PRAGMA cache_size")).toEqual({ cache_size: -512 });
      expect(adapter.raw.getRowsModified()).toBe(changed);
      expect(cursor.step()).toBe(true);
      expect(cursor.getAsObject()).toEqual({ value: "second" });
    } finally { cursor.free(); }
    adapter.close();
    const reopened = await open(file);
    expect(reopened.all("SELECT value FROM records ORDER BY id")).toEqual([{ value: "before\0after" }, { value: "second" }]);
    expect(reopened.get("SELECT name FROM sqlite_master WHERE name='runtime_only'")).toBeUndefined();
  });

  it("rejects persistence inside a write transaction without rolling it back or replacing the saved file", async () => {
    const file = temporaryDatabase();
    const adapter = await open(file);
    adapter.exec("CREATE TABLE records (value TEXT NOT NULL)");
    adapter.flushDurable();
    const original = fs.readFileSync(file);
    adapter.raw.exec("BEGIN");
    try {
      adapter.run("INSERT INTO records VALUES (?)", ["uncommitted"]);
      expect(() => adapter.flushDurable()).toThrow(/write transaction/i);
      expect(fs.readFileSync(file)).toEqual(original);
      expect(adapter.all("SELECT value FROM records")).toEqual([{ value: "uncommitted" }]);
    } finally { adapter.raw.exec("ROLLBACK"); }
    adapter.flushDurable();
    adapter.close();
    expect((await open(file)).all("SELECT value FROM records")).toEqual([]);
  });
});
