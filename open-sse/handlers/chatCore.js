import { detectFormat, getTargetFormat, resolveTransport } from "../services/provider.js";
import { rejectGoKimiDeferredTools, translateRequest } from "../translator/index.js";
import { applyThinking, extractThinking, parseSuffix, stripThinkingSuffix } from "../translator/concerns/thinkingUnified.js";
import { FORMATS } from "../translator/formats.js";
import { normalizeClaudePassthrough, anchorClaudeCache } from "../translator/formats/claude.js";
import { createStreamController } from "../utils/streamHandler.js";
import { refreshWithRetry } from "../services/tokenRefresh.js";
import { isPermanentAuthDenial } from "../services/accountFallback.js";
import { createRequestLogger } from "../utils/requestLogger.js";
import { getModelTargetFormat, getModelSupportedFormats, getModelStrip, getModelUpstreamId, getModelType, PROVIDER_ID_TO_ALIAS } from "../config/providerModels.js";
import { PROVIDERS } from "../config/providers.js";
import { createErrorResult, parseUpstreamError, formatProviderError } from "../utils/error.js";
import { HTTP_STATUS, TOKEN_SAVER_HEADER } from "../config/runtimeConfig.js";
import { handleBypassRequest } from "../utils/bypassHandler.js";
import { trackPendingRequest, appendRequestLog, saveRequestDetail } from "@/lib/usageDb.js";
import { getExecutor } from "../executors/index.js";
import { supportsGrokCliReasoningEffort } from "../config/grokCli.js";
import { buildRequestDetail, extractRequestConfig, extractUsageFromResponse } from "./chatCore/requestDetail.js";
import { handleForcedSSEToJson } from "./chatCore/sseToJsonHandler.js";
import { handleNonStreamingResponse } from "./chatCore/nonStreamingHandler.js";
import { handleStreamingResponse, buildOnStreamComplete, acceptUsageRecord } from "./chatCore/streamingHandler.js";
import { detectClientTool, isNativePassthrough } from "../utils/clientDetector.js";
import { dedupeTools } from "../utils/toolDeduper.js";
import { injectCaveman } from "../rtk/caveman.js";
import { injectPonytail } from "../rtk/ponytail.js";
import { compressMessages, formatRtkLog } from "../rtk/index.js";
import { compressWithHeadroom, formatHeadroomLog, formatHeadroomSizeLog, isHeadroomPhantomSavings } from "../rtk/headroom.js";
import { compressWithPxpipe } from "../rtk/pxpipe.js";
import { getCapabilitiesForModel, withDeclaredCapabilities } from "../providers/capabilities.js";
import { getDeclaredModelCaps } from "../providers/declaredCaps.js";
import { stripUnsupportedModalities } from "../translator/concerns/modality.js";
import { prefetchRemoteImages } from "../translator/concerns/prefetch.js";
import { defaultClaudeToolType, shouldDefaultClaudeToolType } from "../translator/concerns/toolCall.js";
import { clientRequestedStreaming } from "./chatCore/streamMode.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { normalizeToolSchemasForProvider } from "../utils/toolSchemaCompatibility.js";
import { parseTimeMs } from "../services/oauthCredentialManager.js";
import { redactAccountName } from "@/shared/utils/accountRedaction.js";
import { cloneRequestBody } from "../utils/requestBody.js";
import { normalizeGeminiContents, normalizeGeminiToolResultMedia } from "../translator/formats/gemini.js";
import { isGemini4Model } from "../config/models.js";
import { validateSupportedParams } from "../translator/concerns/paramSupport.js";
import { getServiceTierAccounting, prepareServiceTierRequest } from "../providers/serviceTiers.js";
import { rejectUnsupportedDocuments } from "../translator/concerns/requestMedia.js";
import { getThinkingContext, setThinkingContext } from "../translator/concerns/thinking.js";
import { startRequestPhase } from "../utils/requestTiming.js";

const GOOGLE_WIRE_FORMATS = new Set([FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.VERTEX, FORMATS.ANTIGRAVITY]);

/**
 * Core chat handler - shared between SSE and Worker
 * @param {object} options.body - Request body
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {string} options.sourceFormatOverride - Override detected source format (e.g. "openai-responses")
 */
/**
 * Remove translator-internal continuity fields from the outbound upstream
 * body. The Responses→Chat request translator stashes reasoning
 * `encrypted_content` on assistant messages so a later openai→responses
 * round-trip can restore the store=false continuity blob; that stash must
 * never reach an upstream provider. Chat-native proxies reject the unknown
 * assistant-message field and answer every turn with a literal "400" body
 * (observed with multi-turn Codex sessions via OpenAI-compatible nodes).
 */
export function stripContinuityFields(body) {
  if (!body || !Array.isArray(body.messages)) return body;
  for (const msg of body.messages) {
    if (msg && typeof msg === "object") {
      delete msg.encrypted_content;
      delete msg.reasoning_encrypted_content;
    }
  }
  return body;
}

function requestParameterError(error) {
  if (!["invalid_thinking_budget", "invalid_output_budget", "unsupported_parameter", "invalid_service_tier", "unsupported_service_tier"].includes(error?.code)) return null;
  return createErrorResult(HTTP_STATUS.BAD_REQUEST, error.message, undefined, {
    type: "invalid_request_error", code: error.code, param: error.param,
  });
}

