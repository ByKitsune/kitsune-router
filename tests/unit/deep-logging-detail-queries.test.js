import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

const fixture = vi.hoisted(() => ({ adapter: null }));
vi.mock("@/lib/db/driver.js", () => ({ getAdapter: async () => fixture.adapter }));

let sqlite;
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE requestDetails(id TEXT PRIMARY KEY, timestamp TEXT, provider TEXT, model TEXT, connectionId TEXT, status TEXT, data TEXT)");
  const insert = sqlite.prepare("INSERT INTO requestDetails VALUES(?, ?, ?, ?, ?, ?, ?)");
  for (let i = 0; i < 120; i++) insert.run(`detail-${i}`, "2026-11-17T00:00:00.000Z", "synthetic-provider", "model", "connection", "success", JSON.stringify({ id: `detail-${i}` }));
  fixture.adapter = {
    get: vi.fn((sql, params = []) => sqlite.prepare(sql).get(...params)),
    all: vi.fn((sql, params = []) => sqlite.prepare(sql).all(...params)),
  };
});
afterEach(() => { sqlite.close(); fixture.adapter = null; });

describe("bounded request-detail repository queries", () => {
  it.each([
    { pageSize: -1 }, { pageSize: 1.5 }, { pageSize: 101 }, { pageSize: Infinity },
    { page: 0 }, { page: NaN }, { page: "12garbage" },
    { page: Number.MAX_SAFE_INTEGER, pageSize: 100 },
  ])("rejects unsafe pagination before any database query: %j", async filter => {
    const repo = await import("@/lib/db/repos/requestDetailsRepo.js");
    await expect(repo.getRequestDetails(filter)).rejects.toMatchObject({ code: "INVALID_REQUEST_DETAIL_FILTER" });
    expect(fixture.adapter.all).not.toHaveBeenCalled();
    expect(fixture.adapter.get).not.toHaveBeenCalled();
  });

  it("retains ordinary page behavior and complete count metadata", async () => {
    const repo = await import("@/lib/db/repos/requestDetailsRepo.js");
    const result = await repo.getRequestDetails({ page: 2, pageSize: 50 });
    expect(result.details).toHaveLength(50);
    expect(result.pagination).toEqual({ page: 2, pageSize: 50, totalItems: 120, totalPages: 3, hasNext: true, hasPrev: true });
  });

  it.each([{ startDate: "not a date" }, { endDate: "not a date" }, { startDate: "2026-11-18", endDate: "2026-11-17" }])("rejects malformed or reversed date filters before querying: %j", async filter => {
    const repo = await import("@/lib/db/repos/requestDetailsRepo.js");
    await expect(repo.getRequestDetails(filter)).rejects.toMatchObject({ code: "INVALID_REQUEST_DETAIL_FILTER" });
    expect(fixture.adapter.get).not.toHaveBeenCalled();
  });
});
