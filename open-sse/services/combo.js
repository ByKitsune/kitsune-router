/**
 * Shared combo (model combo) handling with fallback support
 */

import { checkFallbackError, classifyAvailabilityError, extractResetsAtMs, formatRetryAfter } from "./accountFallback.js";
import { FALLBACK_SCOPE } from "../config/errorConfig.js";
import { createErrorResult, errorResponse } from "../utils/error.js";
import { getCapabilitiesForModel } from "../providers/capabilities.js";
import { extractTextContent } from "../translator/formats/gemini.js";
import { isOpenAIResponsesTerminalEvent } from "../utils/responsesStreamHelpers.js";
import { extractReasoningText } from "../translator/concerns/reasoning.js";
import { cloneRequestBody } from "../utils/requestBody.js";

// Hard capabilities = input modalities; missing one drops request data (e.g. image
// stripped). Must be prioritized. Soft (e.g. search) only degrades a feature.
const HARD_CAPS = new Set(["vision", "pdf", "audioInput", "videoInput"]);

// Prefixes used when flattening tool turns into plain prose for panel models.
const TOOL_CALL_PREFIX = "[Called tools: ";
const TOOL_RESULT_PREFIX = "[Tool result: ";

function hasMeaningfulSseData(text) {
  return String(text || "").split("\n").some(line => frameCarriesContent(line.trim()));
}

async function rejectFastEmptyStream(response, timeoutMs = 150) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (!response.body || !contentType.includes("text/event-stream")) return response;

  const [probe, client] = response.body.tee();
  const probeResult = (async () => {
    const reader = probe.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return { empty: !hasMeaningfulSseData(text) };
      text += decoder.decode(value, { stream: true });
      if (hasMeaningfulSseData(text)) return { empty: false };
    }
  })();
  const timed = await Promise.race([
    probeResult,
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), timeoutMs)),
  ]);
  if (timed.timedOut) {
    await probe.cancel().catch(() => {});
    return new Response(client, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  if (timed.empty) {
    return errorResponse(503, "Upstream returned an empty stream", { code: "empty_stream" });
  }
  return new Response(client, { status: response.status, statusText: response.statusText, headers: response.headers });
}

// Flatten tool turns into prose so panel models keep the context but can't loop
// on tools: drop the request's tools, turn tool/function results into assistant
// text, and inline assistant tool_calls names instead of the structured field.
function flattenToolHistory(messages) {
  return messages
    .filter((msg) => msg)
    .map((msg) => {
      if (msg.role === "tool" || msg.role === "function") {
        return { role: "assistant", content: `${TOOL_RESULT_PREFIX}${extractTextContent(msg.content) || String(msg.content ?? "")}]` };
      }
      if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
        const { tool_calls, ...rest } = msg;
        const names = tool_calls.map((c) => c?.function?.name || c?.name || "tool").join(", ");
        const base = extractTextContent(rest.content) || (typeof rest.content === "string" ? rest.content : "");
        return { ...rest, content: `${base}${base ? "\n" : ""}${TOOL_CALL_PREFIX}${names}]` };
      }
      if (Array.isArray(msg.content)) {
        const hasToolUse = msg.content.some((c) => c.type === "tool_use");
        const hasToolResult = msg.content.some((c) => c.type === "tool_result");
        if (hasToolUse || hasToolResult) {
          const textParts = [];
          const toolNames = [];
          const toolResults = [];
          for (const block of msg.content) {
            if (block.type === "text" && block.text) textParts.push(block.text);
            if (block.type === "tool_use") toolNames.push(block.name || "tool");
            if (block.type === "tool_result") toolResults.push(extractTextContent(block.content) || String(block.content ?? ""));
          }
          const { ...rest } = msg;
          let newContent = textParts.join("\n");
          if (toolNames.length > 0) {
            newContent = `${newContent}${newContent ? "\n" : ""}${TOOL_CALL_PREFIX}${toolNames.join(", ")}]`;
          }
          if (toolResults.length > 0) {
            newContent = `${newContent}${newContent ? "\n" : ""}${TOOL_RESULT_PREFIX}${toolResults.join("\n")}]`;
          }
          return { ...rest, content: newContent };
        }
      }
      return msg;
    });
}

