import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns";
const lookup = dns.promises.lookup;
import { Agent, fetch as pinnedFetch } from "undici";

vi.mock("node:dns", async original => {
  const actual = await original();
  return { ...actual, default: { ...actual.default, promises: { ...actual.default.promises, lookup: vi.fn() } } };
});
vi.mock("undici", async original => ({ ...await original(), fetch: vi.fn() }));

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { handleFetchCore } from "../../open-sse/handlers/fetch/index.js";
import { AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers.js";

const CONFIG = {
  baseUrl: "https://ollama.com/api/web_fetch",
  timeoutMs: 30000,
};

beforeEach(() => {
  pinnedFetch.mockReset();
  lookup.mockReset().mockImplementation(async (hostname, options) => {
    expect(hostname).toBe("ollama.com");
    expect(options).toEqual({ all: true, verbatim: true });
    return [{ address: "93.184.216.34", family: 4 }];
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ollama Cloud web fetch provider", () => {
  it("registers web fetch on the existing Ollama Cloud connection", () => {
    const entry = REGISTRY.find((candidate) => candidate.id === "ollama");

    expect(entry).toMatchObject({
      category: "freeTier",
      serviceKinds: ["llm", "webFetch"],
      fetchConfig: {
        baseUrl: "https://ollama.com/api/web_fetch",
        method: "POST",
        authHeader: "bearer",
        formats: ["markdown"],
      },
    });
    expect(AI_PROVIDERS.ollama?.fetchConfig).toEqual(entry.fetchConfig);
    expect(getProvidersByKind("webFetch").map((provider) => provider.id)).toContain("ollama");
  });

  it("calls Ollama with bearer auth and normalizes the response", async () => {
    pinnedFetch.mockImplementation(async () => new Response(JSON.stringify({
      title: "Example Domain",
      content: "Hello from Ollama",
      links: ["https://www.iana.org/domains/example"],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const result = await handleFetchCore({
      url: "https://example.com",
      format: "markdown",
      maxCharacters: 5,
      provider: "ollama",
      providerConfig: CONFIG,
      credentials: { apiKey: "ollama-test-key" },
    });

    expect(result.success).toBe(true);
    expect(pinnedFetch).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = pinnedFetch.mock.calls[0];
    expect(String(requestUrl)).toBe("https://ollama.com/api/web_fetch");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher).toBeInstanceOf(Agent);
    expect(lookup).toHaveBeenCalledOnce();
    expect(Object.fromEntries(init.headers)).toEqual({
      "content-type": "application/json",
      authorization: "Bearer ollama-test-key",
    });
    expect(JSON.parse(init.body)).toEqual({ url: "https://example.com" });
    expect(result.data).toMatchObject({
      provider: "ollama",
      url: "https://example.com",
      title: "Example Domain",
      content: { format: "markdown", text: "Hello", length: 5 },
      links: ["https://www.iana.org/domains/example"],
      usage: { fetch_cost_usd: null },
    });
  });

  it("returns the upstream status and error message", async () => {
    pinnedFetch.mockImplementation(async () => new Response(
      JSON.stringify({ error: "invalid API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    ));

    const result = await handleFetchCore({
      url: "https://example.com",
      provider: "ollama",
      providerConfig: CONFIG,
      credentials: { apiKey: "bad-key" },
    });

    expect(result).toMatchObject({
      success: false,
      status: 401,
      error: "invalid API key",
    });
  });

  it("treats an empty successful response as an upstream error", async () => {
    pinnedFetch.mockImplementation(async () => new Response(null, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const result = await handleFetchCore({
      url: "https://example.com",
      provider: "ollama",
      providerConfig: CONFIG,
      credentials: { apiKey: "ollama-test-key" },
    });

    expect(result).toEqual({
      success: false,
      status: 502,
      error: "Ollama returned an empty or invalid web fetch response",
    });
  });

  it("rejects a mixed public/private DNS answer before sending the bearer token", async () => {
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    pinnedFetch.mockReset();
    const result = await handleFetchCore({
      url: "https://example.com", provider: "ollama", providerConfig: CONFIG, credentials: { apiKey: "ollama-test-key" },
    });
    expect(result).toMatchObject({ success: false, status: 502, error: expect.stringMatching(/Blocked URL: private IP/) });
    expect(pinnedFetch).not.toHaveBeenCalled();
  });
});
