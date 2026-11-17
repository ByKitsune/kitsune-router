import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns";
import { Agent, fetch as pinnedFetch } from "undici/index.js";

const state = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(), markAccountUnavailable: vi.fn(), clearAccountError: vi.fn(),
  checkAndRefreshToken: vi.fn(), updateProviderCredentials: vi.fn(),
  getSettings: vi.fn(), getCombos: vi.fn(), assertPublicUrlAsync: vi.fn(),
}));
vi.mock("node:dns", async original => {
  const actual = await original();
  return { ...actual, default: { ...actual.default, promises: { ...actual.default.promises, lookup: vi.fn() } } };
});
vi.mock("undici/index.js", async original => ({ ...await original(), fetch: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getSettings: state.getSettings, getCombos: state.getCombos, isApiKeyRequired: () => false }));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: () => null, isValidApiKey: async () => true,
  getProviderCredentials: state.getProviderCredentials,
  markAccountUnavailable: state.markAccountUnavailable,
  clearAccountError: state.clearAccountError,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken: state.checkAndRefreshToken, updateProviderCredentials: state.updateProviderCredentials }));
vi.mock("@/sse/utils/logger.js", () => ({ request() {}, debug() {}, info() {}, warn() {}, error() {}, maskKey() {} }));
vi.mock("@/shared/utils/ssrfGuard.js", async original => ({ ...await original(), assertPublicUrlAsync: state.assertPublicUrlAsync }));

import { handleFetchCore } from "open-sse/handlers/fetch/index.js";
import { handleFetch } from "@/sse/handlers/fetch.js";
import { PROVIDER_MEDIA } from "open-sse/providers/index.js";
import { resetRateLimiter } from "@/lib/rateLimit/v1Limiter.js";

const lookup = dns.promises.lookup;
const target = "https://example.com/article";
const providerKey = "synthetic-firecrawl-v2-key";
const account = { connectionId: "synthetic-firecrawl-v2-account", apiKey: providerKey };
const invoke = (extra = {}) => handleFetchCore({
  provider: "firecrawl", url: target, providerConfig: PROVIDER_MEDIA.firecrawl.fetchConfig, credentials: account, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
  lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  pinnedFetch.mockReset();
  state.getProviderCredentials.mockResolvedValue(account);
  state.markAccountUnavailable.mockResolvedValue({ shouldFallback: false });
  state.checkAndRefreshToken.mockImplementation(async (_provider, credentials) => credentials);
  state.getSettings.mockResolvedValue({});
  state.getCombos.mockResolvedValue([]);
  state.assertPublicUrlAsync.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected global Firecrawl request"); }));
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRateLimiter();
});