// Reorder combo models by capability fit. Stable; never drops a model (fallback intact).
// Tier 0: satisfies all hard + all soft. Tier 1: all hard only. Tier 2: rest.
export function reorderByCapabilities(models, required, modelCapabilities = null) {
  if (!required || required.size === 0 || !Array.isArray(models) || models.length <= 1) return models;
  const hard = [...required].filter((c) => HARD_CAPS.has(c));
  const soft = [...required].filter((c) => !HARD_CAPS.has(c));

  const tierOf = (m) => {
    const slash = typeof m === "string" ? m.indexOf("/") : -1;
    const provider = slash > 0 ? m.slice(0, slash) : "";
    const model = slash > 0 ? m.slice(slash + 1) : m;
    const caps = modelCapabilities?.get(m) || getCapabilitiesForModel(provider, model);
    if (!hard.every((c) => caps[c] === true)) return 2;
    return soft.every((c) => caps[c] === true) ? 0 : 1;
  };

  // Nothing satisfies the hard caps — order is already optimal, return the
  // caller's array by identity (no reorder, no copy).
  const tiers = models.map(tierOf);
  if (tiers.every((t) => t === 2)) return models;

  // Stable sort by tier (Array.prototype.sort is stable in modern engines).
  return models
    .map((m, i) => ({ m, i, t: tiers[i] }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.m);
}

/**
 * Track rotation state per combo (for round-robin strategy)
 * @type {Map<string, { index: number, consecutiveUseCount: number }>}
 */
const comboRotationState = new Map();

// Trailing run of items after the last assistant/model turn = the current user
// turn. It may span several messages (e.g. text + image split across blocks),
// so we return all of them. History media (older turns) must not pin the combo
// to a vision model — those get stripped + placeholdered downstream instead.
function trailingUserItems(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const isAssistant = (r) => r === "assistant" || r === "model";
  let i = arr.length - 1;
  while (i >= 0 && !isAssistant(arr[i]?.role)) i--;
  return arr.slice(i + 1);
}

// Detect which capabilities a request needs. Modalities (vision/pdf/audioInput/videoInput)
// are scanned across the entire conversation history (user & tool turns); "search"/"tools"
// are request-wide. Returns a Set of: "vision" | "pdf" | "audioInput" | "videoInput" | "tools" | "search".
export function detectRequiredCapabilities(body) {
  const required = new Set();
  if (!body || typeof body !== "object") return required;

  const addByMime = (mime) => {
    if (typeof mime !== "string") return;
    if (mime.startsWith("image/")) required.add("vision");
    else if (mime === "application/pdf") required.add("pdf");
    else if (mime.startsWith("audio/")) required.add("audioInput");
    else if (mime.startsWith("video/")) required.add("videoInput");
  };

  const scanBlock = (b) => {
    if (!b || typeof b !== "object") return;
    const t = b.type;
    if (t === "image_url" || t === "image" || t === "input_image") required.add("vision");
    if (t === "input_audio" || t === "audio_url" || t === "audio") required.add("audioInput");
    if (t === "input_video" || t === "video_url" || t === "video") required.add("videoInput");
    if (t === "file" || t === "document" || t === "input_file") {
      // Infer modality from embedded mime when available; fall back to pdf for generic files.
      let fmime = null;
      if (b.input_audio?.format) fmime = `audio/${b.input_audio.format}`;
      else if (b.file?.file_data) fmime = String(b.file.file_data).match(/^data:([^;,]+)/)?.[1];
      else if (b.source?.media_type) fmime = b.source.media_type;
      else if (b.source?.data) fmime = String(b.source.data).match(/^data:([^;,]+)/)?.[1];
      if (fmime) addByMime(fmime);
      else required.add("pdf");
    }
    if (t === "tool_result") {
      if (Array.isArray(b.content)) scanContent(b.content);
      else if (typeof b.content === "string") {
        if (b.content.includes("data:image/")) required.add("vision");
        else if (b.content.includes("data:audio/")) required.add("audioInput");
        else if (b.content.includes("data:video/")) required.add("videoInput");
        else if (b.content.includes("data:application/pdf")) required.add("pdf");
      }
    }
    if (Array.isArray(b.functionResponse?.parts)) scanContent(b.functionResponse.parts);
    if (b.functionResponse?.response) {
      const resp = b.functionResponse.response;
      if (typeof resp === "string") {
        if (resp.includes("data:image/")) required.add("vision");
        else if (resp.includes("data:audio/")) required.add("audioInput");
        else if (resp.includes("data:video/")) required.add("videoInput");
        else if (resp.includes("data:application/pdf")) required.add("pdf");
      } else if (Array.isArray(resp)) {
        scanContent(resp);
      } else if (typeof resp === "object") {
        addByMime(resp.inlineData?.mimeType || resp.fileData?.mimeType);
        if (Array.isArray(resp.parts)) scanContent(resp.parts);
        if (Array.isArray(resp.content)) scanContent(resp.content);
        if (Array.isArray(resp.result)) scanContent(resp.result);
      }
    }
    // gemini parts: inlineData/fileData carry a mime
    const inline = b.inlineData || b.inline_data;
    const file = b.fileData || b.file_data;
    addByMime(inline?.mimeType || inline?.mime_type || file?.mimeType || file?.mime_type);
  };

  const scanContent = (content) => {
    if (Array.isArray(content)) for (const b of content) scanBlock(b);
  };

  const scanMessage = (m) => {
    if (!m || typeof m !== "object") return;

    // Ollama / Hermes images array (strings or objects)
    if (Array.isArray(m.images) && m.images.length > 0) {
      required.add("vision");
    }

    // Vercel AI SDK / Hermes attachments / experimental_attachments
    const attachments = m.experimental_attachments || m.attachments;
    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        if (!att) continue;
        const mime = att.contentType || att.mediaType || (typeof att.url === "string" && att.url.match(/^data:([^;,]+)/)?.[1]);
        if (mime) addByMime(mime);
        else if (att.url || att.data) required.add("vision");
      }
    }

    // Direct message-level modality properties
    if (m.image_url || m.image) required.add("vision");
    if (m.audio_url || m.audio) required.add("audioInput");
    if (m.video_url || m.video) required.add("videoInput");

    // Scan array content blocks
    scanContent(m.content);

    // Scan output (Responses API function_call_output)
    if (typeof m.output === "string") {
      if (m.output.includes("data:image/")) required.add("vision");
      else if (m.output.includes("data:audio/")) required.add("audioInput");
      else if (m.output.includes("data:video/")) required.add("videoInput");
      else if (m.output.includes("data:application/pdf")) required.add("pdf");
    } else if (Array.isArray(m.output)) {
      scanContent(m.output);
    }

    // Scan string content for embedded data URIs
    if (typeof m.content === "string") {
      if (m.content.includes("data:image/")) required.add("vision");
      else if (m.content.includes("data:audio/")) required.add("audioInput");
      else if (m.content.includes("data:video/")) required.add("videoInput");
      else if (m.content.includes("data:application/pdf")) required.add("pdf");
    }
  };

  const isAssistantOrSystemRole = (r) => (
    r === "assistant" || r === "system" || r === "developer" || r === "model"
  );

  // Scan ALL user messages and tool result messages across the entire conversation history.
  // 1. body.messages (openai / claude / hermes / ollama)
  if (Array.isArray(body.messages)) {
    for (const m of body.messages) {
      if (!m || typeof m !== "object") continue;
      if (m.type === "tool_result" || m.type === "function_call_output") {
        scanMessage(m);
      } else if (!isAssistantOrSystemRole(m.role)) {
        scanMessage(m);
      }
    }
  }

  // 2. body.input (responses API / grok-cli / codex)
  if (Array.isArray(body.input)) {
    for (const it of body.input) {
      if (!it || typeof it !== "object") continue;
      if (it.type === "function_call") continue;
      if (it.type === "tool_result" || it.type === "function_call_output") {
        scanMessage(it);
      } else if (!isAssistantOrSystemRole(it.role)) {
        scanMessage(it);
      }
    }
  } else if (typeof body.input === "string") {
    if (body.input.includes("data:image/")) required.add("vision");
    else if (body.input.includes("data:audio/")) required.add("audioInput");
    else if (body.input.includes("data:video/")) required.add("videoInput");
    else if (body.input.includes("data:application/pdf")) required.add("pdf");
  }

  // 3. body.contents / body.request.contents (gemini / antigravity)
  const contents = body.contents || body.request?.contents;
  if (Array.isArray(contents)) {
    for (const c of contents) {
      if (!c || typeof c !== "object") continue;
      if (c.role === "model") continue;
      scanContent(c.parts);
    }
  }

  // search: a declared web-search tool on the request means this turn needs
  // server-side grounding — prefer combo entries that declare search support.
  // Matches OpenAI-style {type:"web_search"} and Gemini googleSearch shapes.
  const declaredTools = Array.isArray(body.tools) ? body.tools : [];
  if (declaredTools.some((tool) => (
    tool?.type === "function" || tool?.function || tool?.functionDeclarations
  ))) {
    required.add("tools");
  }
  for (const tool of declaredTools) {
    const name = typeof tool === "string"
      ? tool
      : tool?.type || tool?.function?.name || tool?.name || "";
    if (/^(web_search|webSearch|googleSearch|google_search)$/.test(String(name))) {
      required.add("search");
      break;
    }
  }

  return required;
}

