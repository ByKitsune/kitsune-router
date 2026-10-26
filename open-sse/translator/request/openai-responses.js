/**
 * Translator: OpenAI Responses API → OpenAI Chat Completions
 * 
 * Responses API uses: { input: [...], instructions: "..." }
 * Chat API uses: { messages: [...] }
 */
import { createHash } from "node:crypto";
import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { convertResponsesApiFormat, normalizeToolParameters } from "../formats/responsesApi.js";
import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK, RESPONSES_ITEM, TOOL_ERROR_PREFIX } from "../schema/index.js";
import { normalizeMediaPart, splitToolResultContent } from "../concerns/multimodal.js";
import { expandToolResultMessages } from "../concerns/toolCall.js";
import { readOutputTokenCap } from "../formats/maxTokens.js";
import { splitToolCallId } from "../concerns/thoughtSignature.js";

const MAX_CALL_ID_LEN = 64;

function callIdMapper(messages) {
  const reserved = new Set();
  const reserve = id => { if (typeof id === "string" && id.length <= MAX_CALL_ID_LEN) reserved.add(id); };
  for (const message of messages) {
    for (const call of message.tool_calls || []) reserve(call.id);
    reserve(message.tool_call_id);
    for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block.type === CLAUDE_BLOCK.TOOL_RESULT) reserve(block.tool_use_id);
    }
  }
  const aliases = new Map();
  return id => {
    if (typeof id !== "string" || id.length <= MAX_CALL_ID_LEN) return id;
    if (splitToolCallId(id).thoughtSignature) {
      const error = new Error("unsupported_parameter: A signed Gemini tool ID cannot fit this destination's call_id limit without losing its opaque signature. Use a native Google route or resend history with a supported continuity representation.");
      error.code = "unsupported_parameter";
      error.param = "tool_calls.id";
      throw error;
    }
    if (aliases.has(id)) return aliases.get(id);
    const hash = createHash("sha256").update(id).digest("hex").slice(0, 16);
    let candidate = `${id.slice(0, MAX_CALL_ID_LEN - hash.length - 1)}_${hash}`;
    let suffix = 2;
    while (reserved.has(candidate)) {
      const tail = `_${hash}_${suffix++}`;
      candidate = `${id.slice(0, MAX_CALL_ID_LEN - tail.length)}${tail}`;
    }
    aliases.set(id, candidate);
    reserved.add(candidate);
    return candidate;
  };
}


export function openaiResponsesToOpenAIRequest(model, body, stream) {
  return convertResponsesApiFormat(body, { model, stream });
}

/**
 * Build a Responses `reasoning` input item from Chat Completions assistant fields.
 * Preserves encrypted blobs needed by store=false multi-turn (Grok CLI / Codex).
 * Returns null when the message has nothing useful to re-send.
 */
function buildReasoningInputItem(msg) {
  if (!msg || typeof msg !== "object") return null;

  const encrypted =
    (typeof msg.encrypted_content === "string" && msg.encrypted_content) ||
    (typeof msg.reasoning_encrypted_content === "string" && msg.reasoning_encrypted_content) ||
    (typeof msg.reasoning?.encrypted_content === "string" && msg.reasoning.encrypted_content) ||
    "";

  let summaryText = "";
  if (typeof msg.reasoning_content === "string" && msg.reasoning_content.trim()) {
    summaryText = msg.reasoning_content;
  } else if (typeof msg.reasoning === "string" && msg.reasoning.trim()) {
    summaryText = msg.reasoning;
  } else if (Array.isArray(msg.reasoning_details)) {
    summaryText = msg.reasoning_details
      .map((d) => (typeof d?.text === "string" ? d.text : typeof d?.content === "string" ? d.content : ""))
      .filter(Boolean)
      .join("\n");
  }

  if (!encrypted && !summaryText) return null;

  const item = { type: RESPONSES_ITEM.REASONING };
  if (summaryText) {
    item.summary = [{ type: RESPONSES_ITEM.SUMMARY_TEXT, text: summaryText }];
  }
  // encrypted_content is the continuity token for store=false backends
  if (encrypted) item.encrypted_content = encrypted;
  return item;
}

/**
 * Convert OpenAI Chat Completions to OpenAI Responses API format
 */
