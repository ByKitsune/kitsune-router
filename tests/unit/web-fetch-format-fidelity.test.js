import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { Dispatcher1Wrapper } from "undici";

const io = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(), markAccountUnavailable: vi.fn(), clearAccountError: vi.fn(),
  checkAndRefreshToken: vi.fn(), updateProviderCredentials: vi.fn(), assertPublicUrlAsync: vi.fn(),
  getSettings: vi.fn(), getCombos: vi.fn(),
  log: { request: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), maskKey: vi.fn() },
}));
vi.mock("node:dns/promises", async original => ({ ...await original(), lookup: vi.fn() }));
vi.mock("@/lib/localDb", () => ({
  getSettings: io.getSettings, getCombos: io.getCombos, isApiKeyRequired: () => false,
}));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: io.getProviderCredentials, markAccountUnavailable: io.markAccountUnavailable,
  clearAccountError: io.clearAccountError, extractApiKey: () => null, isValidApiKey: vi.fn(),
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: io.checkAndRefreshToken, updateProviderCredentials: io.updateProviderCredentials,
}));
vi.mock("@/sse/utils/logger.js", () => io.log);
vi.mock("@/shared/utils/ssrfGuard.js", () => ({ assertPublicUrlAsync: io.assertPublicUrlAsync }));

import { handleFetch } from "@/sse/handlers/fetch.js";
import { handleFetchCore } from "open-sse/handlers/fetch/index.js";
import { resetRateLimiter } from "@/lib/rateLimit/v1Limiter.js";

const TARGET = "https://example.com/article";
const PROVIDER_KEY = "synthetic-web-fetch-provider-key";
const UPSTREAM = { "jina-reader": "https://r.jina.ai/", tavily: "https://api.tavily.com/extract" };
const account = { apiKey: PROVIDER_KEY, connectionId: "format-fixture-account", connectionName: "Fixture" };

function request(provider, format, extra = {}) {
  return new Request("http://localhost/v1/web/fetch", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, url: TARGET, ...(format === undefined ? {} : { format }), ...extra }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
  io.getSettings.mockResolvedValue({ requireApiKey: false });
  io.getCombos.mockResolvedValue([]);
  io.getProviderCredentials.mockResolvedValue(account);
  io.checkAndRefreshToken.mockImplementation(async (_provider, credentials) => credentials);
  io.markAccountUnavailable.mockResolvedValue({ shouldFallback: false });
  io.assertPublicUrlAsync.mockResolvedValue(undefined);
  lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(global.fetch.mock.calls.map(([, init]) => init.dispatcher.close()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRateLimiter();
});

describe("public web fetch preserves the selected native output format", () => {
  it.each([
    ["jina-reader", "markdown", "# Jina markdown\n**Native content**"],
    ["jina-reader", "text", "Jina plain text\nNative content"],
    ["jina-reader", "html", '<html><body><a href="http://169.254.169.254/private">Native HTML</a></body></html>'],
    ["tavily", "markdown", "# Tavily markdown\n**Native content**"],
    ["tavily", "text", "Tavily plain text\nNative content"],
  ])("forwards %s/%s and labels the returned content consistently", async (provider, format, content) => {
    global.fetch.mockResolvedValueOnce(provider === "jina-reader"
      ? new Response(content, { headers: { "Content-Type": format === "html" ? "text/html" : "text/plain" } })
      : Response.json({ results: [{ url: TARGET, raw_content: content }], failed_results: [] }));

    const response = await handleFetch(request(provider, format));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider, url: TARGET, content: { format, text: content, length: content.length },
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(UPSTREAM[provider]);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher).toBeInstanceOf(Dispatcher1Wrapper);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
    expect(init.headers.authorization).toBe(`Bearer ${PROVIDER_KEY}`);
    if (provider === "jina-reader") {
      expect(init.headers["x-return-format"]).toBe(format);
      expect(JSON.parse(init.body)).toEqual({ url: TARGET });
    } else {
      expect(JSON.parse(init.body)).toEqual({ urls: [TARGET], extract_depth: "basic", format });
    }
    expect(io.assertPublicUrlAsync).toHaveBeenCalledExactlyOnceWith(TARGET);
    expect(lookup).toHaveBeenCalledExactlyOnceWith(new URL(UPSTREAM[provider]).hostname, { all: true });
    expect(io.clearAccountError).toHaveBeenCalledExactlyOnceWith(account.connectionId, account, `webfetch:${provider}`);
    expect(io.markAccountUnavailable).not.toHaveBeenCalled();
  });

  it.each(["jina-reader", "tavily"])("requests the explicit markdown default from %s when format is omitted", async provider => {
    global.fetch.mockResolvedValueOnce(provider === "jina-reader"
      ? new Response("# Default output")
      : Response.json({ results: [{ raw_content: "# Default output" }] }));
    const response = await handleFetch(request(provider));
    expect(response.status).toBe(200);
    expect((await response.json()).content.format).toBe("markdown");
    const [, init] = global.fetch.mock.calls[0];
    expect(provider === "jina-reader" ? init.headers["x-return-format"] : JSON.parse(init.body).format).toBe("markdown");
  });

  it("retains the UI model selector and max-character cap without changing the requested native format", async () => {
    global.fetch.mockResolvedValueOnce(Response.json({ results: [{ raw_content: "Native plain text" }] }));
    const response = await handleFetch(request(undefined, "text", { model: "tavily", max_characters: 6 }));
    expect(response.status).toBe(200);
    expect((await response.json()).content).toEqual({ format: "text", text: "Native", length: 6 });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).format).toBe("text");
  });

  it.each(["jina-reader", "tavily"])("keeps %s native error status and safe public error normalization", async provider => {
    global.fetch.mockResolvedValueOnce(Response.json({ detail: { error: "native-private-payload", trace: "private-upstream-trace" } }, { status: 402 }));
    const response = await handleFetch(request(provider, "text"));
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toMatchObject({ type: "billing_error", code: "payment_required" });
    expect(JSON.stringify(body)).not.toContain("native-private-payload");
    expect(JSON.stringify(body)).not.toContain("private-upstream-trace");
    expect(io.markAccountUnavailable).toHaveBeenCalledExactlyOnceWith(
      account.connectionId, 402, expect.any(String), provider, `webfetch:${provider}`,
    );
    expect(io.clearAccountError).not.toHaveBeenCalled();
  });
});