function normalizeStickyLimit(stickyLimit) {
  const parsed = Number.parseInt(stickyLimit, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function rotateModelsFromIndex(models, currentIndex) {
  const rotatedModels = [...models];
  for (let i = 0; i < currentIndex; i++) {
    const moved = rotatedModels.shift();
    rotatedModels.push(moved);
  }
  return rotatedModels;
}

/**
 * Get rotated model list based on strategy
 * @param {string[]} models - Array of model strings
 * @param {string} comboName - Name of the combo
 * @param {string} strategy - "fallback" or "round-robin"
 * @param {number|string} [stickyLimit=1] - Requests per combo model before switching
 * @returns {string[]} Rotated models array
 */
export function getRotatedModels(models, comboName, strategy, stickyLimit = 1) {
  if (!models || models.length <= 1 || strategy !== "round-robin") {
    return models;
  }

  const rotationKey = comboName || "__default__";
  const normalizedStickyLimit = normalizeStickyLimit(stickyLimit);
  const existingState = comboRotationState.get(rotationKey);
  const state = typeof existingState === "number"
    ? { index: existingState, consecutiveUseCount: 0 }
    : (existingState || { index: 0, consecutiveUseCount: 0 });

  const currentIndex = state.index % models.length;
  const rotatedModels = rotateModelsFromIndex(models, currentIndex);
  const nextUseCount = state.consecutiveUseCount + 1;

  if (nextUseCount >= normalizedStickyLimit) {
    comboRotationState.set(rotationKey, {
      index: (currentIndex + 1) % models.length,
      consecutiveUseCount: 0,
    });
  } else {
    comboRotationState.set(rotationKey, {
      index: currentIndex,
      consecutiveUseCount: nextUseCount,
    });
  }

  return rotatedModels;
}

/**
 * Reset in-memory rotation state when combo/settings change
 * @param {string} [comboName] - Combo name to reset; omit to clear all
 */
export function resetComboRotation(comboName) {
  if (comboName) comboRotationState.delete(comboName);
  else comboRotationState.clear();
}

/**
 * Get combo models from combos data
 * @param {string} modelStr - Model string to check
 * @param {Array|Object} combosData - Array of combos or object with combos
 * @returns {string[]|null} Array of models or null if not a combo
 */
export function getComboModelsFromData(modelStr, combosData) {
  // Don't check if it's in provider/model format
  if (modelStr.includes("/")) return null;
  
  // Handle both array and object formats
  const combos = Array.isArray(combosData) ? combosData : (combosData?.combos || []);
  
  const combo = combos.find(c => c.name === modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}

/**
 * Handle combo chat with fallback
 * @param {Object} options
 * @param {Object} options.body - Request body
 * @param {string[]} options.models - Array of model strings to try
 * @param {Function} options.handleSingleModel - Function to handle single model: (body, modelStr) => Promise<Response>
 * @param {Object} options.log - Logger object
 * @param {string} [options.comboName] - Name of the combo (for round-robin tracking)
 * @param {string} [options.comboStrategy] - Strategy: "fallback" or "round-robin"
 * @param {number|string} [options.comboStickyLimit=1] - Requests per combo model before switching
 * @returns {Promise<Response>}
 */

const SSE_CONTENT_TYPE = "text/event-stream";
const PEEK_MAX_BYTES = 256 * 1024;

function frameCarriesContent(line) {
  if (!line.startsWith("data:")) return false;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return false;

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }

  if (parsed.error || isOpenAIResponsesTerminalEvent(null, parsed)) return true;
  if (hasIncurredUsage(parsed.usage) || hasIncurredUsage(parsed.response?.usage) ||
      hasIncurredUsage(parsed.usageMetadata) || hasIncurredUsage(parsed.response?.usageMetadata)) return true;

  const delta = parsed.choices?.[0]?.delta;
  if (nonEmptyString(delta?.content)) return true;
  if (extractReasoningText(delta) || nonEmptyString(delta?.refusal)) return true;
  if (delta?.tool_calls?.length || delta?.function_call) return true;

  if (parsed.type === "content_block_delta") {
    const d = parsed.delta;
    if (nonEmptyString(d?.text) || nonEmptyString(d?.partial_json) || nonEmptyString(d?.thinking)) return true;
  }
  if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") return true;

  if (typeof parsed.type === "string" && parsed.type.endsWith(".delta") && nonEmptyString(parsed.delta)) return true;

  const parts = (parsed.candidates || parsed.response?.candidates)?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.some(p => nonEmptyString(p?.text) || p?.functionCall || p?.inlineData)) return true;

  if (nonEmptyString(parsed.message?.content) || nonEmptyString(parsed.response)) return true;
  if (parsed.message?.tool_calls?.length) return true;

  return false;
}

function nonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function hasIncurredUsage(usage) {
  if (!usage || typeof usage !== "object") return false;
  return ["prompt_tokens", "input_tokens", "completion_tokens", "output_tokens", "total_tokens",
    "promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "totalTokenCount"]
    .some(key => Number.isFinite(Number(usage[key])) && Number(usage[key]) > 0);
}

export async function peekStreamForContent(response, timeoutMs = 45000) {
  const contentType = response?.headers?.get?.("content-type") || "";
  if (!contentType.includes(SSE_CONTENT_TYPE) || !response?.body) {
    return { hasContent: true, body: response?.body };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const bufferedChunks = [];
  let bufferedBytes = 0;
  let textBuffer = "";
  let hasContent = false;

  const readPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (textBuffer.trim()) {
          const lines = textBuffer.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && frameCarriesContent(trimmed)) {
              hasContent = true;
              break;
            }
          }
        }
        break;
      }

      bufferedChunks.push(value);
      bufferedBytes += value.byteLength;
      textBuffer += decoder.decode(value, { stream: true });

      const lines = textBuffer.split("\n");
      textBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && frameCarriesContent(trimmed)) {
          hasContent = true;
          break;
        }
      }

      if (hasContent || bufferedBytes >= PEEK_MAX_BYTES) break;
    }
  })();

  let timerId = null;
  const timeoutPromise = new Promise((resolve) => {
    timerId = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([readPromise, timeoutPromise]);
  if (timerId) clearTimeout(timerId);

  // If timed out without any content, abort reader immediately to prevent background runaway/leak
  if (!hasContent) {
    try { await reader.cancel(new Error("peekStreamForContent timeout")); } catch {}
  }

  const replayedStream = new ReadableStream({
    async start(controller) {
      for (const chunk of bufferedChunks) {
        controller.enqueue(chunk);
      }
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch {}
    }
  });

  return { hasContent, body: replayedStream };
}

export async function handleComboChat({ body, models, handleSingleModel, log, comboName, comboStrategy, comboStickyLimit = 1, autoSwitch = true, modelCapabilities = null }) {
  // Apply rotation strategy if enabled
  let rotatedModels = getRotatedModels(models, comboName, comboStrategy, comboStickyLimit);

  // Auto-switch: float models that satisfy the request's required capabilities to the front.
  if (autoSwitch) {
    const required = detectRequiredCapabilities(body);
    if (required.size > 0) {
      const reordered = reorderByCapabilities(rotatedModels, required, modelCapabilities);
      if (reordered[0] !== rotatedModels[0]) {
        log.info("COMBO", `auto-switch for [${[...required].join(",")}] → ${reordered[0]}`);
      }
      rotatedModels = reordered;
    }
  }
  
  let lastError = null;
  let earliestRetryAfter = null;
  let lastStatus = null;
  let lastResponse = null;

  for (let i = 0; i < rotatedModels.length; i++) {
    const modelStr = rotatedModels[i];
    log.info("COMBO", `Trying model ${i + 1}/${rotatedModels.length}: ${modelStr}`);

    try {
      // Clone body so in-place mutations in downstream handlers/translators
      // don't corrupt the request for subsequent fallback models (#3619).
      const modelBody = cloneRequestBody(body);
      const rawResult = await handleSingleModel(modelBody, modelStr);
      let result = rawResult?.ok ? await rejectFastEmptyStream(rawResult) : rawResult;
      
      // Success (2xx) - return response
      if (result.ok) {
        // Empty-stream guard (#3463): verify the stream actually carries content before returning success
        const peek = await peekStreamForContent(result);
        if (peek.hasContent) {
          log.info("COMBO", `Model ${modelStr} succeeded`);
          return new Response(peek.body, {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
          });
        }
        log.warn("COMBO", `Model ${modelStr} returned empty stream (no content frames) -> trying next model`);
        try { await peek.body?.cancel?.(new Error("combo empty stream")); } catch {}
        try { await result?.body?.cancel?.(new Error("combo empty stream")); } catch {}
        continue;
      }

      // Extract error info from response
      let errorText = result.statusText || "";
      let errorCode = null;
      let errorType = null;
      let retryAfter = null;
      try {
        const errorBody = await result.clone().json();
        errorText = errorBody?.error?.message || errorBody?.error || errorBody?.message || errorText;
        const code = errorBody?.error?.code ?? errorBody?.code;
        if (typeof code === "string") errorCode = code;
        if (typeof errorBody?.error?.type === "string") errorType = errorBody.error.type;
        // Validate before use: provider payloads carry values like "soon",
        // "1 minute", "" or "30". A non-parseable value used to flow into the
        // `Retry-After` response header as the literal string "NaN".
        const candidate = errorBody?.retryAfter ?? null;
        retryAfter = typeof candidate === "string" && /^\d{4}-\d{2}-\d{2}T/.test(candidate) && Date.parse(candidate) > Date.now() ? candidate : null;
      } catch {
        // Ignore JSON parse errors
      }


      // Normalize error text to string (Worker-safe)
      if (typeof errorText !== "string") {
        try { errorText = JSON.stringify(errorText); } catch { errorText = String(errorText); }
      }

      // Preserve structured diagnostics for model-dependent request failures,
      // without reclassifying them as account faults or changing the response.
      const errorEvidence = { message: errorText, code: errorCode, type: errorType };
      const availability = classifyAvailabilityError(result.status, errorText, errorEvidence);
      if ((availability.kind || result.status === 503) && retryAfter && (!earliestRetryAfter || Date.parse(retryAfter) < Date.parse(earliestRetryAfter))) earliestRetryAfter = retryAfter;
      const reset = availability.kind || result.status === 503 ? extractResetsAtMs(result, errorText) : null;
      if (reset && (!earliestRetryAfter || reset < Date.parse(earliestRetryAfter))) earliestRetryAfter = new Date(reset).toISOString();
      if (availability.statusCode !== result.status) {
        result = createErrorResult(result.status, errorText, reset, errorEvidence).response;
      }
      const { shouldFallback, cooldownMs } = checkFallbackError(result.status, errorEvidence, 0, result, FALLBACK_SCOPE.COMBO);

      if (!shouldFallback) {
        log.warn("COMBO", `Model ${modelStr} failed (no fallback)`, { status: result.status });
        return result;
      }

      // For transient errors (503/502/504), wait for cooldown before falling through
      // so a briefly-overloaded provider gets a chance to recover rather than being
      // skipped immediately (fixes: combo falls through on transient 503)
      if (!availability.kind && !reset && cooldownMs && cooldownMs > 0 && cooldownMs <= 5000 &&
          (result.status === 503 || result.status === 502 || result.status === 504)) {
        log.info("COMBO", `Model ${modelStr} transient ${result.status}, waiting ${cooldownMs}ms before next`);
        await new Promise(r => setTimeout(r, cooldownMs));
      }

      // Fallback to next model
      lastError = errorText || String(result.status);
      lastStatus = result.status;
      lastResponse = result;
      log.warn("COMBO", `Model ${modelStr} failed, trying next`, { status: result.status });
    } catch (error) {
      // Catch unexpected exceptions to ensure fallback continues
      lastError = error.message || String(error);
      lastStatus = 503;
      lastResponse = null;
      log.warn("COMBO", `Model ${modelStr} threw error, trying next`, { error: lastError });
    }
  }

  // All models failed
  // Use 503 (Service Unavailable) rather than 406 (Not Acceptable) — 406 implies
  // the request itself is invalid, but here the providers are simply unavailable
  // or have no active credentials. 503 is more accurate and retryable by clients.
  const allDisabled = lastError && lastError.toLowerCase().includes("no credentials");
  const status = allDisabled ? 503 : (lastStatus || 503);
  const msg = lastError || "All combo models unavailable";
  log.warn("COMBO", `All models failed | ${msg}${earliestRetryAfter ? ` (${formatRetryAfter(earliestRetryAfter)})` : ""}`);
  if (lastResponse && lastResponse.status === status) {
    if (earliestRetryAfter && (status === 429 || status === 503)) {
      const headers = new Headers(lastResponse.headers);
      headers.set("Retry-After", String(Math.max(1, Math.ceil((Date.parse(earliestRetryAfter) - Date.now()) / 1000))));
      return new Response(lastResponse.body, { status, headers });
    }
    return lastResponse;
  }
  return errorResponse(status, "The requested model is temporarily unavailable. Please try again shortly.");
}

/**
 * Extract assistant text from a non-stream completion across formats
 * (OpenAI chat, Claude messages, Gemini, OpenAI Responses). Returns "" if none.
 * Panel responses are already translated to the client format by chatCore, so the
 * leaf content→string step reuses the translator's own extractTextContent.
 */
function extractPanelText(json) {
  if (!json || typeof json !== "object") return "";

  // OpenAI chat completion
  const choice = json.choices?.[0];
  if (choice) {
    const msg = choice.message ?? choice.delta ?? {};
    const t = extractTextContent(msg.content);
    if (t.trim()) return t;
    if (typeof choice.text === "string" && choice.text.trim()) return choice.text;
  }

  // Claude messages (text blocks share OpenAI's {type:"text"} shape)
  const claudeText = extractTextContent(json.content);
  if (claudeText.trim()) return claudeText;

  // Gemini (parts carry .text without a type discriminator)
  const parts = json.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const t = parts.map((p) => p?.text || "").join("");
    if (t.trim()) return t;
  }

  // OpenAI Responses API
  if (Array.isArray(json.output)) {
    const t = json.output
      .flatMap((o) => (Array.isArray(o.content) ? o.content.map((c) => c?.text || "") : []))
      .join("");
    if (t.trim()) return t;
  }

  return "";
}

