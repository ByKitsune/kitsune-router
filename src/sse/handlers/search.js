import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { getSettings, getCombos, isApiKeyRequired } from "@/lib/localDb";
import { AI_PROVIDERS, resolveProviderId } from "@/shared/constants/providers.js";
import { handleSearchCore } from "open-sse/handlers/search/index.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";
import { checkAndRefreshToken } from "../services/tokenRefresh.js";
import { handleComboChat, getComboModelsFromData } from "open-sse/services/combo.js";
import { redactAccountName } from "@/shared/utils/accountRedaction.js";
import { publicMessage } from "open-sse/utils/clientErrors.js";
import { withInferenceLimit } from "@/lib/rateLimit/inferenceLimit.js";
const MAX_RESOURCE_FALLBACK_ATTEMPTS = 3;

/**
 * Handle web search request for the SSE/Next.js server.
 * Provider IS the model (no model field). Mirrors handleEmbeddings auth + fallback flow.
 *
 * @param {Request} request
 */
export async function handleSearch(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("SEARCH", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const url = new URL(request.url);
  // Accept either `provider` or `model` (UI sends `model` since provider IS the model for webSearch)
  const providerInput = body.provider || body.model;
  const query = body.query;

  log.request("POST", `${url.pathname} | ${providerInput}`);

  // Log API key (masked)
  const apiKey = extractApiKey(request);
  if (apiKey) {
    log.debug("AUTH", `API Key: ${log.maskKey(apiKey)}`);
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

  return withInferenceLimit(request, apiKey, async () => {
    if (!providerInput || typeof providerInput !== "string") {
      log.warn("SEARCH", "Missing provider/model");
      return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: provider (or model)");
    }

    if (!query || typeof query !== "string" || !query.trim()) {
      log.warn("SEARCH", "Missing query");
      return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: query");
    }

    // Combo expansion: providerInput may be a combo name → run fallback/round-robin across providers
    const combos = await getCombos();
    const comboModels = getComboModelsFromData(providerInput, combos);
    if (comboModels) {
      const comboStrategies = settings.comboStrategies || {};
      const comboStrategy = comboStrategies[providerInput]?.fallbackStrategy || settings.comboStrategy || "fallback";
      const comboStickyLimit = settings.comboStickyRoundRobinLimit;
      log.info("SEARCH", `Combo "${providerInput}" with ${comboModels.length} providers (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
      return handleComboChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m) => handleSingleProviderSearch(b, m, request, apiKey, settings),
        log,
        comboName: providerInput,
        comboStrategy,
        comboStickyLimit
      });
    }

    return handleSingleProviderSearch(body, providerInput, request, apiKey, settings);
  });
}

async function handleSingleProviderSearch(body, providerInput, request, apiKey, settings) {
  const query = body.query;
  if (typeof providerInput !== "string" || !providerInput.trim()) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid search provider/model selector");
  }

  // Support "provider/model" format (e.g. "ag/gemini-3.8-flash" or "gemini/gemini-2.5-flash")
  let requestedProvider = providerInput;
  // A bare model is the provider selector. Only a separate provider field or
  // the provider/model syntax makes it an explicit upstream grounding model.
  // Combo members own their provider/model; the original combo body must not
  // override the member selected by the fallback strategy.
  let requestedModel = body.provider === providerInput ? body.model : undefined;
  if (providerInput && providerInput.includes("/")) {
    const slashIdx = providerInput.indexOf("/");
    requestedProvider = providerInput.slice(0, slashIdx);
    requestedModel = providerInput.slice(slashIdx + 1);
    // `/v1/models/web` advertises provider/search as a service ID, not an
    // upstream model literally named "search".
    if (requestedModel === "search") requestedModel = undefined;
  }

  if (requestedModel != null && (typeof requestedModel !== "string" || !requestedModel.trim())) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid upstream search model");
  }

  const providerId = resolveProviderId(requestedProvider);
  // Some clients send both fields with the same provider selector. That does
  // not select an upstream model named after the provider.
  if (requestedModel && resolveProviderId(requestedModel) === providerId) requestedModel = undefined;
  const resolvedProvider = AI_PROVIDERS[providerId];

  if (!resolvedProvider) {
    log.warn("SEARCH", "Unknown provider", { provider: requestedProvider });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Unknown provider: ${providerInput}`);
  }

  const providerConfig = resolvedProvider.searchConfig;
  const supportsSearch = !!providerConfig || !!resolvedProvider.searchViaChat;

  if (!supportsSearch) {
    log.warn("SEARCH", "Provider does not support web search", { provider: providerId });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Provider ${providerId} does not support web search`);
  }

  if (providerInput !== providerId) {
    log.info("ROUTING", `${providerInput} → ${providerId}${requestedModel ? ` (${requestedModel})` : ""}`);
  } else {
    log.info("ROUTING", `Provider: ${providerId}${requestedModel ? ` (${requestedModel})` : ""}`);
  }

  // Sanitized body forwarded to core
  const coreBody = {
    query: query.trim(),
    provider: providerId,
    model: requestedModel,
    max_results: body.max_results,
    search_type: body.search_type,
    country: body.country,
    language: body.language,
    time_range: body.time_range,
    offset: body.offset,
    domain_filter: body.domain_filter,
    content_options: body.content_options,
    provider_options: body.provider_options
  };

  // No-auth providers (e.g. searxng) bypass credential lookup
  if (resolvedProvider.noAuth) {
    log.info("AUTH", `\x1b[32m${providerId} no-auth mode\x1b[0m`);
    const result = await handleSearchCore({
      body: coreBody,
      provider: resolvedProvider,
      providerConfig,
      credentials: null,
      log
    });
    if (result.success) return result.response;
    return result.response;
  }

  // Credential + fallback loop
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;
  let resourceFailures = 0;

  // Credential fallback: some search providers reuse the API key of a related
  // chat provider (e.g. ollama-search reuses the `ollama` chat key, zai-search
  // reuses the `glm` chat key). When the search provider has no own connection,
  // fall back to the linked provider's credentials.
  const fallbackProviderId = resolvedProvider.credentialFallback;

  // Lock scope for this handler. Without it markAccountUnavailable would write
  // an account-wide `__all` lock, which on the credentialFallback path takes
  // the shared chat key (e.g. glm) offline for chat as well. Must be passed to
  // getProviderCredentials too, so the lock is read back under the same key.
  const searchLockKey = `websearch:${providerId}`;

  while (true) {
    // Provider that actually owns the connection in use — differs from
    // providerId once we fall back, and error locks must be attributed to it.
    let credentialProviderId = providerId;
    let credentials = await getProviderCredentials(providerId, excludeConnectionIds, searchLockKey);

    // Fall back to the related chat provider's credentials when this search
    // provider has none of its own (one key, chat + search).
    if (!credentials && fallbackProviderId) {
      credentials = await getProviderCredentials(fallbackProviderId, excludeConnectionIds, searchLockKey);
      if (credentials) {
        credentialProviderId = fallbackProviderId;
        log.info("AUTH", `\x1b[32m${providerId} reusing ${fallbackProviderId} credentials\x1b[0m`);
      }
    }

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("SEARCH", `[${providerId}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${providerId}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.error("AUTH", `No credentials for provider: ${providerId}`);
        return errorResponse(HTTP_STATUS.BAD_REQUEST, publicMessage("no_credentials"));
      }
      log.warn("SEARCH", "No more accounts available", { provider: providerId });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${providerId} account: ${redactAccountName(credentials.connectionName, credentials.connectionId)}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(providerId, credentials);

    const result = await handleSearchCore({
      body: coreBody,
      provider: resolvedProvider,
      providerConfig,
      credentials: refreshedCredentials,
      log
    });

    if (result.success) {
      await clearAccountError(credentials.connectionId, credentials, searchLockKey);
      return result.response;
    }

    if (result.errorScope === "request") return result.response;
    if (result.errorScope === "resource") {
      resourceFailures++;
      if (resourceFailures >= MAX_RESOURCE_FALLBACK_ATTEMPTS) return result.response;
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, credentialProviderId, searchLockKey);

    if (shouldFallback) {
      log.warn("AUTH", `Account ${redactAccountName(credentials.connectionName, credentials.connectionId)} unavailable (${result.status}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}
