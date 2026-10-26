import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { Dispatcher1Wrapper } from "undici";

vi.mock("node:dns/promises", async original => ({ ...await original(), lookup: vi.fn() }));

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { handleFetchCore } from "../../open-sse/handlers/fetch/index.js";
import { AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers.js";

const CONFIG = {
  baseUrl: "https://ollama.com/api/web_fetch",
  timeoutMs: 30000,
};

beforeEach(() => {
  lookup.mockReset().mockImplementation(async (hostname, options) => {
    expect(hostname).toBe("ollama.com");
    expect(options).toEqual({ all: true });
    return [{ address: "93.184.216.34", family: 4 }];
  });
});
afterEach(async () => {
  const calls = global.fetch.mock?.calls || [];
  await Promise.all(calls.map(([, init]) => init.dispatcher.close()));
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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      title: "Example Domain",
      content: "Hello from Ollama",
      links: ["https://www.iana.org/domains/example"],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const result = await handleFetchCore({
      url: "https://example.com",
      format: "markdown",
      maxCharacters: 5,
      provider: "ollama",
      providerConfig: CONFIG,
      credentials: { apiKey: "ollama-test-key" },
    });

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = global.fetch.mock.calls[0];
    expect(requestUrl).toBe("https://ollama.com/api/web_fetch");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher).toBeInstanceOf(Dispatcher1Wrapper);
    expect(lookup).toHaveBeenCalledOnce();
    expect(init.headers).toEqual({
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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "invalid API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));

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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

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
    vi.stubGlobal("fetch", vi.fn());
    const result = await handleFetchCore({
      url: "https://example.com", provider: "ollama", providerConfig: CONFIG, credentials: { apiKey: "ollama-test-key" },
    });
    expect(result).toEqual({ success: false, status: 502, error: "SSRF blocked: private or invalid IP" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
