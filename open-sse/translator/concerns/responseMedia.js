import { FORMATS } from "../formats.js";
import { CLAUDE_BLOCK, RESPONSES_ITEM } from "../schema/index.js";
import { toOpenAIUsage } from "./usage.js";

export function unsupportedResponseMedia(targetFormat, sourceFormat, chunk) {
  if (!chunk || targetFormat === sourceFormat) return null;
  const google = [FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.VERTEX, FORMATS.ANTIGRAVITY];
  const data = chunk.response || chunk;
  let unsupported = false;
  if (google.includes(targetFormat)) {
    for (const candidate of data.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        const media = part.inlineData || part.inline_data || part.fileData || part.file_data;
        if (!media) continue;
        const mime = media.mimeType || media.mime_type;
        if (!mime || !mime.toLowerCase().startsWith("image/") || part.fileData || part.file_data || sourceFormat === FORMATS.CLAUDE || sourceFormat === FORMATS.OPENAI_RESPONSES) unsupported = true;
      }
    }
  }
  if (targetFormat === FORMATS.OPENAI) {
    for (const choice of chunk.choices || []) {
      const message = choice.delta || choice.message;
      if (message?.audio) unsupported = true;
      if ([FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES].includes(sourceFormat) && message?.images?.length) unsupported = true;
    }
  }
  if (targetFormat === FORMATS.CLAUDE) {
    const blocks = chunk.content_block ? [chunk.content_block] : Array.isArray(chunk.content) ? chunk.content : [];
    if (blocks.some(block => [CLAUDE_BLOCK.IMAGE, CLAUDE_BLOCK.DOCUMENT].includes(block?.type))) unsupported = true;
  }
  if (targetFormat === FORMATS.OPENAI_RESPONSES) {
    const event = chunk.data || chunk;
    const items = event.item ? [event.item] : event.response?.output || event.output || [];
    for (const item of items) {
      if (item.type === "image_generation_call") unsupported = true;
      if (item.type === RESPONSES_ITEM.MESSAGE && item.content?.some(part => part.type === "output_image" || part.type === RESPONSES_ITEM.INPUT_IMAGE || part.type === RESPONSES_ITEM.INPUT_FILE)) unsupported = true;
    }
  }
  if (!unsupported) return null;
  const event = chunk.data || chunk;
  const kind = google.includes(targetFormat) ? "gemini" : targetFormat === FORMATS.CLAUDE ? "claude" : targetFormat === FORMATS.OPENAI_RESPONSES ? "responses" : "openai";
  const rawUsage = kind === "gemini" ? data.usageMetadata || chunk.usageMetadata : event.response?.usage || event.usage;
  const usage = toOpenAIUsage(rawUsage, kind);
  return { status: 502, ...(usage ? { usage } : {}), error: { type: "upstream_error", code: "unsupported_response_media",
    message: "The upstream returned media with no supported lossless mapping to this client protocol. Use its native endpoint; media bytes were not converted to prose or discarded." } };
}