// Go asks clients to identify themselves. Keep a specific caller identity
// unchanged; generic SDK/default agents fall back to the registry's truthful
// router identity. This carries no session ID or other client headers.
function goCallerUserAgent(clientRawRequest, userAgent) {
  const headers = clientRawRequest?.headers;
  const key = headers && typeof headers.get !== "function"
    ? Object.keys(headers).find(name => name.toLowerCase() === "user-agent") : null;
  const raw = userAgent || (typeof headers?.get === "function" ? headers.get("user-agent") : key ? headers[key] : null);
  if (typeof raw !== "string" || raw.length > 512 || /[^\x20-\x7e]/.test(raw)) return null;
  const value = raw.trim();
  if (!value || /^(?:node(?:-fetch)?|undici|curl|wget|python-(?:requests|httpx)|httpx|axios|go-http-client|okhttp|openai\/(?:js|python)|openai-(?:node|python)|anthropic\/(?:js|python)|anthropic-(?:sdk|node|python))(?:\/|\s|$)/i.test(value)) return null;
  return value;
}

function goTransportWithCaller(provider, targetTransport, targetFormat, clientRawRequest, userAgent) {
  if (provider !== "opencode-go") return targetTransport;
  const caller = goCallerUserAgent(clientRawRequest, userAgent);
  if (!caller) return targetTransport;
  const config = PROVIDERS[provider];
  const transport = targetTransport || { ...config, format: targetFormat };
  const headerKey = Object.keys(transport.headers || {}).find(name => name.toLowerCase() === "user-agent");
  const configured = headerKey ? transport.headers[headerKey] : null;
  const fallbackKey = Object.keys(config.headers || {}).find(name => name.toLowerCase() === "user-agent");
  if (configured && configured !== config.headers?.[fallbackKey]) return targetTransport;
  const headers = { ...transport.headers };
  if (headerKey) delete headers[headerKey];
  headers["User-Agent"] = caller;
  return { ...transport, headers };
}

