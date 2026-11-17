import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const io = vi.hoisted(() => ({ open: null }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal();
  io.open = vi.fn(actual.open);
  return { ...actual, open: io.open };
});

const queueKey = Symbol.for("kitsunerouter.requestLogQueue");
let directory, previous;

beforeEach(async () => {
  previous = Object.getOwnPropertyDescriptor(globalThis, queueKey);
  delete globalThis[queueKey];
  directory = await mkdtemp(join(tmpdir(), "kitsune-deep-file-logs-"));
  await mkdir(join(directory, "state"));
  await mkdir(join(directory, "bundle"));
  vi.stubEnv("DATA_DIR", join(directory, "state"));
  vi.stubEnv("ENABLE_REQUEST_LOGS", "true");
  vi.spyOn(process, "cwd").mockReturnValue(join(directory, "bundle"));
  vi.resetModules();
  io.open.mockClear();
});
afterEach(async () => {
  const logs = await import("open-sse/utils/requestLogger.js");
  await logs.flushRequestLogs({ deadline: Date.now() + 10_000, stop: true });
  if (previous) Object.defineProperty(globalThis, queueKey, previous);
  else delete globalThis[queueKey];
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("bounded private request-log output", () => {
  it("writes metadata inside the authoritative DATA_DIR, not the installed bundle directory", async () => {
    const logs = await import("open-sse/utils/requestLogger.js");
    const logger = await logs.createRequestLogger("openai", "claude", "model");
    expect(logger.sessionPath).toMatch(new RegExp(`^${join(directory, "state", "logs")}`));
    logger.logTargetRequest("https://example.invalid/v1/chat", {}, { messages: ["private prompt"] });
    expect(await logs.flushRequestLogs()).toMatchObject({ drained: true, errors: 0 });
    expect(await readdir(join(directory, "bundle"))).toEqual([]);
    const file = join(logger.sessionPath, "4_req_target.json");
    expect(await readFile(file, "utf8")).not.toContain("private prompt");
    if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("bounds metadata appended by a long-lived stream without deleting existing logs", async () => {
    const logs = await import("open-sse/utils/requestLogger.js");
    const logger = await logs.createRequestLogger("openai", "claude", "model");
    for (let batch = 0; batch < 10; batch++) {
      for (let chunk = 0; chunk < 700; chunk++) logger.appendConvertedChunk("generated content".repeat(16));
      expect(await logs.flushRequestLogs()).toMatchObject({ drained: true });
    }
    const file = join(logger.sessionPath, "7_res_client.txt");
    expect((await stat(file)).size).toBeLessThanOrEqual(64 * 1024);
    expect((await stat(file)).size).toBeGreaterThan(0);
    expect(logs.getRequestLogQueueMetrics().dropped).toBeGreaterThan(0);
    expect(await readFile(file, "utf8")).not.toContain("generated content");
  });

  it("masks credential headers beyond OAuth token/API-key names", async () => {
    const logs = await import("open-sse/utils/requestLogger.js");
    const result = logs.maskSensitiveHeaders({ password: "synthetic-password-canary", "x-auth": "synthetic-auth-canary", "x-session-id": "synthetic-session-canary", accept: "application/json" });
    expect(result).toEqual({ password: "[REDACTED]", "x-auth": "[REDACTED]", "x-session-id": "[REDACTED]", accept: "application/json" });
  });

  it("records UTF-8 byte sizes accurately without retaining content", async () => {
    const logs = await import("open-sse/utils/requestLogger.js");
    expect(logs.safePayloadMetadata("界😀")).toEqual({ present: true, type: "bytes", size: 7 });
    const logger = await logs.createRequestLogger("openai", "claude", "model");
    logger.appendProviderChunk("界😀");
    await logs.flushRequestLogs();
    expect(JSON.parse((await readFile(join(logger.sessionPath, "5_res_provider.txt"), "utf8")).trim())).toEqual({ size: 7 });
  });

  it("coalesces queued metadata writes while retaining every admitted chunk record", async () => {
    const logs = await import("open-sse/utils/requestLogger.js");
    const logger = await logs.createRequestLogger("openai", "claude", "model");
    for (let index = 0; index < 1000; index++) logger.appendProviderChunk("text");
    expect(await logs.flushRequestLogs()).toMatchObject({ drained: true, written: 1000, dropped: 0 });
    const records = (await readFile(join(logger.sessionPath, "5_res_provider.txt"), "utf8")).trim().split("\n");
    expect(records).toHaveLength(1000);
    expect(records.every(line => JSON.parse(line).size === 4)).toBe(true);
    expect(io.open.mock.calls.length).toBeLessThanOrEqual(25);
  });

  it.skipIf(process.platform === "win32")("refuses a symbolic-link log directory instead of writing outside private state", async () => {
    const outside = join(directory, "outside");
    await mkdir(outside);
    await symlink(outside, join(directory, "state", "logs"), "dir");
    vi.mocked(process.cwd).mockReturnValue(join(directory, "state"));
    const logs = await import("open-sse/utils/requestLogger.js");
    const logger = await logs.createRequestLogger("openai", "claude", "model");
    logger.logRawRequest({ private: "not retained" });
    expect(await logs.flushRequestLogs()).toMatchObject({ drained: true, errors: 1, dropped: 1 });
    expect(await readdir(outside)).toEqual([]);
  });
});
