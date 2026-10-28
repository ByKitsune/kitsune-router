import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { getSettings, isApiKeyRequired } from "@/lib/localDb";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleImageGenerationCore } from "open-sse/handlers/imageGenerationCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { handleComboChat } from "open-sse/services/combo.js";
import * as log from "../utils/logger.js";
import { randomUUID } from "node:crypto";
import { enqueueRequestUsage } from "@/lib/usageDb.js";
import { publicMessage } from "open-sse/utils/clientErrors.js";
import { withInferenceLimit } from "@/lib/rateLimit/inferenceLimit.js";

// Providers that don't require credentials (noAuth)
const NO_AUTH_PROVIDERS = new Set(["sdwebui", "comfyui"]);

// Persist exact provider-reported usage for image requests (9router #4643):
// Codex image generation reports tokens on the Responses stream, but the
// image path never entered the chat usage pipeline, so those requests and
// their tokens were missing from usage history, provider/model statistics
// and request counts. Only exact integer counts are recorded — no
// fabricated 0/0 rows.
function recordImageRequestUsage({ provider, model, connectionId, apiKey, endpoint, eventId, timestamp, usage, status = "success" }) {
  if (!usage || typeof usage !== "object" || usage.estimated === true) return;
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  if (!Number.isSafeInteger(promptTokens) || promptTokens < 0 ||
      !Number.isSafeInteger(completionTokens) || completionTokens < 0 ||
      promptTokens + completionTokens === 0) {
    return;
  }

  return enqueueRequestUsage({
    eventId,
    timestamp,
    provider,
    model,
    connectionId: connectionId || undefined,
    apiKey: apiKey || undefined,
    endpoint: endpoint || null,
    tokens: structuredClone(usage),
    status,
  });
}

/**
 * Handle image generation request
 * @param {Request} request
 */
export async function handleImageGeneration(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const url = new URL(request.url);
  const preferredConnectionId = request.headers.get("x-connection-id") || null;
  const wantsStream = (request.headers.get("accept") || "").includes("text/event-stream");
  const binaryOutput = url.searchParams.get("response_format") === "binary";
  const modelStr = body.model;

  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (isApiKeyRequired(settings)) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  return withInferenceLimit(request, apiKey, async () => {
    if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
    if (!body.prompt) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: prompt");

    // Combo expansion: model may be a combo name → run fallback/round-robin across models
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      const comboStrategies = settings.comboStrategies || {};
      const comboStrategy = comboStrategies[modelStr]?.fallbackStrategy || settings.comboStrategy || "fallback";
      const comboStickyLimit = settings.comboStickyRoundRobinLimit;
      let usageFailureResponse;
      log.info("IMAGE", `Combo "${modelStr}" with ${comboModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
      return handleComboChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m) => usageFailureResponse || handleSingleModelImage(b, m, {
          wantsStream, binaryOutput, preferredConnectionId, apiKey, endpoint: url.pathname, clientSignal: request.signal,
          onUsageAcceptanceFailure: response => { usageFailureResponse = response; },
        }),
        log,
        signal: request.signal,
        comboName: modelStr,
        comboStrategy,
        comboStickyLimit,
      });
    }

    return handleSingleModelImage(body, modelStr, { wantsStream, binaryOutput, preferredConnectionId, apiKey, endpoint: url.pathname, clientSignal: request.signal });
  });
}

async function handleSingleModelImage(body, modelStr, { wantsStream, binaryOutput, preferredConnectionId, apiKey, endpoint, onUsageAcceptanceFailure, clientSignal } = {}) {
  const cancelled = () => errorResponse(499, "Client closed request");
  if (clientSignal?.aborted) return cancelled();
  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");

  const { provider, model } = modelInfo;

  // noAuth providers — no credential needed
  if (NO_AUTH_PROVIDERS.has(provider)) {
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();
    const result = await handleImageGenerationCore({
      body, modelInfo: { provider, model }, credentials: null, binaryOutput, clientSignal,
      onUsage: (usage, terminal = {}) => recordImageRequestUsage({ provider, model, apiKey, endpoint, eventId, timestamp, usage, status: terminal.status }),
    });
    // The combo can return 499 before a cancelled attempt's accounting settles.
    if (clientSignal?.aborted && result.diagnostics?.code === "usage_acceptance_failed") {
      log.error("IMAGE", "Durable usage acceptance failed after client cancellation");
    }
    if (result.localFailure) onUsageAcceptanceFailure?.(result.response);
    return result.response;
  }

  // Credentialed providers — fallback loop
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model, { preferredConnectionId });

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        return errorResponse(HTTP_STATUS.BAD_REQUEST, publicMessage("no_credentials"));
      }
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    if (clientSignal?.aborted) return cancelled();
    let refreshedCredentials;
    try { refreshedCredentials = await checkAndRefreshToken(provider, credentials, { signal: clientSignal }); }
    catch (error) {
      if (clientSignal?.aborted) return cancelled();
      if (error?.code === "STALE_CONNECTION_WRITE") {
        const response = errorResponse(503, "Credentials changed during refresh", { code: error.code });
        onUsageAcceptanceFailure?.(response);
        return response;
      }
      throw error;
    }
    if (clientSignal?.aborted) return cancelled();
    const usageEventId = randomUUID();
    const usageTimestamp = new Date().toISOString();
    let usageAcceptance;

    const result = await handleImageGenerationCore({
      body,
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      streamToClient: wantsStream,
      binaryOutput,
      clientSignal,
      onCredentialsRefreshed: async (newCreds) => {
        const committed = await updateProviderCredentials(credentials.connectionId, {
          accessToken: newCreds.accessToken,
          refreshToken: newCreds.refreshToken,
          providerSpecificData: newCreds.providerSpecificData,
          testStatus: "active"
        }, { expected: refreshedCredentials._writeFence });
        if (committed === false) throw Object.assign(new Error("Credentials changed during refresh"), { code: "STALE_CONNECTION_WRITE" });
      },
      onUsage: (usage, terminal = {}) => {
        if (!usageAcceptance) {
          const pending = recordImageRequestUsage({
            provider,
            model,
            connectionId: credentials.connectionId,
            apiKey,
            endpoint,
            eventId: usageEventId,
            timestamp: usageTimestamp,
            usage,
            status: clientSignal?.aborted ? "aborted" : terminal.status || "success",
          });
          if (pending) {
            usageAcceptance = pending.catch(() => {
              log.error("IMAGE", "Durable usage acceptance failed");
              throw Object.assign(new Error("Usage accounting could not be accepted"), { code: "usage_acceptance_failed" });
            });
            usageAcceptance.catch(() => {});
          }
        }
        return usageAcceptance;
      },
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
      }
    });

    if (usageAcceptance) {
      try { await usageAcceptance; }
      catch {
        await result.response?.body?.cancel().catch(() => {});
        const response = errorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, "Usage accounting could not be accepted", { code: "usage_acceptance_failed" });
        onUsageAcceptanceFailure?.(response);
        return response;
      }
    }
    if (result.localFailure) { onUsageAcceptanceFailure?.(result.response); return result.response; }
    if (clientSignal?.aborted || result.status === 499) return cancelled();
    if (result.success) return result.response;

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);

    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}
