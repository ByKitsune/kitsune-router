import { CLAUDE_BLOCK, OPENAI_BLOCK, RESPONSES_ITEM, DEFAULT_IMAGE_MIME } from "../schema/index.js";
import { encodeDataUri, parseDataUri } from "./image.js";

// Normalize recognized media only. Ordinary tool JSON is not inspected as media.
export function normalizeMediaPart(part) {
  if (!part || typeof part !== "object") return null;
  const type = part.type;
  if (type === OPENAI_BLOCK.IMAGE_URL || type === RESPONSES_ITEM.INPUT_IMAGE) {
    const source = part.image_url;
    const url = typeof source === "string" ? source : source?.url;
    if (typeof url !== "string" || !url) return null;
    return {
      type: OPENAI_BLOCK.IMAGE_URL,
      image_url: { ...(typeof source === "object" ? source : {}), url, ...(part.detail ? { detail: part.detail } : {}) },
    };
  }
  if (type === CLAUDE_BLOCK.IMAGE) {
    const source = part.source;
    if (source?.type === "url" && source.url) {
      return { type: OPENAI_BLOCK.IMAGE_URL, image_url: { url: source.url } };
    }
    const data = source?.type === "base64" ? source.data : part.data;
    if (typeof data === "string" && data) {
      return { type: OPENAI_BLOCK.IMAGE_URL, image_url: { url: encodeDataUri(source?.media_type || part.mimeType || part.mime_type || DEFAULT_IMAGE_MIME, data) } };
    }
  }
  const inline = part.inlineData || part.inline_data;
  if (inline && typeof inline.data === "string") {
    const mime = inline.mimeType || inline.mime_type;
    if (typeof mime === "string" && mime.toLowerCase().startsWith("image/")) {
      return { type: OPENAI_BLOCK.IMAGE_URL, image_url: { url: encodeDataUri(mime, inline.data) } };
    }
  }
  const remote = part.fileData || part.file_data;
  if (remote) {
    const mime = remote.mimeType || remote.mime_type;
    const url = remote.fileUri || remote.file_uri;
    if (typeof mime === "string" && mime.toLowerCase().startsWith("image/") && typeof url === "string") {
      return { type: OPENAI_BLOCK.IMAGE_URL, image_url: { url, mime_type: mime } };
    }
  }
  if (type === OPENAI_BLOCK.FILE || type === RESPONSES_ITEM.INPUT_FILE || type === CLAUDE_BLOCK.DOCUMENT) {
    const file = part.file || part;
    const data = file.file_data || (part.source?.type === "base64" && encodeDataUri(part.source.media_type, part.source.data));
    if (typeof data === "string" && data) {
      const parsed = parseDataUri(data);
      if (parsed?.mimeType.toLowerCase().startsWith("image/")) {
        return { type: OPENAI_BLOCK.IMAGE_URL, image_url: { url: data } };
      }
      return { type: OPENAI_BLOCK.FILE, file: { file_data: data, ...(file.filename ? { filename: file.filename } : {}) } };
    }
    if (file.file_id) return { type: OPENAI_BLOCK.FILE, file: { file_id: file.file_id } };
  }
  return null;
}

// Binary blocks belong to the vision channel, never to a JSON/text fallback.
export function splitToolResultContent(content) {
  const text = [];
  const media = [];
  for (const part of Array.isArray(content) ? content : [content]) {
    if (part == null) continue;
    if (typeof part === "string") {
      text.push(part);
      continue;
    }
    const normalized = normalizeMediaPart(part);
    if (normalized) {
      media.push(normalized);
    } else if (typeof part.text === "string") {
      text.push(part.text);
    } else if ([OPENAI_BLOCK.IMAGE_URL, CLAUDE_BLOCK.IMAGE, CLAUDE_BLOCK.DOCUMENT, OPENAI_BLOCK.FILE, RESPONSES_ITEM.INPUT_IMAGE, RESPONSES_ITEM.INPUT_FILE].includes(part.type)) {
      text.push(`[${part.type} block unavailable]`);
    } else {
      text.push(JSON.stringify(part));
    }
  }
  return { text: text.join("\n"), media };
}
