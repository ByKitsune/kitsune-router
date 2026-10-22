import { FORMATS } from "./formats.js";
import { ensureToolCallIds, fixMissingToolResponses } from "./concerns/toolCall.js";
import { prepareClaudeRequest, ensureTrailingUserTurn } from "./formats/claude.js";
import { cloakClaudeTools, decloakStreamChunk } from "../utils/claudeCloaking.js";
import { compressToolNames, decloakOpenAIChunk } from "../utils/toolCompressor.js";
import { filterToOpenAIFormat } from "./formats/openai.js";
import { stripUnsupportedChatExtensions, validateSupportedParams } from "./concerns/paramSupport.js";
import { applyThinking, captureThinking } from "./concerns/thinkingUnified.js";
import { getThinkingContext, setThinkingContext } from "./concerns/thinking.js";
import { captureSessionId } from "../utils/sessionManager.js";
import { AntigravityExecutor } from "../executors/antigravity.js";
import { PROVIDERS } from "../providers/index.js";
import { ROLE, GEMINI_ROLE } from "./schema/roles.js";
import { extractResponseError, responseErrorToClient } from "./concerns/responseError.js";
import { lowerKimiDeferredTools } from "./concerns/deferredTools.js";

// Registry for translators. Lazy-init guards against circular-import order:
// translator modules call register() (side-effect) before this module's body runs.
// var (not let): hoisted as undefined so register() can run during circular import (no TDZ).
var requestRegistry;
var responseRegistry;

// Register translator
export function register(from, to, requestFn, responseFn) {
  requestRegistry ??= new Map();
  responseRegistry ??= new Map();
  const key = `${from}:${to}`;
  if (requestFn) {
    requestRegistry.set(key, requestFn);
  }
  if (responseFn) {
    responseRegistry.set(key, responseFn);
  }
}

// No-op: translators self-register via the static imports at the bottom of this file.
function ensureInitialized() {}

// Strip specific content types from messages (explicit opt-in via strip[] in PROVIDER_MODELS)
function stripContentTypes(body, stripList = []) {
  if (!stripList.length || !body.messages || !Array.isArray(body.messages)) return;
  const imageTypes = new Set(["image_url", "image"]);
  const audioTypes = new Set(["audio_url", "input_audio"]);
  const shouldStrip = (type) => {
    if (imageTypes.has(type)) return stripList.includes("image");
    if (audioTypes.has(type)) return stripList.includes("audio");
    return false;
  };
  for (const msg of body.messages) {
    if (!Array.isArray(msg.content)) continue;
    msg.content = msg.content.filter(part => !shouldStrip(part.type));
    if (msg.content.length === 0) msg.content = "";
  }
}

// Role the client's conversation actually ended on, in the source format's own
// shape — not every source uses messages[] (Gemini/Antigravity: contents[],
// Responses/Codex: input[]). Only an explicit trailing model/assistant turn is
// real prefill and must reach ensureTrailingUserTurn as ROLE.ASSISTANT; every
// other tail (including no role, e.g. a function output) stays undefined so
// the emptied-turn fix still applies.
function detectClientLastRole(body) {
  if (Array.isArray(body?.messages)) return body.messages[body.messages.length - 1]?.role;
  const items = Array.isArray(body?.contents) ? body.contents : Array.isArray(body?.input) ? body.input : null;
  if (!items) return undefined;
  const role = items[items.length - 1]?.role;
  return role === ROLE.ASSISTANT || role === GEMINI_ROLE.MODEL ? ROLE.ASSISTANT : undefined;
}

