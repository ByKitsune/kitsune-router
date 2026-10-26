import { ROLE, OPENAI_BLOCK, RESPONSES_ITEM, TOOL_ERROR_PREFIX } from "../schema/index.js";
import { generateToolCallId } from "../concerns/toolCall.js";
import { readOutputTokenCap, requiresMaxCompletionTokens } from "./maxTokens.js";

/**
 * Normalize Responses API input to array format.
 * Accepts string or array, returns array of message items.
 * An empty array is treated like an empty string — providers require at least one user
 * message, so we inject a placeholder rather than forwarding an empty messages[].
 * @param {string|Array} input - raw input from Responses API body
 * @returns {Array|null} normalized array or null if invalid
 */
export function normalizeResponsesInput(input) {
  if (typeof input === "string") {
    const text = input.trim() === "" ? "..." : input;
    return [{ type: RESPONSES_ITEM.MESSAGE, role: ROLE.USER, content: [{ type: RESPONSES_ITEM.INPUT_TEXT, text }] }];
  }
  if (Array.isArray(input)) {
    // Empty input[] would produce messages:[] which all providers reject (#389)
    if (input.length === 0) {
      return [{ type: RESPONSES_ITEM.MESSAGE, role: ROLE.USER, content: [{ type: RESPONSES_ITEM.INPUT_TEXT, text: "..." }] }];
    }
    return input;
  }
  return null;
}

// Keep multimodal content structured across the Responses → Chat bridge.
export function normalizeResponsesContent(content) {
  if (!Array.isArray(content)) return content;
  return content.map((part) => {
    if (part.type === RESPONSES_ITEM.INPUT_TEXT || part.type === RESPONSES_ITEM.OUTPUT_TEXT) {
      return { type: OPENAI_BLOCK.TEXT, text: part.text };
    }
    if (part.type === RESPONSES_ITEM.INPUT_IMAGE) {
      const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
      if (url) return { type: OPENAI_BLOCK.IMAGE_URL, image_url: { url, detail: part.detail || "auto" } };
      if (part.file_id) {
        const error = new Error("unsupported_parameter: Responses image file IDs cannot be resolved by this protocol route; supply inline image data or a supported image URL.");
        error.code = "unsupported_parameter";
        error.param = "input_image.file_id";
        throw error;
      }
    }
    if (part.type === RESPONSES_ITEM.INPUT_FILE) {
      if (typeof part.file_data === "string" && part.file_data) {
        return { type: OPENAI_BLOCK.FILE, file: { file_data: part.file_data, ...(part.filename ? { filename: part.filename } : {}) } };
      }
      if (part.file_id) return { type: OPENAI_BLOCK.FILE, file: { file_id: part.file_id } };
      const error = new Error("unsupported_parameter: Responses file input requires inline file_data or a supported file ID on this protocol route.");
      error.code = "unsupported_parameter";
      error.param = "input_file";
      throw error;
    }
    return part;
  });
}

/**
 * Convert OpenAI Responses API request to OpenAI Chat Completions format
 */