export function openaiToOpenAIResponsesRequest(model, body, stream, credentials) {
  // Body already in Responses API format (e.g. Cursor CLI calling /chat/completions with input[])
  if (Object.hasOwn(body, "input")) {
    const out = { ...body, model, stream: true };
    const cap = readOutputTokenCap(out, ["max_output_tokens", "max_completion_tokens", "max_tokens"]);
    if (cap !== undefined) out.max_output_tokens = cap;
    delete out.max_tokens;
    delete out.max_completion_tokens;
    return out;
  }

  const result = {
    model,
    input: [],
    stream: true,
    store: false
  };

  // Extract system message as instructions
  let hasSystemMessage = false;
  const messages = body.messages || [];
  const clampCallId = callIdMapper(messages);
  let pendingToolMedia = [];
  const flushToolMedia = () => {
    if (pendingToolMedia.length > 0) {
      result.input.push({ type: RESPONSES_ITEM.MESSAGE, role: ROLE.USER, content: pendingToolMedia });
      pendingToolMedia = [];
    }
  };

  for (const msg of expandToolResultMessages(messages)) {
    if (msg.role !== ROLE.TOOL) flushToolMedia();
    if (msg.role === ROLE.SYSTEM || msg.role === ROLE.DEVELOPER) {
      // A leading scalar system prompt can use instructions. Preserve every
      // later/native structured instruction at its original input position.
      if (!hasSystemMessage && result.input.length === 0 && typeof msg.content === "string") {
        result.instructions = msg.content;
      } else {
        result.input.push({ type: RESPONSES_ITEM.MESSAGE, role: msg.role, content: typeof msg.content === "string"
          ? [{ type: RESPONSES_ITEM.INPUT_TEXT, text: msg.content }]
          : (msg.content || []).map(part => ({ type: RESPONSES_ITEM.INPUT_TEXT, text: part.text })) });
      }
      hasSystemMessage = true;
      continue;
    }

    // Convert user/assistant messages to input items
    if (msg.role === ROLE.USER || msg.role === ROLE.ASSISTANT) {
      // Multi-turn continuity for store=false Responses backends (Codex / Grok CLI):
      // re-emit a reasoning item before the assistant message when the chat-format
      // history carried reasoning text and/or encrypted_content from a prior turn.
      if (msg.role === ROLE.ASSISTANT) {
        const reasoningItem = buildReasoningInputItem(msg);
        if (reasoningItem) result.input.push(reasoningItem);
      }

      const hasInputMedia = Array.isArray(msg.content) && msg.content.some(part => normalizeMediaPart(part));
      const contentType = msg.role === ROLE.USER || hasInputMedia ? RESPONSES_ITEM.INPUT_TEXT : RESPONSES_ITEM.OUTPUT_TEXT;
      const content = typeof msg.content === "string"
        ? [{ type: contentType, text: msg.content }]
        : Array.isArray(msg.content)
          ? msg.content.map(c => {
            c = normalizeMediaPart(c) || c;
            if (c.type === OPENAI_BLOCK.TEXT) return { type: contentType, text: c.text };
            // Convert Chat Completions image_url → Responses API input_image
            // Responses API expects: { type: "input_image", image_url: "<url string>" }
            // Chat Completions sends: { type: "image_url", image_url: { url: "...", detail: "..." } }
            if (c.type === OPENAI_BLOCK.IMAGE_URL) {
              const url = typeof c.image_url === "string" ? c.image_url : c.image_url?.url;
              return { type: RESPONSES_ITEM.INPUT_IMAGE, image_url: url, detail: c.image_url?.detail || "auto" };
            }
            if (c.type === RESPONSES_ITEM.INPUT_IMAGE) return c;
            if (c.type === OPENAI_BLOCK.FILE || c.type === RESPONSES_ITEM.INPUT_FILE) {
              const fileData = c.file?.file_data || c.file_data;
              if (fileData) {
                return { type: RESPONSES_ITEM.INPUT_FILE, file_data: fileData, ...(c.file?.filename || c.filename ? { filename: c.file?.filename || c.filename } : {}) };
              }
              const fileId = c.file?.file_id || c.file_id;
              if (fileId) return { type: RESPONSES_ITEM.INPUT_FILE, file_id: fileId };
            }
            const text = c.text || c.content || JSON.stringify(c);
            return { type: contentType, text: typeof text === "string" ? text : JSON.stringify(text) };
          })
          : [];

      // Only push a message block if content is non-empty.
      // Assistant messages with only tool_calls have content: null — skip the
      // message block in that case; the tool_calls are pushed separately below.
      if (content.length > 0) {
        result.input.push({
          type: RESPONSES_ITEM.MESSAGE,
          role: msg.role,
          content
        });
      }
    }

    // Convert tool calls
    if (msg.role === ROLE.ASSISTANT && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        result.input.push({
          type: RESPONSES_ITEM.FUNCTION_CALL,
          call_id: clampCallId(tc.id),
          name: tc.function?.name || "_unknown",
          arguments: tc.function?.arguments || "{}"
        });
      }
    }

    // Keep parallel tool answers contiguous; emit their media in a vision turn.
    if (msg.role === ROLE.TOOL) {
      const { text, media } = splitToolResultContent(msg.content);
      const output = msg.is_error === true && !text.startsWith(TOOL_ERROR_PREFIX) ? `${TOOL_ERROR_PREFIX}${text}` : text;
      for (const part of media) {
        if (part.type === OPENAI_BLOCK.IMAGE_URL) {
          pendingToolMedia.push({ type: RESPONSES_ITEM.INPUT_IMAGE, image_url: part.image_url.url, detail: part.image_url.detail || "auto" });
        } else if (part.file?.file_data || part.file?.file_id) {
          pendingToolMedia.push({ type: RESPONSES_ITEM.INPUT_FILE, ...part.file });
        }
      }
      result.input.push({
        type: RESPONSES_ITEM.FUNCTION_CALL_OUTPUT,
        call_id: clampCallId(msg.tool_call_id),
        output
      });
    }
  }
  flushToolMedia();

  // If no system message, leave instructions empty (will be filled by executor)
  if (!hasSystemMessage) {
    result.instructions = "";
  }

  // Convert tools format
  if (body.tools && Array.isArray(body.tools)) {
    result.tools = body.tools.map(tool => {
      if (tool.type === OPENAI_BLOCK.FUNCTION) {
        return {
          type: OPENAI_BLOCK.FUNCTION,
          name: tool.function.name,
          description: String(tool.function.description || ""),
          parameters: normalizeToolParameters(tool.function.parameters),
          strict: tool.function.strict
        };
      }
      return tool;
    });
  }

  // Pass through other relevant fields
  if (body.temperature !== undefined) result.temperature = body.temperature;
  const cap = readOutputTokenCap(body, ["max_output_tokens", "max_completion_tokens", "max_tokens"]);
  if (cap !== undefined) result.max_output_tokens = cap;
  for (const field of ["metadata", "user", "safety_identifier", "parallel_tool_calls", "store"]) {
    if (body[field] !== undefined) result[field] = body[field];
  }
  if (body.tool_choice !== undefined) {
    result.tool_choice = body.tool_choice?.type === OPENAI_BLOCK.FUNCTION && body.tool_choice.function?.name
      ? { type: OPENAI_BLOCK.FUNCTION, name: body.tool_choice.function.name } : body.tool_choice;
  }
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.reasoning !== undefined) result.reasoning = body.reasoning;
  if (body.reasoning_effort !== undefined) result.reasoning = { effort: body.reasoning_effort, summary: "auto" };
  if (body.service_tier !== undefined) result.service_tier = body.service_tier;
  if (body.prompt_cache_key !== undefined) result.prompt_cache_key = body.prompt_cache_key;

  // Structured output (9router #4547, fixes #2896): Chat Completions'
  // response_format becomes the Responses API's text.format, which the Codex
  // allowlist keeps (it strips response_format). json_schema keeps its name,
  // strict flag and schema; json_object stays json_object.
  const rf = body.response_format;
  if (rf && rf.type === "json_schema" && rf.json_schema && rf.json_schema.schema) {
    const { schema, ...options } = rf.json_schema;
    result.text = { format: { type: "json_schema", ...options, name: options.name || "response", schema } };
  } else if (rf && (rf.type === "json_object" || rf.type === "text")) {
    result.text = { format: { type: rf.type } };
  }

  return result;
}

// Register both directions
register(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, openaiResponsesToOpenAIRequest, null);
register(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, openaiToOpenAIResponsesRequest, null);