// Translate request: source -> openai -> target
export function translateRequest(sourceFormat, targetFormat, model, body, stream = true, credentials = null, provider = null, reqLogger = null, stripList = [], connectionId = null, clientTool = null, capabilities = null) {
  ensureInitialized();
  validateSupportedParams(provider, model, body, targetFormat);
  const responsesSource = sourceFormat === FORMATS.OPENAI_RESPONSES || sourceFormat === FORMATS.CODEX;
  const responsesTarget = targetFormat === FORMATS.OPENAI_RESPONSES || targetFormat === FORMATS.CODEX;
  if (responsesSource && !responsesTarget) {
    for (const param of ["previous_response_id", "conversation"]) {
      if (body?.[param] == null) continue;
      const error = new Error(`This destination cannot use ${param}; resend the complete conversation or select a Responses-compatible route.`);
      error.code = "unsupported_parameter";
      error.param = param;
      throw error;
    }
  }
  if (targetFormat === FORMATS.CLAUDE && PROVIDERS[provider]?.quirks?.dropOutputConfig) {
    let param;
    if (body?.response_format?.type === "json_schema") param = "response_format";
    else if (body?.text?.format?.type === "json_schema") param = "text.format";
    else if (body?.output_config?.format != null) param = "output_config.format";
    else {
      const request = body?.request || body;
      if (request?.generationConfig?.responseJsonSchema != null) param = "generationConfig.responseJsonSchema";
      else if (request?.generationConfig?.responseSchema != null) param = "generationConfig.responseSchema";
      if (param && body?.request) param = `request.${param}`;
    }
    if (param) {
      const error = new Error(`This destination does not support ${param}; select a destination with structured-output support.`);
      error.code = "unsupported_parameter";
      error.param = param;
      throw error;
    }
  }
  let result = provider === "kimi" && targetFormat === FORMATS.CLAUDE
    ? lowerKimiDeferredTools(body) : body;
  // Role the client actually ended on, before any translator drops an emptied turn.
  const clientLastRole = detectClientLastRole(body);
  // Capture thinking intent from the original (pre-translation) body, before any
  // format conversion strips/renames the fields. Applied after translation.
  const thinkingIntent = captureThinking(result);

  // Compress tool names > 64 chars to prevent provider INVALID_ARGUMENT rejection (#3622)
  const { body: compressedBody, toolNameMap: compressedMap } = compressToolNames(sourceFormat, result);
  result = compressedBody;
  if (compressedMap?.size > 0) {
    result._toolNameMap = compressedMap;
  }

  // Strip explicit content types (opt-in via strip[] in PROVIDER_MODELS entry)
  stripContentTypes(result, stripList);

  // Fill missing IDs without applying a foreign alphabet before source conversion.
  ensureToolCallIds(result, { sanitizeIds: false });

  // Kiro reconciles source-aware results after replay. Cursor's native history
  // must contain only executions actually supplied by the client.
  if (targetFormat !== FORMATS.KIRO && targetFormat !== FORMATS.CURSOR) {
    fixMissingToolResponses(result);
  }


  // Capture session id from the original body (envelope still intact, e.g. antigravity request.sessionId)
  const clientSessionId = captureSessionId(result, credentials, connectionId, targetFormat);
  // Expose to downstream translators (gemini-cli/antigravity envelopes) that run after envelope is stripped
  if (credentials) credentials._clientSessionId = clientSessionId;

  // If same format, skip translation steps
  if (sourceFormat !== targetFormat) {
    // Direct route: if a translator is registered for this exact source:target
    // pair, use it instead of pivoting through OpenAI. This is lossless for
    // pairs like claude:kiro (avoids the claude->openai->kiro double-hop).
    const directFn = requestRegistry.get(`${sourceFormat}:${targetFormat}`);
    if (directFn) {
      result = directFn(model, result, stream, credentials, provider);
    } else {
      // Step 1: source -> openai (if source is not openai)
      if (sourceFormat !== FORMATS.OPENAI) {
        const toOpenAI = requestRegistry.get(`${sourceFormat}:${FORMATS.OPENAI}`);
        if (toOpenAI) {
          result = toOpenAI(model, result, stream, credentials, provider);
          // Log OpenAI intermediate format
          reqLogger?.logOpenAIRequest?.(result);
        }
      }

      // Kiro consumes intent inside its request builder, before a KAS body exists.
      if (targetFormat === FORMATS.KIRO && sourceFormat !== FORMATS.OPENAI && thinkingIntent) {
        delete result.reasoning;
        delete result.reasoning_effort;
        delete result.output_config;
        delete result.thinking;
        if (thinkingIntent.mode === "level") result.reasoning_effort = thinkingIntent.level;
        if (thinkingIntent.mode !== "level" || thinkingIntent.display) {
          result.thinking = {
            type: thinkingIntent.mode === "none" ? "disabled" : thinkingIntent.mode === "budget" ? "enabled" : "adaptive",
            ...(thinkingIntent.mode === "budget" ? { budget_tokens: thinkingIntent.budget } : {}),
            ...(thinkingIntent.display ? { display: thinkingIntent.display } : {}),
          };
        }
      }

      // Step 2: openai -> target (if target is not openai)
      if (targetFormat !== FORMATS.OPENAI) {
        const fromOpenAI = requestRegistry.get(`${FORMATS.OPENAI}:${targetFormat}`);
        if (fromOpenAI) {
          result = fromOpenAI(model, result, stream, credentials, provider);
        }
      }
    }
  }

  // Normalize thinking to the target provider-native format (config-driven, capability-aware).
  // Kiro's GenerateAssistantResponse request does not accept the generic top-level
  // `thinking` field; its translators map thinking intent to KAS-compatible
  // systemPrompt/additionalModelRequestFields instead.
  const kiroThinkingMappedByTranslator =
    targetFormat === FORMATS.KIRO &&
    (sourceFormat === FORMATS.OPENAI || sourceFormat === FORMATS.CLAUDE);
  if (!kiroThinkingMappedByTranslator) {
    applyThinking(targetFormat, model, result, provider, thinkingIntent, capabilities);
  }
  const thinkingContext = getThinkingContext(result);

  // Always normalize to clean OpenAI format when target is OpenAI
  // This handles hybrid requests (e.g., OpenAI messages + Claude tools)
  if (targetFormat === FORMATS.OPENAI) {
    result = { ...result };
    result = filterToOpenAIFormat(result, {
      preserveCacheControl: !!PROVIDERS[provider]?.quirks?.preserveCacheControl,
      preserveDeveloperRole: provider === "openai" || !!PROVIDERS[provider]?.quirks?.preserveDeveloperRole,
    });
    // Chat clients have always had prompt_cache_key forwarded verbatim (executors such
    // as opencode read it post-translation for session affinity). Only the
    // Responses→Chat hop newly exposes the field, so scope the strict-endpoint guard
    // to that direction; providers opt in via the preservePromptCacheKey quirk.
    if (sourceFormat === FORMATS.OPENAI_RESPONSES) {
      stripUnsupportedChatExtensions(provider, result);
    }
  }

  // Final step: prepare request for Claude format endpoints
  if (targetFormat === FORMATS.CLAUDE) {
    ensureToolCallIds(result, { sanitizeIds: true });
    const apiKey = credentials?.accessToken || credentials?.apiKey || null;
    result = prepareClaudeRequest(result, provider, apiKey, connectionId, credentials?.rawHeaders, clientSessionId);
    if (Array.isArray(result?.messages)) result.messages = ensureTrailingUserTurn(result.messages, clientLastRole);
  }

  // Converters may rebuild the body and add their own wire-name aliases.
  if (compressedMap?.size > 0) {
    const aliases = result._toolNameMap;
    if (aliases instanceof Map && aliases !== compressedMap && aliases.size > 0) {
      const merged = new Map(compressedMap);
      for (const [wireName, original] of aliases) merged.set(wireName, compressedMap.get(original) || original);
      result._toolNameMap = merged;
    } else {
      result._toolNameMap = compressedMap;
    }
  }

  // Claude cloaking: rename client tools with CLAUDE_TOOL_SUFFIX (anti-ban)
  // quirk: only providers flagged cloakToolsOnOAuth, and only with an OAuth token
  if (PROVIDERS[provider]?.quirks?.cloakToolsOnOAuth) {
    const apiKey = credentials?.accessToken || credentials?.apiKey || null;
    if (apiKey?.includes("sk-ant-oat")) {
      const { body: cloakedBody, toolNameMap } = cloakClaudeTools(result);
      result = cloakedBody;
      if (toolNameMap?.size > 0) {
        if (result._toolNameMap) {
          const merged = new Map(result._toolNameMap);
          for (const [suffixed, orig] of toolNameMap) {
            const trueOriginal = result._toolNameMap.get(orig) || orig;
            merged.set(suffixed, trueOriginal);
          }
          result._toolNameMap = merged;
        } else {
          result._toolNameMap = toolNameMap;
        }
      }
    }
  }

  // Antigravity cloaking disabled
  // if (provider === FORMATS.ANTIGRAVITY && body.userAgent !== FORMATS.ANTIGRAVITY) {
  //   const { cloakedBody, toolNameMap } = AntigravityExecutor.cloakTools(result);
  //   result = cloakedBody;
  //   if (toolNameMap?.size > 0) {
  //     result._toolNameMap = toolNameMap;
  //   }
  // }

  if (thinkingContext) setThinkingContext(result, thinkingContext);
  return result;
}

