import { createErrorResult, formatProviderError } from "../utils/error.js";
import { parseMediaError } from "./imageProviders/_base.js";
import { HTTP_STATUS, FETCH_CONNECT_TIMEOUT_MS } from "../config/runtimeConfig.js";
import { getExecutor } from "../executors/index.js";
import { refreshWithRetry } from "../services/tokenRefresh.js";
import { getEmbeddingAdapter } from "./embeddingProviders/index.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";

/**
 * Core embeddings handler — orchestrator only. Provider-specific URL/headers/body/normalize
 * live in `./embeddingProviders/{id}.js`.
 *
 * @returns {Promise<{ success: boolean, response: Response, status?: number, error?: string }>}
 */
export async function handleEmbeddingsCore({
  body,
  modelInfo,
  credentials,
  log,
  onCredentialsRefreshed,
  onRequestSuccess,
  clientSignal,
}) {
  const { provider, model } = modelInfo;
  let measured = null;
  const cancelled = () => ({ ...createErrorResult(499, "Client closed request"), usage: measured });
  const parseError = response => parseMediaError(response, value => { measured = value?.usage || null; }, clientSignal);
  if (clientSignal?.aborted) return cancelled();

  // Validate input
  const input = body.input;
  if (!input) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Missing required field: input");
  }
  if (typeof input !== "string" && !Array.isArray(input)) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, "input must be a string or array of strings");
  }

  const adapter = getEmbeddingAdapter(provider);
  if (!adapter) {
    return createErrorResult(
      HTTP_STATUS.BAD_REQUEST,
      `Provider '${provider}' does not support embeddings.`
    );
  }

  const ctx = { input };
  // buildUrl/buildHeaders/buildBody were called bare. An adapter that rejects a
  // misconfigured connection — selfhosted-embedding throws when no baseUrl is set
  // rather than silently falling back to api.openai.com — would have escaped this
  // function uncaught, surfacing as a 500 or a request that never settles. A
  // configuration mistake is a 400 with the reason in it.
  let url, headers, requestBody;
  try {
    url = adapter.buildUrl(model, credentials, ctx);
    headers = adapter.buildHeaders(credentials, ctx);
    requestBody = adapter.buildBody(model, {
      input,
      encoding_format: body.encoding_format || "float",
      dimensions: body.dimensions,
    });
  } catch (error) {
    log?.debug?.("EMBEDDINGS", `Request build failed: ${error.message}`);
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, `[${provider}/${model}] ${error.message}`);
  }

  log?.debug?.("EMBEDDINGS", `${provider.toUpperCase()} | ${model} | input_type=${Array.isArray(input) ? `array[${input.length}]` : "string"}`);

  const proxyOptions = {
    connectionProxyEnabled: credentials?.providerSpecificData?.connectionProxyEnabled === true,
    connectionProxyUrl: credentials?.providerSpecificData?.connectionProxyUrl || "",
    connectionNoProxy: credentials?.providerSpecificData?.connectionNoProxy || "",
    vercelRelayUrl: credentials?.providerSpecificData?.vercelRelayUrl || "",
    strictProxy: credentials?.providerSpecificData?.strictProxy === true,
  };
  // Preserve the existing response deadline on every attempt, including the
  // post-refresh retry. Caller cancellation also covers body consumption.
  const fetchAttempt = async (target, requestHeaders) => {
    clientSignal?.throwIfAborted();
    const deadline = AbortSignal.timeout(FETCH_CONNECT_TIMEOUT_MS);
    const signal = clientSignal ? AbortSignal.any([clientSignal, deadline]) : deadline;
    return proxyAwareFetch(target, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
      signal,
    }, proxyOptions);
  };
  const fetchError = (error) => {
    if (clientSignal?.aborted) return cancelled();
    const errMsg = formatProviderError(error, provider, model, HTTP_STATUS.BAD_GATEWAY);
    log?.debug?.("EMBEDDINGS", `Fetch error: ${errMsg}`);
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, errMsg);
  };
  let providerResponse;
  try {
    providerResponse = await fetchAttempt(url, headers);
  } catch (error) {
    return fetchError(error);
  }
  if (clientSignal?.aborted) {
    await providerResponse.body?.cancel().catch(() => {});
    return cancelled();
  }

  const executor = getExecutor(provider);
  let diagnostics;
  if (!executor?.noAuth && [HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.FORBIDDEN].includes(providerResponse.status)) {
    diagnostics = await parseError(providerResponse);
    if (clientSignal?.aborted) return cancelled();
    const prompt = measured?.prompt_tokens ?? measured?.input_tokens;
    const incurred = Number.isSafeInteger(prompt) && prompt > 0 && measured?.total_tokens === prompt;
    if (!incurred) {
      let newCredentials;
      try {
        newCredentials = await refreshWithRetry(
          () => executor.refreshCredentials(credentials, log, proxyOptions, clientSignal), 3, log, clientSignal,
        );
        if (newCredentials?.accessToken || newCredentials?.apiKey) {
          if (onCredentialsRefreshed) await onCredentialsRefreshed(newCredentials);
          clientSignal?.throwIfAborted();
          Object.assign(credentials, newCredentials);
          providerResponse = await fetchAttempt(adapter.buildUrl(model, credentials, ctx), adapter.buildHeaders(credentials, ctx));
          diagnostics = null;
        }
      } catch (error) {
        if (error?.code === "STALE_CONNECTION_WRITE") {
          return { ...createErrorResult(503, "Credentials changed during refresh", null, { code: error.code }), localFailure: true, usage: measured };
        }
        return fetchError(error);
      }
    }
  }
  if (!providerResponse.ok) {
    const { statusCode, message } = diagnostics || await parseError(providerResponse);
    if (clientSignal?.aborted) return cancelled();
    return { ...createErrorResult(statusCode, formatProviderError(new Error(message), provider, model, statusCode)), usage: measured };
  }

  let responseBody;
  try {
    responseBody = await providerResponse.json();
    measured = responseBody?.usage || null;
  } catch {
    if (clientSignal?.aborted) return cancelled();
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, `Invalid JSON response from ${provider}`);
  }
  if (clientSignal?.aborted) return cancelled();
  const normalized = adapter.normalize(responseBody, model);
  measured = normalized.usage || measured;
  if (onRequestSuccess) await onRequestSuccess();
  if (clientSignal?.aborted) return cancelled();
  log?.debug?.("EMBEDDINGS", `Success | usage=${JSON.stringify(normalized.usage || {})}`);

  return {
    success: true,
    usage: normalized.usage || null,
    response: new Response(JSON.stringify(normalized), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }),
  };
}
