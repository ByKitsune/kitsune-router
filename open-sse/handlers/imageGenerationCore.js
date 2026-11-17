import { createErrorResult, formatProviderError } from "../utils/error.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { refreshWithRetry } from "../services/tokenRefresh.js";
import { getExecutor } from "../executors/index.js";
import { getImageAdapter } from "./imageProviders/index.js";
import { parseMediaError, reportedImageUsage, readImageUrl, fetchImageProvider, readImageProviderJson } from "./imageProviders/_base.js";
import { createAccountTransport, isAccountRoutingFailure } from "../utils/accountTransport.js";
import { IMAGE_MODEL_REJECTION_CODES } from "../config/codexImage.js";
import { IMAGE_OUTPUT_MIME_TYPES } from "../config/mediaConfig.js";

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
  onCredentialsRefreshed, onRequestSuccess, onUsage, clientSignal, proxyOptions = null,
}) {
  const { provider, model } = modelInfo;
  const cancelled = () => createErrorResult(499, "Client closed request");
  if (clientSignal?.aborted) return cancelled();
  if (body && typeof body === "object" && !Array.isArray(body) && body.prompt == null) return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Missing required field: prompt");
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, "prompt must be a nonempty string");
  }
  if (body.n != null && (!Number.isSafeInteger(body.n) || body.n < 1)) return createErrorResult(HTTP_STATUS.BAD_REQUEST, "n must be a positive integer");
  if (body.output_format != null && typeof body.output_format !== "string") return createErrorResult(HTTP_STATUS.BAD_REQUEST, "output_format must be a string");
  if (binaryOutput && body.n != null && body.n !== 1) return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Binary image output requires n=1");
  if (binaryOutput && body.output_format && !Object.hasOwn(IMAGE_OUTPUT_MIME_TYPES, body.output_format.toLowerCase())) return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Unsupported binary image format; request JSON output");
  const adapter = getImageAdapter(provider);
  if (!adapter) return createErrorResult(HTTP_STATUS.BAD_REQUEST, `Provider '${provider}' does not support image generation`);
  const transport = createAccountTransport(credentials, { signal: clientSignal, proxyOptions });

  let measured = null;
  let submissionAccepted = false;
  let accepted;
  const observeUsage = value => {
    // Some asynchronous APIs can return a job alongside an error. Once an
    // identifier or polling route exists, submitting on another account may
    // create a second billable job even if token usage is not reported.
    if ([value?.id, value?.taskId, value?.data?.taskId, value?.polling_url, value?.status_url, value?.response_url]
      .some(field => typeof field === "string" && field.length > 0)) submissionAccepted = true;
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
  const isModelRejection = (status, diagnostics = {}) => provider === "codex" &&
    ([400, 403, 404, 422].includes(status) && (status === 403 || IMAGE_MODEL_REJECTION_CODES.has(diagnostics.code)));
  const rejection = (status, message, explicitlyRejected = true, diagnostics = {}) => {
    const requestRejected = isModelRejection(status, diagnostics);
    return {
      ...createErrorResult(status, message, diagnostics.resetsAtMs, diagnostics),
      allowAccountFallback: !requestRejected && explicitlyRejected && !measured && !submissionAccepted
        && [HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.FORBIDDEN, HTTP_STATUS.RATE_LIMITED].includes(status),
      ...(requestRejected ? { requestRejected: true } : {}),
    };
  };
  const fail = error => {
    if (error?.code === "usage_acceptance_failed" || error?.code === "STALE_CONNECTION_WRITE") {
      return { ...createErrorResult(503, error.message, null, { code: error.code }), localFailure: true };
    }
    if (clientSignal?.aborted) return cancelled();
    if (error?.name === "TimeoutError") return { ...createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, "Image provider response timed out"), localFailure: true };
    if (isAccountRoutingFailure(error) || error?.code === "unsafe_image_provider_route") {
      return { ...createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Configured account proxy unavailable"), localFailure: true };
    }
    if (error?.code === "unsafe_image_asset") {
      return { ...createErrorResult(HTTP_STATUS.BAD_GATEWAY, "Remote image download rejected or unavailable"), localFailure: true };
    }
    const upstreamStatus = Number(error?.upstreamStatus ?? error?.status);
    const status = Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus < 600
      ? upstreamStatus : HTTP_STATUS.BAD_GATEWAY;
    return rejection(status, formatProviderError(error, provider, model, status), error?.allowAccountFallback === true, error);
  };
  const finishBody = async responseBody => {
    observeUsage(responseBody);
    let finalBody;
    try {
      clientSignal?.throwIfAborted();
      const normalized = adapter.normalize(responseBody, body.prompt);
      finalBody = Array.isArray(normalized?.data) ? normalized : responseBody;
      if (!Array.isArray(finalBody?.data) || !finalBody.data.length || finalBody.data.some(image =>
        !image || !(typeof image.b64_json === "string" && image.b64_json.trim() || typeof image.url === "string" && image.url.trim()))) {
        throw new Error("Image provider did not return a completed image");
      }
      if (binaryOutput && finalBody.data.length !== 1) throw new Error("Image provider returned multiple images for a binary response");
      clientSignal?.throwIfAborted();
    } catch (error) {
      await acceptUsage(measured, { status: clientSignal?.aborted ? "aborted" : "error" });
      throw error;
    }
    await acceptUsage();
    clientSignal?.throwIfAborted();
    const markSuccess = async () => {
      if (onRequestSuccess) await onRequestSuccess();
      clientSignal?.throwIfAborted();
    };
    if (binaryOutput) {
      const first = finalBody.data?.[0];
      let b64 = first?.b64_json;
      let downloadedMime;
      if (!b64 && first?.url) {
        try {
          const downloaded = await readImageUrl(first.url, clientSignal, transport);
          b64 = downloaded.base64;
          downloadedMime = downloaded.mimeType;
        }
        catch (error) {
          clientSignal?.throwIfAborted();
          // A binary request cannot silently become a JSON URL response when
          // the guarded image download rejects the target or wire bytes.
          throw error;
        }
      }
      clientSignal?.throwIfAborted();
      if (b64) {
        await markSuccess();
        const fmt = (body.output_format || "png").toLowerCase();
        const mime = downloadedMime || IMAGE_OUTPUT_MIME_TYPES[fmt] || "image/png";
        const extension = downloadedMime ? downloadedMime.split("/")[1] : fmt === "jpeg" ? "jpg" : fmt;
        return { success: true, response: new Response(Buffer.from(b64, "base64"), {
          headers: { "Content-Type": mime, "Content-Disposition": `inline; filename="image.${extension}"`, "Access-Control-Allow-Origin": "*" },
        }) };
      }
    }
    await markSuccess();
    return { success: true, response: new Response(JSON.stringify(finalBody), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    }) };
  };

  if (adapter.useExecutor && adapter.executeViaExecutor) {
    try {
      const responseBody = await adapter.executeViaExecutor(model, body, credentials, log, { clientSignal, observeUsage, transport });
      return await finishBody(responseBody);
    } catch (error) {
      try { await acceptUsage(measured, { status: clientSignal?.aborted ? "aborted" : "error" }); }
      catch (acceptanceError) { return fail(acceptanceError); }
      return fail(error);
    }
  }

  let url, headers, requestBody;
  try {
    url = adapter.buildUrl(model, credentials, body);
    requestBody = await adapter.buildBody(model, body, { clientSignal, transport });
    headers = adapter.buildHeaders(credentials, requestBody, model, body);
    clientSignal?.throwIfAborted();
  } catch (error) {
    if (clientSignal?.aborted) return cancelled();
    if (isAccountRoutingFailure(error)) return fail(error);
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, error.message || `Invalid ${provider} image request`);
  }

  const fetchAttempt = async (target, requestHeaders, payload) => {
    clientSignal?.throwIfAborted();
    return fetchImageProvider(transport, target, { method: "POST", headers: requestHeaders, body: serializeRequestBody(payload), signal: clientSignal });
  };
  const parseError = response => parseMediaError(response, observeUsage, clientSignal);
  let providerResponse;
  try {
    providerResponse = await fetchAttempt(url, headers, requestBody);
    if (clientSignal?.aborted) {
      void providerResponse.body?.cancel().catch(() => {});
      return cancelled();
    }
    const executor = getExecutor(provider);
    if (!executor?.noAuth && !adapter.noAuth && [HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.FORBIDDEN].includes(providerResponse.status)) {
      const diagnostics = await parseError(providerResponse);
      if (isModelRejection(diagnostics.statusCode, diagnostics)) {
        await acceptUsage(measured, { status: "error" });
        return rejection(diagnostics.statusCode, diagnostics.message, diagnostics.bodyComplete, diagnostics);
      }
      if (measured || submissionAccepted || !diagnostics.bodyComplete) {
        await acceptUsage(measured, { status: "error" });
        return rejection(diagnostics.statusCode, formatProviderError(new Error(diagnostics.message), provider, model, diagnostics.statusCode), diagnostics.bodyComplete, diagnostics);
      }
      clientSignal?.throwIfAborted();
      const newCredentials = await refreshWithRetry(
        () => executor.refreshCredentials(credentials, log, transport.proxyOptions, clientSignal), 3, log, clientSignal,
      );
      if (newCredentials?.accessToken || newCredentials?.apiKey) {
        if (onCredentialsRefreshed) await onCredentialsRefreshed(newCredentials);
        clientSignal?.throwIfAborted();
        Object.assign(credentials, newCredentials);
        requestBody = await adapter.buildBody(model, body, { clientSignal, transport });
        headers = adapter.buildHeaders(credentials, requestBody, model, body);
        url = adapter.buildUrl(model, credentials, body);
        providerResponse = await fetchAttempt(url, headers, requestBody);
      } else return rejection(diagnostics.statusCode, formatProviderError(new Error(diagnostics.message), provider, model, diagnostics.statusCode), diagnostics.bodyComplete, diagnostics);
    }
    if (!providerResponse.ok) {
      const diagnostics = await parseError(providerResponse);
      const { statusCode, message, bodyComplete } = diagnostics;
      await acceptUsage(measured, { status: clientSignal?.aborted ? "aborted" : "error" });
      if (clientSignal?.aborted) return cancelled();
      return rejection(statusCode, formatProviderError(new Error(message), provider, model, statusCode), bodyComplete, diagnostics);
    }
    // A successful submit is accepted before body parsing/polling starts.
    // A later error cannot authorize another image-generation POST.
    submissionAccepted = true;
    let parsed;
    if (adapter.parseResponse) {
      parsed = await adapter.parseResponse(providerResponse, {
        headers, log, streamToClient: streamToClient && !binaryOutput, deferUsage: !streamToClient || binaryOutput, onRequestSuccess,
        onUsage: acceptUsage, observeUsage, clientSignal, url, requestBody, model, body, transport,
      });
      if (parsed?.sseResponse) return { success: true, response: parsed.sseResponse };
    } else parsed = await readImageProviderJson(providerResponse, clientSignal);
    return await finishBody(parsed);
  } catch (error) {
    if (!providerResponse?.body?.locked) void providerResponse?.body?.cancel().catch(() => {});
    try { await acceptUsage(measured, { status: clientSignal?.aborted ? "aborted" : "error" }); }
    catch (acceptanceError) { return fail(acceptanceError); }
    return fail(error);
  }
}