// Translate response chunk: target -> openai -> source
export function translateResponse(targetFormat, sourceFormat, chunk, state) {
  ensureInitialized();
  if (state?.responseErrorSent) return [];
  // If same format, return as-is — except the tool name may still be cloaked or compressed:
  // translateRequest() suffixes client tools for OAuth-cloaked Claude providers and compresses
  // long tool names for Gemini/Vertex/OpenAI, so streamed tool_use blocks must be decloaked here.
  if (sourceFormat === targetFormat) {
    if (sourceFormat === FORMATS.CLAUDE) {
      return [decloakStreamChunk(chunk, state?.toolNameMap)];
    }
    if (sourceFormat === FORMATS.OPENAI || sourceFormat === FORMATS.OPENAI_RESPONSES) {
      return [decloakOpenAIChunk(chunk, state?.toolNameMap)];
    }
    return [chunk];
  }
  const failure = extractResponseError(chunk);
  if (failure) {
    if (state) state.responseErrorSent = true;
    return [responseErrorToClient(sourceFormat, failure, state)];
  }


  let results = [chunk];
  let openaiResults = null; // Store OpenAI intermediate results

  // Direct route: if a response translator is registered for this exact
  // target:source pair, use it instead of pivoting through OpenAI. Mirrors the
  // request-side direct route (e.g. kiro:claude — KiroExecutor already emits
  // OpenAI-shaped chunks, so this converts them straight to Claude SSE).
  const directFn = responseRegistry.get(`${targetFormat}:${sourceFormat}`);
  if (directFn) {
    const converted = directFn(chunk, state);
    return converted ? (Array.isArray(converted) ? converted : [converted]) : [];
  }

  // Step 1: target -> openai (if target is not openai)
  if (targetFormat !== FORMATS.OPENAI) {
    const toOpenAI = responseRegistry.get(`${targetFormat}:${FORMATS.OPENAI}`);
    if (toOpenAI) {
      results = [];
      const converted = toOpenAI(chunk, state);
      if (converted) {
        results = Array.isArray(converted) ? converted : [converted];
        openaiResults = results; // Store OpenAI intermediate
      }
    }
  }

  // Step 2: openai -> source (if source is not openai)
  if (sourceFormat !== FORMATS.OPENAI) {
    const fromOpenAI = responseRegistry.get(`${FORMATS.OPENAI}:${sourceFormat}`);
    if (fromOpenAI) {
      const finalResults = [];
      for (const r of results) {
        const converted = fromOpenAI(r, state);
        if (converted) {
          finalResults.push(...(Array.isArray(converted) ? converted : [converted]));
        }
      }
      results = finalResults;
    }
  }

  // Attach OpenAI intermediate results for logging
  if (openaiResults && sourceFormat !== FORMATS.OPENAI && targetFormat !== FORMATS.OPENAI) {
    results._openaiIntermediate = openaiResults;
  }

  // Decloak tool names on final translated chunks if toolNameMap was used
  if (state?.toolNameMap?.size > 0) {
    if (sourceFormat === FORMATS.CLAUDE) {
      results = results.map((r) => decloakStreamChunk(r, state.toolNameMap));
    } else if (sourceFormat === FORMATS.OPENAI || sourceFormat === FORMATS.OPENAI_RESPONSES) {
      results = results.map((r) => decloakOpenAIChunk(r, state.toolNameMap));
    }
  }

  return results;
}

