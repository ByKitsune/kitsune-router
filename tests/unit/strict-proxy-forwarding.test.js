import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fetch as nativeFetch } from "undici";
import * as models from "../../src/models/index.js";
import { resolveConnectionProxyConfig } from "../../src/lib/network/connectionProxy.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

beforeEach(() => {
  // These cases explicitly exercise an absent proxy. A cloud runner's valid
  // inherited proxy must not turn them into anonymous live provider requests.
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) {
    vi.stubEnv(key, "");
  }
  vi.stubGlobal("fetch", vi.fn((url, options) => {
    if (String(url).startsWith("data:")) return nativeFetch(url, options);
    throw new Error("Unexpected network request in strict-proxy unit test");
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Strict Proxy configuration and propagation", () => {
  it("resolves strictProxy: true from pool configuration", async () => {
    vi.spyOn(models, "getProxyPoolById").mockResolvedValue({
      id: "pool-strict",
      proxyUrl: "http://proxy.example.com:8080",
      strictProxy: true,
      isActive: true,
    });

    const proxyConfig = await resolveConnectionProxyConfig({
      proxyPoolId: "pool-strict",
    });

    expect(proxyConfig.connectionProxyEnabled).toBe(true);
    expect(proxyConfig.connectionProxyUrl).toBe("http://proxy.example.com:8080");
    expect(proxyConfig.strictProxy).toBe(true);
  });

  it("resolves strictProxy: false when pool does not set it", async () => {
    vi.spyOn(models, "getProxyPoolById").mockResolvedValue({
      id: "pool-non-strict",
      proxyUrl: "http://proxy.example.com:8080",
      strictProxy: false,
      isActive: true,
    });

    const proxyConfig = await resolveConnectionProxyConfig({
      proxyPoolId: "pool-non-strict",
    });

    expect(proxyConfig.strictProxy).toBe(false);
  });

  it.each([
    { isActive: false, proxyUrl: "http://proxy.example.com:8080" },
    { isActive: true, proxyUrl: "" },
  ])("blocks direct traffic for an unusable strict pool: %j", async (pool) => {
    vi.spyOn(models, "getProxyPoolById").mockResolvedValue({ ...pool, strictProxy: true });
    const config = await resolveConnectionProxyConfig({ proxyPoolId: "strict-pool" });
    expect(config.strictProxy).toBe(true);
    await expect(proxyAwareFetch("https://api.openai.com/v1/models", {}, config))
      .rejects.toThrow("strictProxy=true");
  });

  it.each([undefined, "__none__", "missing-pool"])("preserves explicit strict intent without a pool: %s", async (proxyPoolId) => {
    vi.spyOn(models, "getProxyPoolById").mockResolvedValue(null);
    const config = await resolveConnectionProxyConfig({ proxyPoolId, strictProxy: true });
    expect(config.strictProxy).toBe(true);
    await expect(proxyAwareFetch("https://api.openai.com/v1/models", {}, config))
      .rejects.toThrow("strictProxy=true");
  });

  it("preserves strict policy when falling back to a legacy proxy", async () => {
    vi.spyOn(models, "getProxyPoolById").mockResolvedValue({ isActive: false, strictProxy: true });
    const config = await resolveConnectionProxyConfig({
      proxyPoolId: "strict-pool", connectionProxyEnabled: true,
      connectionProxyUrl: "http://legacy.example.com:8080",
    });
    expect(config).toMatchObject({ source: "legacy", strictProxy: true, connectionProxyEnabled: true });
  });

  it("keeps explicit strict legacy policy", async () => {
    const config = await resolveConnectionProxyConfig({ strictProxy: true,
      connectionProxyEnabled: true, connectionProxyUrl: "http://legacy.example.com:8080" });
    expect(config).toMatchObject({ source: "legacy", strictProxy: true });
  });

  it("does not let a non-strict valid pool override explicit strict intent", async () => {
    vi.spyOn(models, "getProxyPoolById").mockResolvedValue({ isActive: true,
      proxyUrl: "http://proxy.example.com:8080", strictProxy: false });
    expect(await resolveConnectionProxyConfig({ proxyPoolId: "pool", strictProxy: true }))
      .toMatchObject({ source: "pool", strictProxy: true });
  });

  it("fails closed for explicit strict intent on a lookup error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(models, "getProxyPoolById").mockRejectedValue(new Error("DB unavailable"));
    const config = await resolveConnectionProxyConfig({ proxyPoolId: "pool", strictProxy: true });
    expect(config).toMatchObject({ source: "error", strictProxy: true });
    await expect(proxyAwareFetch("https://api.openai.com/v1/models", {}, config))
      .rejects.toThrow("strictProxy=true");
  });

  it("leaves ordinary unconfigured traffic non-strict", async () => {
    const config = await resolveConnectionProxyConfig({});
    const response = await proxyAwareFetch("data:application/json,%7B%22ok%22%3Atrue%7D", {}, config);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("accepts an inherited environment proxy without treating strict policy as missing configuration", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://synthetic-proxy.invalid:8080");
    fetch.mockResolvedValueOnce(new Response("{}"));
    const config = await resolveConnectionProxyConfig({ strictProxy: true });

    expect((await proxyAwareFetch("https://provider.invalid/v1/models", {}, config)).ok).toBe(true);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("https://provider.invalid/v1/models", expect.objectContaining({ dispatcher: expect.anything() }));
  });
});
