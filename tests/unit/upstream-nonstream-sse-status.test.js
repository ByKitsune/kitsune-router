import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}), enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));

import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { extractResponseError } from "../../open-sse/translator/concerns/responseError.js";

// 9Router 56dbf466: SSE error frames must not become HTTP 200. Kitsune also
// records real incurred usage before returning failure, rather than dropping it.
describe("non-streaming upstream SSE error status", () => {
  it.each([[undefined, 502], [403, 403], ["429", 429], [503, 503], [399, 502], [600, 502], [503.5, 502], ["429bad", 502]])(
    "maps status %s to HTTP %s without reporting success", async (upstreamStatus, expectedStatus) => {
      const wire = `data: ${JSON.stringify({ error: { status: upstreamStatus, message: "Synthetic upstream failure" } })}\n\ndata: [DONE]\n\n`;
      const onRequestSuccess = vi.fn();
      const result = await handleNonStreamingResponse({
        providerResponse: new Response(wire, { headers: { "content-type": "text/event-stream" } }),
        provider: "kiro", model: "offline", sourceFormat: FORMATS.OPENAI, targetFormat: FORMATS.OPENAI,
        body: { model: "offline", messages: [] }, stream: false, requestStartTime: Date.now(),
        connectionId: "fixture", clientRawRequest: { endpoint: "/v1/chat/completions" },
        onRequestSuccess, trackDone: vi.fn(), appendLog: vi.fn(),
        reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() },
      });
      expect(result.success).toBe(false);
      expect(result.response.status).toBe(expectedStatus);
      expect((await result.response.json()).error.message).toContain("Synthetic upstream failure");
      expect(onRequestSuccess).not.toHaveBeenCalled();
    }
  );
});

it.each(["status", "status_code", "code"])("recognizes an HTTP status string in %s without accepting malformed status", field => {
  expect(extractResponseError({ error: { [field]: " 429 ", message: "Limited" } }).status).toBe(429);
  expect(extractResponseError({ error: { [field]: "429oops", message: "Failed" } }).status).toBe(502);
});