// Check if translation needed
export function needsTranslation(sourceFormat, targetFormat) {
  return sourceFormat !== targetFormat;
}

// Initialize state for streaming response based on format
export function initState(sourceFormat) {
  // Base state for all formats
  const base = {
    messageId: null,
    model: null,
    textBlockStarted: false,
    thinkingBlockStarted: false,
    inThinkingBlock: false,
    currentBlockIndex: null,
    toolCalls: new Map(),
    finishReason: null,
    finishReasonSent: false,
    usage: null,
    contentBlockIndex: -1
  };

  // Add openai-responses specific fields
  if (sourceFormat === FORMATS.OPENAI_RESPONSES) {
    return {
      ...base,
      seq: 0,
      responseId: `resp_${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
      started: false,
      msgTextBuf: {},
      msgItemAdded: {},
      msgContentAdded: {},
      msgItemDone: {},
      reasoningId: "",
      reasoningIndex: -1,
      reasoningBuf: "",
      reasoningPartAdded: false,
      reasoningDone: false,
      inThinking: false,
      funcArgsBuf: {},
      funcNames: {},
      funcCallIds: {},
      funcItemAdded: {},
      funcArgsDone: {},
      funcItemDone: {},
      customToolNames: new Set(),
      // Chat Completions usage for response.completed. Not state.usage: other translators in
      // the same pipeline overwrite that in their own shapes.
      responsesUsage: null,
      // finish_reason arrived before usage; response.completed waits for the usage chunk.
      completionPending: false,
      completedSent: false
    };
  }

  return base;
}

// Kept for backward compatibility; translators are already registered at import time.
export function initTranslators() {
  ensureInitialized();
}

// Static side-effect imports: each module calls register() at load (works in ESM + bundler).
import "./request/claude-to-openai.js";
import "./request/openai-to-claude.js";
import "./request/gemini-to-openai.js";
import "./request/openai-to-gemini.js";
import "./request/openai-to-vertex.js";
import "./request/antigravity-to-openai.js";
import "./request/openai-responses.js";
import "./request/openai-to-kiro.js";
import "./request/openai-to-cursor.js";
import "./request/openai-to-ollama.js";
import "./request/openai-to-commandcode.js";
import "./request/claude-to-kiro.js";
import "./response/claude-to-openai.js";
import "./response/openai-to-claude.js";
import "./response/gemini-to-openai.js";
import "./response/openai-to-antigravity.js";
import "./response/openai-responses.js";
import "./response/kiro-to-openai.js";
import "./response/cursor-to-openai.js";
import "./response/ollama-to-openai.js";
import "./response/commandcode-to-openai.js";
import "./response/kiro-to-claude.js";
