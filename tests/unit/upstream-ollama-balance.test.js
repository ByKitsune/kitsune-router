import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { OLLAMA_USAGE_CONFIG } from "../../open-sse/config/ollamaUsageConfig.js";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";
import { parseQuotaData } from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";
import { normalizeQuotasToSnapshot } from "../../src/sse/services/quotaAwareSelection.js";

const connection = { provider: "ollama", apiKey: "fixture-ollama-key" };
const response = (body, status = 200) => Response.json(body, { status });
const mockBalance = (body, historyStatus = 200) => {
  proxyAwareFetch.mockResolvedValueOnce(response({ activity: {} }, historyStatus))
    .mockResolvedValueOnce(response({ Plan: "pro" }))
    .mockResolvedValueOnce(response(body));
};
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());

describe("Ollama Cloud balance migration (9router #5025/#5026)", () => {
  it("restores quota windows from /balance when /usage contains only history", async () => {
    mockBalance({ included: {
      session: { remaining_percent: 85.5, resets_at: "2026-10-29T15:00:00Z" },
      weekly: { remaining_percent: "92", resets_at: 1793462400 },
    } });
    const proxy = { connectionProxyEnabled: true, connectionProxyUrl: "http://fixture.invalid" };
    const usage = await getUsageForProvider(connection, proxy);
    expect(usage).toMatchObject({ plan: "Pro", quotas: {
      "Session (5h)": { used: 14.5, total: 100, remainingPercentage: 85.5, resetAt: "2026-10-29T15:00:00.000Z", unlimited: false },
      "Weekly (7d)": { used: 8, total: 100, remainingPercentage: 92 },
    } });
    expect(usage.quotas["Session (5h)"].remaining).toBeUndefined();
    expect(proxyAwareFetch.mock.calls.map(([url]) => url)).toEqual([
      OLLAMA_USAGE_CONFIG.usageUrl, OLLAMA_USAGE_CONFIG.meUrl, OLLAMA_USAGE_CONFIG.balanceUrl,
    ]);
    for (const [, options, route] of proxyAwareFetch.mock.calls) {
      expect(options.headers.Authorization).toBe("Bearer fixture-ollama-key");
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(route).toEqual(proxy);
    }
  });

  it.each([404, 410])("uses the replacement endpoint after history endpoint HTTP %s", async (status) => {
    mockBalance({ included: { weekly: { remaining_percent: 0 } } }, status);
    expect((await getUsageForProvider(connection)).quotas["Weekly (7d)"]).toMatchObject({ used: 100, remainingPercentage: 0 });
  });

  it("keeps working legacy windows without an unnecessary balance request", async () => {
    proxyAwareFetch.mockResolvedValueOnce(response({ limits: { session: { usage: 0 }, weekly: { usage: 1 } } }))
      .mockResolvedValueOnce(response({ Plan: "max" }));
    expect((await getUsageForProvider(connection)).quotas).toMatchObject({
      "Session (5h)": { remainingPercentage: 100 }, "Weekly (7d)": { remainingPercentage: 0 },
    });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });

  it.each([null, "", true, -1, 101, "not-a-number"])("does not turn invalid remaining observation %s into full/free quota", async (value) => {
    mockBalance({ included: { session: { remaining_percent: value } } });
    expect((await getUsageForProvider(connection)).quotas).toEqual({});
  });

  it("keeps USD allowance separate from remaining purchased credits without inventing spend", async () => {
    mockBalance({ included: { allowance_usd: "2.50", balance_usd: "1.25", period: { until: "2026-11-01T00:00:00Z" } }, purchased: { balance_usd: "10.00" } });
    const usage = await getUsageForProvider(connection);
    expect(usage.quotas["Allowance ($)"]).toEqual({ used: 1.25, total: 2.5, remainingPercentage: 50, resetAt: "2026-11-01T00:00:00.000Z", unlimited: false, unit: "USD" });
    expect(usage.quotas["Purchased Credits"]).toEqual({ balance: 10, isCreditBalance: true, currency: "USD", unit: "USD" });
    const rows = parseQuotaData("ollama", usage);
    expect(rows.find(row => row.isCreditBalance)).toEqual({ name: "Purchased Credits", balance: 10, isCreditBalance: true, currency: "USD", unit: "USD" });
    expect(rows.find(row => row.unit === "USD" && !row.isCreditBalance).remainingPercentage).toBe(50);
  });

  it("preserves an observed zero balance and excludes unobserved amounts", async () => {
    mockBalance({ included: { allowance_usd: "2.5", balance_usd: null }, purchased: { balance_usd: 0 } });
    const usage = await getUsageForProvider(connection);
    expect(usage.quotas["Allowance ($)"]).toBeUndefined();
    expect(usage.quotas["Purchased Credits"].balance).toBe(0);
    const snapshot = normalizeQuotasToSnapshot("ollama", usage);
    expect(snapshot.remainingFraction).toBeNull();
    expect(snapshot.blockingExhausted).toBe(false);
  });

  it.each([401, 403])("does not retry a rejected key through another endpoint (HTTP %s)", async (status) => {
    proxyAwareFetch.mockResolvedValueOnce(response({}, status));
    expect((await getUsageForProvider(connection)).message).toMatch(/invalid or expired/);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("does not describe a failed balance request as a successful empty observation", async () => {
    proxyAwareFetch.mockResolvedValueOnce(response({ activity: {} }))
      .mockResolvedValueOnce(response({ Plan: "free" }))
      .mockResolvedValueOnce(response({}, 503));
    const usage = await getUsageForProvider(connection);
    expect(usage.message).toBe("Unable to fetch Ollama Cloud usage.");
    expect(usage.quotas).toEqual({});
  });

  it("bounds a stalled observation and does not expose transport details", async () => {
    vi.useFakeTimers();
    proxyAwareFetch.mockImplementationOnce((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("private transport detail")), { once: true });
    }));
    const pending = getUsageForProvider(connection);
    await vi.advanceTimersByTimeAsync(OLLAMA_USAGE_CONFIG.timeoutMs);
    expect(await pending).toEqual({ message: "Unable to fetch Ollama Cloud usage." });
    expect(vi.getTimerCount()).toBe(0);
  });
});

