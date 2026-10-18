/**
 * Stream-to-JSON Converter
 * Converts Responses API SSE stream to single JSON response
 * Used when client requests non-streaming but provider forces streaming (e.g., Codex)
 */
import { getResponseServiceTier } from "../providers/serviceTiers.js";

/**
 * Process a single SSE message and update state accordingly.
 */
function processSSEMessage(msg, state) {
  if (!msg.trim()) return;

  const eventMatch = msg.match(/^event:\s*(.+)$/m);
  const dataMatch = msg.match(/^data:\s*(.+)$/m);
  if (!dataMatch) return;

  let eventType = eventMatch?.[1].trim();
  const dataStr = dataMatch[1].trim();
  if (dataStr === "[DONE]") return;

  let parsed;
  try { parsed = JSON.parse(dataStr); }
  catch { return; }
  state.serviceTier = getResponseServiceTier(parsed) ?? state.serviceTier;
  eventType ||= parsed.type;
  if (["response.completed", "response.done", "response.incomplete", "response.failed"].includes(eventType)) {
    const response = parsed.response || {};
    state.responseId = response.id ?? state.responseId;
    state.created = response.created_at ?? state.created;
    state.model = response.model ?? state.model;
    state.incomplete_details = response.incomplete_details;
    if (response.usage) state.usage = { ...response.usage };
    if (Array.isArray(response.output)) {
      state.items = new Map(response.output.map((item, index) => [index, item]));
    }
  }

  if (eventType === "response.created") {
    state.responseId = parsed.response?.id || state.responseId;
    state.created = parsed.response?.created_at || state.created;
  } else if (eventType === "response.output_item.done") {
    state.items.set(parsed.output_index ?? 0, parsed.item);
  } else if (["response.completed", "response.done", "response.incomplete"].includes(eventType) && state.status !== "failed") {
    state.status = eventType === "response.incomplete" ? "incomplete" : "completed";
  } else if (eventType === "response.failed" || eventType === "error") {
    state.status = "failed";
    state.error = parsed.response?.error || parsed.error || { message: parsed.message || "Upstream Responses stream failed" };
  }
}

const EMPTY_RESPONSE = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

/**
 * Convert Responses API SSE stream to single JSON response
 * @param {ReadableStream} stream - SSE stream from provider
 * @returns {Promise<Object>} Final JSON response in Responses API format
 */
export async function convertResponsesStreamToJson(stream) {
  if (!stream || typeof stream.getReader !== "function") {
    return { id: `resp_${Date.now()}`, object: "response", created_at: Math.floor(Date.now() / 1000), status: "failed", output: [], usage: { ...EMPTY_RESPONSE } };
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const state = {
    responseId: "",
    created: Math.floor(Date.now() / 1000),
    status: "in_progress",
    usage: { ...EMPTY_RESPONSE },
    items: new Map()
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split("\n\n");
      buffer = messages.pop() || "";

      for (const msg of messages) {
        processSSEMessage(msg, state);
      }
    }

    // Flush remaining buffer (last event may not end with \n\n)
    if (buffer.trim()) {
      processSSEMessage(buffer, state);
    }
  } finally {
    reader.releaseLock();
  }

  // Build output array from accumulated items (ordered by index)
  const output = [];
  const maxIndex = state.items.size > 0 ? Math.max(...state.items.keys()) : -1;
  for (let i = 0; i <= maxIndex; i++) {
    output.push(state.items.get(i) || { type: "message", content: [], role: "assistant" });
  }

  return {
    id: state.responseId || `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "response",
    created_at: state.created,
    status: state.status || "completed",
    ...(state.error ? { error: state.error } : {}),
    ...(state.model !== undefined ? { model: state.model } : {}),
    ...(state.serviceTier ? { service_tier: state.serviceTier } : {}),
    ...(state.incomplete_details ? { incomplete_details: state.incomplete_details } : {}),
    output,
    usage: state.usage
  };
}
