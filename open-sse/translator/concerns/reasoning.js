import { ROLE, REASONING_DETAIL, RESPONSES_ITEM } from "../schema/index.js";

// Build OpenAI delta carrying reasoning_content (optional leading assistant role)
export function reasoningDelta(text, withRole = false) {
  return withRole
    ? { role: ROLE.ASSISTANT, reasoning_content: text }
    : { reasoning_content: text };
}

// Prefer top-level canonical/vendor aliases; provider extensions are a fallback.
export function extractReasoningText(delta) {
  return extractOwnReasoningText(delta) || extractOwnReasoningText(delta?.provider_specific_fields);
}

function extractOwnReasoningText(delta) {
  if (!delta || typeof delta !== "object") return "";
  if (typeof delta.reasoning_content === "string" && delta.reasoning_content) return delta.reasoning_content;
  if (typeof delta.reasoning === "string" && delta.reasoning) return delta.reasoning;
  const details = delta.reasoning_details;
  if (Array.isArray(details)) {
    const parts = [];
    for (const detail of details) {
      if (typeof detail === "string") {
        parts.push(detail);
        continue;
      }
      if (!detail || typeof detail !== "object") continue;
      // Typed opaque continuity is not readable reasoning, even if a vendor
      // attaches a text-like field. Untyped entries are MiniMax's split shape.
      if (detail.type != null && detail.type !== REASONING_DETAIL.TEXT && detail.type !== REASONING_DETAIL.SUMMARY) continue;
      const text = detail.type === REASONING_DETAIL.SUMMARY && typeof detail.summary === "string" && detail.summary
        ? detail.summary
        : typeof detail.text === "string" && detail.text
          ? detail.text
          : typeof detail.content === "string" ? detail.content : "";
      if (text) parts.push(text);
    }
    return parts.join("");
  }
  return "";
}

function responsesSummaryText(item) {
  const parts = [];
  for (const part of Array.isArray(item?.summary) ? item.summary : []) {
    if ((part?.type == null || part.type === RESPONSES_ITEM.SUMMARY_TEXT) && typeof part?.text === "string") parts.push(part.text);
  }
  return parts.join("");
}

function responsesContentText(item) {
  if (typeof item?.content === "string") return item.content;
  const parts = [];
  for (const part of Array.isArray(item?.content) ? item.content : []) {
    if (part?.type === RESPONSES_ITEM.REASONING_TEXT && typeof part.text === "string") parts.push(part.text);
  }
  return parts.join("");
}

export function extractResponsesReasoningText(item) {
  const summary = responsesSummaryText(item);
  const content = responsesContentText(item);
  return content === summary ? summary : summary + content;
}

function reasoningItemState(state, data) {
  const items = state.responsesReasoningItems ??= new Map();
  const id = data.item_id ?? data.item?.id;
  const index = data.output_index;
  const idKey = id == null ? null : `id:${id}`;
  const indexKey = index == null ? (idKey ? null : "index:0") : `index:${index}`;
  const item = (idKey && items.get(idKey)) || (indexKey && items.get(indexKey)) || new Map();
  if (idKey) items.set(idKey, item);
  if (indexKey) items.set(indexKey, item);
  return item;
}

function captureReasoningPart(parts, lane, index, text, snapshot) {
  if (typeof text !== "string" || !text) return "";
  const key = `${lane}:${index ?? 0}`;
  const length = parts.get(key) || 0;
  if (snapshot) {
    if (text.length <= length) return "";
    parts.set(key, text.length);
    return text.slice(length);
  }
  parts.set(key, length + text.length);
  return text;
}

function captureReasoningItem(item, parts) {
  const result = [];
  const summary = responsesSummaryText(item);
  const content = responsesContentText(item);
  const sameText = summary && summary === content;
  let contentSeen = false;
  for (const key of parts.keys()) {
    if (key.startsWith("content:")) { contentSeen = true; break; }
  }
  if (!(sameText && contentSeen)) {
    for (const [index, part] of (Array.isArray(item?.summary) ? item.summary : []).entries()) {
      if (part?.type == null || part.type === RESPONSES_ITEM.SUMMARY_TEXT) {
        result.push(captureReasoningPart(parts, "summary", index, part?.text, true));
      }
    }
  }
  if (!sameText || contentSeen) {
    if (typeof item?.content === "string") result.push(captureReasoningPart(parts, "content", 0, item.content, true));
    else for (const [index, part] of (Array.isArray(item?.content) ? item.content : []).entries()) {
      if (part?.type === RESPONSES_ITEM.REASONING_TEXT) result.push(captureReasoningPart(parts, "content", index, part.text, true));
    }
  }
  return result.join("");
}

// Done/item/terminal frames repeat complete text. Emit only the suffix not already
// delivered by deltas for that item and part; encrypted continuity is never read.
export function captureResponsesReasoning(chunk, state) {
  const data = chunk?.data || chunk;
  const type = chunk?.event || data?.type;
  if (type === "response.reasoning_summary_text.delta" || type === "response.reasoning_summary_text.done") {
    return captureReasoningPart(reasoningItemState(state, data), "summary", data.summary_index,
      type.endsWith(".delta") ? data.delta : data.text, type.endsWith(".done"));
  }
  if (type === "response.reasoning_text.delta" || type === "response.reasoning_text.done") {
    return captureReasoningPart(reasoningItemState(state, data), "content", data.content_index,
      type.endsWith(".delta") ? data.delta : data.text, type.endsWith(".done"));
  }
  if (type === "response.reasoning_summary_part.done") {
    return data.part?.type === RESPONSES_ITEM.SUMMARY_TEXT
      ? captureReasoningPart(reasoningItemState(state, data), "summary", data.summary_index, data.part.text, true) : "";
  }
  if (type === "response.output_item.done" && data.item?.type === RESPONSES_ITEM.REASONING) {
    return captureReasoningItem(data.item, reasoningItemState(state, data));
  }
  if (["response.completed", "response.done", "response.incomplete", "response.failed"].includes(type)) {
    const result = [];
    for (const [index, item] of (Array.isArray(data.response?.output) ? data.response.output : []).entries()) {
      if (item?.type === RESPONSES_ITEM.REASONING) {
        result.push(captureReasoningItem(item, reasoningItemState(state, { item, output_index: index })));
      }
    }
    return result.join("");
  }
  return "";
}
