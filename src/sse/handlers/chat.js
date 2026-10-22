import "open-sse/index.js";

import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { handleAntigravityQuotaError, clearAntigravityStrikes } from "../services/antigravityQuota.js";
import { getSettings, isApiKeyRequired } from "@/lib/localDb";
import { getDisabledByProvider } from "@/lib/disabledModelsDb";
import { getModelInfo, getComboModels, resolveModelCapabilities } from "../services/model.js";
import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { DEFAULT_HEADROOM_URL } from "@/lib/headroom/detect";
import { getTransform as getPxpipeTransform } from "@/lib/pxpipe/loader.js";
import { appendPxpipeEvent } from "@/lib/pxpipe/events.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { handleComboChat, handleFusionChat, detectRequiredCapabilities } from "open-sse/services/combo.js";
import { classifyAvailabilityError } from "open-sse/services/accountFallback.js";
import { augmentModelsWithCapacityAdapter, withCapacityAdapterStripping, getActiveAdapterStrategy, getCapacityAdapterModels } from "open-sse/services/capacityAdapter.js";
import { handleBypassRequest } from "open-sse/utils/bypassHandler.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { correlateResponse } from "../utils/requestCorrelation.js";
import { detectFormatByEndpoint, FORMATS } from "open-sse/translator/formats.js";
import { ANTIGRAVITY_RETIRED_FLASH_IDS, ANTIGRAVITY_RETIRED_MODEL_ERROR } from "open-sse/config/antigravity.js";
import { stripThinkingSuffix } from "open-sse/translator/concerns/thinkingUnified.js";
import { resolveSessionId } from "open-sse/utils/sessionManager.js";
import * as log from "../utils/logger.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { getProjectIdForConnection } from "open-sse/services/projectId.js";
import { stripModelContextMarker } from "open-sse/utils/modelMarkers.js";
import { redactAccountName } from "@/shared/utils/accountRedaction.js";
import { publicMessage } from "open-sse/utils/clientErrors.js";
import { consume, rateLimitKey, rateLimitHeaders, rateLimitedResponse } from "@/lib/rateLimit/v1Limiter.js";
import { getClientIp } from "@/lib/auth/loginLimiter.js";
import { readRequestJson, RequestBodyError } from "@/shared/utils/requestJson.js";

// Attach the advisory x-ratelimit-* headers to a response.
//
// Takes the limiter result explicitly rather than reading module state, so it is
// pure and testable. Copies into a new Response instead of mutating: the body
// may be a live SSE ReadableStream, and constructing a Response around the same
// stream preserves it (no buffering, no re-read).
function withRateLimitHeaders(response, limitInfo) {
  if (!limitInfo || !(response instanceof Response) || response.bodyUsed) return response;
  try {
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(rateLimitHeaders(limitInfo))) headers.set(k, v);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    // Never let advisory headers break a response.
    return response;
  }
}

/**
 * Handle chat completion request
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
 * Format detection and translation handled by translator
 * options are trusted internal route controls, never client query parameters.
 */
export async function handleChat(request, clientRawRequest = null, serverRequestId = crypto.randomUUID(), options = {}) {
  try {
    const response = await handleChatInternal(request, clientRawRequest, serverRequestId, options);
    return correlateResponse(response, serverRequestId);
  } catch (error) {
    // Previously a bare `catch {}`: any unexpected exception anywhere in the
    // chat pipeline (translation, executor, DB, streaming) collapsed into
    // "Chat request failed" with no stack trace and no trace of the
    // serverRequestId the client received — so the id was useless for
    // correlation. errorLine() is always printed regardless of LOG_LEVEL
    // (an unexpected crash must never be hidden by log configuration).
    // Identity + stack only; never the prompt or the response body.
    const detail = `${error?.name || "Error"}: ${error?.message || error}`;
    if (log.errorLine) log.errorLine("CHAT", "❌", `[${serverRequestId}] unhandled failure: ${detail}`);
    if (error?.stack) console.error(`[${serverRequestId}] ${error.stack}`);
    return correlateResponse(errorResponse(HTTP_STATUS.SERVER_ERROR, "Chat request failed"), serverRequestId);
  }
}

