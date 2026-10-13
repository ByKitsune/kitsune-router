// 9router #4643: the Codex image provider must extract exact usage from
// `response.completed` / `response.done` Responses events (both streaming and
// buffered paths) and hand it to the caller's onUsage callback. A stream
// without usage must not invent 0/0 counts.
import { describe, expect, it, vi } from "vitest";
import codexImageProvider from "../../open-sse/handlers/imageProviders/codex.js";

function sseResponse(events) {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

const imageDoneEvent = {
  event: "response.output_item.done",
  data: { item: { type: "image_generation_call", result: "aW1hZ2U=" } },
};

describe("Codex image provider usage extraction (#4643)", () => {
  it("collects usage from response.completed and passes it to onUsage (buffered)", async () => {
    const onUsage = vi.fn();
    const response = sseResponse([
      imageDoneEvent,
      {
        event: "response.completed",
        data: {
          response: {
            usage: {
              input_tokens: 321,
              output_tokens: 654,
              total_tokens: 975,
              input_tokens_details: { cached_tokens: 111 },
              output_tokens_details: { reasoning_tokens: 22 },
            },
          },
        },
      },
    ]);

    const parsed = await codexImageProvider.parseResponse(response, {
      log: { info: vi.fn() },
      streamToClient: false,
      onRequestSuccess: vi.fn(),
      onUsage,
    });

    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({
      prompt_tokens: 321,
      completion_tokens: 654,
      total_tokens: 975,
      cached_tokens: 111,
      reasoning_tokens: 22,
    });
    expect(parsed.data[0].b64_json).toBe("aW1hZ2U=");
  });

  it("does not call onUsage when the stream reports no usage", async () => {
    const onUsage = vi.fn();
    const response = sseResponse([imageDoneEvent]);

    await codexImageProvider.parseResponse(response, {
      log: { info: vi.fn() },
      streamToClient: false,
      onRequestSuccess: vi.fn(),
      onUsage,
    });

    expect(onUsage).not.toHaveBeenCalled();
  });

  it("falls back to prompt_tokens/completion_tokens spellings and defaults total", async () => {
    const onUsage = vi.fn();
    const response = sseResponse([
      imageDoneEvent,
      {
        event: "response.done",
        data: { usage: { prompt_tokens: 10, completion_tokens: 20 } },
      },
    ]);

    await codexImageProvider.parseResponse(response, {
      log: { info: vi.fn() },
      streamToClient: false,
      onRequestSuccess: vi.fn(),
      onUsage,
    });

    expect(onUsage).toHaveBeenCalledWith({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    });
  });

  it("ignores a malformed usage object rather than persisting bad counts", async () => {
    const onUsage = vi.fn();
    const response = sseResponse([
      imageDoneEvent,
      {
        event: "response.completed",
        data: { response: { usage: { input_tokens: "many", output_tokens: 20 } } },
      },
    ]);

    await codexImageProvider.parseResponse(response, {
      log: { info: vi.fn() },
      streamToClient: false,
      onRequestSuccess: vi.fn(),
      onUsage,
    });

    expect(onUsage).not.toHaveBeenCalled();
  });

  it("passes usage through the streaming (SSE) path", async () => {
    const onUsage = vi.fn();
    const response = sseResponse([
      imageDoneEvent,
      {
        event: "response.completed",
        data: { response: { usage: { input_tokens: 5, output_tokens: 7, total_tokens: 12 } } },
      },
    ]);

    const { sseResponse: clientSse } = await codexImageProvider.parseResponse(response, {
      log: { info: vi.fn() },
      streamToClient: true,
      onRequestSuccess: vi.fn(),
      onUsage,
    });

    // Drain the client stream so the ReadableStream start() runs to completion.
    const text = await clientSse.text();
    expect(text).toContain("event: done");
    expect(onUsage).toHaveBeenCalledWith({ prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 });
  });
});