export function convertResponsesApiFormat(body, { model = body.model, stream = body.stream } = {}) {
  if (!Object.hasOwn(body, "input")) return body;

  const result = { ...body, model, stream };
  result.messages = [];

  // Convert instructions to system message
  if (body.instructions) {
    result.messages.push({ role: ROLE.SYSTEM, content: body.instructions });
  }

  // Group items by conversation turn
  let currentAssistantMsg = null;
  let pendingToolResults = [];
  let pendingReasoning = "";
  let pendingReasoningEncrypted = "";
  const additionalTools = [];
  const customToolNames = new Set();
  const pendingToolCallIds = [];
  let toolCallSeq = 0;

  const inputItems = normalizeResponsesInput(body.input);
  if (!inputItems) return body;

  // Extract reasoning text from summary[].text (encrypted_content is continuity-only)
  const extractReasoningText = (item) => {
    if (Array.isArray(item.summary)) {
      const txt = item.summary.map(s => s?.text || "").filter(Boolean).join("\n");
      if (txt) return txt;
    }
    if (Array.isArray(item.content)) {
      const txt = item.content.map(c => c?.text || "").filter(Boolean).join("\n");
      if (txt) return txt;
    }
    return "";
  };

  const attachPendingReasoning = (msg) => {
    if (pendingReasoning) msg.reasoning_content = pendingReasoning;
    if (pendingReasoningEncrypted) msg.encrypted_content = pendingReasoningEncrypted;
    pendingReasoning = "";
    pendingReasoningEncrypted = "";
  };

  for (const item of inputItems) {
    // Determine item type - Droid CLI sends role-based items without 'type' field
    // Fallback: if no type but has role property, treat as message
    const itemType = item.type || (item.role ? RESPONSES_ITEM.MESSAGE : null);

    if (itemType === RESPONSES_ITEM.MESSAGE) {
      // Flush any pending assistant message with tool calls
      if (currentAssistantMsg) {
        result.messages.push(currentAssistantMsg);
        currentAssistantMsg = null;
      }
      // Flush pending tool results
      if (pendingToolResults.length > 0) {
        for (const tr of pendingToolResults) {
          result.messages.push(tr);
        }
        pendingToolResults = [];
      }

      // Convert content: input_text → text, output_text → text, input_image → image_url
      const content = normalizeResponsesContent(item.content);
      const msg = { role: item.role, content };
      if (item.role === ROLE.TOOL && !item.tool_call_id) {
        const repairedToolId = pendingToolCallIds.shift();
        if (repairedToolId) {
          msg.tool_call_id = repairedToolId;
        } else {
          msg.role = ROLE.USER;
          msg.content = typeof content === "string"
            ? `[Tool result: ${content}]`
            : [{ type: OPENAI_BLOCK.TEXT, text: "[Tool result]" }, ...(Array.isArray(content) ? content : [])];
        }
      }
      // Attach buffered reasoning to assistant turn (required by xiaomi-mimo + store=false continuity)
      if (item.role === ROLE.ASSISTANT) attachPendingReasoning(msg);
      else {
        pendingReasoning = "";
        pendingReasoningEncrypted = "";
      }
      result.messages.push(msg);
    }
    else if (itemType === RESPONSES_ITEM.FUNCTION_CALL || itemType === RESPONSES_ITEM.CUSTOM_TOOL_CALL) {
      // Start or append to assistant message with tool_calls
      if (!currentAssistantMsg) {
        currentAssistantMsg = {
          role: ROLE.ASSISTANT,
          content: null,
          tool_calls: []
        };
        attachPendingReasoning(currentAssistantMsg);
      }
      // Skip items with empty/missing name — Codex/OpenAI reject nameless tool calls (#444)
      if (!item.name || typeof item.name !== "string" || item.name.trim() === "") continue;
      if (itemType === RESPONSES_ITEM.CUSTOM_TOOL_CALL) customToolNames.add(item.name);
      const toolInput = itemType === RESPONSES_ITEM.CUSTOM_TOOL_CALL
        ? { input: typeof item.input === "string" ? item.input : JSON.stringify(item.input ?? "") }
        : item.arguments;
      const callId = item.call_id || generateToolCallId(toolCallSeq++, currentAssistantMsg.tool_calls.length, item.name);
      currentAssistantMsg.tool_calls.push({
        id: callId,
        type: OPENAI_BLOCK.FUNCTION,
        function: {
          name: item.name,
          arguments: typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput ?? {})
        }
      });
      pendingToolCallIds.push(callId);
    }
    else if (itemType === RESPONSES_ITEM.FUNCTION_CALL_OUTPUT || itemType === RESPONSES_ITEM.CUSTOM_TOOL_CALL_OUTPUT) {
      // Flush assistant message first if exists
      if (currentAssistantMsg) {
        if (currentAssistantMsg.tool_calls?.length > 0 || currentAssistantMsg.content !== null || currentAssistantMsg.reasoning_content) {
          result.messages.push(currentAssistantMsg);
        }
        currentAssistantMsg = null;
      }
      // Flush any pending tool results first
      if (pendingToolResults.length > 0) {
        for (const tr of pendingToolResults) {
          result.messages.push(tr);
        }
        pendingToolResults = [];
      }
      const outputContent = Array.isArray(item.output)
        ? normalizeResponsesContent(item.output)
        : typeof item.output === "string" ? item.output : JSON.stringify(item.output);
      let outputCallId = typeof item.call_id === "string" && item.call_id ? item.call_id : "";
      if (outputCallId) {
        const queued = pendingToolCallIds.indexOf(outputCallId);
        if (queued >= 0) pendingToolCallIds.splice(queued, 1);
      } else {
        outputCallId = pendingToolCallIds.shift() || "";
      }
      // True orphan outputs have no valid call to answer; drop them rather
      // than emit a role:tool message every strict upstream rejects.
      if (outputCallId) {
        result.messages.push({ role: ROLE.TOOL, tool_call_id: outputCallId, content: outputContent,
          ...(typeof item.is_error === "boolean" ? { is_error: item.is_error }
            : typeof outputContent === "string" && outputContent.startsWith(TOOL_ERROR_PREFIX) ? { is_error: true } : {}) });
      }
    }
    else if (itemType === RESPONSES_ITEM.ADDITIONAL_TOOLS) {
      if (Array.isArray(item.tools)) additionalTools.push(...item.tools);
    }
    else if (itemType === RESPONSES_ITEM.REASONING) {
      // Buffer reasoning text; attached to next assistant message/function_call.
      // Also stash encrypted_content so a later openai→responses hop can restore
      // the store=false continuity blob (Grok CLI / Codex multi-turn).
      const txt = extractReasoningText(item);
      if (txt) pendingReasoning = pendingReasoning ? `${pendingReasoning}\n${txt}` : txt;
      if (typeof item.encrypted_content === "string" && item.encrypted_content) {
        // Prefer attaching to the next assistant message we create
        pendingReasoningEncrypted = item.encrypted_content;
      }
      continue;
    }
  }

  // Flush remaining
  if (currentAssistantMsg) {
    if (currentAssistantMsg.tool_calls?.length > 0 || currentAssistantMsg.content !== null || currentAssistantMsg.reasoning_content) {
      result.messages.push(currentAssistantMsg);
    }
  }
  if (pendingToolResults.length > 0) {
    for (const tr of pendingToolResults) {
      result.messages.push(tr);
    }
  }

  // Convert tools format.
  // Responses API supports "hosted" tools (e.g. { type: "request_user_input" }) that carry no
  // explicit `name` field and cannot be represented as Chat Completions function declarations.
  // Filter them out to avoid sending nameless functionDeclarations to downstream providers
  // such as Gemini, which strictly validates function names.
  const responseTools = [
    ...(Array.isArray(body.tools) ? body.tools : []),
    ...additionalTools,
  ];
  if (responseTools.length > 0) {
    result.tools = responseTools
      .map(tool => {
        // Already in Chat Completions format: { type: "function", function: { name, ... } }
        if (tool.function) return tool;
        // Responses API function/custom tool: { type, name, description, parameters|format }.
        // Chat Completions has no freeform custom-tool declaration, so expose custom
        // tools as functions with one raw `input` string while retaining their names
        // in translator-only metadata for the response conversion.
        const name = tool.name;
        if (!name || typeof name !== "string" || name.trim() === "") return null;
        if (tool.type === "custom") {
          customToolNames.add(name);
          const formatHint = [tool.format?.syntax, tool.format?.definition].filter(Boolean).join("\n");
          return {
            type: OPENAI_BLOCK.FUNCTION,
            function: {
              name,
              description: [String(tool.description || ""), formatHint].filter(Boolean).join("\n\n"),
              parameters: {
                type: "object",
                properties: {
                  input: {
                    type: "string",
                    description: "Raw freeform input for this custom tool"
                  }
                },
                required: ["input"],
                additionalProperties: false
              }
            }
          };
        }
        // Responses API function tool: { type: "function", name, description, parameters }
        // Only convert when a non-empty name is present; skip hosted tools without one.
        return {
          type: OPENAI_BLOCK.FUNCTION,
          function: {
            name,
            description: String(tool.description || ""),
            parameters: normalizeToolParameters(tool.parameters),
            strict: tool.strict
          }
        };
      })
      .filter(Boolean);
  }
  if (customToolNames.size > 0) result._customToolNames = [...customToolNames];

  // Cleanup Responses API specific fields
  const cap = readOutputTokenCap(result, ["max_output_tokens", "max_completion_tokens", "max_tokens"]);
  delete result.max_output_tokens;
  delete result.max_tokens;
  delete result.max_completion_tokens;
  if (cap !== undefined) result[requiresMaxCompletionTokens(model) ? "max_completion_tokens" : "max_tokens"] = cap;
  if (result.tool_choice?.type === OPENAI_BLOCK.FUNCTION && result.tool_choice.name) {
    result.tool_choice = { type: OPENAI_BLOCK.FUNCTION, function: { name: result.tool_choice.name } };
  }
  for (const key of ["background", "truncation", "max_tool_calls"]) delete result[key];
  // Non-null references are inherited input, not disposable output controls.
  // The target-aware entry guard rejects them for stateless destinations.
  for (const key of ["previous_response_id", "conversation"]) if (result[key] === null) delete result[key];

  delete result.input;
  delete result.instructions;
  delete result.include;
  // prompt_cache_key is intentionally kept: Chat Completions accepts it on
  // api.openai.com/Azure and it seeds the stable Codex/Grok cache id. Providers
  // that reject it are handled by the config-driven guard in translator/index.js.
  delete result.store;
  if (typeof result.reasoning?.effort === "string") {
    result.reasoning_effort = result.reasoning.effort;
  }
  delete result.reasoning;
  delete result.client_metadata;
  // `text` (verbosity + structured-output format) is a Responses-only control.
  // Every other Responses-only field is stripped above; leaving this one made
  // strict chat backends reject the whole body — OpenCode Go's glm-5.3-flash
  // answers HTTP 400 `unknown field "text"` (9router #4637). The structured
  // output survives as response_format via the dedicated mapping below.
  const textControl = result.text;
  delete result.text;
  if (textControl?.format && result.response_format === undefined) {
    const fmt = textControl.format;
    if (fmt.type === "json_schema" && fmt.schema) {
      const { type, ...schemaFormat } = fmt;
      result.response_format = { type, json_schema: { ...schemaFormat, name: fmt.name || "response" } };
    } else if (fmt.type === "json_object" || fmt.type === "text") {
      result.response_format = { type: fmt.type };
    }
  }

  return result;
}

// Responses requires a properties map even for parameterless function tools.
export function normalizeToolParameters(params) {
  if (!params) return { type: "object", properties: {} };
  if (params.type === "object" && !params.properties) return { ...params, properties: {} };
  return params;
}
