import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { Dispatcher1Wrapper } from "undici";
import { handleFetchCore } from "../../open-sse/handlers/fetch/index.js";

vi.mock("node:dns/promises", async original => ({ ...await original(), lookup: vi.fn() }));

const originalFetch = global.fetch;

describe("Jina Reader fetch", () => {
  beforeEach(() => {
    lookup.mockReset().mockImplementation(async (hostname, options) => {
      expect(hostname).toBe("r.jina.ai");
      expect(options).toEqual({ all: true });
      return [{ address: "93.184.216.34", family: 4 }];
    });
    global.fetch = vi.fn();
  });

  afterEach(async () => {
    const calls = global.fetch.mock.calls;
    global.fetch = originalFetch;
    await Promise.all(calls.map(([, init]) => init.dispatcher.close()));
    vi.restoreAllMocks();
  });

  it("uses Jina's JSON POST API instead of embedding the URL in the path", async () => {
    global.fetch.mockResolvedValueOnce(new Response([
      "Title: Example page",
      "",
      "URL Source: https://example.com/article",
      "",
      "Markdown Content:",
      "Hello",
    ].join("\n")));

    const result = await handleFetchCore({
      url: "https://example.com/article",
      format: "markdown",
      provider: "jina-reader",
      providerConfig: { timeoutMs: 30000 },
      credentials: { apiKey: "jina-test-key" },
    });

    expect(result.success).toBe(true);
    expect(result.data.title).toBe("Example page");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [requestUrl, init] = global.fetch.mock.calls[0];
    expect(requestUrl).toBe("https://r.jina.ai/");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher).toBeInstanceOf(Dispatcher1Wrapper);
    expect(lookup).toHaveBeenCalledOnce();
    expect(init.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer jina-test-key",
    });
    expect(JSON.parse(init.body)).toEqual({ url: "https://example.com/article" });
  });

  it("returns the upstream status and error body", async () => {
    global.fetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ detail: "Payment required" }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    ));

    const result = await handleFetchCore({
      url: "https://example.com/article",
      provider: "jina-reader",
      providerConfig: { timeoutMs: 30000 },
      credentials: { apiKey: "jina-test-key" },
    });

    expect(result).toMatchObject({
      success: false,
      status: 402,
    });
    expect(result.error).toContain("Payment required");
  });

  it("blocks an upstream hostname resolving to a private address before fetching credentials", async () => {
    lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const result = await handleFetchCore({
      url: "https://example.com/article", provider: "jina-reader", credentials: { apiKey: "jina-test-key" },
    });
    expect(result).toEqual({ success: false, status: 502, error: "SSRF blocked: private or invalid IP" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