/**
 * Append a synthesized user turn to whichever message array the request format uses.
 * Preserves the original conversation + system prompt so the judge has full context.
 */
function appendUserTurn(body, text) {
  const next = { ...body };
  if (Array.isArray(body.messages)) {
    next.messages = [...body.messages, { role: "user", content: text }];
  } else if (Array.isArray(body.input)) {
    next.input = [...body.input, { role: "user", content: text }];
  } else if (Array.isArray(body.contents)) {
    next.contents = [...body.contents, { role: "user", parts: [{ text }] }];
  } else {
    next.messages = [{ role: "user", content: text }];
  }
  return next;
}

/**
 * Build the judge directive. Per OpenRouter's Fusion design, the judge does NOT
 * merge — it analyzes (consensus / contradictions / partial coverage / unique
 * insights / blind spots) then writes one answer grounded in that analysis.
 * ~3/4 of fusion's quality lift comes from this synthesis step.
 *
 * Sources are anonymized ("Source N") so the judge weighs substance, not the
 * reputation of a model brand.
 */
function buildJudgePrompt(answers) {
  const panel = answers
    .map((a, i) => `[Source ${i + 1}]\n${a.text}`)
    .join("\n\n");

  return [
    `You are the JUDGE in a model-fusion panel. ${answers.length} expert models independently answered the user's most recent request. Their responses are below, anonymized by source.`,
    "",
    "Do NOT mention that multiple models were used, and do NOT refer to the sources. Produce ONE authoritative final answer addressed directly to the user.",
    "",
    "First, internally analyze the panel along these dimensions: consensus (points most sources agree on — treat as higher-confidence), contradictions (where they disagree — resolve with your own judgment), partial coverage, unique insights only one source surfaced, and blind spots every source missed. Then write the best possible final answer grounded in that analysis — more complete and correct than any single response, with no filler.",
    "",
    "=== PANEL RESPONSES ===",
    panel,
    "=== END PANEL RESPONSES ===",
    "",
    "Now write the final answer to the user's original request.",
  ].join("\n");
}

