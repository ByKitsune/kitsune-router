import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeSqliteAdapter } from "@/lib/db/adapters/nodeSqliteAdapter.js";
import { createBetterSqliteAdapter } from "@/lib/db/adapters/betterSqliteAdapter.js";
import { createBunSqliteAdapter } from "@/lib/db/adapters/bunSqliteAdapter.js";
import { createSqlJsAdapter } from "@/lib/db/adapters/sqljsAdapter.js";

const fixtures = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const { adapter, directory } of fixtures.splice(0)) {
    try { adapter.close(); } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});

async function open(factory) {
  const directory = mkdtempSync(join(tmpdir(), "kitsune-adapter-stability-"));
  try {
    const adapter = await factory(join(directory, "data.sqlite"));
    fixtures.push({ adapter, directory });
    adapter.exec("CREATE TABLE ledger (value TEXT NOT NULL)");
    return adapter;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

describe.each([
  ["node:sqlite", createNodeSqliteAdapter],
  ["better-sqlite3", createBetterSqliteAdapter],
  ["sql.js", createSqlJsAdapter],
  ...(process.versions.bun ? [["bun:sqlite", createBunSqliteAdapter]] : []),
])("%s synchronous transaction contract", (_name, factory) => {
  it("rolls back writes when a transaction callback returns a promise", async () => {
    const adapter = await open(factory);
    expect(() => adapter.transaction(() => {
      adapter.run("INSERT INTO ledger(value) VALUES (?)", ["must roll back"]);
      return Promise.resolve("unsupported asynchronous result");
    })).toThrow(/transaction function cannot return a promise/i);
    expect(adapter.all("SELECT value FROM ledger")).toEqual([]);

    expect(adapter.transaction(() => {
      adapter.run("INSERT INTO ledger(value) VALUES (?)", ["committed"]);
      return "synchronous result";
    })).toBe("synchronous result");
    expect(adapter.all("SELECT value FROM ledger")).toEqual([{ value: "committed" }]);
  });

  it("rolls back an unsupported nested thenable without aborting the outer transaction", async () => {
    const adapter = await open(factory);
    const then = vi.fn();
    adapter.transaction(() => {
      adapter.run("INSERT INTO ledger(value) VALUES (?)", ["before"]);
      expect(() => adapter.transaction(() => {
        adapter.run("INSERT INTO ledger(value) VALUES (?)", ["must roll back"]);
        return { then };
      })).toThrow(/transaction function cannot return a promise/i);
      adapter.run("INSERT INTO ledger(value) VALUES (?)", ["after"]);
    });
    expect(then).not.toHaveBeenCalled();
    expect(adapter.all("SELECT value FROM ledger ORDER BY rowid")).toEqual([
      { value: "before" }, { value: "after" },
    ]);
  });
});

describe.each([
  ["node:sqlite", createNodeSqliteAdapter],
  ["better-sqlite3", createBetterSqliteAdapter],
])("%s prepared statement retention", (_name, factory) => {
  it("reuses hot queries and evicts old templates during a long-running workload", async () => {
    const adapter = await open(factory);
    const prepare = vi.spyOn(adapter.raw, "prepare");
    const cold = "SELECT ? AS value /* cold query */";
    const hot = "SELECT ? AS value /* hot query */";
    expect(adapter.get(cold, ["original"])).toEqual({ value: "original" });
    for (let index = 0; index < 512; index++) {
      expect(adapter.get(hot, [index])).toEqual({ value: index });
      expect(adapter.get(`SELECT ? AS value /* variable template ${index} */`, [index])).toEqual({ value: index });
    }
    expect(adapter.get(cold, ["reloaded"])).toEqual({ value: "reloaded" });
    expect(prepare.mock.calls.filter(([sql]) => sql === hot)).toHaveLength(1);
    expect(prepare.mock.calls.filter(([sql]) => sql === cold)).toHaveLength(2);
  });
});
