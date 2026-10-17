import { FORMATS } from "../translator/formats.js";
import { ROLE, GEMINI_ROLE, OPENAI_BLOCK, CLAUDE_BLOCK, RESPONSES_ITEM, TOOL_ERROR_PREFIX } from "../translator/schema/index.js";

const DEFAULT_TIMEOUT_MS = 3000;
const byteEncoder = typeof Buffer === "undefined" ? new TextEncoder() : null;

function normalizeTimeout(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_TIMEOUT_MS;
}

function jsonBytes(value) {
  try {
    const json = JSON.stringify(value) || "";
    return byteEncoder ? byteEncoder.encode(json).length : Buffer.byteLength(json, "utf8");
  } catch {
    return 0;
  }
}

function messagePayload(body) {
  if (Array.isArray(body?.messages)) return body.messages;
  if (Array.isArray(body?.input)) return body.input;
  const kiro = collectKiroHeadroomMessages(body);
  if (kiro) return kiro.messages;
  return null;
}

function captureSizeSnapshot(body) {
  const messages = messagePayload(body);
  const toolHistory = messages?.filter((message) =>
    message?.role === "tool"
    || message?.role === "function"
    || message?.tool_calls?.length
    || message?.content?.some?.((part) => part?.type === "tool_use" || part?.type === "tool_result")
    || message?.type === "function_call"
    || message?.type === "function_call_output"
    || message?.type === "custom_tool_call"
    || message?.type === "custom_tool_call_output"
  ) || [];
  return {
    bodyBytes: jsonBytes(body),
    messageBytes: messages ? jsonBytes(messages) : 0,
    toolSchemaBytes: jsonBytes(body?.tools || []),
    toolHistoryBytes: jsonBytes(toolHistory),
  };
}

function setDiagnostic(diagnostics, reason) {
  if (diagnostics && !diagnostics.reason) diagnostics.reason = reason;
}

function scrubSensitiveUrlText(text) {
  return String(text)
    .replace(/\/\/[^/@\s]+@/g, "//")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]*/g, "$1");
}

function describeFetchError(error) {
  const cause = error?.cause;
  const code = cause?.code || error?.code;
  const message = scrubSensitiveUrlText(cause?.message || error?.message || String(error));
  return code ? `${code}: ${message}` : message;
}