async function handleChatInternal(request, clientRawRequest = null, serverRequestId, options = {}) {
  if (request?.signal?.aborted) {
    return errorResponse(499, "Client Closed Request", { code: "client_aborted" });
  }
  // Authenticate and rate-limit before reading or decompressing any body.
  // Keep auth error semantics and auth -> limiter -> routing order unchanged.
  // Log API key (masked)
  const authHeader = request.headers.get("Authorization");
  const apiKey = extractApiKey(request);
  if (authHeader && apiKey) {
    const masked = log.maskKey(apiKey);
    log.debug("AUTH", `API Key: ${masked}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings
  const settings = await getSettings();
  if (isApiKeyRequired(settings)) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  // Inbound rate limit, after authentication so the bucket is attributable.
  // Keyed by the API key (many clients share one NAT); an unauthenticated
  // request falls back to the peer address so a missing key cannot become an
  // unmetered path. Counters are hashed, bounded and in-memory — see
  // src/lib/rateLimit/v1Limiter.js for the reasoning and the tunables.
  const rateLimit = consume(apiKey ? rateLimitKey(apiKey) : `ip:${getClientIp(request)}`);
  if (!rateLimit.allowed) {
    log.warn("RATELIMIT", `429 for ${apiKey ? log.maskKey(apiKey) : "unauthenticated"} (limit ${rateLimit.limit}/min)`);
    return rateLimitedResponse(rateLimit, { "Access-Control-Allow-Origin": "*" });
  }

  let body;
  try {
    body = await readRequestJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RequestBodyError(HTTP_STATUS.BAD_REQUEST, "JSON body must be an object", "bad_request");
    }
    // Compact shares the original request's auth, rate bucket, decoder and
    // signal. Apply its internal marker only after bounded JSON validation.
    if (options.compact === true) body = { ...body, _compact: true };
  } catch (error) {
    if (error instanceof RequestBodyError) {
      log.warn("CHAT", error.message);
      return withRateLimitHeaders(errorResponse(error.status, error.message, {
        type: error.type, code: error.code, param: error.param,
      }), rateLimit);
    }
    log.warn("CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  // Build clientRawRequest for logging (if not provided)
  if (!clientRawRequest) {
    const url = new URL(request.url);
    clientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: Object.fromEntries(request.headers.entries()),
      serverRequestId
    };
  } else {
    clientRawRequest = { ...clientRawRequest, serverRequestId };
  }
  // Per OpenAI Chat Completions API spec, stream defaults to false (#4122)
  const endpointPath = clientRawRequest?.endpoint || (request?.url ? new URL(request.url).pathname : "");
  if (endpointPath.includes("/chat/completions") && body.stream === undefined) {
    body = { ...body, stream: false };
    if (clientRawRequest?.body) clientRawRequest.body = { ...clientRawRequest.body, stream: false };
  }

  let modelStr = body.model;
  // Claude Code 1M-context beta appends "[1m]" to model name (e.g. "claude-opus-5[1m]")
  // while the capability rides in anthropic-beta header. Strip the marker for routing
  // so combo lookup and provider/model parsing succeed. See decolua/9router#3690.
  const { model: cleanModel, contextMarker } = stripModelContextMarker(modelStr);
  if (contextMarker) {
    log.debug("CHAT", `Stripped [${contextMarker}] marker: "${modelStr}" -> "${cleanModel}"`);
    modelStr = cleanModel;
    body = { ...body, model: cleanModel };
  }

  // Request summary is emitted as the unified "▶" line in chatCore (has fmt/thinking/account)

  if (!modelStr) {
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  // Bypass naming/warmup requests before combo rotation to avoid wasting rotation slots
  const userAgent = request?.headers?.get("user-agent") || "";
  const bypassResponse = handleBypassRequest(body, modelStr, userAgent, !!settings.ccFilterNaming);
  if (bypassResponse) return bypassResponse.response || bypassResponse;

  const requiredCapabilities = detectRequiredCapabilities(body);

  // Check if model is a combo (has multiple models with fallback)
  const comboModels = await getComboModels(modelStr);
  if (comboModels) {
    // Check for combo-specific strategy first, fallback to global
    const comboStrategies = settings.comboStrategies || {};
    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
    const comboStrategy = comboSpecificStrategy || settings.comboStrategy || "fallback";
    const modelCapabilities = requiredCapabilities.size
      ? await resolveModelCapabilities([...comboModels, ...getCapacityAdapterModels(settings, requiredCapabilities)]) : null;
    const augmentedModels = augmentModelsWithCapacityAdapter(comboModels, requiredCapabilities, settings, modelCapabilities);
    const adapterAdded = augmentedModels.filter((m) => !comboModels.includes(m));

    if (comboStrategy === "fusion") {
      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
      return handleFusionChat({
        body,
        models: comboModels,
        modelCapabilities,
        signal: request?.signal || null,
        handleSingleModel: (b, m, isPanel, attemptSignal) => {
          // The body is already parsed; this request only carries per-attempt
          // cancellation and the original routing/header metadata.
          const attemptRequest = attemptSignal ? new Request(request.url, {
            method: request.method || "POST", headers: request.headers, signal: attemptSignal,
          }) : request;
          let cleanRawReq = clientRawRequest;
          if (isPanel && clientRawRequest) {
            const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
            cleanRawReq = { ...clientRawRequest, body: cleanBody };
          }
          return handleSingleModelChat(b, m, cleanRawReq, attemptRequest, apiKey, rateLimit);
        },
        log,
        comboName: modelStr,
        judgeModel: comboStrategies[modelStr]?.judgeModel,
        tuning: comboStrategies[modelStr]?.fusionTuning,
      });
    }

    const comboStickyLimit = settings.comboStickyRoundRobinLimit;
    log.info("CHAT", `Combo "${modelStr}" with ${augmentedModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
    return handleComboChat({
      body,
      models: augmentedModels,
      modelCapabilities,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, rateLimit),
        adapterAdded, modelCapabilities
      ),
      log,
      comboName: modelStr,
      comboStrategy,
      comboStickyLimit
    });
  }

  // Single model request — may still switch to a capacity-adapter model if the
  // target lacks a capability the request needs (e.g. no vision, request has an image).
  const modelCapabilities = requiredCapabilities.size
    ? await resolveModelCapabilities([modelStr, ...getCapacityAdapterModels(settings, requiredCapabilities)]) : null;
  const soloAugmented = augmentModelsWithCapacityAdapter([modelStr], requiredCapabilities, settings, modelCapabilities);
  if (soloAugmented.length > 1) {
    const adapterAdded = soloAugmented.filter((m) => m !== modelStr);
    log.info("CHAT", `Capacity adapter for [${[...requiredCapabilities].join(",")}] on "${modelStr}" → trying ${soloAugmented.join(", ")}`);
    return handleComboChat({
      body,
      models: soloAugmented,
      modelCapabilities,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, rateLimit),
        adapterAdded, modelCapabilities
      ),
      log,
      comboName: modelStr,
      comboStrategy: getActiveAdapterStrategy(requiredCapabilities, settings)
    });
  }

  return handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey, rateLimit);
}

