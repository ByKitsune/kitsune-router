import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSqlJsAdapter } from "@/lib/db/adapters/sqljsAdapter.js";

const SQLITE_MAGIC = "SQLite format 3\0";

describe("sql.js atomic persist", () => {
  let tmpDir;
  let dbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqljs-atomic-"));
    dbPath = path.join(tmpDir, "test.sqlite");
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates a valid SQLite file upon initial persist", async () => {
    const adapter = await createSqlJsAdapter(dbPath);
    adapter.run("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
    adapter.run("INSERT INTO test (value) VALUES (?)", ["hello"]);

    // Give debounce timer time to fire
    await new Promise((r) => setTimeout(r, 200));

    expect(fs.existsSync(dbPath)).toBe(true);
    const content = fs.readFileSync(dbPath);
    expect(content.toString("utf8", 0, 16)).toBe(SQLITE_MAGIC);
    adapter.close();
  });
});
