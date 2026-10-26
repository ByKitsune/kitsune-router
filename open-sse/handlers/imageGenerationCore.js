import { createErrorResult, formatProviderError } from "../utils/error.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { refreshWithRetry } from "../services/tokenRefresh.js";
import { getExecutor } from "../executors/index.js";
import { getImageAdapter } from "./imageProviders/index.js";
import { parseMediaError, reportedImageUsage, urlToBase64 } from "./imageProviders/_base.js";

function serializeRequestBody(requestBody) {
  if (typeof FormData !== "undefined" && requestBody instanceof FormData) return requestBody;
  if (typeof requestBody === "string") return requestBody;
  return JSON.stringify(requestBody);
}

/**
 * Core image generation orchestrator. Adapters own provider wire formats.
 * @returns {Promise<{success: boolean, response: Response, status?: number, error?: string}>}
 */
export async function handleImageGenerationCore({
  body, modelInfo, credentials, log, streamToClient = false, binaryOutput = false,
  onCredentialsRefreshed, onRequestSuccess, onUsage, clientSignal,
}) {
  const { provider, model } = modelInfo;
  const cancelled = () => createErrorResult(499, "Client closed request");
  if (clientSignal?.aborted) return cancelled();
  if (!body.prompt) return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Missing required field: prompt");
  const adapter = getImageAdapter(provider);
  if (!adapter) return createErrorResult(HTTP_STATUS.BAD_REQUEST, `Provider '${provider}' does not support image generation`);

  let measured = null;
  let accepted;
  const observeUsage = value => {
    const usage = reportedImageUsage(value);
    if (usage && (!measured || usage.total_tokens >= measured.total_tokens)) measured = usage;
  };
  const acceptUsage = (usage = measured, terminal = {}) => {
    if (!usage || !onUsage) return Promise.resolve();
    if (!accepted) {
      accepted = Promise.resolve().then(() => onUsage(structuredClone(usage), {
        status: clientSignal?.aborted ? "aborted" : terminal.status || "success",
      })).catch(() => {
        throw Object.assign(new Error("Usage accounting could not be accepted"), { code: "usage_acceptance_failed" });
      });
      accepted.catch(() => {});
    }
    return accepted;
  };
  const fail = error => {
    if (error?.code === "usage_acceptance_failed" || error?.code === "STALE_CONNECTION_WRITE") {
      return { ...createErrorResult(503, error.message, null, { code: error.code }), localFailure: true };
    }
    if (clientSignal?.aborted) return cancelled();
    const upstreamStatus = Number(error?.upstreamStatus ?? error?.status);
    const status = Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus < 600
      ? upstreamStatus : HTTP_STATUS.BAD_GATEWAY;
    return createErrorResult(status, formatProviderError(error, provider, model, status));
  };
  const finishBody = async responseBody => {
    observeUsage(responseBody);
    let finalBody;
    try {
      clientSignal?.throwIfAborted();
      const normalized = adapter.normalize(responseBody, body.prompt);
      finalBody = normalized.created && Array.isArray(normalized.data) ? normalized : responseBody;
      clientSignal?.throwIfAborted();
    } catch (error) {
      await acceptUsage(measured, { status: clientSignal?.aborted ? "aborted" : "error" });
      throw error;
    }
    await acceptUsage();
    clientSignal?.throwIfAborted();
    if (onRequestSuccess) await onRequestSuccess();
    clientSignal?.throwIfAborted();
    if (binaryOutput) {
      const first = finalBody.data?.[0];
      let b64 = first?.b64_json;
      if (!b64 && first?.url) {
        try { b64 = await urlToBase64(first.url, clientSignal); }
        catch (error) { clientSignal?.throwIfAborted(); log?.debug?.("IMAGE", `Image download failed: ${error.message}`); }
      }
      clientSignal?.throwIfAborted();
      if (b64) {
        const fmt = (body.output_format || "png").toLowerCase();
        const mime = fmt === "jpeg" || fmt === "jpg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";
        return { success: true, response: new Response(Buffer.from(b64, "base64"), {
          headers: { "Content-Type": mime, "Content-Disposition": `inline; filename="image.${fmt === "jpeg" ? "jpg" : fmt}"`, "Access-Control-Allow-Origin": "*" },
        }) };
      }
    }
    return { success: true, response: new Response(JSON.stringify(finalBody), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    }) };
  };

  if (adapter.useExecutor && adapter.executeViaExecutor) {
    try {
      const responseBody = await adapter.executeViaExecutor(model, body, credentials, log, { clientSignal, observeUsage });
      return await finishBody(responseBody);
    } catch (error) {
      try { await acceptUsage(measured, { status: clientSignal?.aborted ? "aborted" : "error" }); }
      catch (acceptanceError) { return fail(acceptanceError); }
      return fail(error);
    }
  }

  let url, headers, requestBody;
  try {
    url = adapter.buildUrl(model, credentials);
    requestBody = await adapter.buildBody(model, body, { clientSignal });
    headers = adapter.buildHeaders(credentials, requestBody, model, body);
    clientSignal?.throwIfAborted();
  } catch (error) {
    if (clientSignal?.aborted) return cancelled();
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, error.message || `Invalid ${provider} image request`);
  }

  const fetchAttempt = async (target, requestHeaders, payload) => {
    clientSignal?.throwIfAborted();
    return fetch(target, { method: "POST", headers: requestHeaders, body: serializeRequestBody(payload), signal: clientSignal });
  };
  const parseError = response => parseMediaError(response, observeUsage, clientSignal);
  let providerResponse;
  try {
    providerResponse = await fetchAttempt(url, headers, requestBody);
    if (clientSignal?.aborted) {
      await providerResponse.body?.cancel().catch(() => {});
      return cancelled();
    }
    const executor = getExecutor(provider);
    if (!executor?.noAuth && !adapter.noAuth && [HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.FORBIDDEN].includes(providerResponse.status)) {
      const diagnostics = await parseError(providerResponse);
      if (measured) {
        await acceptUsage(measured, { status: "error" });
        return createErrorResult(diagnostics.statusCode, formatProviderError(new Error(diagnostics.message), provider, model, diagnostics.statusCode));
      }
      clientSignal?.throwIfAborted();
      const newCredentials = await refreshWithRetry(
        () => executor.refreshCredentials(credentials, log, null, clientSignal), 3, log, clientSignal,
      );
      if (newCredentials?.accessToken || newCredentials?.apiKey) {
        if (onCredentialsRefreshed) await onCredentialsRefreshed(newCredentials);
        clientSignal?.throwIfAborted();
        Object.assign(credentials, newCredentials);
        requestBody = await adapter.buildBody(model, body, { clientSignal });
        headers = adapter.buildHeaders(credentials, requestBody, model, body);
        url = adapter.buildUrl(model, credentials);
        providerResponse = await fetchAttempt(url, headers, requestBody);
      } else return createErrorResult(diagnostics.statusCode, formatProviderError(new Error(diagnostics.message), provider, model, diagnostics.statusCode));
    }
    if (!providerResponse.ok) {
      const { statusCode, message } = await parseError(providerResponse);
      await acceptUsage(measured, { status: clientSignal?.aborted ? "aborted" : "error" });
      if (clientSignal?.aborted) return cancelled();
      return createErrorResult(statusCode, formatProviderError(new Error(message), provider, model, statusCode));
    }
    let parsed;
    if (adapter.parseResponse) {
      parsed = await adapter.parseResponse(providerResponse, {
        headers, log, streamToClient, onRequestSuccess,
        onUsage: acceptUsage, observeUsage, clientSignal, url, requestBody, model, body,
      });
      if (parsed?.sseResponse) return { success: true, response: parsed.sseResponse };
    } else parsed = await providerResponse.json();
    return await finishBody(parsed);
  } catch (error) {
    if (!providerResponse?.body?.locked) await providerResponse?.body?.cancel().catch(() => {});
    try { await acceptUsage(measured, { status: clientSignal?.aborted ? "aborted" : "error" }); }
    catch (acceptanceError) { return fail(acceptanceError); }
    return fail(error);
  }
}