function permanentDenialEvidence(status, responseBody, diagnostics) {
  const error = responseBody?.error && typeof responseBody.error === "object" && !Array.isArray(responseBody.error) ? responseBody.error : responseBody;
  const details = error?.details;
  const typedCodes = [error?.code, error?.error_code, diagnostics?.code,
    ...[details, ...(Array.isArray(details) ? details.slice(0, 32) : [])].map(detail => detail?.error_code)];
  if (typedCodes.some(code => typeof code === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(code) && isPermanentAuthDenial(status, code))) return true;
  const message = typeof error?.message === "string" ? error.message : diagnostics?.message;
  const unquoted = String(message || "").slice(0, 8192).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`/g, "");
  return isPermanentAuthDenial(status, unquoted);
}

export async function handleChatCore({ body, modelInfo, credentials, log, onCredentialsRefreshed, onRequestSuccess, onDisconnect, onStreamFailed, clientRawRequest, connectionId, userAgent, apiKey, ccFilterNaming, rtkEnabled, headroomEnabled, headroomUrl, headroomCompressUserMessages, headroomTimeoutMs, cavemanEnabled, cavemanLevel, ponytailEnabled, ponytailLevel, pxpipeEnabled, pxpipeMinChars, pxpipeTimeoutMs, pxpipeTransform, onPxpipeEvent, sourceFormatOverride, sourceBody, providerThinking, providerServiceTier, clientSignal }) {
  const { provider, model } = modelInfo;
  const requestStartTime = Date.now();
  // Stable per-session color so all lines of one CLI conversation share a tag
  const sessionSeed = clientRawRequest?.serverRequestId || (() => {
    try {
      return resolveSessionId({ headers: clientRawRequest?.headers, body, connectionId, scope: provider });
    } catch {
      return connectionId || "";
    }
  })();
  const reqTag = log?.tagForSession ? log.tagForSession(sessionSeed) : (log?.nextTag ? log.nextTag() : "");

  const sourceFormat = sourceFormatOverride || detectFormat(body);
  const preparationDone = startRequestPhase("request_prepare");

  // Each account/model attempt owns its mutations; retries keep the source history.
  body = cloneRequestBody(body);

  let serviceTier;
  try {
    serviceTier = prepareServiceTierRequest(provider, model, body, providerServiceTier, credentials);
    if (serviceTier?.selection !== undefined) body.service_tier = serviceTier.selection;
  } catch (error) {
    const invalidRequest = requestParameterError(error);
    if (invalidRequest) {
      // Trusted pre-dispatch metadata only. Never infer this marker from a
      // provider's HTTP status or error text: those keep normal error handling.
      if (error.code === "unsupported_service_tier" && error.scope === "account") {
        invalidRequest.accountServiceTierDenied = true;
      }
      return invalidRequest;
    }
    throw error;
  }

  const alias = PROVIDER_ID_TO_ALIAS[provider] || provider;
  const isMuseOnOpenCode = (provider === "opencode" || alias === "oc") && /muse/i.test(model);
  const modelTargetFormat = isMuseOnOpenCode ? FORMATS.OPENAI_RESPONSES : getModelTargetFormat(alias, model);
  // Multi-endpoint providers: pick transport matching sourceFormat → zero translation.
  // Per-model guard: only use the transport when the model declares support for that
  // sourceFormat — opencode-go models differ in endpoint support (kimi/glm only do
  // /chat/completions), so without this guard a claude-format request would wrongly
  // route kimi to /messages.
  const modelSupportedFormats = getModelSupportedFormats(alias, model);
  const runtimeTransport = resolveTransport(provider, sourceFormat);
  // Per-model guard: when a model declares supportedFormats, only use the
  // sourceFormat-matched transport if that format is declared (opencode-go models
  // differ — kimi/glm only do /chat/completions). Undeclared models keep the
  // upstream default (use the transport), preserving behavior for glm/deepseek/...
  const useTransport = serviceTier?.requiresResponses ? resolveTransport(provider, FORMATS.OPENAI_RESPONSES)
    : (!modelSupportedFormats || modelSupportedFormats.includes(sourceFormat)) ? runtimeTransport : null;
  // A source-format-matched endpoint keeps the request lossless. Prefer it
  // over a model-level targetFormat, which is only the fallback for clients
  // whose wire format has no supported transport (for example MiniMax-M3:
  // OpenAI clients should stay on /chat/completions; other clients can fall
  // back to its declared Claude target).
  const targetFormat = useTransport?.format || modelTargetFormat || getTargetFormat(provider, credentials);
  // A model-level translation target needs its matching endpoint as well.
  // Provider-default targets already use the executor's default transport.
  const targetTransport = goTransportWithCaller(provider,
    useTransport || (modelTargetFormat ? resolveTransport(provider, targetFormat) : null),
    targetFormat, clientRawRequest, userAgent);
  if (credentials) {
    if (targetTransport) credentials.runtimeTransport = targetTransport;
    else delete credentials.runtimeTransport; // Reused credentials must not retain a prior request's endpoint.
  }
  const stripList = getModelStrip(alias, model);

  // Inject provider-level thinking config override (only if client hasn't set)
  // on/off → extended type (body.thinking), none/low/medium/high → effort type (body.reasoning_effort)
  const useProviderThinking = providerThinking?.mode && providerThinking.mode !== "auto" && !extractThinking(body);
  if (useProviderThinking) {
    const mode = providerThinking.mode;
    if (mode === "on" && !body.thinking) {
      console.log("Injecting provider-level thinking config override: on");
      body = { ...body, thinking: { type: "enabled", budget_tokens: 10000 } };
    } else if (mode === "off" && !body.thinking) {
      body = { ...body, thinking: { type: "disabled" } };
    } else if (!body.reasoning_effort) {
      body = { ...body, reasoning_effort: mode };
    }
    setThinkingContext(body, { providerDefault: true, explicitBudget: false });
  }

  const upstreamModel = getModelUpstreamId(alias, model, extractThinking(body));

  const clientWantsStream = clientRequestedStreaming(body, sourceFormat);
  const providerRequiresStreaming = PROVIDERS[provider]?.forceStream === true;
  // OpenAI Chat Completions defines an omitted `stream` field as false.
  // Providers that only expose SSE still stream upstream and are aggregated
  // back to JSON below when the client did not explicitly request streaming.
  let stream = providerRequiresStreaming || clientWantsStream;

  // Image generation models require non-streaming (Google v1internal:generateContent)
  const modelType = getModelType(alias, model);
  const isImageGenModel = modelType === "imageGen" || /image|imagen|image-generation/i.test(model);
  if (isImageGenModel && (provider === "antigravity" || provider === "gemini-cli")) {
    stream = false;
  }

  // DeepSeek-TUI: interactive TUI panel sends stream:true and needs SSE.
  // Non-interactive mode (-p flag) sends without stream and can't parse SSE.
  // Only force non-streaming when client didn't explicitly request it.
  const detectedTool = detectClientTool(clientRawRequest?.headers || {}, body);
  if (detectedTool === "deepseek-tui" && body.stream !== true) stream = false;

  // Check client Accept header preference for non-streaming requests
  // This fixes AI SDK compatibility where clients send Accept: application/json
  const acceptHeader = clientRawRequest?.headers?.accept || "";
  const clientPrefersJson = acceptHeader.includes("application/json");
  const clientPrefersSSE = acceptHeader.includes("text/event-stream");
  if (clientPrefersJson && !clientPrefersSSE && body.stream !== true && !providerRequiresStreaming) {
    stream = false;
  }

  const reqLogger = await createRequestLogger(sourceFormat, targetFormat, model);
  if (clientRawRequest) reqLogger.logClientRawRequest(clientRawRequest.endpoint, clientRawRequest.body, clientRawRequest.headers);
  reqLogger.logRawRequest(body);
  log?.debug?.("FORMAT", `${sourceFormat} → ${targetFormat} | stream=${stream}`);

  // Native CLI headers only enable passthrough when the actual wire format matches.
  const clientTool = detectClientTool(clientRawRequest?.headers || {}, body);
  const responsesWire = (sourceFormat === FORMATS.OPENAI_RESPONSES || sourceFormat === FORMATS.CODEX) &&
    (targetFormat === FORMATS.OPENAI_RESPONSES || targetFormat === FORMATS.CODEX);
  const googleWire = GOOGLE_WIRE_FORMATS.has(sourceFormat) && GOOGLE_WIRE_FORMATS.has(targetFormat);
  const passthrough = isNativePassthrough(clientTool, provider) && (sourceFormat === targetFormat || responsesWire || googleWire);

  // Expose raw client headers to translators/executors for session-id resolution
  if (credentials) credentials.rawHeaders = clientRawRequest?.headers || {};

  try {
    validateSupportedParams(provider, upstreamModel, body, targetFormat, model, { providerThinkingInjected: useProviderThinking });
  } catch (error) {
    const invalidRequest = requestParameterError(error);
    if (invalidRequest) return invalidRequest;
    throw error;
  }

  // Legacy tool arrays must become typed media even on native Google passthrough.
  if (GOOGLE_WIRE_FORMATS.has(sourceFormat)) normalizeGeminiToolResultMedia(body);

  // Documents must never disappear into an omitted-file placeholder, including
  // native passthrough. Reject unsupported routes before any billable dispatch.
  const capabilityModel = stripThinkingSuffix(model);
  const declared = await getDeclaredModelCaps(provider, capabilityModel);
  const capabilities = withDeclaredCapabilities(getCapabilitiesForModel(provider, capabilityModel), declared, provider, capabilityModel);
  let hasDocuments;
  try {
    hasDocuments = rejectUnsupportedDocuments(body, capabilities);
  } catch (error) {
    const invalidRequest = requestParameterError(error);
    if (invalidRequest) return invalidRequest;
    throw error;
  }
  // Validate before both the core shortcut and modality filtering: a shortcut
  // cannot synthesize success for a deferred tool that this route cannot honor,
  // and the diagnostic must reference the original message content indexes.
  try {
    if (sourceBody && sourceBody !== body) rejectGoKimiDeferredTools(sourceFormat, targetFormat, provider, upstreamModel, sourceBody);
    rejectGoKimiDeferredTools(sourceFormat, targetFormat, provider, upstreamModel, body);
  } catch (error) {
    const invalidRequest = requestParameterError(error);
    if (invalidRequest) return invalidRequest;
    throw error;
  }
  // CLI warmup/title bypasses are text optimizations, not permission to return
  // synthetic success after silently ignoring unsupported attachments.
  const bypassResponse = hasDocuments ? null : handleBypassRequest(body, model, userAgent, ccFilterNaming);
  if (bypassResponse) return bypassResponse;
  // Other legacy media downgrade policies remain translation-only.
  if (!passthrough) {
    if (stripUnsupportedModalities(body, sourceFormat, capabilities)) {
      log?.debug?.("MODALITY", `stripped unsupported media for ${provider}/${model}`);
    }
  }
  // Remote-image prefetch runs on BOTH paths.
  //
  // It used to be inside the `!passthrough` branch, so a native passthrough
  // request carrying an HTTP image_url was forwarded as-is to a target that
  // cannot fetch URLs, and the upstream failed with a confusing 400. The helper
  // is a no-op when the target does not need inlining (prefetch.js checks the
  // format itself), so running it on the passthrough path only adds work when
  // there is work to do.
  //
  // stripUnsupportedModalities stays translation-only on purpose: dropping a
  // media block from a body the client sent in the provider's OWN native format
  // would silently alter a request the gateway promised to pass through.
  try {
    const n = await prefetchRemoteImages(body, sourceFormat, targetFormat, { signal: clientSignal });
    if (n > 0) log?.debug?.("MODALITY", `prefetched ${n} remote image(s) for ${targetFormat}`);
  } catch (e) { log?.warn?.("MODALITY", `image prefetch failed: ${e.message}`); }
  if (clientSignal?.aborted) return createErrorResult(499, "Client closed request");

  let translatedBody;
  let toolNameMap;
  let customToolNames;
  if (passthrough) {
    log?.debug?.("PASSTHROUGH", `${clientTool} → ${provider} | native lossless`);
    translatedBody = { ...body, model: stripThinkingSuffix(upstreamModel) };
    const thinkingContext = getThinkingContext(body);
    if (thinkingContext) setThinkingContext(translatedBody, thinkingContext);
    // Gateway suffixes and injected defaults need native wire fields even when
    // translation is bypassed. Retain the client's display/summary options.
    if (parseSuffix(upstreamModel).override || useProviderThinking) {
      applyThinking(targetFormat, upstreamModel, translatedBody, provider);
    }
    // Normalize newer Cowork/CC beta shapes (adaptive thinking, mid-conversation system) the API rejects
    if (clientTool === "claude") {
      try {
        normalizeClaudePassthrough(translatedBody, translatedBody.model, clientRawRequest?.headers || null);
      } catch (error) {
        const invalidRequest = requestParameterError(error);
        if (invalidRequest) return invalidRequest;
        throw error;
      }
    }
  } else {
    try {
      translatedBody = translateRequest(sourceFormat, targetFormat, upstreamModel, body, stream, credentials, provider, reqLogger, stripList, connectionId, clientTool, capabilities, { ownership: "owned" });
    } catch (error) {
      const invalidRequest = requestParameterError(error);
      if (invalidRequest) return invalidRequest;
      throw error;
    }
    if (!translatedBody) {
      trackPendingRequest(model, provider, connectionId, false, true);
      return createErrorResult(HTTP_STATUS.BAD_REQUEST, `Failed to translate request for ${sourceFormat} → ${targetFormat}`);
    }
    toolNameMap = translatedBody._toolNameMap;
    delete translatedBody._toolNameMap;
    customToolNames = translatedBody._customToolNames;
    delete translatedBody._customToolNames;
    translatedBody.model = stripThinkingSuffix(upstreamModel);
    stripContinuityFields(translatedBody);
  }

  // Speed is orthogonal to the source format. Claude and other translators
  // need not know OpenAI-only extension fields; retain the selected intent here.
  if (serviceTier?.selection !== undefined) translatedBody.service_tier = serviceTier.selection;

  // Same-format and native passthrough bypass the request translators. Normalize
  // their actual outbound Parts too, without inventing a native tool result.
  if (GOOGLE_WIRE_FORMATS.has(targetFormat) && isGemini4Model(upstreamModel)) {
    const request = translatedBody.request || translatedBody;
    if (Array.isArray(request.contents)) {
      request.contents = normalizeGeminiContents(request.contents, upstreamModel, { ensureUserTurns: false });
    }
  }

  // Tool normalization: MCP-equivalent built-in dedup (Claude clients) + same-name
  // dedup for DeepSeek models (upstream rejects duplicate tool names on all endpoints).
  if (Array.isArray(translatedBody.tools)) {
    const { tools: deduped, stripped } = dedupeTools(translatedBody.tools, { clientTool, model });
    if (stripped.length > 0) {
      translatedBody.tools = deduped;
      log?.debug?.("TOOLDEDUP", `stripped ${stripped.length}: ${stripped.slice(0, 3).join(", ")}${stripped.length > 3 ? "..." : ""}`);
    }
  }

  translatedBody.tools = normalizeToolSchemasForProvider(provider, translatedBody.tools, log);

  // Token savers: applied at the final body just before dispatch
  // Covers both passthrough (source shape) and translated (target shape) flows
  const finalFormat = passthrough ? sourceFormat : targetFormat;

  // Request line: one correlated summary (fmt + thinking + counts + account)
  if (log?.line) {
    const clientModel = clientRawRequest?.body?.model || `${provider}/${model}`;
    const msgN = translatedBody.messages?.length || translatedBody.input?.length || translatedBody.contents?.length || body.messages?.length || body.input?.length || 0;
    const toolN = translatedBody.tools?.length || body.tools?.length || 0;
    const fmtStr = passthrough ? `FMT: ${sourceFormat} (passthrough)` : `FMT: ${sourceFormat}→${targetFormat}`;
    const showThinking = provider !== "grok-cli" || supportsGrokCliReasoningEffort(model);
    const think = showThinking ? log.fmtThink?.(extractThinking(translatedBody)) : null;
    const acc = credentials?.connectionName || credentials?.connectionId
      ? redactAccountName(credentials?.connectionName, credentials?.connectionId)
      : "-";
    const parts = [
      `POST ${clientModel} → ${provider}/${model}`,
      fmtStr,
      stream ? "STREAM" : "JSON",
      `${msgN} MSG`,
    ];
    if (toolN) parts.push(`${toolN} TOOL`);
    if (think) parts.push(`THINK:${think}`);
    parts.push(`ACC:${acc}`);
    log.line(reqTag, "▶", parts.join(" · "));
  }

  // TTS models don't support tool messages/function calling
  if (getModelType(alias, model) === "tts" && translatedBody.messages) {
    translatedBody.messages = translatedBody.messages.filter((msg) => msg.role !== "tool");
    delete translatedBody.tools;
  }

  // Claude tool schema requires `type` to be explicitly set; strict gateways (e.g., MiniMax)
  // reject legacy payloads that omit it with HTTP 400. Default to "custom" when missing.
  // Provider-scoped via quirks (shouldDefaultClaudeToolType): only gateways that declare
  // requireClaudeToolType get the explicit type. Applying it unconditionally breaks
  // Claude-format endpoints that only accept the legacy typeless tool shape — DeepSeek's
  // Anthropic-compatible endpoint 400s with "unknown variant `custom`" (#3905).
  if (shouldDefaultClaudeToolType(provider, finalFormat, translatedBody.tools, PROVIDERS)) {
    translatedBody.tools = defaultClaudeToolType(translatedBody.tools);
  }

  // Per-request opt-out: client can bypass all token savers via header
  const tokenSaverEnabled = clientRawRequest?.headers?.[TOKEN_SAVER_HEADER]?.toLowerCase() !== "off";

  // RTK: compress tool_result content
  const rtkStats = compressMessages(translatedBody, tokenSaverEnabled && rtkEnabled);
  const rtkLine = formatRtkLog(rtkStats);
  if (rtkLine) console.log(rtkLine);

  // Headroom: optional external proxy compression; fail open if proxy is absent.
  const headroomDiagnostics = {};
  const headroomStats = await compressWithHeadroom(translatedBody, { enabled: tokenSaverEnabled && headroomEnabled, url: headroomUrl, model: upstreamModel, format: finalFormat, compressUserMessages: headroomCompressUserMessages, timeoutMs: headroomTimeoutMs, diagnostics: headroomDiagnostics });
  const headroomLine = formatHeadroomLog(headroomStats);
  const headroomSizeLine = formatHeadroomSizeLog(headroomDiagnostics);
  if (headroomLine) {
    log?.info?.("HEADROOM", `${headroomLine}${headroomSizeLine ? ` | ${headroomSizeLine}` : ""}`);
    if (isHeadroomPhantomSavings(headroomStats, headroomDiagnostics)) {
      log?.warn?.("HEADROOM", `reported token delta, but outbound JSON shrank <5%; provider may bill near-original payload | ${formatHeadroomSizeLog(headroomDiagnostics)}`);
    }
  } else if (tokenSaverEnabled && headroomEnabled) log?.warn?.("HEADROOM", `skipped: ${headroomDiagnostics.reason || "compression unavailable"}${headroomDiagnostics.endpoint ? ` (${headroomDiagnostics.endpoint})` : ""}`);

  // Token-saver flags accumulator for the single "⚙" log line below.
  const xf = [];

  // Caveman: inject terse-style system prompt
  if (tokenSaverEnabled && cavemanEnabled && cavemanLevel) {
    injectCaveman(translatedBody, finalFormat, cavemanLevel);
    xf.push(`CAVEMAN:${cavemanLevel}`);
  }

  // Ponytail: inject lazy-senior-dev system prompt
  if (tokenSaverEnabled && ponytailEnabled && ponytailLevel) {
    injectPonytail(translatedBody, finalFormat, ponytailLevel);
    xf.push(`PONYTAIL:${ponytailLevel}`);
  }

  // PXPIPE: image bulky context (Claude-format bodies only), last saver before dispatch
  let pxpipeSummary = null;
  if (pxpipeEnabled) {
    const pxpipeResult = await compressWithPxpipe(translatedBody, {
      enabled: true, format: finalFormat, model: upstreamModel,
      minChars: pxpipeMinChars, timeoutMs: pxpipeTimeoutMs, transform: pxpipeTransform,
    });
    pxpipeSummary = pxpipeResult.summary;
    if (pxpipeResult.body) translatedBody = pxpipeResult.body;
    if (pxpipeSummary?.applied) xf.push(`PXPIPE:${pxpipeSummary.imageCount}img`);
    try { onPxpipeEvent?.({ provider, model, ...pxpipeSummary }); } catch { /* stats must not break requests */ }
  }

  if (xf.length && log?.line) log.line(reqTag, "⚙", xf.join(" · "));

  // Pin cache breakpoints to the final body — every saver above can reshape
  // system/tools/messages, and a stale anchor costs a full prefix rewrite.
  // Applies whenever the final wire format is Claude / Anthropic-compatible.
  if (finalFormat === FORMATS.CLAUDE || (passthrough && clientTool === "claude")) {
    anchorClaudeCache(translatedBody);
  }

  preparationDone();
  if (clientSignal?.aborted) return createErrorResult(499, "Client closed request");

  const executor = getExecutor(provider);
  let usageEventId = crypto.randomUUID();
  let usageTimestamp = new Date(requestStartTime).toISOString();
  trackPendingRequest(model, provider, connectionId, true);
  appendRequestLog({ model, provider, connectionId, status: "PENDING" }).catch(() => { });

  const msgCount = translatedBody.messages?.length || translatedBody.input?.length || translatedBody.contents?.length || translatedBody.request?.contents?.length || 0;
  log?.debug?.("REQUEST", `${provider.toUpperCase()} | ${model} | ${msgCount} msgs`);

  let removeClientAbort = () => {};
  const streamController = createStreamController({
    onDisconnect: (reason) => {
      removeClientAbort();
      trackPendingRequest(model, provider, connectionId, false);
      if (onDisconnect) onDisconnect(reason);
    },
    onError: () => { removeClientAbort(); trackPendingRequest(model, provider, connectionId, false); },
    log, provider, model, reqTag
  });
  const complete = streamController.handleComplete;
  streamController.handleComplete = () => { removeClientAbort(); complete(); };
  const handleError = streamController.handleError;
  streamController.handleError = error => { removeClientAbort(); handleError(error); };

  if (clientSignal) {
    const abort = () => streamController.handleDisconnect("client_aborted");
    removeClientAbort = () => clientSignal.removeEventListener("abort", abort);
    if (clientSignal.aborted) abort();
    else clientSignal.addEventListener("abort", abort, { once: true });
  }

  const proxyOptions = {
    connectionProxyEnabled: credentials?.providerSpecificData?.connectionProxyEnabled === true,
    connectionProxyUrl: credentials?.providerSpecificData?.connectionProxyUrl || "",
    connectionNoProxy: credentials?.providerSpecificData?.connectionNoProxy || "",
    vercelRelayUrl: credentials?.providerSpecificData?.vercelRelayUrl || "",
    strictProxy: credentials?.providerSpecificData?.strictProxy === true,
  };

  if (proxyOptions.vercelRelayUrl) {
    const connectionName = credentials?.connectionName || credentials?.connectionId || "unknown";
    const poolId = credentials?.providerSpecificData?.connectionProxyPoolId || "none";
    log?.info?.("PROXY", `${provider.toUpperCase()} | ${model} | conn=${connectionName} | pool=${poolId} | vercel-relay=${proxyOptions.vercelRelayUrl}`);
  } else if (proxyOptions.connectionProxyEnabled && proxyOptions.connectionProxyUrl) {
    let maskedProxyUrl = proxyOptions.connectionProxyUrl;
    try {
      const parsed = new URL(proxyOptions.connectionProxyUrl);
      const host = parsed.hostname || "";
      const port = parsed.port ? `:${parsed.port}` : "";
      const protocol = parsed.protocol || "http:";
      maskedProxyUrl = `${protocol}//${host}${port}`;
    } catch {
      // Keep raw if URL parsing fails
    }

    const poolId = credentials?.providerSpecificData?.connectionProxyPoolId || "none";
    const connectionName = credentials?.connectionName || credentials?.connectionId || "unknown";
    log?.info?.("PROXY", `${provider.toUpperCase()} | ${model} | conn=${connectionName} | pool=${poolId} | url=${maskedProxyUrl}`);
  }

  if (proxyOptions.connectionProxyEnabled && proxyOptions.connectionNoProxy) {
    const connectionName = credentials?.connectionName || credentials?.connectionId || "unknown";
    log?.debug?.("PROXY", `${provider.toUpperCase()} | ${model} | conn=${connectionName} | no_proxy=${proxyOptions.connectionNoProxy}`);
  }

  // Execute request
  let providerResponse, providerUrl, providerHeaders, finalBody;
  // Most executors return their registry format. Cursor AgentService is an
  // exception: it is decoded by the executor into OpenAI-compatible output.
  let providerResponseFormat = targetFormat;
  const upstreamHeadersDone = startRequestPhase("upstream_headers");
  try {
    const result = await executor.execute({ model, body: translatedBody, stream, credentials, signal: streamController.signal, log, proxyOptions });
    providerResponse = result.response;
    providerUrl = result.url;
    providerHeaders = result.headers;
    finalBody = result.transformedBody;
    providerResponseFormat = result.responseFormat || targetFormat;
    upstreamHeadersDone();
    reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);
  } catch (error) {
    const invalidRequest = requestParameterError(error);
    const cancelled = clientSignal?.aborted || streamController.signal?.aborted || error.name === "AbortError";
    const status = cancelled ? 499 : invalidRequest ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.BAD_GATEWAY;
    trackPendingRequest(model, provider, connectionId, false, true);
    appendRequestLog({ model, provider, connectionId, status: `FAILED ${status}` }).catch(() => { });
    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId,
      latency: { ttft: 0, total: Date.now() - requestStartTime },
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      request: extractRequestConfig(body, stream),
      providerRequest: translatedBody || null,
      response: { error: error.message || String(error), status, thinking: null },
      pxpipe: pxpipeSummary,
      status: "error"
    })).catch(() => { });

    if (cancelled) {
      streamController.handleError(error);
      return createErrorResult(499, "Request aborted");
    }
    streamController.handleComplete();
    if (invalidRequest) return invalidRequest;
    const errMsg = formatProviderError(error, provider, model, HTTP_STATUS.BAD_GATEWAY);
    if (log?.errorLine) {
      log.errorLine(reqTag, "✗", `ERROR 502 · ${provider}/${model} · ${Date.now() - requestStartTime}ms\n    ${errMsg}${error.stack ? `\n    ${error.stack}` : ""}`);
    }
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, errMsg);
  } finally { upstreamHeadersDone(); }

  // Handle 401/403 - try token refresh (skip for noAuth providers).
  // Permanent org-policy denials (Anthropic `oauth_not_allowed_for_organization`)
  // can never be healed by refresh: skip the refresh+retry entirely so one
  // denied credential doesn't burn refresh budget and lock every sibling
  // account in turn. The normal error path below still locks this account
  // (terminal, extended cooldown) and falls back once to the next account.
  let providerErrorDiagnostics = null;
  let incurredUsage = null;
  let errorServiceTier = serviceTier;
  let permanentDenial = false;
  let accountingUncertain = false;
  const readProviderError = () => parseUpstreamError(providerResponse, executor, (responseBody, capture) => {
    accountingUncertain = capture.uncertain;
    incurredUsage = extractUsageFromResponse(responseBody);
    errorServiceTier = getServiceTierAccounting(provider, serviceTier, responseBody);
    permanentDenial = permanentDenialEvidence(providerResponse.status, responseBody);
  }, { signal: streamController.signal });
  if (!executor.noAuth && (providerResponse.status === HTTP_STATUS.UNAUTHORIZED || providerResponse.status === HTTP_STATUS.FORBIDDEN)) {
    providerErrorDiagnostics = await readProviderError();
    permanentDenial ||= permanentDenialEvidence(providerResponse.status, null, providerErrorDiagnostics);
    const alreadyIncurred = incurredUsage && (incurredUsage.prompt_tokens > 0 || incurredUsage.completion_tokens > 0 || incurredUsage.usage_invalid || incurredUsage.cache_write_invalid);
    if (permanentDenial || alreadyIncurred || accountingUncertain) {
      if (log?.line) log.line(reqTag, "⛔", `${accountingUncertain ? "ACCOUNTING UNCERTAIN" : permanentDenial ? "PERMANENT AUTH DENIAL" : "INCURRED USAGE"} · ${provider}/${model} · skipping token refresh`);
    } else {
    try {
      // Mutate credentials after each successful refresh: rotating refresh_token
      // providers (xAI/grok-cli) issue a new RT on every refresh; without this,
      // refreshWithRetry's 2nd/3rd attempt reuses the already-consumed RT →
      // invalid_grant → auth_failed retryable=false.
      const newCredentials = await refreshWithRetry(async () => {
        const result = await executor.refreshCredentials(credentials, log, proxyOptions, streamController.signal);
        if (result?.refreshToken && result.refreshToken !== credentials.refreshToken) {
          if (result.accessToken) credentials.accessToken = result.accessToken;
          credentials.refreshToken = result.refreshToken;
        }
        return result;
      }, 3, log, streamController.signal);
      if (newCredentials?.accessToken || newCredentials?.copilotToken) {
        if (log?.line) log.line(reqTag, "🔑", `TOKEN REFRESHED · ${provider}/${model}`);
        const previousSpecific = credentials.providerSpecificData;
        Object.assign(credentials, newCredentials);
        if (newCredentials.providerSpecificData) credentials.providerSpecificData = { ...previousSpecific, ...newCredentials.providerSpecificData };
        if (onCredentialsRefreshed) {
          try {
            const committed = await onCredentialsRefreshed(newCredentials);
            if (committed === false) throw Object.assign(new Error("Selected credentials changed during refresh"), { code: "STALE_CONNECTION_WRITE" });
          } catch (e) {
            if (e?.code === "STALE_CONNECTION_WRITE") throw e;
            log?.warn?.("TOKEN", `onCredentialsRefreshed failed: ${e.message}`);
          }
        }
        try {
          usageEventId = crypto.randomUUID();
          usageTimestamp = new Date().toISOString();
          const retryResult = await executor.execute({ model, body: translatedBody, stream, credentials, signal: streamController.signal, log, proxyOptions });
          providerResponse = retryResult.response;
          providerErrorDiagnostics = null;
          incurredUsage = null;
          errorServiceTier = serviceTier;
          permanentDenial = false;
          accountingUncertain = false;
          providerUrl = retryResult.url;
          finalBody = retryResult.transformedBody ?? finalBody;
          providerResponseFormat = retryResult.responseFormat || targetFormat;
        } catch { log?.warn?.("TOKEN", `${provider.toUpperCase()} | retry after refresh failed`); }
      } else {
        log?.warn?.("TOKEN", `${provider.toUpperCase()} | refresh failed`);
      }
    } catch (e) {
      if (e?.code === "STALE_CONNECTION_WRITE") {
        await providerResponse.body?.cancel().catch(() => {});
        trackPendingRequest(model, provider, connectionId, false);
        streamController.handleComplete();
        return { ...createErrorResult(HTTP_STATUS.SERVICE_UNAVAILABLE, "Routing configuration changed; retry the request"), credentialsSuperseded: true };
      }
      log?.warn?.("TOKEN", `${provider.toUpperCase()} | refresh threw: ${e.message}`);
    }
    } // end else (non-permanent 401/403 → refresh path)
  }

  // A refresh/refresh-retry catch must not turn caller cancellation back into
  // the original 401/403 and cool down or rotate a healthy account.
  if (providerResponse.ok && (clientSignal?.aborted || streamController.signal?.aborted)) {
    trackPendingRequest(model, provider, connectionId, false);
    streamController.handleComplete();
    await providerResponse.body?.cancel().catch(() => {});
    return createErrorResult(499, "Client closed request");
  }

  // Provider returned error
  if (!providerResponse.ok) {
    trackPendingRequest(model, provider, connectionId, false, true);
    const diagnostics = providerErrorDiagnostics || await readProviderError();
    try {
      await acceptUsageRecord({ provider, model, tokens: incurredUsage, connectionId, apiKey, eventId: usageEventId, timestamp: usageTimestamp, endpoint: clientRawRequest?.endpoint, silent: true, serviceTier: errorServiceTier });
    } catch (error) {
      streamController.handleComplete();
      return createErrorResult(503, error.message, null, { code: error.code });
    }
    if (clientSignal?.aborted || streamController.signal?.aborted) {
      streamController.handleComplete();
      return createErrorResult(499, "Client closed request");
    }
    if (accountingUncertain) {
      streamController.handleComplete();
      return createErrorResult(503, "Usage accounting could not be determined; do not retry this request", null, { code: "usage_accounting_uncertain" });
    }
    const { statusCode, message, resetsAtMs } = diagnostics;
    appendRequestLog({ model, provider, connectionId, status: `FAILED ${statusCode}` }).catch(() => { });
    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId,
      latency: { ttft: 0, total: Date.now() - requestStartTime },
      tokens: incurredUsage || { prompt_tokens: 0, completion_tokens: 0 },
      request: extractRequestConfig(body, stream),
      providerRequest: finalBody || translatedBody || null,
      response: { error: message, status: statusCode, thinking: null },
      pxpipe: pxpipeSummary,
      status: "error"
    })).catch(() => { });

    const errMsg = formatProviderError(new Error(message), provider, model, statusCode);
    if (log?.errorLine) {
      const urlStr = providerUrl ? `\n    URL: ${providerUrl}` : "";
      log.errorLine(reqTag, "✗", `ERROR ${statusCode} · ${provider}/${model} · ${Date.now() - requestStartTime}ms${urlStr}\n    ${errMsg}`);
    }
    reqLogger.logError(new Error(message));
    streamController.handleComplete();
    return createErrorResult(statusCode, errMsg, resetsAtMs, diagnostics);
  }

  const sharedCtx = { provider, model, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, serviceTier, usageEventId, usageTimestamp, pxpipe: pxpipeSummary, reqTag, log };
  const appendLog = (extra) => appendRequestLog({ model, provider, connectionId, ...extra }).catch(() => { });
  const trackDone = () => trackPendingRequest(model, provider, connectionId, false);

  // Provider forced streaming but client wants JSON
  if (!clientWantsStream && providerRequiresStreaming) {
    try {
      const result = await handleForcedSSEToJson({ ...sharedCtx, providerResponse, sourceFormat, targetFormat: providerResponseFormat, toolNameMap, customToolNames, trackDone, appendLog, signal: streamController.signal });
      if (result) { streamController.handleComplete(); return result; }
    } catch (error) {
      streamController.handleComplete();
      if (clientSignal?.aborted || streamController.signal?.aborted) { trackDone(); return createErrorResult(499, "Client closed request"); }
      throw error;
    }
  }

  // Non-streaming response. Stream-only providers normally arrive here only
  // after the SSE-to-JSON handler determined that their upstream returned JSON.
  if (!stream || (!clientWantsStream && providerRequiresStreaming)) {
    try {
      const result = await handleNonStreamingResponse({ ...sharedCtx, providerResponse, sourceFormat, targetFormat: providerResponseFormat, reqLogger, toolNameMap, customToolNames, trackDone, appendLog, signal: streamController.signal });
      if (result.response?.headers?.get("x-should-retry") === "false") return result;
      if (clientSignal?.aborted || streamController.signal?.aborted) { trackDone(); return createErrorResult(499, "Client closed request"); }
      return result;
    } catch (error) {
      if (clientSignal?.aborted || streamController.signal?.aborted) { trackDone(); return createErrorResult(499, "Client closed request"); }
      throw error;
    } finally { streamController.handleComplete(); }
  }

  // Streaming response
  const { onStreamComplete, onStreamAborted, streamDetailId } = buildOnStreamComplete({ ...sharedCtx, onStreamFailed });
  return handleStreamingResponse({ ...sharedCtx, providerResponse, sourceFormat, targetFormat: providerResponseFormat, userAgent, reqLogger, toolNameMap, customToolNames, streamController, onStreamComplete, onStreamAborted, streamDetailId });
}

export function isTokenExpiringSoon(expiresAt, bufferMs = 5 * 60 * 1000) {
  if (!expiresAt) return false;
  const expiryMs = parseTimeMs(expiresAt);
  return expiryMs !== null && expiryMs - Date.now() < bufferMs;
}
