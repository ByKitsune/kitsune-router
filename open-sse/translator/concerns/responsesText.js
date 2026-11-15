import { RESPONSES_ITEM } from "../schema/index.js";

// Done frames repeat full text; only their unseen suffix belongs on a delta wire.
// Keep ownership per item and part, not by text value (equal text can be distinct).
export function captureResponsesText(chunk, state) {
  const data = chunk?.data || chunk;
  const type = chunk?.event || data?.type;
  const items = state.responsesTextItems ??= new Map();
  const output = [];
  const partsFor = (value) => {
    const id = value.item_id ?? value.item?.id;
    const idKey = id == null ? null : `id:${id}`;
    const indexKey = value.output_index == null ? (idKey ? null : "index:0") : `index:${value.output_index}`;
    const parts = (idKey && items.get(idKey)) || (indexKey && items.get(indexKey)) || new Map();
    if (idKey) items.set(idKey, parts);
    if (indexKey) items.set(indexKey, parts);
    return parts;
  };
  const capture = (parts, kind, index, text, snapshot) => {
    if (typeof text !== "string" || !text) return;
    const key = `${kind}:${index ?? 0}`;
    const length = parts.get(key) || 0;
    if (snapshot && text.length <= length) return;
    parts.set(key, snapshot ? text.length : length + text.length);
    output.push({ type: kind, text: snapshot ? text.slice(length) : text });
  };
  const capturePart = (parts, part, index) => {
    if (part?.type === RESPONSES_ITEM.OUTPUT_TEXT) capture(parts, part.type, index, part.text, true);
    else if (part?.type === RESPONSES_ITEM.REFUSAL) capture(parts, part.type, index, part.refusal, true);
  };
  const captureItem = (item, outputIndex) => {
    if (item?.type !== RESPONSES_ITEM.MESSAGE) return;
    const parts = partsFor({ item, output_index: outputIndex });
    for (const [index, part] of (Array.isArray(item.content) ? item.content : []).entries()) capturePart(parts, part, index);
  };
  if (type === "response.output_text.delta" || type === "response.output_text.done") {
    capture(partsFor(data), RESPONSES_ITEM.OUTPUT_TEXT, data.content_index, type.endsWith(".delta") ? data.delta : data.text, type.endsWith(".done"));
  } else if (type === "response.refusal.delta" || type === "response.refusal.done") {
    capture(partsFor(data), RESPONSES_ITEM.REFUSAL, data.content_index, type.endsWith(".delta") ? data.delta : data.refusal, type.endsWith(".done"));
  } else if (type === "response.content_part.done") {
    capturePart(partsFor(data), data.part, data.content_index);
  } else if (type === "response.output_item.done") {
    captureItem(data.item, data.output_index);
  } else if (["response.completed", "response.done", "response.incomplete"].includes(type)) {
    for (const [index, item] of (Array.isArray(data.response?.output) ? data.response.output : []).entries()) captureItem(item, index);
  }
  return output;
}
