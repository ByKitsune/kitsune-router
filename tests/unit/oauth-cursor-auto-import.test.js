import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fsPromises from "fs/promises";

// Mock next/server
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status || 200,
      body,
      json: async () => body,
    })),
  },
}));

// Mock os
vi.mock("os", () => ({
  default: { homedir: vi.fn(() => "/mock/home") },
  homedir: vi.fn(() => "/mock/home"),
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
  access: vi.fn(),
  constants: { R_OK: 4 },
}));

// Mock child_process.execFile (promisified inside the route) — controls the
// sqlite3-CLI fallback strategy and the linux `which cursor` install probe.
const execFileMock = vi.hoisted(() =>
  vi.fn((cmd, args, opts, cb) => cb(new Error("sqlite3: command not found"), ""))
);

vi.mock("child_process", () => ({
  execFile: (...args) => execFileMock(...args),
}));

// Shared mock better-sqlite3 instance — prepare().get(key) mirrors the real
// single-row query contract used by the route.
const mockDbInstance = {
  prepare: vi.fn(),
  close: vi.fn(),
  __throwOnConstruct: false,
};

vi.mock("../../src/lib/db/helpers/optionalNativeSqlite.js", () => ({
  loadBetterSqlite: () => class MockDatabase {
    constructor() {
      if (mockDbInstance.__throwOnConstruct) {
        throw new Error("SQLITE_CANTOPEN");
      }
      return mockDbInstance;
    }
  },
}));

let GET;

describe("GET /api/oauth/cursor/auto-import", () => {
  const originalPlatform = process.platform;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbInstance.__throwOnConstruct = false;
    mockDbInstance.prepare.mockReset();
    mockDbInstance.close.mockReset();
    execFileMock.mockImplementation((cmd, args, opts, cb) =>
      cb(new Error(`${cmd}: command not found`))
    );
    // Force darwin so macOS-specific logic is exercised by default
    Object.defineProperty(process, "platform", { value: "darwin", writable: true });
    const mod = await import("../../src/app/api/oauth/cursor/auto-import/route.js");
    GET = mod.GET;
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  /** Wire the mocked db to answer per-key lookups from a map. */
  const seedDb = (rows) => {
    mockDbInstance.prepare.mockImplementation(() => ({
      get: vi.fn((key) => (key in rows ? { value: rows[key] } : undefined)),
    }));
  };

  // ── Path probing ──────────────────────────────────────────────────────

  it("returns not-found listing checked locations when no db path is accessible", async () => {
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.error).toContain("Cursor database not found");
    expect(response.body.error.replace(/\\/g, "/")).toContain(
      "/mock/home/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
    );
  });

  it("reports manual-import payload when the db exists but every strategy fails", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    mockDbInstance.__throwOnConstruct = true; // better-sqlite3 strategy fails
    // execFileMock already rejects → sqlite3 CLI strategy fails

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.windowsManual).toBe(true);
    expect(response.body.dbPath).toContain("state.vscdb");
  });

  // ── Token extraction (better-sqlite3 strategy) ────────────────────────

  it("extracts tokens using exact keys", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    seedDb({
      "cursorAuth/accessToken": "test-token",
      "storage.serviceMachineId": "test-machine-id",
    });

    const response = await GET();

    expect(response.body.found).toBe(true);
    expect(response.body.accessToken).toBe("test-token");
    expect(response.body.machineId).toBe("test-machine-id");
    expect(mockDbInstance.close).toHaveBeenCalled();
  });

  it("unwraps JSON-encoded string values", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    seedDb({
      "cursorAuth/accessToken": '"json-token"',
      "storage.serviceMachineId": '"json-machine-id"',
    });

    const response = await GET();

    expect(response.body.found).toBe(true);
    expect(response.body.accessToken).toBe("json-token");
    expect(response.body.machineId).toBe("json-machine-id");
  });

  it("falls back to alternate key names before giving up", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    seedDb({
      "cursorAuth/token": "alt-token",
      "telemetry.machineId": "alt-machine",
    });

    const response = await GET();

    expect(response.body.found).toBe(true);
    expect(response.body.accessToken).toBe("alt-token");
    expect(response.body.machineId).toBe("alt-machine");
  });

  it("falls through to the CLI strategy when better-sqlite3 yields nothing", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    mockDbInstance.prepare.mockImplementation(() => ({
      get: vi.fn(() => undefined),
    }));
    // sqlite3 CLI answers with raw values for any key query
    execFileMock.mockImplementation((cmd, args, opts, cb) => {
      if (cmd !== "sqlite3") return cb(new Error("not installed"));
      const sql = args[1] || "";
      if (sql.includes("cursorAuth/accessToken")) {
        return cb(null, { stdout: "cli-token\n" });
      }
      if (sql.includes("storage.serviceMachineId")) {
        return cb(null, { stdout: "cli-machine\n" });
      }
      return cb(null, { stdout: "" });
    });

    const response = await GET();

    expect(response.body.found).toBe(true);
    expect(response.body.accessToken).toBe("cli-token");
    expect(response.body.machineId).toBe("cli-machine");
  });

  it("closes the native database before falling back after a query error", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    mockDbInstance.prepare.mockImplementation(() => { throw new Error("SQLITE_CORRUPT"); });
    execFileMock.mockImplementation((cmd, args, opts, cb) => {
      expect(mockDbInstance.close).toHaveBeenCalledOnce();
      if (cmd !== "sqlite3") return cb(new Error("not installed"));
      return cb(null, { stdout: args[1].includes("cursorAuth/accessToken") ? "cli-token\n" : "cli-machine\n" });
    });
    const response = await GET();
    expect(response.body).toMatchObject({ found: true, accessToken: "cli-token", machineId: "cli-machine" });
    expect(mockDbInstance.close).toHaveBeenCalledOnce();
  });

  // ── Linux install gate ────────────────────────────────────────────────

  it("linux skips auto-import when Cursor IDE is not installed", async () => {
    Object.defineProperty(process, "platform", { value: "linux", writable: true });
    vi.mocked(fsPromises.access).mockResolvedValue(); // config db exists…
    execFileMock.mockImplementation((cmd, args, opts, cb) => {
      if (cmd === "which") return cb(new Error("not found")); // …but no binary
      return cb(new Error("unused"));
    });
    // Desktop-file probe also fails
    vi.mocked(fsPromises.access)
      .mockResolvedValueOnce() // first candidate db readable
      .mockRejectedValue(new Error("ENOENT"));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.body.found).toBe(false);
    expect(response.body.error).toContain("does not appear to be installed");
  });
});