describe("unsupported web fetch output surfaces are local request errors", () => {
  it.each([
    ["jina-reader", "json"], ["jina-reader", "screenshot"], ["jina-reader", "pageshot"], ["jina-reader", "frontmatter"],
    ["tavily", "html"], ["tavily", "json"], ["tavily", "text\r\nAuthorization: private-format-value"],
  ])("rejects %s/%s before selecting, refreshing or cooling down an account", async (provider, format) => {
    const response = await handleFetch(request(provider, format));
    expect(response.status).toBe(400);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(response.headers.get("retry-after")).toBeNull();
    const body = await response.json();
    expect(body.error).toMatchObject({ type: "invalid_request_error", code: "bad_request", param: "format" });
    expect(body.error.message).toContain("Supported formats:");
    expect(JSON.stringify(body)).not.toContain("private-format-value");
    expect(io.getProviderCredentials).not.toHaveBeenCalled();
    expect(io.checkAndRefreshToken).not.toHaveBeenCalled();
    expect(io.updateProviderCredentials).not.toHaveBeenCalled();
    expect(io.markAccountUnavailable).not.toHaveBeenCalled();
    expect(io.clearAccountError).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([null, false, 0, "", "Markdown", ["text"], { format: "text" }])("rejects malformed format %j in the core before reading credentials", async format => {
    const readKey = vi.fn(() => { throw new Error("Credential access must not occur"); });
    const credentials = Object.defineProperty({}, "apiKey", { get: readKey });
    const result = await handleFetchCore({ provider: "jina-reader", url: TARGET, format, credentials });
    expect(result).toMatchObject({ success: false, status: 400 });
    expect(readKey).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps an unsupported format terminal across a real provider combo", async () => {
    io.getCombos.mockResolvedValue([{ name: "format-fixture-combo", models: ["tavily", "jina-reader"] }]);
    const response = await handleFetch(request("format-fixture-combo", "html"));
    expect(response.status).toBe(400);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(io.getProviderCredentials).not.toHaveBeenCalled();
    expect(io.markAccountUnavailable).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(["jina-reader", "tavily"])("retains the public target guard before a supported %s extraction", async provider => {
    io.assertPublicUrlAsync.mockRejectedValueOnce(new Error("Blocked URL: private target"));
    const response = await handleFetch(request(provider, "text"));
    expect(response.status).toBe(400);
    expect(io.getProviderCredentials).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(["jina-reader", "tavily"])("retains upstream DNS pin validation for %s", async provider => {
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    const result = await handleFetchCore({ provider, url: TARGET, format: "text", credentials: account });
    expect(result).toEqual({ success: false, status: 502, error: "SSRF blocked: private or invalid IP" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(["jina-reader", "tavily"])("retains %s's configured upstream timeout signal and 504 classification", async provider => {
    vi.useFakeTimers();
    global.fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException("Synthetic extraction timeout", "AbortError"));
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }));
    const pending = handleFetchCore({ provider, url: TARGET, format: "text", credentials: account, providerConfig: { timeoutMs: 25 } });
    await vi.advanceTimersByTimeAsync(25);
    expect(await pending).toEqual({ success: false, status: 504, error: "Synthetic extraction timeout" });
    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