// Fusion tuning. Overridable per-combo via settings.comboStrategies[name].
const FUSION_DEFAULTS = {
  minPanel: 2,             // answers needed before stragglers get a grace window
  stragglerGraceMs: 8000,  // wait this long for laggards once quorum is reached
  panelHardTimeoutMs: 90000, // absolute cap so one hung model can't stall forever
};

// A discarded panel owns an abort controller; losing the race must not leave
// transport/body work running unobserved after its response is no longer used.
function withTimeout(promise, ms, controller) {
  return new Promise((resolve) => {
    const finish = value => {
      clearTimeout(t);
      controller.signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish({ __timeout: true });
    const t = setTimeout(() => {
      controller.abort(new Error("Fusion panel deadline exceeded"));
      finish({ __timeout: true });
    }, ms);
    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
    Promise.resolve(promise)
      .then(finish)
      .catch(error => finish({ __error: error }));
  });
}

/**
 * Collect panel responses with quorum-grace: as soon as `minPanel` calls succeed,
 * start a short grace timer for the rest, then proceed with whatever arrived. This
 * caps the straggler penalty (the slowest model otherwise dominates wall time) while
 * still preferring a full panel when everyone is fast. Bounded by a hard timeout.
 * Returns a sparse array aligned to `calls` (undefined = not yet / dropped).
 */
function collectPanel(calls, { minPanel, stragglerGraceMs, panelHardTimeoutMs, signal }) {
  return new Promise((resolve) => {
    const out = new Array(calls.length);
    let settled = 0;
    let ok = 0;
    let finished = false;
    let graceTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(hardTimer);
      if (graceTimer) clearTimeout(graceTimer);
      signal?.removeEventListener("abort", finish);
      resolve(out);
    };
    const hardTimer = setTimeout(finish, panelHardTimeoutMs);
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
    calls.forEach((p, i) => {
      Promise.resolve(p)
        .then((v) => { out[i] = v; })
        .catch((e) => { out[i] = { __error: e }; })
        .finally(() => {
          settled++;
          if (out[i] && out[i].ok) ok++;
          if (settled === calls.length) return finish();
          if (ok >= minPanel && !graceTimer) graceTimer = setTimeout(finish, stragglerGraceMs);
        });
    });
  });
}

