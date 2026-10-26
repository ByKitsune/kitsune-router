import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const globals = ["_dbAdapter", "_pendingRequests", "_lastErrorProvider", "_statsEmitter", "_pendingTimers", "_recentRing", "_connectionMapCache", "_statsEmitTimers", "_requestFailureCounts"];
let previous, directory, adapter, usage, buildOnStreamComplete, handleStreamingResponse, createStreamController;
beforeEach(async () => {
  previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) delete globalThis[key];
  directory = await mkdtemp(join(tmpdir(), "zen-sse-native-acceptance-")); vi.stubEnv("DATA_DIR", directory); vi.stubEnv("ENABLE_REQUEST_LOGS", "false"); vi.resetModules();
  usage = await import("@/lib/db/repos/usageRepo.js"); adapter = await (await import("@/lib/db/driver.js")).getAdapter();
  const outbox = usage.initializeUsagePersistence(adapter); outbox.stopped = true; clearTimeout(outbox.timer); outbox.timer = null;
  ({ buildOnStreamComplete, handleStreamingResponse } = await import("../../open-sse/handlers/chatCore/streamingHandler.js"));
  ({ createStreamController } = await import("../../open-sse/utils/streamHandler.js"));
});
afterEach(async () => {
  for (const timer of Object.values(globalThis._pendingTimers || {})) clearTimeout(timer);
  for (const timer of Object.values(globalThis._statsEmitTimers || {})) clearTimeout(timer);
  await adapter?.close();
  for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); await rm(directory, { recursive: true, force: true });
});
it("the actual native terminal is gated by a real outbox insert, not history projection", async () => {
  const entry = { provider: "sse-native-fixture", model: "offline", body: { messages: [] }, requestStartTime: Date.now(), stream: true, sourceFormat: "openai-responses", targetFormat: "openai-responses", usageEventId: "native-attempt-one", usageTimestamp: "2026-10-26T01:00:00.000Z" };
  const callbacks = buildOnStreamComplete(entry);
  const value = { type: "response.completed", response: { id: "resp_native_accept", status: "completed", output: [], usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } } };
  const result = await handleStreamingResponse({ ...entry, ...callbacks, streamController: createStreamController(), providerResponse: new Response(`event: response.completed\ndata: ${JSON.stringify(value)}\n\n`, { headers: { "content-type": "text/event-stream" } }) });
  const reader = result.response.body.getReader(); const first = await reader.read(); expect(new TextDecoder().decode(first.value)).toContain("response.completed");
  expect(await usage.getUsageHistory()).toEqual([]);
  const row = adapter.get("SELECT eventId, payload FROM usageOutbox"); expect(row.eventId).toBe("native-attempt-one"); expect(JSON.parse(row.payload)).toMatchObject({ timestamp: entry.usageTimestamp, tokens: { prompt_tokens: 7, completion_tokens: 3 } });
  await reader.cancel("terminal consumed"); await callbacks.onStreamAborted({ usage: value.response.usage }, "duplicate"); expect(adapter.get("SELECT COUNT(*) AS count FROM usageOutbox").count).toBe(1);
  await usage.flushUsageQueue(); expect(await usage.getUsageHistory()).toHaveLength(1);
});