function buildCompressEndpoint(url) {
  try {
    const parsed = new URL(url);
    parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/v1/compress`;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    const raw = String(url).replace(/#.*$/, "");
    const [base, query = ""] = raw.split("?", 2);
    const endpoint = `${base.replace(/\/$/, "")}/v1/compress`;
    return query ? `${endpoint}?${query}` : endpoint;
  }
}

function maskEndpoint(endpoint) {
  try {
    const parsed = new URL(endpoint);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(endpoint).replace(/\/\/[^/@\s]+@/, "//").replace(/[?#].*$/, "");
  }
}

const CHAT_TEXT_TYPES = [OPENAI_BLOCK.TEXT];
const RESPONSES_TEXT_TYPES = [RESPONSES_ITEM.INPUT_TEXT, RESPONSES_ITEM.OUTPUT_TEXT];

function isErrorResult(result) {
  return result?.is_error === true || result?.status === "error";
}

function addTextTarget(projection, role, object, key, extra = {}) {
  const text = object?.[key];
  if (typeof text !== "string") return;
  if (role === ROLE.TOOL && text.startsWith(TOOL_ERROR_PREFIX)) return;
  projection.messages.push({ role, content: text, ...extra });
  projection.targets.push({ object, key });
}

function addContentTargets(projection, role, object, key, textTypes, extra = {}) {
  const content = object?.[key];
  if (typeof content === "string") {
    addTextTarget(projection, role, object, key, extra);
    return;
  }
  const parts = Array.isArray(content) ? content : content ? [content] : [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (typeof part === "string") {
      addTextTarget(projection, role, parts, i, extra);
    } else if (textTypes.includes(part?.type)) {
      addTextTarget(projection, role, part, "text", extra);
    }
  }
}

function collectChatHeadroomMessages(body, claude) {
  const items = Array.isArray(body?.messages) ? body.messages
    : !claude && Array.isArray(body?.input) ? body.input
    : null;
  if (!items) return null;

  const projection = { messages: [], targets: [] };
  if (claude) addContentTargets(projection, ROLE.SYSTEM, body, "system", CHAT_TEXT_TYPES);

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const role = item.role || ROLE.USER;
    if (isErrorResult(item)) continue;

    if (!claude) {
      const extra = {
        ...(item.tool_call_id ? { tool_call_id: item.tool_call_id } : {}),
        ...(item.name ? { name: item.name } : {}),
        ...(item.tool_calls ? { tool_calls: item.tool_calls } : {}),
      };
      addContentTargets(projection, role, item, "content", CHAT_TEXT_TYPES, extra);
      continue;
    }

    if (typeof item.content === "string") {
      addTextTarget(projection, role, item, "content");
      continue;
    }
    const blocks = Array.isArray(item.content) ? item.content : item.content ? [item.content] : [];
    for (const block of blocks) {
      if (block?.type === CLAUDE_BLOCK.TEXT) {
        addTextTarget(projection, role, block, "text");
      } else if (block?.type === CLAUDE_BLOCK.TOOL_RESULT || block?.type === CLAUDE_BLOCK.WEB_SEARCH_TOOL_RESULT) {
        if (isErrorResult(block)) continue;
        addContentTargets(projection, ROLE.TOOL, block, "content", CHAT_TEXT_TYPES,
          block.tool_use_id ? { tool_call_id: block.tool_use_id } : {});
      }
    }
  }
  return projection.messages.length > 0 ? projection : null;
}

function collectResponsesHeadroomMessages(body) {
  if (!Array.isArray(body?.input)) return null;
  const projection = { messages: [], targets: [] };

  for (const item of body.input) {
    if (!item || typeof item !== "object" || isErrorResult(item)) continue;
    const itemType = item.type || (item.role ? RESPONSES_ITEM.MESSAGE : null);
    if (itemType === RESPONSES_ITEM.MESSAGE) {
      addContentTargets(projection, item.role || ROLE.USER, item, "content", RESPONSES_TEXT_TYPES);
    } else if (itemType === RESPONSES_ITEM.FUNCTION_CALL_OUTPUT || itemType === RESPONSES_ITEM.CUSTOM_TOOL_CALL_OUTPUT) {
      addContentTargets(projection, ROLE.TOOL, item, "output", RESPONSES_TEXT_TYPES,
        item.call_id ? { tool_call_id: item.call_id } : {});
    }
  }
  return projection.messages.length > 0 ? projection : null;
}

function hasSameToolIdentity(expected, actual) {
  for (const key of ["tool_call_id", "name"]) {
    if (expected[key] !== undefined && actual[key] !== expected[key]) return false;
  }
  if (!expected.tool_calls) return true;
  if (!Array.isArray(actual.tool_calls) || actual.tool_calls.length !== expected.tool_calls.length) return false;
  return expected.tool_calls.every((call, index) => {
    const returned = actual.tool_calls[index];
    return returned?.id === call.id
      && returned?.type === call.type
      && returned?.function?.name === call.function?.name
      && returned?.name === call.name;
  });
}

function applyHeadroomMessages(projection, compressedMessages, diagnostics, label) {
  if (!Array.isArray(compressedMessages) || compressedMessages.length !== projection.messages.length) {
    setDiagnostic(diagnostics, `proxy response did not match ${label} message count`);
    return false;
  }

  const texts = [];
  for (let i = 0; i < projection.messages.length; i++) {
    const expected = projection.messages[i];
    const actual = compressedMessages[i];
    if (!actual || actual.role !== expected.role) {
      setDiagnostic(diagnostics, `proxy response did not preserve ${label} message ${label === "Kiro" ? "order" : "order/role"}`);
      return false;
    }
    if (!hasSameToolIdentity(expected, actual)) {
      setDiagnostic(diagnostics, `proxy response did not preserve ${label} tool identity/order`);
      return false;
    }
    const text = textFromHeadroomMessage(actual);
    if (text === null) {
      setDiagnostic(diagnostics, `proxy response missing ${label} text content`);
      return false;
    }
    texts.push(text);
  }

  // Validate the complete response before changing any original text leaf.
  for (let i = 0; i < projection.targets.length; i++) {
    const target = projection.targets[i];
    target.object[target.key] = texts[i];
  }
  return true;
}

function collectKiroHeadroomMessages(body) {
  const state = body?.conversationState;
  if (!state || typeof state !== "object") return null;
  const projection = { messages: [], targets: [] };

  const toToolCalls = (toolUses) => {
    if (!Array.isArray(toolUses) || toolUses.length === 0) return undefined;
    const calls = toolUses.map((toolUse) => ({
      id: toolUse?.toolUseId,
      type: OPENAI_BLOCK.FUNCTION,
      function: {
        name: toolUse?.name || "",
        arguments: JSON.stringify(toolUse?.input || {}),
      },
    })).filter((call) => call.id || call.function.name);
    return calls.length > 0 ? calls : undefined;
  };

  const visit = (item) => {
    const user = item?.userInputMessage;
    if (user) {
      addTextTarget(projection, ROLE.SYSTEM, user, "systemInstruction");
      addTextTarget(projection, ROLE.USER, user, "content");

      const toolResults = user.userInputMessageContext?.toolResults;
      if (Array.isArray(toolResults)) {
        for (const toolResult of toolResults) {
          if (isErrorResult(toolResult) || !Array.isArray(toolResult?.content)) continue;
          for (const part of toolResult.content) {
            addTextTarget(projection, ROLE.TOOL, part, "text",
              toolResult.toolUseId ? { tool_call_id: toolResult.toolUseId } : {});
          }
        }
      }
      return;
    }

    const assistant = item?.assistantResponseMessage;
    if (assistant) {
      const toolCalls = toToolCalls(assistant.toolUses);
      addTextTarget(projection, ROLE.ASSISTANT, assistant, "content", toolCalls ? { tool_calls: toolCalls } : {});
    }
  };

  if (Array.isArray(state.history)) {
    for (const item of state.history) visit(item);
  }
  if (state.currentMessage) visit(state.currentMessage);
  return projection.messages.length > 0 ? projection : null;
}

function textFromHeadroomMessage(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  const parts = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
    } else if (part?.type === OPENAI_BLOCK.TEXT && typeof part.text === "string") {
      parts.push(part.text);
    } else {
      return null;
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function collectGeminiHeadroomMessages(body) {
  const contents = body?.request?.contents || body?.contents;
  if (!Array.isArray(contents) || contents.length === 0) return null;
  const projection = { messages: [], targets: [] };

  for (const turn of contents) {
    if (!turn || !Array.isArray(turn.parts)) continue;
    const role = turn.role === GEMINI_ROLE.MODEL ? ROLE.ASSISTANT : ROLE.USER;

    for (const part of turn.parts) {
      if (!part || typeof part !== "object") continue;
      if (typeof part.text === "string" && part.text.trim()) {
        addTextTarget(projection, role, part, "text");
      } else if (part.functionResponse && typeof part.functionResponse === "object") {
        const response = part.functionResponse.response;
        if (!response || typeof response !== "object" || isErrorResult(response) || response.error != null) continue;
        const toolCallId = part.functionResponse.id || part.functionResponse.name;
        for (const key of ["output", "result", "content", "text"]) {
          if (typeof response[key] === "string" && response[key].trim()) {
            addTextTarget(projection, ROLE.TOOL, response, key, toolCallId ? { tool_call_id: toolCallId } : {});
            break;
          }
        }
      }
    }
  }
  return projection.messages.length > 0 ? projection : null;
}

// POST messages to Headroom /v1/compress; returns compressed messages + stats or null.
async function callCompress(url, messages, model, timeoutMs, compressUserMessages, diagnostics) {
  const endpoint = buildCompressEndpoint(url);
  diagnostics.endpoint = maskEndpoint(endpoint);
  const payload = { messages, model };
  if (compressUserMessages) payload.config = { compress_user_messages: true };
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    setDiagnostic(diagnostics, `request failed: ${describeFetchError(error)}`);
    return null;
  }
  if (!res.ok) {
    setDiagnostic(diagnostics, `proxy returned HTTP ${res.status}`);
    return null;
  }
  const data = await res.json();
  if (!Array.isArray(data?.messages)) {
    setDiagnostic(diagnostics, "proxy response missing messages[]");
    return null;
  }
  return data;
}

// Compress only projected text leaves. Never round-trip provider history through
// another wire format or trust a text proxy to return its media/tool structure.
// Fail-open: invalid or failed compression leaves the original request untouched.
export async function compressWithHeadroom(body, { enabled, url, model, format, compressUserMessages, timeoutMs = DEFAULT_TIMEOUT_MS, diagnostics = null } = {}) {
  timeoutMs = normalizeTimeout(timeoutMs);
  if (!enabled) {
    setDiagnostic(diagnostics, "disabled");
    return null;
  }
  if (!url) {
    setDiagnostic(diagnostics, "missing proxy URL");
    return null;
  }
  if (!body) {
    setDiagnostic(diagnostics, "missing request body");
    return null;
  }

  try {
    if (diagnostics) diagnostics.before = captureSizeSnapshot(body);

    let projection;
    let label;
    if (format === FORMATS.CLAUDE) {
      projection = collectChatHeadroomMessages(body, true);
      label = "Claude";
    } else if (format === FORMATS.OPENAI_RESPONSES) {
      projection = collectResponsesHeadroomMessages(body);
      label = "Responses";
    } else if (format === FORMATS.KIRO) {
      projection = collectKiroHeadroomMessages(body);
      label = "Kiro";
    } else if (format === FORMATS.GEMINI || format === FORMATS.ANTIGRAVITY
      || Array.isArray(body.request?.contents) || Array.isArray(body.contents)) {
      projection = collectGeminiHeadroomMessages(body);
      label = "Gemini";
    } else {
      projection = collectChatHeadroomMessages(body, false);
      label = "OpenAI";
    }
    if (!projection) {
      setDiagnostic(diagnostics, `${label} request did not project to messages[]`);
      return null;
    }
    const data = await callCompress(url, projection.messages, model, timeoutMs, compressUserMessages, diagnostics || {});
    if (!data || !applyHeadroomMessages(projection, data.messages, diagnostics, label)) return null;
    if (diagnostics) diagnostics.after = captureSizeSnapshot(body);
    return data;
  } catch (error) {
    setDiagnostic(diagnostics, `unexpected error: ${error?.message || String(error)}`);
    return null;
  }
}

export function formatHeadroomLog(stats) {
  if (!stats) return null;
  const before = stats.tokens_before ?? stats.original_tokens ?? stats.stats?.original_tokens ?? stats.stats?.tokens_before ?? 0;
  const after = stats.tokens_after ?? stats.compressed_tokens ?? stats.stats?.compressed_tokens ?? stats.stats?.tokens_after ?? 0;
  const delta = stats.tokens_saved ?? stats.saved_tokens ?? stats.stats?.saved_tokens ?? stats.stats?.tokens_saved ?? (before > after ? before - after : 0);
  const pct = before > 0 ? ((delta / before) * 100).toFixed(1) : "0";
  return `reported token delta=${delta} before=${before}${after ? ` after=${after}` : ""} (${pct}%)`.trim();
}

export function formatHeadroomSizeLog(diagnostics) {
  const before = diagnostics?.before;
  const after = diagnostics?.after;
  if (!before || !after) return "";
  const effective = before.bodyBytes > 0
    ? (((before.bodyBytes - after.bodyBytes) / before.bodyBytes) * 100).toFixed(1)
    : "0.0";
  return `body=${before.bodyBytes}B→${after.bodyBytes}B messages=${before.messageBytes}B→${after.messageBytes}B tools=${before.toolSchemaBytes || 0}B→${after.toolSchemaBytes || 0}B toolHistory=${before.toolHistoryBytes || 0}B→${after.toolHistoryBytes || 0}B effective=${effective}%`;
}

export function isHeadroomPhantomSavings(stats, diagnostics, minShrinkRatio = 0.05) {
  if (!stats?.tokens_saved || stats.tokens_saved <= 0) return false;
  const before = diagnostics?.before?.bodyBytes || 0;
  const after = diagnostics?.after?.bodyBytes || 0;
  if (before <= 0 || after <= 0) return false;
  return after >= before * (1 - minShrinkRatio);
}
