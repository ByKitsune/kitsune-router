import { createErrorResult, formatProviderError, MAX_UPSTREAM_ERROR_BYTES, parseUpstreamError, parseUpstreamErrorBody } from "../utils/error.js";
import { HTTP_STATUS, FETCH_CONNECT_TIMEOUT_MS } from "../config/runtimeConfig.js";
import { getExecutor } from "../executors/index.js";
import { refreshWithRetry } from "../services/tokenRefresh.js";
import { isRequestValidationError } from "../services/accountFallback.js";
import { getEmbeddingAdapter } from "./embeddingProviders/index.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";

// Only a naturally closed body can supply usage. In particular, reader.cancel()
// also resolves pending reads with done:true, which must not be treated as EOF.
async function readResponseBody(response, signal, maxBytes = Infinity) {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", complete: true };
  const decoder = new TextDecoder();
  const chunks = [];
  let length = 0;
  let completed = false;
  let naturallyClosed = false;
  let cancelled = false;
  // A closed reader has delivered all queued bytes. Record the observation only
  // before abort/cancel; a later fulfillment may have been caused by cancel().
  void reader.closed.then(() => {
    if (!signal.aborted && !cancelled) naturallyClosed = true;
  }, () => {});
  const cancel = reason => {
    if (cancelled) return;
    cancelled = true;
    // Cancellation closes the reader immediately; do not wait for an upstream
    // source's potentially stalled cancellation acknowledgment.
    try { void reader.cancel(reason).catch(() => {}); } catch {}
  };
  const onAbort = () => { if (!naturallyClosed) cancel(signal.reason); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    while (!signal.aborted || naturallyClosed) {
      const { done, value } = await reader.read();
      if (done) {
        completed = !cancelled && (!signal.aborted || naturallyClosed);
        break;
      }
      if (signal.aborted && !naturallyClosed) break;
      const remaining = maxBytes - length;
      const piece = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(decoder.decode(piece, { stream: true }));
      length += piece.byteLength;
      if (length >= maxBytes) {
        completed = value.byteLength <= remaining && naturallyClosed;
        break;
      }
    }
  } catch {
    // A broken or interrupted body is never complete, even if its prefix is JSON.
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (!completed) cancel();
    reader.releaseLock();
  }
  chunks.push(decoder.decode());
  return { text: chunks.join(""), complete: completed };
}

async function readResponseJson(response, signal) {
  const { text, complete } = await readResponseBody(response, signal);
  if (!complete) {
    signal.throwIfAborted();
    throw new Error("Incomplete upstream response");
  }
  return JSON.parse(text);
}

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
  let attemptSignal;
  const cancelled = () => ({ ...createErrorResult(499, "Client closed request"), usage: measured });
  const timedOut = () => ({ ...createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Upstream response timed out"), usage: measured });
  const parseError = async response => {
    const { text, complete } = await readResponseBody(response, attemptSignal, MAX_UPSTREAM_ERROR_BYTES);
    if (complete) {
      try { measured = JSON.parse(text)?.usage || null; } catch {}
    }
    return parseUpstreamError(new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers }));
  };
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
    return {
      ...createErrorResult(HTTP_STATUS.BAD_REQUEST, `[${provider}/${model}] ${error.message}`),
      ...(error?.isConfigError === true ? { localFailure: true } : {}),
    };
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
    attemptSignal = signal;
    const response = await proxyAwareFetch(target, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
      signal,
      // Only opt in to the restrictive redirect policy. Do not let an adapter
      // replace the caller signal, headers, payload, method or transport.
      ...(adapter.requestOptions?.redirect === "error" ? { redirect: "error" } : {}),
    }, proxyOptions);
    // A mocked or custom transport may return a redirect despite redirect:error.
    if (adapter.requestOptions?.redirect === "error" && response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => {});
      signal.throwIfAborted();
      throw new Error("Upstream redirect refused");
    }
    return response;
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
    void providerResponse.body?.cancel().catch(() => {});
    return cancelled();
  }
  const executor = getExecutor(provider);
  let diagnostics;
  if (!executor?.noAuth && [HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.FORBIDDEN].includes(providerResponse.status)) {
    diagnostics = await parseError(providerResponse);
    if (clientSignal?.aborted) return cancelled();
    if (attemptSignal.aborted) return timedOut();
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
    if (attemptSignal.aborted) return timedOut();
    return { ...createErrorResult(statusCode, formatProviderError(new Error(message), provider, model, statusCode)), usage: measured };
  }

  let responseBody;
  try {
    responseBody = await readResponseJson(providerResponse, attemptSignal);
    measured = responseBody?.usage || null;
  } catch {
    if (clientSignal?.aborted) return cancelled();
    if (attemptSignal.aborted) return timedOut();
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, `Invalid JSON response from ${provider}`);
  }
  if (clientSignal?.aborted) return cancelled();
  if (attemptSignal.aborted) return timedOut();
  let normalized;
  try {
    normalized = adapter.normalize(responseBody, model);
  } catch (error) {
    if (clientSignal?.aborted) return cancelled();
    // A 200 response may still contain an upstream error object. Preserve its
    // safe typed diagnostics rather than treating it as embeddings or losing
    // actionable fields. The parser applies the same redaction as HTTP errors.
    let diagnostics = {};
    if (responseBody?.error != null) {
      try {
        const text = JSON.stringify({ error: responseBody.error });
        if (text.length <= MAX_UPSTREAM_ERROR_BYTES && new TextEncoder().encode(text).byteLength <= MAX_UPSTREAM_ERROR_BYTES) {
          diagnostics = parseUpstreamErrorBody(providerResponse, text);
        }
      } catch { /* Fall back to the adapter error. */ }
    }
    const failure = new Error(diagnostics.message || error?.message || "Invalid upstream embedding response");
    // A typed/request-scoped validation failure must not cool down the account
    // just because the upstream incorrectly sent it with HTTP 200.
    const validation = isRequestValidationError(HTTP_STATUS.BAD_REQUEST, failure.message, diagnostics);
    const status = validation ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.BAD_GATEWAY;
    return {
      ...createErrorResult(status, formatProviderError(failure, provider, model, status), null, diagnostics),
      ...(validation ? { localFailure: true } : {}),
      usage: measured,
    };
  }
  measured = normalized.usage || measured;
  if (clientSignal?.aborted) return cancelled();
  if (attemptSignal.aborted) return timedOut();
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