describe("Firecrawl v2 native scrape contract", () => {
  it("advertises only normalized verified formats and the current native endpoint", () => {
    expect(PROVIDER_MEDIA.firecrawl.fetchConfig.baseUrl).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(PROVIDER_MEDIA.firecrawl.fetchConfig.formats).toEqual(["markdown", "html"]);
  });

  it.each(["markdown", "html", undefined])("uses guarded v2 JSON POST for requested format %s", async format => {
    const selected = format || "markdown";
    const content = selected === "html" ? "<p>Native HTML</p>" : "# Native markdown";
    pinnedFetch.mockResolvedValueOnce(Response.json({ success: true, data: { [selected]: content, metadata: { title: "Native title" } } }));
    const result = await invoke({ format });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ provider: "firecrawl", url: target, title: "Native title", content: { format: selected, text: content, length: content.length } });
    expect(pinnedFetch).toHaveBeenCalledOnce();
    const [url, init] = pinnedFetch.mock.calls[0];
    expect(String(url)).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher).toBeInstanceOf(Agent);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers.get("authorization")).toBe(`Bearer ${providerKey}`);
    expect(init.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ url: target, formats: [selected] });
    expect(lookup).toHaveBeenCalledExactlyOnceWith("api.firecrawl.dev", { all: true, verbatim: true });
  });

  it("does not relabel markdown as HTML when both fields are returned", async () => {
    pinnedFetch.mockResolvedValueOnce(Response.json({ success: true, data: { markdown: "# Different markdown", html: "<p>Requested HTML</p>" } }));
    const result = await invoke({ format: "html", maxCharacters: 6 });
    expect(result.success).toBe(true);
    expect(result.data.content).toEqual({ format: "html", text: "<p>Req", length: 6 });
  });

  it("preserves an explicit empty selected format instead of substituting another format", async () => {
    pinnedFetch.mockResolvedValueOnce(Response.json({ success: true, data: { markdown: "must not substitute", html: "" } }));
    const result = await invoke({ format: "html" });
    expect(result.success).toBe(true);
    expect(result.data.content).toEqual({ format: "html", text: "", length: 0 });
  });

  it("does not return empty success for the API's success:false envelope", async () => {
    pinnedFetch.mockResolvedValueOnce(Response.json({ success: false, error: "Synthetic scrape failed", data: { markdown: "discarded partial content" } }));
    const result = await invoke();
    expect(result).toMatchObject({ success: false, status: 502, error: "Synthetic scrape failed" });
    expect(result.data).toBeUndefined();
    expect(pinnedFetch).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    {},
    { success: "true", data: { markdown: "invalid envelope" } },
    { success: true },
    { success: true, data: null },
    { success: true, data: [] },
    { success: true, data: { markdown: { text: "wrong type" } } },
    { success: true, data: { html: "not the requested format" } },
  ])("rejects malformed successful document envelope %j", async payload => {
    pinnedFetch.mockResolvedValueOnce(Response.json(payload));
    const result = await invoke();
    expect(result).toMatchObject({ success: false, status: 502 });
    expect(typeof result.error).toBe("string");
    expect(result.data).toBeUndefined();
    expect(pinnedFetch).toHaveBeenCalledOnce();
  });

  it("retains the upstream HTTP rejection without replacing it with synthetic success", async () => {
    pinnedFetch.mockResolvedValueOnce(Response.json({ success: false, error: "Synthetic payment required" }, { status: 402 }));
    expect(await invoke()).toMatchObject({ success: false, status: 402, error: "Synthetic payment required" });
    expect(pinnedFetch).toHaveBeenCalledOnce();
  });
});

describe("Firecrawl migration retains request safety", () => {
  it.each(["text", "json", "rawHtml", "screenshot", null, "Markdown"])("rejects unsupported format %j before credential selection or refresh", async format => {
    const response = await handleFetch(new Request("http://localhost/v1/web/fetch", {
      method: "POST", body: JSON.stringify({ provider: "firecrawl", url: target, format }),
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect((await response.json()).error).toMatchObject({ code: "bad_request", param: "format" });
    expect(state.getProviderCredentials).not.toHaveBeenCalled();
    expect(state.checkAndRefreshToken).not.toHaveBeenCalled();
    expect(state.markAccountUnavailable).not.toHaveBeenCalled();
    expect(state.clearAccountError).not.toHaveBeenCalled();
    expect(pinnedFetch).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses an account proxy route before bypassing the guarded transport", async () => {
    const result = await invoke({ credentials: { ...account, providerSpecificData: { strictProxy: true, vercelRelayUrl: "http://127.0.0.1:9" } } });
    expect(result).toMatchObject({ success: false, status: 502, localFailure: true, errorScope: "request" });
    expect(pinnedFetch).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("blocks private provider DNS before sending the API key", async () => {
    lookup.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
    expect(await invoke()).toMatchObject({ success: false, status: 502 });
    expect(pinnedFetch).not.toHaveBeenCalled();
  });

  it("does not follow a provider redirect or forward credentials to another host", async () => {
    pinnedFetch.mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "https://synthetic-credential-trap.example/scrape" } }));
    expect(await invoke()).toMatchObject({ success: false, status: 502 });
    expect(pinnedFetch).toHaveBeenCalledOnce();
    expect(lookup).toHaveBeenCalledOnce();
  });

  it("does not start after caller cancellation", async () => {
    const caller = new AbortController();
    caller.abort(new Error("Synthetic caller left"));
    expect(await invoke({ signal: caller.signal })).toMatchObject({ success: false, status: 499 });
    expect(pinnedFetch).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("cancels the in-flight guarded request without retrying", async () => {
    const caller = new AbortController();
    let dispatched;
    const started = new Promise(resolve => { dispatched = resolve; });
    pinnedFetch.mockImplementationOnce((_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      dispatched();
    }));
    const pending = invoke({ signal: caller.signal });
    await started;
    caller.abort(new Error("Synthetic caller cancelled pending scrape"));
    expect(await pending).toMatchObject({ success: false, status: 499 });
    expect(pinnedFetch).toHaveBeenCalledOnce();
    expect(pinnedFetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