/**
 * Strip multimodal content (images, PDFs, audio, video) from a request body,
 * leaving only clean text prompt so text-only judge models (like deepseek, qwen-coder)
 * do not crash with HTTP 400 'this model does not support image input' (Issue #3375).
 */
export function stripMultimodalContent(body) {
  if (!body || typeof body !== "object") return body;
  const next = cloneRequestBody(body);

  const isMediaBlock = (b) => {
    if (!b || typeof b !== "object") return false;
    const t = b.type;
    if (t === "image_url" || t === "image" || t === "input_image") return true;
    if (t === "input_audio" || t === "audio_url" || t === "audio") return true;
    if (t === "input_video" || t === "video_url" || t === "video") return true;
    if (t === "file" || t === "document" || t === "input_file") return true;
    if (b.inlineData || b.inline_data || b.fileData || b.file_data) return true;
    return false;
  };

  const cleanDataUris = (str) => {
    if (typeof str !== "string") return str;
    return str.replace(/data:(?:image|audio|video|application\/pdf)[^"'\s)>]+/gi, "[media omitted]");
  };

  const cleanBlock = (b) => {
    if (!b || typeof b !== "object") return b;
    if (b.type === "text" && typeof b.text === "string") {
      return { ...b, text: cleanDataUris(b.text) };
    }
    if (b.type === "input_text" && typeof b.text === "string") {
      return { ...b, text: cleanDataUris(b.text) };
    }
    if (typeof b.text === "string" && !b.type) {
      return { ...b, text: cleanDataUris(b.text) };
    }
    if (b.type === "tool_result") {
      if (Array.isArray(b.content)) {
        const filtered = b.content.filter((c) => !isMediaBlock(c)).map(cleanBlock);
        return { ...b, content: filtered.length > 0 ? filtered : [{ type: "text", text: "[media omitted]" }] };
      }
      if (typeof b.content === "string") {
        return { ...b, content: cleanDataUris(b.content) };
      }
    }
    if (b.functionResponse) {
      const result = { ...b.functionResponse };
      const cleanParts = (parts) => parts.filter((part) => !isMediaBlock(part)).map(cleanBlock);
      if (Array.isArray(result.parts)) result.parts = cleanParts(result.parts);
      if (Array.isArray(result.response)) result.response = cleanParts(result.response);
      else if (result.response && typeof result.response === "object") {
        result.response = { ...result.response };
        for (const key of ["parts", "content", "result"]) {
          if (Array.isArray(result.response[key])) result.response[key] = cleanParts(result.response[key]);
        }
      }
      return { ...b, functionResponse: result };
    }
    return b;
  };

  const cleanMessage = (m) => {
    if (!m || typeof m !== "object") return m;
    const msg = { ...m };
    if ("images" in msg) delete msg.images;
    if ("image_url" in msg) delete msg.image_url;
    if ("image" in msg) delete msg.image;
    if ("audio_url" in msg) delete msg.audio_url;
    if ("audio" in msg) delete msg.audio;
    if ("video_url" in msg) delete msg.video_url;
    if ("video" in msg) delete msg.video;

    if (Array.isArray(msg.experimental_attachments)) {
      msg.experimental_attachments = msg.experimental_attachments.filter(
        (a) => !a?.contentType?.startsWith("image/") && !a?.contentType?.startsWith("audio/") && !a?.contentType?.startsWith("video/") && a?.contentType !== "application/pdf" && !String(a?.url || "").startsWith("data:")
      );
    }
    if (Array.isArray(msg.attachments)) {
      msg.attachments = msg.attachments.filter(
        (a) => !a?.contentType?.startsWith("image/") && !a?.contentType?.startsWith("audio/") && !a?.contentType?.startsWith("video/") && a?.contentType !== "application/pdf" && !String(a?.url || "").startsWith("data:")
      );
    }

    if (Array.isArray(msg.content)) {
      const filtered = msg.content
        .filter((b) => !isMediaBlock(b))
        .map(cleanBlock);
      msg.content = filtered.length > 0 ? filtered : [{ type: "text", text: "[media omitted]" }];
    } else if (typeof msg.content === "string") {
      msg.content = cleanDataUris(msg.content);
    }

    if (typeof msg.output === "string") {
      msg.output = cleanDataUris(msg.output);
    } else if (Array.isArray(msg.output)) {
      const filtered = msg.output.filter((b) => !isMediaBlock(b)).map(cleanBlock);
      msg.output = filtered.length > 0 ? filtered : [{ type: "text", text: "[media omitted]" }];
    }

    return msg;
  };

  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map(cleanMessage);
  }

  if (Array.isArray(next.input)) {
    next.input = next.input.map((it) => {
      if (!it || typeof it !== "object") return it;
      const item = { ...it };
      if (Array.isArray(item.content)) {
        const filtered = item.content.filter((b) => !isMediaBlock(b)).map(cleanBlock);
        item.content = filtered.length > 0 ? filtered : [{ type: "input_text", text: "[media omitted]" }];
      } else if (typeof item.content === "string") {
        item.content = cleanDataUris(item.content);
      }
      if (Array.isArray(item.output)) {
        const filtered = item.output.filter((block) => !isMediaBlock(block)).map(cleanBlock);
        item.output = filtered.length ? filtered : [{ type: "input_text", text: "[media omitted]" }];
      }
      return item;
    });
  }

  const cleanContents = (contents) => {
    if (!Array.isArray(contents)) return contents;
    return contents.map((c) => {
      if (!c || typeof c !== "object") return c;
      const copy = { ...c };
      if (Array.isArray(copy.parts)) {
        const filtered = copy.parts.filter((p) => !isMediaBlock(p)).map(cleanBlock);
        copy.parts = filtered.length > 0 ? filtered : [{ text: "[media omitted]" }];
      }
      return copy;
    });
  };

  if (Array.isArray(next.contents)) {
    next.contents = cleanContents(next.contents);
  }
  if (Array.isArray(next.request?.contents)) {
    next.request.contents = cleanContents(next.request.contents);
  }

  return next;
}

/**
 * Handle a fusion combo: fan the prompt out to every panel model in parallel,
 * then a judge model synthesizes one final answer from all panel responses.
 *
 * Panel calls are forced non-streaming with tools stripped (the judge needs
 * complete prose to synthesize). The judge call keeps the client's original
 * stream flag + tools, so streaming and downstream tool use still work.
 *
 * Speed: quorum-grace collection caps the straggler penalty. Quality: the judge
 * runs the consensus/contradiction/blind-spot analysis before writing.
 *
 * Degrades gracefully: 0 panel answers -> 503, exactly 1 -> return it directly.
 *
 * @param {Object} options
 * @param {Object} options.body - Request body (client format)
 * @param {string[]} options.models - Panel model strings
 * @param {Function} options.handleSingleModel - (body, modelStr) => Promise<Response>
 * @param {Object} options.log - Logger
 * @param {string} [options.comboName] - Combo name (logging)
 * @param {string} [options.judgeModel] - Judge model; falls back to panel[0]
 * @param {Object} [options.tuning] - Override FUSION_DEFAULTS (minPanel, grace, timeout)
 * @returns {Promise<Response>}
 */
export async function handleFusionChat({ body, models, handleSingleModel, log, comboName, judgeModel, tuning, modelCapabilities = null, signal = null }) {
  const cancelled = () => errorResponse(499, "Client closed request", { code: "client_aborted" });
  if (signal?.aborted) return cancelled();
  let panel = Array.isArray(models) ? models.filter(Boolean) : [];
  if (panel.length === 0) {
    return errorResponse(400, "Fusion combo has no models");
  }

  // Filter panel models by detectRequiredCapabilities(body) so text-only panel
  // members don't receive media requests that cause 400 errors (upstream Issue #3375).
  const required = detectRequiredCapabilities(body);
  const mediaCaps = [...required].filter((c) => HARD_CAPS.has(c));
  if (mediaCaps.length > 0) {
    const capablePanel = panel.filter((m) => {
      const slash = typeof m === "string" ? m.indexOf("/") : -1;
      const provider = slash > 0 ? m.slice(0, slash) : "";
      const model = slash > 0 ? m.slice(slash + 1) : m;
      const caps = modelCapabilities?.get(m) || getCapabilitiesForModel(provider, model);
      return mediaCaps.every((c) => caps[c] === true);
    });
    if (capablePanel.length > 0) {
      if (capablePanel.length < panel.length) {
        log?.info?.("FUSION", `Filtered panel for [${mediaCaps.join(",")}] from ${panel.length} to ${capablePanel.length} models: [${capablePanel.join(", ")}]`);
      }
      panel = capablePanel;
    }
  }

  // A single-model fusion has nothing to fuse — just answer directly.
  if (panel.length === 1) {
    return handleSingleModel(body, panel[0], undefined, signal);
  }

  const cfg = { ...FUSION_DEFAULTS, ...(tuning || {}) };
  const minPanel = Math.min(Math.max(2, cfg.minPanel), panel.length);
  const judge = judgeModel && judgeModel.trim() ? judgeModel.trim() : panel[0];
  log.info("FUSION", `Combo "${comboName}" | panel=${panel.length} [${panel.join(", ")}] | judge=${judge} | quorum=${minPanel}`);

  // 1. Fan out to the panel in parallel: non-streaming, tools stripped (we want prose).
  const { tools, tool_choice, stream_options, ...rest } = body;
  // Fusion runs panel models non-streaming; drop stream_options too, or providers
  // like DeepSeek reject it with "stream_options should be set along with stream = true".
  // See issue #3024.
  const panelBody = { ...rest, stream: false };

  // Flatten tool turns to prose so panel models keep context without emitting tool_calls.
  if (Array.isArray(panelBody.messages)) {
    panelBody.messages = flattenToolHistory(panelBody.messages);
  } else if (Array.isArray(panelBody.input)) {
    panelBody.input = flattenToolHistory(panelBody.input);
  }

  const t0 = Date.now();
  const controllers = panel.map(() => new AbortController());
  const completed = new Set();
  const abortPanel = () => controllers.forEach((controller, index) => {
    if (!completed.has(index)) controller.abort(signal?.reason || new Error("Fusion panel no longer needed"));
  });
  signal?.addEventListener("abort", abortPanel, { once: true });
  const calls = panel.map((model, index) => withTimeout((async () => {
    const controller = controllers[index];
    if (signal?.aborted) controller.abort(signal.reason);
    const response = await handleSingleModel(cloneRequestBody(panelBody), model, true, controller.signal);
    if (!response?.ok) {
      void response?.body?.cancel().catch(() => {});
      completed.add(index);
      return { ok: false, status: response?.status };
    }
    // Header arrival is not a usable panel answer. The same deadline covers
    // JSON/body consumption, so a stalled body cannot win quorum and hang fusion.
    const text = extractPanelText(await response.json());
    completed.add(index);
    return { ok: !!text, status: response.status, text };
  })(), cfg.panelHardTimeoutMs, controllers[index]));
  let settled;
  try {
    settled = await collectPanel(calls, { ...cfg, minPanel, signal });
  } finally {
    abortPanel();
    signal?.removeEventListener("abort", abortPanel);
  }
  if (signal?.aborted) return cancelled();
  log.info("FUSION", `fan-out collected in ${Date.now() - t0}ms`);

  // 2. Collect successful answers.
  const answers = [];
  for (let i = 0; i < settled.length; i++) {
    const res = settled[i];
    const model = panel[i];
    if (!res) { log.warn("FUSION", `Panel ${model} dropped (straggler/timeout)`); continue; }
    if (res.__timeout) { log.warn("FUSION", `Panel ${model} timed out`); continue; }
    if (res.__error) { log.warn("FUSION", `Panel ${model} threw`, { error: res.__error?.message || String(res.__error) }); continue; }
    if (!res.ok) { log.warn("FUSION", `Panel ${model} failed`, { status: res.status }); continue; }
    try {
      const text = res.text;
      if (text) {
        answers.push({ model, text });
        log.info("FUSION", `Panel ${model} ok (${text.length} chars)`);
      } else {
        log.warn("FUSION", `Panel ${model} returned empty content`);
      }
    } catch (e) {
      log.warn("FUSION", `Panel ${model} unparseable`, { error: e.message || String(e) });
    }
  }

  // 3. Degrade gracefully when the panel is too thin to fuse.
  if (answers.length === 0) {
    log.warn("FUSION", "All panel models failed");
    return errorResponse(503, "All fusion panel models failed");
  }
  if (answers.length === 1) {
    log.info("FUSION", `Only ${answers[0].model} succeeded — answering directly (no fusion)`);
    return handleSingleModel(body, answers[0].model, undefined, signal);
  }

  // 4. Judge analyzes + writes one final answer (streams to client if requested).
  // Strip multimodal content from judgeBody so text-only judge models (like deepseek, qwen-coder)
  // do not crash with HTTP 400 'this model does not support image input' (Issue #3375).
  const judgeBody = stripMultimodalContent(appendUserTurn(body, buildJudgePrompt(answers)));
  log.info("FUSION", `Judging ${answers.length} answers with ${judge}`);
  if (signal?.aborted) return cancelled();
  return handleSingleModel(judgeBody, judge, undefined, signal);
}
