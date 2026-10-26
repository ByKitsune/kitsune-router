import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const globals = [Symbol.for("zenrouter.requestLogQueue"), Symbol.for("zenrouter.db.lifecycle"), "_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
let directory, previous, adapter;

beforeEach(async () => {
  previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) delete globalThis[key];
  directory = await mkdtemp(join(tmpdir(), "zen-request-log-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("ENABLE_REQUEST_LOGS", "true");
  vi.stubEnv("OBSERVABILITY_ENABLED", "true");
  vi.resetModules();
});

afterEach(async () => {
  const queue = globalThis[Symbol.for("zenrouter.requestLogQueue")];
  if (queue) await (await import("open-sse/utils/requestLogger.js")).flushRequestLogs({ deadline: Date.now() + 10_000 });
  await adapter?.close();
  adapter = null;
  for (const timer of Object.values(global._statsEmitTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(global._pendingTimers || {})) clearTimeout(timer);
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

describe("bounded async request logs", () => {
  it("creates no directory on the admission path and flushes redacted metadata through async filesystem I/O", async () => {
    const loggerModule = await import("open-sse/utils/requestLogger.js");
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    const logger = await loggerModule.createRequestLogger("../../source", "target", "../model");
    logger.logTargetRequest("https://user:password@example.invalid/v1/chat?api_key=private", { authorization: "secret", "x-api-key": "secret", accept: "application/json" }, { messages: [{ content: "private prompt" }] });
    logger.appendProviderChunk("secret provider output");
    expect(loggerModule.getRequestLogQueueMetrics()).toMatchObject({ depth: 2, written: 0 });
    const result = await loggerModule.flushRequestLogs();
    expect(result).toMatchObject({ drained: true, depth: 0, errors: 0, written: 2 });
    const data = await readFile(join(logger.sessionPath, "4_req_target.json"), "utf8");
    expect(data).not.toContain("password");
    expect(data).not.toContain("private prompt");
    expect(data).not.toContain("api_key=private");
    expect(JSON.parse(data)).toMatchObject({ url: "https://example.invalid/v1/chat", headers: { authorization: "[REDACTED]", "x-api-key": "[REDACTED]" } });
    expect(await readFile(join(logger.sessionPath, "5_res_provider.txt"), "utf8")).not.toContain("secret provider output");
    if (process.platform !== "win32") expect((await stat(join(logger.sessionPath, "4_req_target.json"))).mode & 0o777).toBe(0o600);
  });

  it("bounds queued count and bytes, counts drops and drains all admitted records", async () => {
    const requestLogs = await import("open-sse/utils/requestLogger.js");
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    const logger = await requestLogs.createRequestLogger("source", "target", "model");
    for (let i = 0; i < 1100; i++) logger.appendConvertedChunk("one chunk");
    const before = requestLogs.getRequestLogQueueMetrics();
    expect(before.depth).toBeLessThanOrEqual(1000);
    expect(before.bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(before.dropped).toBeGreaterThan(0);
    expect(await requestLogs.flushRequestLogs({ deadline: Date.now() + 10_000 })).toMatchObject({ drained: true });
    const after = requestLogs.getRequestLogQueueMetrics();
    expect(after.written).toBe(before.accepted);
  });

  it("projects payloads before detail buffering, retries failed batches and preserves caller objects", async () => {
    const db = await import("@/lib/db/index.js");
    adapter = await (await import("@/lib/db/driver.js")).getAdapter();
    await db.updateSettings({ enableObservability: true, observabilityBatchSize: 20 });
    const detail = { id: "detail", model: "safe-model", request: { authorization: "secret", content: "private" }, tokens: { prompt_tokens: 1 }, response: { text: "secret" } };
    const before = structuredClone(detail);
    await db.saveRequestDetail(detail);
    detail.tokens.prompt_tokens = 999;
    const run = adapter.run.bind(adapter);
    const fault = vi.spyOn(adapter, "run").mockImplementation((sql, params) => {
      if (sql.startsWith("INSERT INTO requestDetails")) throw new Error("simulated disk error");
      return run(sql, params);
    });
    await expect(db.flushRequestDetails()).rejects.toThrow("simulated disk error");
    expect(await db.getRequestDetailQueueMetrics()).toMatchObject({ depth: 1, retries: 1 });
    fault.mockRestore();
    expect(await db.flushRequestDetails()).toMatchObject({ drained: true, written: 1 });
    const stored = await db.getRequestDetailById("detail");
    expect(stored).toMatchObject({ tokens: { prompt_tokens: 1 }, request: { redacted: true }, response: { redacted: true } });
    expect(JSON.stringify(stored)).not.toContain("secret");
    expect(detail.request).toEqual(before.request);
    expect(detail.response).toEqual(before.response);
  });

  it("bounds the detail buffer without fabricating usage rows", async () => {
    const db = await import("@/lib/db/index.js");
    adapter = await (await import("@/lib/db/driver.js")).getAdapter();
    await db.updateSettings({ enableObservability: true, observabilityBatchSize: 50, observabilityFlushIntervalMs: 60_000 });
    for (let i = 0; i < 1100; i++) await db.saveRequestDetail({ id: `detail-${i}`, request: { text: "private" }, tokens: {} });
    expect(await db.getRequestDetailQueueMetrics()).toMatchObject({ depth: 1000, dropped: 100 });
    expect(adapter.get("SELECT COUNT(*) AS n FROM usageHistory").n).toBe(0);
    expect(await db.flushRequestDetails({ deadline: Date.now() + 10_000 })).toMatchObject({ drained: true });
  });

  it("flushes an accumulated small-threshold backlog in one bounded batch", async () => {
    const db = await import("@/lib/db/index.js");
    adapter = await (await import("@/lib/db/driver.js")).getAdapter();
    await db.updateSettings({ enableObservability: true, observabilityBatchSize: 1 });
    await db.saveRequestDetail({ id: "threshold-one" });
    await db.saveRequestDetail({ id: "threshold-two" });
    const transactions = vi.spyOn(adapter, "transaction");
    await db.flushRequestDetails();
    expect(transactions).toHaveBeenCalledTimes(1);
    expect(await db.getRequestDetailQueueMetrics()).toMatchObject({ depth: 0, written: 2 });
    expect(await db.getRequestDetailById("threshold-one")).toMatchObject({ id: "threshold-one" });
    expect(await db.getRequestDetailById("threshold-two")).toMatchObject({ id: "threshold-two" });
  });

  it("lets a managed coordinator own adapter signal exits and refuses a second sql.js owner", async () => {
    const { configureDbLifecycle } = await import("@/lib/db/helpers/adapterLifecycle.js");
    configureDbLifecycle({ managed: true });
    const before = process.listenerCount("SIGTERM");
    const { createSqlJsAdapter } = await import("@/lib/db/adapters/sqljsAdapter.js");
    const file = join(directory, "sqljs.sqlite");
    adapter = await createSqlJsAdapter(file);
    expect(process.listenerCount("SIGTERM")).toBe(before);
    adapter.run("CREATE TABLE durable(id INTEGER PRIMARY KEY)");
    adapter.run("INSERT INTO durable(id) VALUES(1)");
    adapter.flushDurable();
    await expect(createSqlJsAdapter(file)).rejects.toMatchObject({ code: "SQLJS_EXCLUSIVE_OWNER" });
    adapter.close(); adapter = await createSqlJsAdapter(file);
    expect(adapter.get("SELECT COUNT(*) AS n FROM durable").n).toBe(1);
  });
});