/**
 * Handle single model chat request
 */
async function handleSingleModelChat(body, modelStr, clientRawRequest = null, request = null, apiKey = null, rateLimit = null) {
  // Optional account pinning, same opt-in header as the image/video endpoints:
  // `x-connection-id: <providerConnection id>` (9router #4718). Falls back to
  // the normal account strategy when the header is absent or the id is
  // unknown/unavailable — getProviderCredentials only honors ids that are in
  // the resolved provider's active, unexcluded, unlocked selectable set, so a
  // pinned id can never select a cross-provider account.
  const preferredConnectionId = request?.headers?.get("x-connection-id") || null;
  const modelInfo = await getModelInfo(modelStr);

  // If provider is null, this might be a combo name - check and handle
  if (!modelInfo.provider) {
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      const chatSettings = await getSettings();
      // Check for combo-specific strategy first, fallback to global
      const comboStrategies = chatSettings.comboStrategies || {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy = comboSpecificStrategy || chatSettings.comboStrategy || "fallback";
      const requiredCapabilities = detectRequiredCapabilities(body);
      const modelCapabilities = requiredCapabilities.size
        ? await resolveModelCapabilities([...comboModels, ...getCapacityAdapterModels(chatSettings, requiredCapabilities)]) : null;
      const augmentedModels = augmentModelsWithCapacityAdapter(comboModels, requiredCapabilities, chatSettings, modelCapabilities);
      const adapterAdded = augmentedModels.filter((m) => !comboModels.includes(m));

      if (comboStrategy === "fusion") {
        log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
        return handleFusionChat({
          body,
          models: comboModels,
          modelCapabilities,
          signal: request?.signal || null,
          handleSingleModel: (b, m, isPanel, attemptSignal) => {
            const attemptRequest = attemptSignal ? new Request(request.url, {
              method: request.method || "POST", headers: request.headers, signal: attemptSignal,
            }) : request;
            let cleanRawReq = clientRawRequest;
            if (isPanel && clientRawRequest) {
              const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
              cleanRawReq = { ...clientRawRequest, body: cleanBody };
            }
            return handleSingleModelChat(b, m, cleanRawReq, attemptRequest, apiKey, rateLimit);
          },
          log,
          comboName: modelStr,
          judgeModel: comboStrategies[modelStr]?.judgeModel,
          tuning: comboStrategies[modelStr]?.fusionTuning,
        });
      }

      const comboStickyLimit = chatSettings.comboStickyRoundRobinLimit;
      log.info("CHAT", `Combo "${modelStr}" with ${augmentedModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
      return handleComboChat({
        body,
        models: augmentedModels,
        modelCapabilities,
        handleSingleModel: withCapacityAdapterStripping(
          (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, rateLimit),
          adapterAdded, modelCapabilities
        ),
        log,
        comboName: modelStr,
        comboStrategy,
        comboStickyLimit
      });
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;

  // Disabled models are gated at routing time, not just hidden in listings:
  // a dashboard-disabled model must not reach an upstream account (#4249).
  // Combo members funnel through here too, so each member is gated in turn.
  try {
    const disabled = await getDisabledByProvider(provider);
    if (Array.isArray(disabled) && disabled.includes(model)) {
      log.warn("CHAT", `Model disabled by operator: ${provider}/${model}`);
      log.warn("CHAT", `Model ${provider}/${model} is disabled by configuration`);
      return errorResponse(HTTP_STATUS.FORBIDDEN, publicMessage("model_disabled"));
    }
  } catch {
    // Fail-open: a disabled-list read failure must not block routing.
  }

  // Reject only proven runtime retirements, after alias resolution but before
  // credentials/refresh/project lookup. A model-scoped 410 lets an explicitly
  // configured combo advance without account rotation, health writes or usage.
  // Never infer retirement by scanning generated prose or from deprecated flags.
  if (provider === FORMATS.ANTIGRAVITY && ANTIGRAVITY_RETIRED_FLASH_IDS.has(stripThinkingSuffix(model))) {
    if (request?.signal?.aborted) return withRateLimitHeaders(errorResponse(499, "Client Closed Request"), rateLimit);
    const { status, error } = ANTIGRAVITY_RETIRED_MODEL_ERROR;
    log.warn("CHAT", `Retired model requested: ${provider}/${model}`);
    return withRateLimitHeaders(errorResponse(status, error.message, error), rateLimit);
  }

  // Routing shown in the unified "▶" line (client model → provider/model)

  // Extract userAgent from request
  const userAgent = request?.headers?.get("user-agent") || "";

  // Session key for the session-sticky account strategy (derived once per
  // logical request; cheap and sync). Absent clients degrade to fill-first.
  let sessionKey = "";
  try {
    sessionKey = resolveSessionId({ headers: clientRawRequest?.headers || {}, body, scope: provider }) || "";
  } catch {
    sessionKey = "";
  }

  // Try with available accounts (fallback on errors)
  const excludeConnectionIds = new Set();
  // Accounts already granted one immediate retry for a sporadic 5xx.
  const retriedConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;
  // Structured error response built by the engine for the last failure. Its
  // body is Zen-authored (type/code/param), so it is safe to forward; the raw
  // upstream text lives in lastError and is never sent to a client.
  let lastResponse = null;
  let lastServiceTierDenial = null;
  let consecutiveSameErrors = 0;
  const MAX_CONSECUTIVE_SAME_ERRORS = 3;

  while (true) {
    if (request?.signal?.aborted) {
      log.warn("CHAT", "Client aborted before upstream connection");
      return errorResponse(499, "Client Closed Request");
    }

    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model, { sessionKey, preferredConnectionId });
    if (request?.signal?.aborted) return withRateLimitHeaders(errorResponse(499, "Client Closed Request"), rateLimit);

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      // Locally known tier ineligibility is not quota exhaustion. If no
      // eligible account was attempted, retain the actionable tier error.
      if (lastServiceTierDenial && !lastResponse) return withRateLimitHeaders(lastServiceTierDenial, rateLimit);
      // A fresh structured upstream/request failure is more precise than the
      // aggregate cooldown snapshot created by that same failed attempt.
      if (lastResponse) return withRateLimitHeaders(lastResponse, rateLimit);
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = Number(credentials.lastErrorCode) === 429
          ? HTTP_STATUS.RATE_LIMITED : HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        // The client gets a neutral message: the previous body embedded
        // `[provider/model]` plus the raw upstream error text, which leaked both
        // the routing provider and internal wording.
        return unavailableResponse(
          status,
          publicMessage("all_accounts_unavailable"),
          credentials.retryAfter,
          credentials.retryAfterHuman,
        );
      }
      if (excludeConnectionIds.size === 0) {
        // Full detail stays in the operator log; the client gets a neutral message
        // that does not name the upstream provider (see clientErrors.js).
        log.warn("AUTH", `No active credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, publicMessage("no_credentials"));
      }
      log.warn("CHAT", "No more accounts available", { provider });
      // Prefer the structured error the engine already built for this failure.
      //
      // That response carries machine-readable diagnostics produced by Zen
      // itself (`type`/`code`/`param`, e.g. `output_budget_exhausted` with a
      // "increase max_tokens or reduce reasoning effort" message) which are
      // actionable for the caller and reveal nothing about routing. Only the
      // free-text `lastError` — which can quote an upstream body naming the
      // provider/account — is withheld in favour of a neutral message.
      return lastResponse || errorResponse(
        lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE,
        publicMessage("all_accounts_unavailable"),
      );
    }

    // Account selection shown in the unified "▶" line (acc:...)
    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    // Ensure real project ID is available for providers that need it (P0 fix: cold miss)
    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const connProxyOptions = {
        connectionProxyEnabled: refreshedCredentials.providerSpecificData?.connectionProxyEnabled === true,
        connectionProxyUrl: refreshedCredentials.providerSpecificData?.connectionProxyUrl || "",
        connectionNoProxy: refreshedCredentials.providerSpecificData?.connectionNoProxy || "",
        vercelRelayUrl: refreshedCredentials.providerSpecificData?.vercelRelayUrl || "",
        strictProxy: refreshedCredentials.providerSpecificData?.strictProxy === true,
      };
      let pid;
      try {
        pid = await getProjectIdForConnection(credentials.connectionId, refreshedCredentials.accessToken, provider, connProxyOptions, request?.signal || null);
      } catch (error) {
        if (request?.signal?.aborted) return withRateLimitHeaders(errorResponse(499, "Client Closed Request"), rateLimit);
        throw error;
      }
      if (pid) {
        refreshedCredentials.projectId = pid;
        // Persist to DB in background so subsequent requests have it immediately
        updateProviderCredentials(credentials.connectionId, { projectId: pid }).catch(() => { });
      }
    }

    // Use shared chatCore
    const chatSettings = await getSettings();
    const providerThinking = (chatSettings.providerThinking || {})[provider] || null;
    const providerServiceTier = (chatSettings.providerServiceTier || {})[provider]?.mode || null;
    const result = await handleChatCore({
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      clientRawRequest,
      connectionId: credentials.connectionId,
      userAgent,
      apiKey,
      ccFilterNaming: !!chatSettings.ccFilterNaming,
      rtkEnabled: !!chatSettings.rtkEnabled,
      headroomEnabled: !!chatSettings.headroomEnabled,
      headroomUrl: chatSettings.headroomUrl || DEFAULT_HEADROOM_URL,
      headroomCompressUserMessages: !!chatSettings.headroomCompressUserMessages,
      headroomTimeoutMs: chatSettings.headroomTimeoutMs,
      cavemanEnabled: !!chatSettings.cavemanEnabled,
      cavemanLevel: chatSettings.cavemanLevel || "full",
      ponytailEnabled: !!chatSettings.ponytailEnabled,
      ponytailLevel: chatSettings.ponytailLevel || "full",
      pxpipeEnabled: !!chatSettings.pxpipeEnabled,
      pxpipeMinChars: chatSettings.pxpipeMinChars,
      pxpipeTimeoutMs: chatSettings.pxpipeTimeoutMs,
      // Lazily warms the in-process module on first use; null when not installed (fail-open)
      pxpipeTransform: chatSettings.pxpipeEnabled ? await getPxpipeTransform() : null,
      onPxpipeEvent: appendPxpipeEvent,
      providerThinking,
      providerServiceTier,
      clientSignal: request?.signal || null,
      // Detect source format by endpoint + body
      sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null,
      onCredentialsRefreshed: async (newCreds) => {
        await updateProviderCredentials(credentials.connectionId, {
          ...newCreds,
          existingProviderSpecificData: credentials.providerSpecificData,
          testStatus: "active"
        });
      },
      // Mid-stream failure: the upstream returned 200 + SSE and then failed
      // inside the body (Codex response.failed, quota exhausted mid-generation).
      // Previously the account was only marked on the pre-stream error path, so
      // a consistently failing account stayed in rotation and every request
      // returned 200 with truncated content — invisible to status-based
      // monitoring. No byte can be un-sent at this point, so failover is not
      // possible; the account is still marked so the NEXT request uses another
      // one. A client disconnect never reaches here (it takes the abort path).
      onStreamFailed: async ({ error: streamError, status }) => {
        log.warn("FALLBACK", `⇄ ACC:${redactAccountName(credentials.connectionName, credentials.connectionId)} mid-stream failure (${status}) — marking unavailable`);
        await markAccountUnavailable(
          credentials.connectionId,
          status || 502,
          streamError || "upstream stream failed",
          provider,
          model
        );
      },
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
        // Antigravity: success resets "consecutive" strike counter so a future
        // 429-burst must re-accumulate 3 strikes from scratch. Also clears any
        // synthesized 15m block (but keeps a real upstream 0% block intact).
        if (provider === "antigravity") {
          try {
            clearAntigravityStrikes(credentials.connectionId, model);
          } catch {
            // never let quota bookkeeping crash a successful response
          }
        }
      }
    });

    if (result.success) return withRateLimitHeaders(result.response, rateLimit);

    // Client abort: client disconnected / cancelled. Do not lock account or retry/fallback.
    const isClientAborted = request?.signal?.aborted || result.error === "client_aborted" || Number(result.status) === 499;
    if (isClientAborted) {
      log.warn("CHAT", "Client aborted before upstream completion");
      return withRateLimitHeaders(result.response || errorResponse(499, "Client Closed Request"), rateLimit);
    }
    if (result.accountServiceTierDenied === true) {
      // Skip only this account for this request, keeping the selected tier.
      // No health writes/cooldowns and no generic-error circuit breaker: every
      // selected account can be checked once, including a soft-pinned account.
      lastServiceTierDenial = result.response;
      if (excludeConnectionIds.has(credentials.connectionId)) return withRateLimitHeaders(lastServiceTierDenial, rateLimit);
      excludeConnectionIds.add(credentials.connectionId);
      log.info("SERVICE_TIER", "Selected account does not advertise or permit the requested tier; trying the next account");
      continue;
    }
    // Sporadic upstream 5xx (9router #4277): grant one immediate same-account
    // retry BEFORE locking/fallback. A single flaky 500 (identical request
    // succeeds seconds later) must not poison the account for 30s while fast
    // clients burn all retries on the cached lock error. Bounded: once per
    // account per logical request, 5xx only, never after client abort.
    // A virtual proxy route has no account to retry. Classify its failure before
    // selecting another pool, especially for quota/abuse denials sent as 5xx.
    const errorEvidence = { ...result.diagnostics, message: result.error };
    const availability = classifyAvailabilityError(result.status, result.error, result.diagnostics);
    const retryable5xx = [500, 502, 503, 504].includes(Number(result.status))
      && !availability.kind && !result.resetsAtMs && !result.response?.headers?.get("retry-after")
      && !(credentials.id === "noauth" && credentials.providerSpecificData?.connectionProxyPoolId);
    if (retryable5xx && !retriedConnectionIds.has(credentials.connectionId) && !request?.signal?.aborted) {
      retriedConnectionIds.add(credentials.connectionId);
      log.warn("RETRY", `transient ${result.status} on ACC:${redactAccountName(credentials.connectionName, credentials.connectionId)} — one immediate retry before fallback`);
      continue;
    }

    // Antigravity 409/429: refresh live quota to get exact resetAt before locking
    let quotaResetMs = null;
    let resetsAtMs = result.resetsAtMs;
    if (provider === "antigravity" && (result.status === 409 || result.status === 429)) {
      quotaResetMs = await handleAntigravityQuotaError(
        credentials.connectionId, result.status, model,
        refreshedCredentials.accessToken, credentials.providerSpecificData
      );
      if (quotaResetMs) resetsAtMs = quotaResetMs;
    }
    if (resetsAtMs > Date.now() && [429, 503].includes(Number(result.response?.status))) {
      const headers = new Headers(result.response.headers);
      headers.set("Retry-After", String(Math.max(1, Math.ceil((resetsAtMs - Date.now()) / 1000))));
      result.response = new Response(result.response.body, { status: result.response.status, headers });
    }

    // Exhausted Antigravity model is blocked only in RAM cache until upstream resetAt.
    // Do not persist a modelLock_* for this path.
    const shouldFallback = provider === "antigravity" && quotaResetMs
      ? true
      : (await markAccountUnavailable(credentials.connectionId, result.status, errorEvidence, provider, model, resetsAtMs)).shouldFallback;

    if (shouldFallback) {
      log.warn("FALLBACK", `⇄ ACC:${redactAccountName(credentials.connectionName, credentials.connectionId)} UNAVAILABLE (${result.status}) → NEXT ACCOUNT`);
      excludeConnectionIds.add(credentials.connectionId);
      
      // Fast-fail circuit breaker: if multiple accounts fail with the exact same systemic error,
      // stop endless retries and return error immediately to save time and sockets.
      if (lastStatus === result.status && (Number(result.status) === 400 || Number(result.status) === 402 || Number(result.status) === 403 || Number(result.status) >= 500)) {
        consecutiveSameErrors++;
      } else {
        consecutiveSameErrors = 1;
      }
      lastError = result.error;
      lastStatus = result.status;
      lastResponse = result.response;

      if (consecutiveSameErrors >= MAX_CONSECUTIVE_SAME_ERRORS) {
        log.warn("FALLBACK", `Circuit breaker: fast-failing ${provider}/${model} after ${consecutiveSameErrors} consecutive accounts failed with status ${result.status}`);
        return withRateLimitHeaders(result.response, rateLimit);
      }

      continue;
    }

    return withRateLimitHeaders(result.response, rateLimit);
  }
}
