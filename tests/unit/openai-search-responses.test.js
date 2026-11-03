import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ proxyAwareFetch: vi.fn() }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: mocks.proxyAwareFetch }));

import { handleChatSearch } from "open-sse/handlers/search/chatSearch.js";

const credentials = { apiKey: "offline-openai-search-fixture" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.proxyAwareFetch.mockResolvedValue(Response.json({
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Grounded answer", annotations: [] }] }],
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("OpenAI Responses web search", () => {
  it("sends the verified default to Responses with a required hosted search tool and account egress policy", async () => {
    const policy = {
      connectionProxyEnabled: true, connectionProxyUrl: "http://127.0.0.1:9999",
      connectionNoProxy: "fixture.invalid", vercelRelayUrl: "", strictProxy: true,
    };
    const result = await handleChatSearch({ provider: "openai", query: "Current fixture news", credentials: {
      ...credentials, providerSpecificData: policy,
    } });
    expect(result.success).toBe(true);
    expect(mocks.proxyAwareFetch).toHaveBeenCalledTimes(1);
    const [url, init, actualPolicy] = mocks.proxyAwareFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${credentials.apiKey}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      model: "gpt-6-luna", input: "Current fixture news", store: false,
      tools: [{ type: "web_search" }], tool_choice: "required",
    });
    expect(actualPolicy).toEqual(policy);
    expect(result.data.answer).toEqual({ source: "openai", text: "Grounded answer", model: "gpt-6-luna" });
  });

  it("extracts only assistant output text and flat URL citations, deduplicates before limiting, and never fetches sources", async () => {
    const directFetch = vi.fn(() => { throw new Error("Citation URLs must not be fetched"); });
    vi.stubGlobal("fetch", directFetch);
    const citation = (url, title) => ({ type: "url_citation", url, title, start_index: 0, end_index: 5 });
    mocks.proxyAwareFetch.mockResolvedValue(Response.json({
      output: [
        { type: "web_search_call", action: { type: "search" }, content: [{ type: "output_text", text: "tool-only", annotations: [citation("https://example.com/tool", "Tool")] }] },
        { type: "reasoning", content: [{ type: "output_text", text: "private reasoning" }] },
        { type: "message", role: "assistant", content: [
          { type: "output_text", text: "First answer. ", annotations: [citation("https://example.com/one", "First source"), citation("https://example.com/one", "Repeated")] },
          { type: "output_text", text: "Second answer.", annotations: [citation("https://example.com/two", "Second source"), { type: "file_citation", url: "https://example.com/file" }, citation(null, "Malformed"), citation("https://example.com/three", "Third source")] },
          { type: "refusal", refusal: "Not output text" },
        ] },
      ],
      usage: { total_tokens: 29 },
    }));
    const result = await handleChatSearch({ provider: "openai", query: "Fixture", model: "gpt-6-astra", maxResults: 2, credentials });
    expect(result.success).toBe(true);
    expect(result.data.answer).toEqual({ source: "openai", text: "First answer. Second answer.", model: "gpt-6-astra" });
    expect(result.data.results).toHaveLength(2);
    expect(result.data.results.map(({ url, title, position, citation }) => ({ url, title, position, provider: citation.provider, rank: citation.rank }))).toEqual([
      { url: "https://example.com/one", title: "First source", position: 1, provider: "openai", rank: 1 },
      { url: "https://example.com/two", title: "Second source", position: 2, provider: "openai", rank: 2 },
    ]);
    expect(result.data.usage.llm_tokens).toBe(29);
    expect(JSON.parse(mocks.proxyAwareFetch.mock.calls[0][1].body).model).toBe("gpt-6-astra");
    expect(directFetch).not.toHaveBeenCalled();
  });

  it("returns an upstream rejection without reporting an empty successful search", async () => {
    mocks.proxyAwareFetch.mockResolvedValue(Response.json({ error: { message: "Unsupported model for web_search" } }, { status: 400 }));
    const result = await handleChatSearch({ provider: "openai", query: "Fixture", credentials });
    expect(result).toMatchObject({ success: false, status: 400, error: "Unsupported model for web_search" });
    expect(result.data).toBeUndefined();
  });

  it("keeps the bounded request timeout on the same proxy-aware request", async () => {
    vi.useFakeTimers();
    let signal;
    mocks.proxyAwareFetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      signal = init.signal;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const pending = handleChatSearch({ provider: "openai", query: "Fixture", credentials });
    await vi.advanceTimersByTimeAsync(15000);
    expect(signal.aborted).toBe(true);
    expect(await pending).toMatchObject({ success: false, status: 504, error: "Upstream timeout" });
    expect(mocks.proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
