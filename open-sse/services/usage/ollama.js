import { OLLAMA_USAGE_CONFIG } from "../../config/ollamaUsageConfig.js";
import { fetchWithTimeout, parseResetTime } from "./shared.js";

// Missing, boolean, empty and non-finite observations are unknown, never zero.
function observation(value) {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function percentageQuota(remaining, resetAt = null) {
  if (remaining === null || remaining > 100) return null;
  return {
    used: Math.round((100 - remaining) * 100) / 100,
    total: 100,
    remainingPercentage: remaining,
    resetAt: parseResetTime(resetAt),
    unlimited: false,
  };
}

/** Read-only Ollama Cloud quotas. No inference request or price is inferred. */
export async function getOllamaUsage(apiKey, providerSpecificData, proxyOptions = null) {
  if (!apiKey) return { message: "Ollama Cloud API key not available." };
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const request = (url, options = {}) => fetchWithTimeout(url, { ...options, headers: { ...headers, ...options.headers } }, OLLAMA_USAGE_CONFIG.timeoutMs, proxyOptions);
  try {
    const response = await request(OLLAMA_USAGE_CONFIG.usageUrl);
    if (response.status === 401 || response.status === 403) return { message: "Ollama Cloud API key invalid or expired." };
    // A removed history endpoint can still be superseded by the balance API.
    if (!response.ok && response.status !== 404 && response.status !== 410) return { message: `Ollama Cloud usage API error (${response.status}).` };
    let data = null;
    if (response.ok) {
      try { data = await response.json(); }
      catch { return { message: "Ollama Cloud usage response was not JSON." }; }
    }
    const me = await request(OLLAMA_USAGE_CONFIG.meUrl, { method: "POST", headers: { "Content-Length": "0" } })
      .then((result) => result.ok ? result.json() : null).catch(() => null);
    const planRaw = typeof me?.Plan === "string" ? me.Plan.trim() : "";
    const plan = planRaw ? planRaw.charAt(0).toUpperCase() + planRaw.slice(1).toLowerCase() : "Ollama Cloud";
    const quotas = {};
    for (const [key, name] of [["session", "Session (5h)"], ["weekly", "Weekly (7d)"]]) {
      const ratio = observation(data?.limits?.[key]?.usage);
      if (ratio !== null && ratio <= 1) quotas[name] = percentageQuota(100 - ratio * 100);
    }
    if (Object.keys(quotas).length) return { plan, quotas };

    // #5026: /api/usage may contain only history. Current quotas live in balance.
    const balanceResponse = await request(OLLAMA_USAGE_CONFIG.balanceUrl);
    if (balanceResponse.status === 401 || balanceResponse.status === 403) return { plan, message: "Ollama Cloud API key invalid or expired.", quotas };
    if (!balanceResponse.ok && balanceResponse.status !== 404 && balanceResponse.status !== 410) return { plan, message: "Unable to fetch Ollama Cloud usage.", quotas };
    const balance = balanceResponse.ok ? await balanceResponse.json() : null;
    for (const [key, name] of [["session", "Session (5h)"], ["weekly", "Weekly (7d)"]]) {
      const quota = percentageQuota(observation(balance?.included?.[key]?.remaining_percent), balance?.included?.[key]?.resets_at);
      if (quota) quotas[name] = quota;
    }
    const allowance = observation(balance?.included?.allowance_usd);
    const remaining = observation(balance?.included?.balance_usd);
    if (allowance !== null && allowance > 0 && remaining !== null) {
      quotas["Allowance ($)"] = {
        used: Math.max(0, allowance - remaining), total: allowance,
        remainingPercentage: Math.min(100, Math.round(remaining / allowance * 10000) / 100),
        resetAt: parseResetTime(balance?.included?.period?.until), unlimited: false, unit: "USD",
      };
    }
    const purchased = observation(balance?.purchased?.balance_usd);
    if (purchased !== null) {
      // A remaining credit balance has no observed original allotment or spent
      // amount. Do not fabricate used=0/total=balance or a full 100% budget bar.
      quotas["Purchased Credits"] = { balance: purchased, isCreditBalance: true, currency: "USD", unit: "USD" };
    }
    return Object.keys(quotas).length
      ? { plan, quotas }
      : { plan, message: "Ollama Cloud connected. No usage limits reported.", quotas };
  } catch {
    return { message: "Unable to fetch Ollama Cloud usage." };
  }
}
