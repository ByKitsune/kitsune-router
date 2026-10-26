import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ execute: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {}, enqueueRequestUsage: io.enqueue, saveRequestUsage: io.enqueue }));
vi.mock("open-sse/executors/index.js", () => ({ getExecutor: () => ({ noAuth: true, execute: io.execute }) }));
vi.mock("open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({ logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logProviderResponse() {}, logConvertedResponse() {}, logError() {} }) }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: async () => { throw new Error("Unexpected network"); } }));

import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { MAX_UPSTREAM_ACCOUNTING_BYTES, MAX_UPSTREAM_ERROR_BYTES, parseUpstreamError } from "open-sse/utils/error.js";
import { calculateCostBreakdown } from "open-sse/providers/pricing.js";
import { hasInvalidUsageCounters } from "open-sse/translator/concerns/usage.js";
import { extractUsageFromResponse } from "open-sse/handlers/chatCore/requestDetail.js";

beforeEach(() => { io.execute.mockReset(); io.enqueue.mockReset().mockImplementation(async entry => ({ accepted: true, eventId: entry.eventId })); });
afterEach(() => { vi.restoreAllMocks(); });

function dispatch(extra = {}) {
  return handleChatCore({ body: { stream: false, messages: [{ role: "user", content: "fixture" }] },
    modelInfo: { provider: "openai", model: "gpt-5.5" }, credentials: { apiKey: "synthetic" }, connectionId: "fixture-account",
    log: { debug() {}, info() {}, warn() {}, error() {}, line() {} }, ...extra });
}
function executorResponse(body, status = 500) {
  return { response: Response.json(body, { status }), url: "http://127.0.0.1/upstream", headers: {}, transformedBody: {} };
}

describe("bounded private HTTP-error accounting", () => {
  it("keeps the public/parser diagnostic limit at 8KiB while reading a separate bounded accounting body", async () => {
    const privateBody = { error: { message: "private-long-diagnostic".repeat(500), details: { privateData: "hidden" } }, usage: { input_tokens: 3, output_tokens: 5 } };
    const observed = vi.fn(); let diagnosticBytes;
    const response = Response.json(privateBody, { status: 500 });
    const parsed = await parseUpstreamError(response, { parseError(_response, text) { diagnosticBytes = Buffer.byteLength(text); return null; } }, observed);
    expect(MAX_UPSTREAM_ERROR_BYTES).toBe(8192); expect(MAX_UPSTREAM_ACCOUNTING_BYTES).toBe(128 * 1024);
    expect(diagnosticBytes).toBeLessThanOrEqual(MAX_UPSTREAM_ERROR_BYTES);
    expect(observed).toHaveBeenCalledExactlyOnceWith({ error: {}, usage: privateBody.usage }, { complete: true, uncertain: false });
    expect(JSON.stringify(observed.mock.calls)).not.toContain("private-long-diagnostic");
    expect(JSON.stringify(parsed)).not.toContain("private-long-diagnostic");
    expect(JSON.stringify(parsed)).not.toContain("privateData");
    expect(response.body.locked).toBe(false);
  });

  it("stops reading after the accounting cap and releases an otherwise endless upstream", async () => {
    let pulls = 0; const cancel = vi.fn();
    const stream = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(4096).fill(120)); }, cancel }, { highWaterMark: 0 });
    const observed = vi.fn();
    await parseUpstreamError(new Response(stream, { status: 500 }), null, observed);
    expect(pulls).toBe(MAX_UPSTREAM_ACCOUNTING_BYTES / 4096);
    expect(observed).toHaveBeenCalledExactlyOnceWith(null, { complete: false, uncertain: true });
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false);
  });

  it("marks a valid-looking capped JSON prefix uncertain and projects only accounting metadata", async () => {
    const text = JSON.stringify({ usage: { input_tokens: 2, output_tokens: 3 }, error: { message: "private" } });
    const prefix = text + " ".repeat(MAX_UPSTREAM_ACCOUNTING_BYTES - Buffer.byteLength(text));
    const observed = vi.fn();
    await parseUpstreamError(new Response(prefix + " trailing data", { status: 500 }), null, observed);
    expect(observed).toHaveBeenCalledExactlyOnceWith({ usage: { input_tokens: 2, output_tokens: 3 }, error: {} }, { complete: false, uncertain: true });
  });

  it("keeps malformed JSON accounting uncertain instead of inferring a free request", async () => {
    const observed = vi.fn();
    await parseUpstreamError(new Response('{"error": {"message":"bad"},"usage":', { status: 500 }), null, observed);
    expect(observed).toHaveBeenCalledExactlyOnceWith(null, { complete: true, uncertain: true });
  });

  it("retains actionable ordinary text errors without manufacturing accounting", async () => {
    const observed = vi.fn();
    const parsed = await parseUpstreamError(new Response("Invalid request: max_tokens must be at least 1", { status: 400 }), null, observed);
    expect(parsed.message).toContain("max_tokens must be at least 1");
    expect(observed).toHaveBeenCalledExactlyOnceWith(null, { complete: true, uncertain: false });
  });

  it.each([
    { input_tokens_details: { cached_tokens: [] } },
    { prompt_tokens_details: { cached_tokens: { privateDetail: "hidden" } } },
    { output_tokens_details: { reasoning_tokens: [] } },
    { completion_tokens_details: { reasoning_tokens: { privateDetail: "hidden" } } },
    { cache_creation: { ephemeral_1h_input_tokens: [] } },
    { input_tokens_details: { cache_write_tokens_details: { ttl_12h_tokens: [] } } },
  ])("keeps nested invalid accounting uncertain through the public parser and pricing: %j", async details => {
    const observed = vi.fn();
    const parsed = await parseUpstreamError(Response.json({
      error: { message: "Invalid request", privateDetail: "hidden" },
      usage: { input_tokens: 5, output_tokens: 2, ...details, usage_invalid: false },
    }, { status: 400 }), null, observed);
    expect(parsed).toMatchObject({ statusCode: 400, message: "Invalid request" });
    const evidence = observed.mock.calls[0][0];
    expect(evidence.usage).toMatchObject({ input_tokens: 5, output_tokens: 2, usage_invalid: true });
    expect(hasInvalidUsageCounters(evidence.usage)).toBe(true);
    const tokens = extractUsageFromResponse(evidence);
    expect(tokens).toMatchObject({ prompt_tokens: 5, completion_tokens: 2, usage_invalid: true });
    expect(calculateCostBreakdown(tokens, { input: 1, output: 2, cached: 0.5 }).totalCost).toBeNull();
    expect(JSON.stringify(observed.mock.calls)).not.toContain("privateDetail");
    expect(JSON.stringify(parsed)).not.toContain("privateDetail");
  });

  it("waits for the first asynchronous cancellation before completing the public parser or releasing its reader", async () => {
    let entered; let finishCleanup;
    const ready = new Promise(resolve => { entered = resolve; });
    const cleanup = new Promise(resolve => { finishCleanup = resolve; });
    const cancel = vi.fn(() => cleanup);
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"error":{"message":"')); },
      pull() { entered(); }, cancel,
    }, { highWaterMark: 0 });
    const abort = new AbortController();
    const observed = vi.fn();
    let settled = false;
    const pending = parseUpstreamError(new Response(stream, { status: 400 }), null, observed, { signal: abort.signal })
      .finally(() => { settled = true; });
    try {
      await ready;
      abort.abort(new Error("caller left during diagnostic"));
      await new Promise(resolve => setImmediate(resolve));
      expect(cancel).toHaveBeenCalledExactlyOnceWith(abort.signal.reason);
      expect(settled).toBe(false);
      expect(observed).not.toHaveBeenCalled();
      expect(stream.locked).toBe(true);
    } finally { finishCleanup(); await pending; }
    expect(stream.locked).toBe(false);
    expect(observed).toHaveBeenCalledExactlyOnceWith(null, { complete: true, uncertain: true });
  });
});

