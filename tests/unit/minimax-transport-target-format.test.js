/**
 * Multi-transport providers must keep the request body and selected endpoint on
 * the same wire format. MiniMax-M3 declares a Claude target for compatibility,
 * but an OpenAI client should use MiniMax's matching OpenAI transport without
 * an OpenAI -> Claude translation, and native Claude clients should use MiniMax's
 * Claude transport on the Claude wire format.
 * Regression: https://github.com/decolua/9router/issues/3418
 */
import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ base: "", requests: [] }));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));

vi.mock("../../open-sse/providers/declaredCaps.js", () => ({
  getDeclaredModelCaps: async () => undefined,
}));

vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest() {},
    logRawRequest() {},
    logTargetRequest() {},
    logOpenAIRequest() {},
    logProviderResponse() {},
    logConvertedResponse() {},
    logError() {},
  }),
}));

vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return {
    getExecutor(provider) {
      const executor = new DefaultExecutor(provider);
      const originalBuildUrl = executor.buildUrl.bind(executor);
      executor.buildUrl = function buildUrl(model, stream, urlIndex = 0, credentials = null) {
        const targetUrl = originalBuildUrl(model, stream, urlIndex, credentials);
        const parsed = new URL(targetUrl);
        return `${fixture.base}${parsed.pathname}${parsed.search}`;
      };
      return executor;
    },
  };
});

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

let server;

beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf8");
    fixture.requests.push({
      url: request.url,
      headers: request.headers,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    response.setHeader("content-type", "application/json");
    if (request.url.includes("/messages")) {
      response.end(JSON.stringify({
        id: "msg_minimax_test",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Claude response" }],
        model: "MiniMax-M3",
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      }));
    } else {
      response.end(JSON.stringify({
        id: "chatcmpl-minimax-test",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "MiniMax-M3",
        choices: [{ index: 0, message: { role: "assistant", content: "OpenAI response" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  fixture.base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  fixture.requests = [];
});

describe("MiniMax-M3 multi-transport routing", () => {
  it("keeps OpenAI image blocks and tool parameters on the matching OpenAI transport", async () => {
    const imageBlock = {
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAAB" },
    };
    const tool = {
      type: "function",
      function: {
        name: "search_db",
        description: "Search the database",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    };
    const body = {
      model: "minimax-cn/MiniMax-M3",
      stream: false,
      messages: [{
        role: "user",
        content: [{ type: "text", text: "Describe this image" }, imageBlock],
      }],
      tools: [tool],
    };

    const result = await handleChatCore({
      body,
      modelInfo: { provider: "minimax-cn", model: "MiniMax-M3" },
      credentials: { apiKey: "test-api-key", providerSpecificData: {} },
      clientRawRequest: {
        endpoint: "/v1/chat/completions",
        body,
        headers: { accept: "application/json" },
      },
      connectionId: "test-connection-openai",
      log: { debug() {}, info() {}, warn() {}, error() {} },
    });

    expect(result.success).toBe(true);
    await result.response.text();

    expect(fixture.requests).toHaveLength(1);
    const wireRequest = fixture.requests[0];
    expect(wireRequest.url).toBe("/v1/chat/completions");
    expect(wireRequest.headers.authorization).toBe("Bearer test-api-key");
    expect(wireRequest.body.messages[0].content).toContainEqual(imageBlock);
    expect(wireRequest.body.tools).toEqual([tool]);
    expect(wireRequest.body).not.toHaveProperty("system");
  });

  it("routes native Claude requests to the Claude wire without translating to OpenAI", async () => {
    const claudeBody = {
      model: "minimax-cn/MiniMax-M3",
      max_tokens: 1024,
      system: [{ type: "text", text: "You are a helpful assistant." }],
      messages: [{
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      }],
      tools: [{
        name: "get_weather",
        description: "Get the current weather",
        input_schema: {
          type: "object",
          properties: { location: { type: "string" } },
          required: ["location"],
        },
      }],
    };

    const result = await handleChatCore({
      body: claudeBody,
      modelInfo: { provider: "minimax-cn", model: "MiniMax-M3" },
      credentials: { apiKey: "test-api-key", providerSpecificData: {} },
      sourceFormatOverride: FORMATS.CLAUDE,
      clientRawRequest: {
        endpoint: "/v1/messages",
        body: claudeBody,
        headers: { accept: "application/json" },
      },
      connectionId: "test-connection-claude",
      log: { debug() {}, info() {}, warn() {}, error() {} },
    });

    expect(result.success).toBe(true);
    await result.response.text();

    expect(fixture.requests).toHaveLength(1);
    const wireRequest = fixture.requests[0];
    expect(wireRequest.url).toBe("/anthropic/v1/messages?beta=true");
    expect(wireRequest.headers["x-api-key"]).toBe("test-api-key");
    expect(wireRequest.body.system).toContainEqual(expect.objectContaining({ type: "text", text: "You are a helpful assistant." }));
    expect(wireRequest.body.max_tokens).toBe(1024);
    expect(wireRequest.body.messages).toMatchObject([{ role: "user", content: [{ type: "text", text: "Hello" }] }]);
    expect(wireRequest.body.tools[0].name).toBe("get_weather");
    expect(wireRequest.body.tools[0].input_schema).toMatchObject({ type: "object", properties: { location: { type: "string" } }, required: ["location"] });
    expect(wireRequest.body).not.toHaveProperty("stream_options");
  });
});
