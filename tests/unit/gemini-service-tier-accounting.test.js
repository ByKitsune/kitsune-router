import { beforeEach, describe, expect, it, vi } from "vitest";
import "../translator/registerAll.js";

const upstream = vi.hoisted(() => vi.fn());
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: upstream }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
  appendProviderChunk() {}, appendConvertedChunk() {}, flush() {},
}) }));

import { enqueueRequestUsage, saveRequestDetail } from "@/lib/usageDb.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getGeminiServiceTierSelection, getServiceTierAccounting } from "../../open-sse/providers/serviceTiers.js";

const model = "gemini-4-hydrogen";
const usageMetadata = {
  promptTokenCount: 100000, candidatesTokenCount: 10000, totalTokenCount: 110000,
  cachedContentTokenCount: 20000,
};
const quote = () => getPricingForModel("gemini", model, { timestamp: "2026-11-17T12:00:00Z" });

beforeEach(() => vi.clearAllMocks());

async function dispatch({ stream, requested, header, misleadingBodyTier, status = 200 }) {
  const headers = new Headers({ "content-type": stream ? "text/event-stream" : "application/json" });
  if (header != null) headers.set("x-gemini-service-tier", header);
  const reply = {
    candidates: [{ content: { role: "model", parts: [{ text: "Gemini answer" }] }, finishReason: "STOP", index: 0 }],
    usageMetadata,
    ...(misleadingBodyTier && { service_tier: misleadingBodyTier }),
    ...(status !== 200 && { error: { code: status, message: "fixture request failed", status: "INVALID_ARGUMENT" } }),
  };
  upstream.mockResolvedValueOnce(new Response(stream ? `data: ${JSON.stringify(reply)}\n\n` : JSON.stringify(reply), { headers, status }));

  const body = {
    contents: [{ role: "user", parts: [{ text: "Explain a concept." }] }], stream,
    ...(requested != null && { service_tier: requested }),
  };
  const method = stream ? "streamGenerateContent" : "generateContent";
  const result = await handleChatCore({
    modelInfo: { provider: "gemini", model }, body, credentials: { apiKey: "offline-gemini-fixture" },
    connectionId: "gemini-offline-tier", sourceFormatOverride: "gemini",
    clientRawRequest: { endpoint: `/${model}:${method}`, headers: {} },
    log: { debug() {}, info() {}, warn() {} },
  });
  expect(upstream).toHaveBeenCalledTimes(1);
  const [url, init] = upstream.mock.calls[0];
  expect(new URL(url).hostname).toBe("generativelanguage.googleapis.com");
  expect(new URL(url).pathname).toBe(`/v1beta/models/${model}:${method}`);
  expect(JSON.parse(init.body).service_tier).toBe(requested ?? undefined);
  expect(result.success).toBe(status === 200);
  await expect(result.response.text()).resolves.toContain(status === 200 ? "Gemini answer" : "fixture request failed");
  expect(enqueueRequestUsage).toHaveBeenCalledTimes(1);
  return enqueueRequestUsage.mock.calls[0][0].tokens;
}

describe.each([false, true])("Gemini GenerateContent tier accounting (stream=%s)", stream => {
  it.each([
    ["priority", "priority", "priority", "unpriced", 0.3537],
    ["priority", "standard", "default", "standard", 0.1965],
    ["flex", "flex", "flex", "unpriced", 0.09825],
    ["priority", null, null, "unconfirmed", null],
    ["flex", null, null, "unconfirmed", null],
    [null, "future-unknown-tier", null, "unconfirmed", null],
    [null, null, null, "standard-estimate", 0.1965],
  ])("prices requested %s and delivered header %s from actual evidence", async (requested, header, actual, status, expectedCost) => {
    const tokens = await dispatch({ stream, requested, header, misleadingBodyTier: "ultrafast" });
    const expected = { requestedServiceTier: requested, actualServiceTier: actual, serviceTierCostStatus: status };
    expect(tokens).toMatchObject({ prompt_tokens: 100000, completion_tokens: 10000, cached_tokens: 20000, ...expected });
    expect(saveRequestDetail.mock.calls.at(-1)[0]).toMatchObject(expected);
    const cost = calculateCostFromTokens(tokens, quote());
    if (expectedCost === null) expect(cost).toBeNull();
    else expect(cost).toBeCloseTo(expectedCost, 12);
  });
});

it("keeps confirmed Gemini delivery on HTTP errors with incurred usage", async () => {
  const tokens = await dispatch({ stream: false, requested: "priority", header: "standard", status: 400 });
  expect(tokens).toMatchObject({ requestedServiceTier: "priority", actualServiceTier: "default" });
  expect(calculateCostFromTokens(tokens, quote())).toBeCloseTo(0.1965, 12);
});

it("keeps Gemini header evidence confined to the Developer API provider", () => {
  const selection = getGeminiServiceTierSelection("priority", new Headers({ "x-gemini-service-tier": "priority" }));
  expect(getServiceTierAccounting("vertex", selection)).toBeNull();
  expect(getServiceTierAccounting("gemini-cli", selection)).toBeNull();
  expect(getServiceTierAccounting("antigravity", selection)).toBeNull();
});