// Exercise the real quota view so credit balances cannot acquire an invented
// percentage bar or turn an observed zero balance into an unlimited budget.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as quotaHelpers from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

function renderQuotas(quotas) {
  const require = createRequire(import.meta.url);
  const filename = fileURLToPath(new URL("../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/QuotaTable.js", import.meta.url));
  const code = require("next/dist/compiled/babel/core").transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
    plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
  }).code;
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports, Intl, Date,
    require(id) {
      if (id === "./utils") return quotaHelpers;
      if (id === "@/i18n/runtime") return { onLocaleChange: () => () => {}, translate: (text, params = {}) => text.replace(/\{(\w+)\}/g, (part, key) => params[key] ?? part) };
      if (id === "@/shared/constants/locales") return { readDisplayLocale: () => "en" };
      return require(id);
    },
  }, { filename });
  return renderToStaticMarkup(React.createElement(fixtureModule.exports.default, { quotas }));
}

describe("Ollama quota monetary display", () => {
  it.each([0, 10])("renders an observed USD balance %s without inventing spent/total or percent", (balance) => {
    const rows = parseQuotaData("ollama", { quotas: { "Purchased Credits": { balance, isCreditBalance: true, currency: "USD", unit: "USD" } } });
    const html = renderQuotas(rows);
    expect(html).toContain("Remaining balance");
    expect(html).toContain(`$${balance.toFixed(2)}`);
    expect(html).not.toContain("0 / ");
    expect(html).not.toContain("100%");
    expect(html).not.toContain("∞");
    expect(html).not.toContain("Unlimited");
    expect(html).not.toContain("width:");
    expect(html).not.toContain("NaN");
  });

  it("renders included USD allowance with its genuine used/total and percent", () => {
    const rows = parseQuotaData("ollama", { quotas: { "Allowance ($)": { used: 1.25, total: 2.5, remainingPercentage: 50, unit: "USD", unlimited: false } } });
    const html = renderQuotas(rows);
    expect(html).toContain("$1.25 / $2.50");
    expect(html).toContain("50%");
  });
});
