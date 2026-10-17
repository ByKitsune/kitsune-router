/**
 * Google usage handlers (Gemini CLI + Antigravity)
 */

import { CLIENT_METADATA } from "../../config/appConstants.js";
import { ANTIGRAVITY_CLI_USER_AGENT, ANTIGRAVITY_CLI_VERSION } from "../../providers/shared.js";
import { PROVIDER_MODELS } from "../../providers/index.js";
import { normalizeAntigravityQuota, parseAntigravityQuotaSummary } from "./antigravity.js";
import { U, parseResetTime, normalizeCloudCodeProjectId, fetchWithTimeout } from "./shared.js";

const ANTIGRAVITY_CONFIG = U("antigravity");
const antigravityModelIds = new Set((PROVIDER_MODELS.ag || []).map(({ id }) => id));

function antigravityUsageHeaders(accessToken) {
  return {
    "Authorization": `Bearer ${accessToken}`,
    "User-Agent": ANTIGRAVITY_CLI_USER_AGENT,
    "Content-Type": "application/json",
    "X-Client-Name": "antigravity",
    "X-Client-Version": ANTIGRAVITY_CLI_VERSION,
  };
}

/**
 * Gemini CLI Usage — fetch per-model quota via Cloud Code Assist API.
 * Uses retrieveUserQuota (same endpoint as `gemini /stats`) returning
 * per-model buckets with remainingFraction + resetTime.
 */
export async function getGeminiUsage(accessToken, providerSpecificData, proxyOptions = null) {
  if (!accessToken) {
    return { plan: "Free", message: "Gemini CLI access token not available." };
  }

  try {
    // Resolve project id: prefer connection-stored id, else loadCodeAssist lookup.
    // #1271: OAuth save stores projectId on the connection, not providerSpecificData.
    let projectId = normalizeCloudCodeProjectId(providerSpecificData?.projectId);
    let plan = "Free";

    if (!projectId) {
      const subInfo = await getGeminiSubscriptionInfo(accessToken, proxyOptions);
      projectId = normalizeCloudCodeProjectId(subInfo?.cloudaicompanionProject);
      plan = subInfo?.currentTier?.name || plan;
    }

    if (!projectId) {
      return {
        plan,
        message: "Gemini CLI project ID not available. Reconnect Gemini CLI, or configure a Google Cloud project with Gemini Code Assist access before checking quota.",
      };
    }

    const response = await fetchWithTimeout(
      U("gemini-cli").quotaUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project: projectId }),
      },
      10000,
      proxyOptions
    );

    if (!response.ok) {
      return { plan, message: `Gemini CLI quota error (${response.status}).` };
    }

    const data = await response.json();
    const quotas = {};

    if (Array.isArray(data.buckets)) {
      for (const bucket of data.buckets) {
        if (!bucket.modelId || bucket.remainingFraction == null) continue;

        const remainingFraction = Number(bucket.remainingFraction) || 0;
        const total = 1000; // Normalized base, matches antigravity convention
        const remaining = Math.round(total * remainingFraction);
        const used = Math.max(0, total - remaining);

        quotas[bucket.modelId] = {
          used,
          total,
          resetAt: parseResetTime(bucket.resetTime),
          remainingPercentage: remainingFraction * 100,
          unlimited: false,
        };
      }
    }

    return { plan, quotas };
  } catch (error) {
    return { message: `Gemini CLI error: ${error.message}` };
  }
}

/**
 * Get Gemini CLI subscription info via loadCodeAssist
 */
async function getGeminiSubscriptionInfo(accessToken, proxyOptions = null) {
  try {
    const response = await fetchWithTimeout(
      U("gemini-cli").loadCodeAssistUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ metadata: CLIENT_METADATA }),
      },
      10000,
      proxyOptions
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Antigravity Usage - Fetch quota from Google Cloud Code API
 */
export async function getAntigravityUsage(accessToken, providerSpecificData, proxyOptions = null) {
  try {
    // Fetch subscription info once — reuse for both projectId and plan
    const subscriptionInfo = await getAntigravitySubscriptionInfo(accessToken, proxyOptions);
    const projectId = normalizeCloudCodeProjectId(subscriptionInfo?.cloudaicompanionProject)
      || normalizeCloudCodeProjectId(providerSpecificData?.projectId);

    const response = await fetchWithTimeout(ANTIGRAVITY_CONFIG.quotaApiUrl, {
      method: "POST",
      headers: antigravityUsageHeaders(accessToken),
      body: JSON.stringify({
        ...(projectId ? { project: projectId } : {})
      }),
    }, 10000, proxyOptions);

    if (response.status === 403) {
      return {
        message: "Antigravity quota API access forbidden. Chat may still work.",
        quotas: {}
      };
    }

    if (response.status === 401) {
      return {
        message: "Antigravity quota API authentication expired. Chat may still work.",
        quotas: {}
      };
    }

    if (!response.ok) {
      throw new Error(`Antigravity API error: ${response.status}`);
    }

    const data = await response.json();
    const quotas = {};

    if (data.models && typeof data.models === "object") {
      for (const [modelKey, info] of Object.entries(data.models)) {
        if (!info?.quotaInfo || info.isInternal || !antigravityModelIds.has(modelKey)) continue;
        const quota = normalizeAntigravityQuota(info.quotaInfo, info.displayName || modelKey);
        if (quota) quotas[modelKey] = quota;
      }
    }

    // Summary access is optional. A denied or malformed summary must not turn
    // a valid per-model reading into an error or a fabricated quota window.
    if (ANTIGRAVITY_CONFIG.quotaSummaryApiUrl) {
      try {
        const summaryResponse = await fetchWithTimeout(ANTIGRAVITY_CONFIG.quotaSummaryApiUrl, {
          method: "POST",
          headers: antigravityUsageHeaders(accessToken),
          body: JSON.stringify(projectId ? { project: projectId } : {}),
        }, 10000, proxyOptions);
        if (summaryResponse.ok) {
          Object.assign(quotas, parseAntigravityQuotaSummary(await summaryResponse.json()));
        } else {
          console.warn("[Antigravity Usage] Quota summary unavailable:", summaryResponse.status);
        }
      } catch (error) {
        console.warn("[Antigravity Usage] Quota summary unavailable:", error.message);
      }
    }

    return {
      plan: subscriptionInfo?.currentTier?.name || "Unknown",
      quotas,
      subscriptionInfo,
    };
  } catch (error) {
    console.error("[Antigravity Usage] Error:", error.message, error.cause);
    return { message: `Antigravity error: ${error.message}` };
  }
}

/**
 * Get Antigravity subscription info
 */
async function getAntigravitySubscriptionInfo(accessToken, proxyOptions = null) {
  try {
    const response = await fetchWithTimeout(ANTIGRAVITY_CONFIG.loadProjectApiUrl, {
      method: "POST",
      headers: antigravityUsageHeaders(accessToken),
      body: JSON.stringify({ metadata: { ...CLIENT_METADATA, clientVersion: ANTIGRAVITY_CLI_VERSION }, mode: 1 }),
    }, 10000, proxyOptions);

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Antigravity Subscription] Error:", error.message);
    return null;
  }
}
