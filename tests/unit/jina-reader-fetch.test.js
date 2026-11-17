import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns";
import { Agent, fetch as pinnedFetch } from "undici";
import { handleFetchCore } from "../../open-sse/handlers/fetch/index.js";

vi.mock("node:dns", async original => {
  const actual = await original();
  return { ...actual, default: { ...actual.default, promises: { ...actual.default.promises, lookup: vi.fn() } } };
});
vi.mock("undici", async original => ({ ...await original(), fetch: vi.fn() }));

const lookup = dns.promises.lookup;

describe("Jina Reader fetch", () => {
  beforeEach(() => {
    lookup.mockReset().mockImplementation(async (hostname, options) => {
      expect(hostname).toBe("r.jina.ai");
      expect(options).toEqual({ all: true, verbatim: true });
      return [{ address: "93.184.216.34", family: 4 }];
    });
    pinnedFetch.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected global fetch egress"); }));
  });

  afterEach(() => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses Jina's JSON POST API instead of embedding the URL in the path", async () => {
    pinnedFetch.mockResolvedValueOnce(new Response([
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
    expect(pinnedFetch).toHaveBeenCalledTimes(1);

    const [requestUrl, init] = pinnedFetch.mock.calls[0];
    expect(String(requestUrl)).toBe("https://r.jina.ai/");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher).toBeInstanceOf(Agent);
    expect(lookup).toHaveBeenCalledOnce();
    expect(Object.fromEntries(init.headers)).toEqual({
      "content-type": "application/json",
      "x-return-format": "markdown",
      authorization: "Bearer jina-test-key",
    });
    expect(JSON.parse(init.body)).toEqual({ url: "https://example.com/article" });
  });

  it("returns the upstream status and error body", async () => {
    pinnedFetch.mockResolvedValueOnce(new Response(
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

  it("blocks an upstream hostname resolving to a private address before sending credentials", async () => {
    lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const result = await handleFetchCore({
      url: "https://example.com/article", provider: "jina-reader", credentials: { apiKey: "jina-test-key" },
    });
    expect(result).toEqual({ success: false, status: 502, error: "Blocked URL: private IP" });
    expect(pinnedFetch).not.toHaveBeenCalled();
  });
});