describe("HTTP-error delivered tier provenance", () => {
  it.each(["priority", "default", "auto", "future-premium"])("freezes the delivered %s tier from the error body before acceptance", async tier => {
    const responseBody = { error: { message: "Invalid request" }, service_tier: tier,
      usage: { input_tokens: 3, output_tokens: 5, input_tokens_details: { cached_tokens: 1 } } };
    io.execute.mockResolvedValueOnce(executorResponse(responseBody, 400));
    const result = await dispatch(); expect(result.status).toBe(400);
    expect(io.enqueue).toHaveBeenCalledOnce();
    const entry = io.enqueue.mock.calls[0][0];
    expect(entry.tokens).toMatchObject({ prompt_tokens: 3, completion_tokens: 5, cached_tokens: 1, actualServiceTier: tier,
      serviceTierCostStatus: tier === "default" ? "standard" : tier === "auto" ? "unconfirmed" : "unpriced" });
    const cost = calculateCostBreakdown(entry.tokens, { input: 1, output: 2, cached: 0.5 });
    if (tier === "default") expect(cost.totalCost).toBeGreaterThan(0);
    else expect(cost.totalCost).toBeNull();
  });

  it("retains nested delivered tier independently of the requested standard selection", async () => {
    io.execute.mockResolvedValueOnce(executorResponse({ error: { message: "Invalid request" }, response: { service_tier: "priority", usage: { input_tokens: 2, output_tokens: 3 } } }, 400));
    const result = await dispatch({ body: { service_tier: "default", stream: false, messages: [{ role: "user", content: "fixture" }] } });
    expect(result.status).toBe(400);
    expect(io.enqueue.mock.calls[0][0].tokens).toMatchObject({ requestedServiceTier: "default", actualServiceTier: "priority", serviceTierCostStatus: "unpriced" });
  });
});
