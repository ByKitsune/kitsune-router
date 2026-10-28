import {
  extractApiKey, isValidApiKey,
  getProviderCredentials, markAccountUnavailable,
} from "../services/auth.js";
import { getSettings, isApiKeyRequired } from "@/lib/localDb";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleTtsCore } from "open-sse/handlers/ttsCore.js";
import { getTtsAdapter } from "open-sse/handlers/ttsProviders/index.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { handleComboChat } from "open-sse/services/combo.js";
import * as log from "../utils/logger.js";
import { redactAccountName } from "@/shared/utils/accountRedaction.js";
import { publicMessage } from "open-sse/utils/clientErrors.js";
import { withInferenceLimit } from "@/lib/rateLimit/inferenceLimit.js";

// Derived from providers.js: any TTS provider not noAuth requires stored credentials
const CREDENTIALED_PROVIDERS = new Set(
  Object.entries(AI_PROVIDERS)
    .filter(([, p]) => p.serviceKinds?.includes("tts") && !p.noAuth && p.ttsConfig?.authType !== "none")
    .map(([id]) => id)
);

export async function handleTts(request) {
  const cancelled = () => errorResponse(499, "Client closed request");
  if (request.signal?.aborted) return cancelled();
  let body;
  try {
    body = await request.json();
  } catch {
    if (request.signal?.aborted) return cancelled();
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const url = new URL(request.url);
  const modelStr = body.model;
  const responseFormat = url.searchParams.get("response_format");
  const language = body.language || ""; // Optional language hint (currently used by Gemini)
  const style = body.style || ""; // Optional style/voice instructions (e.g. Xiaomi MiMo)
  log.request("POST", `${url.pathname} | ${modelStr} | format=${responseFormat}${language ? ` | lang=${language}` : ""}`);

  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (request.signal?.aborted) return cancelled();
  if (isApiKeyRequired(settings)) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (request.signal?.aborted) return cancelled();
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  return withInferenceLimit(request, apiKey, async () => {
    if (request.signal?.aborted) return cancelled();
    if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
    if (!body.input) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: input");

    // Combo expansion: model may be a combo name → run fallback/round-robin across models
    const comboModels = await getComboModels(modelStr);
    if (request.signal?.aborted) return cancelled();
    if (comboModels) {
      const comboStrategies = settings.comboStrategies || {};
      const comboStrategy = comboStrategies[modelStr]?.fallbackStrategy || settings.comboStrategy || "fallback";
      const comboStickyLimit = settings.comboStickyRoundRobinLimit;
      log.info("TTS", `Combo "${modelStr}" with ${comboModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
      const combo = handleComboChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m) => handleSingleModelTts(b, m, responseFormat, language, style, request.signal),
        log,
        signal: request.signal,
        comboName: modelStr,
        comboStrategy,
        comboStickyLimit,
      });
      // Retain the existing public abort response while the combo stops its
      // own backoff/peek. Attempts check the same signal; only adapters with
      // a signal contract can stop their underlying provider operation.
      let onAbort;
      const abort = new Promise((resolve) => {
        onAbort = () => resolve(cancelled());
        request.signal?.addEventListener("abort", onAbort, { once: true });
        if (request.signal?.aborted) onAbort();
      });
      try { return await Promise.race([combo, abort]); }
      finally { request.signal?.removeEventListener("abort", onAbort); }
    }

    return handleSingleModelTts(body, modelStr, responseFormat, language, style, request.signal);
  });
}

async function handleSingleModelTts(body, modelStr, responseFormat, language, style, signal) {
  const cancelled = () => errorResponse(499, "Client closed request");
  if (signal?.aborted) return cancelled();
  const modelInfo = await getModelInfo(modelStr);
  if (signal?.aborted) return cancelled();
  if (!modelInfo.provider) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");

  const { provider, model } = modelInfo;
  // Preserve existing providers' format behavior. Ollama accepts only wav/pcm;
  // its body format is honored instead of silently relabeling wav as mp3.
  const format = provider === "ollama-local"
    ? (responseFormat ?? body.response_format ?? "wav")
    : (responseFormat || "mp3");
  log.info("ROUTING", `Provider: ${provider}, Voice: ${model}`);

  // noAuth providers — no credential needed
  if (!CREDENTIALED_PROVIDERS.has(provider)) {
    const result = await handleTtsCore({ provider, model, input: body.input, responseFormat: format, language, style });
    if (signal?.aborted) return cancelled();
    if (result.success) return result.response;
    return errorResponse(result.status || HTTP_STATUS.BAD_GATEWAY, result.error || "TTS failed");
  }

  // Credentialed providers — fallback loop (same pattern as embeddings)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    if (signal?.aborted) return cancelled();
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);
    if (signal?.aborted) return cancelled();

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const msg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        return unavailableResponse(status, `[${provider}/${model}] ${msg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) return errorResponse(HTTP_STATUS.BAD_REQUEST, publicMessage("no_credentials"));
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${redactAccountName(credentials.connectionName, credentials.connectionId)}\x1b[0m`);

    // The shared TTS core currently has no signal/voice or upstream-status
    // contract. Use the Ollama adapter directly without changing other adapters.
    const result = provider === "ollama-local"
      ? await getTtsAdapter(provider).synthesize(body.input, model, credentials, format, {
          signal, voice: body.voice, speed: body.speed, instructions: body.instructions,
        })
      : await handleTtsCore({ provider, model, input: body.input, credentials, responseFormat: format, language, style });

    if (signal?.aborted || result.status === 499) return cancelled();
    if (result.success || result.localFailure) return result.response;

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);
    if (signal?.aborted) return cancelled();
    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }
    return result.response || errorResponse(result.status, result.error);
  }
}
