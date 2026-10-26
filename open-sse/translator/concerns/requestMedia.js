import { ROLE, CLAUDE_BLOCK, OPENAI_BLOCK, RESPONSES_ITEM } from "../schema/index.js";
import { normalizeMediaPart, isExplicitToolMediaPart } from "./multimodal.js";
import { FORMATS } from "../formats.js";
import { parseDataUri } from "./image.js";

// Only protocol content containers are traversed. Tool arguments, JSON results,
// annotations and strings are data, even when they look like media blocks.
export function visitRequestMedia(body, visit) {
  const parts = (content, path, struct = false, toolResult = false) => {
    if (!Array.isArray(content)) {
      if (content && typeof content === "object") parts([content], path, struct, toolResult);
      return;
    }
    for (const [index, part] of content.entries()) {
      if (!part || typeof part !== "object" || (struct && !isExplicitToolMediaPart(part))) continue;
      const location = `${path}.${index}`;
      visit(part, location, toolResult);
      if (part.type === CLAUDE_BLOCK.TOOL_RESULT) parts(part.content, `${location}.content`, false, true);
      if (part.type === RESPONSES_ITEM.FUNCTION_CALL_OUTPUT || part.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL_OUTPUT) {
        parts(part.output, `${location}.output`, false, true);
      }
      const result = part.functionResponse;
      if (result) {
        parts(result.parts, `${location}.functionResponse.parts`, false, true);
        if (Array.isArray(result.response)) parts(result.response, `${location}.functionResponse.response`, true, true);
        else for (const key of ["parts", "content", "result", "output"]) {
          if (Array.isArray(result.response?.[key])) parts(result.response[key], `${location}.functionResponse.response.${key}`, true, true);
        }
      }
    }
  };
  for (const key of ["messages", "input"]) {
    if (!Array.isArray(body?.[key])) continue;
    for (const [index, message] of body[key].entries()) {
      parts(message?.content, `${key}.${index}.content`, false, message?.role === ROLE.TOOL);
      if (message?.type === RESPONSES_ITEM.FUNCTION_CALL_OUTPUT || message?.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL_OUTPUT) {
        parts(message.output, `${key}.${index}.output`, false, true);
      }
    }
  }
  const request = body?.request || body;
  if (Array.isArray(request?.contents)) {
    for (const [index, content] of request.contents.entries()) {
      parts(content?.parts, `${body?.request ? "request." : ""}contents.${index}.parts`);
    }
  }
}

// Refuse before capability stripping or format conversion can replace an
// unsupported document with prose. Literal tool JSON is never traversed.
export function rejectUnsupportedDocuments(body, capabilities) {
  let hasDocuments = false;
  visitRequestMedia(body, (part, path) => {
    const fileType = [OPENAI_BLOCK.FILE, CLAUDE_BLOCK.DOCUMENT, RESPONSES_ITEM.INPUT_FILE].includes(part.type);
    const native = part.inlineData || part.inline_data || part.fileData || part.file_data;
    const mime = native?.mimeType || native?.mime_type;
    if (!fileType && !(typeof mime === "string" && mime.toLowerCase() === "application/pdf")) return;
    // Some clients carry an actual image in a generic file block. It belongs
    // to the image admission policy, not the document capability.
    if (normalizeMediaPart(part)?.type === OPENAI_BLOCK.IMAGE_URL) return;
    hasDocuments = true;
    if (capabilities?.pdf !== false) return;
    const error = new Error("This route does not support PDF or document input. Select a document-capable route or send extracted text instead; the request was not sent upstream.");
    error.code = "unsupported_parameter";
    error.param = path;
    throw error;
  });
  return hasDocuments;
}

export function rejectClaudeAudio(body) {
  visitRequestMedia(body, (part, path) => {
    const native = part.inlineData || part.inline_data || part.fileData || part.file_data;
    const mime = native?.mimeType || native?.mime_type;
    const audio = part.type === OPENAI_BLOCK.INPUT_AUDIO || part.type === OPENAI_BLOCK.AUDIO_URL;
    if (!audio && !(typeof mime === "string" && mime.toLowerCase().startsWith("audio/"))) return;
    const error = new Error("unsupported_parameter: This destination's Messages wire has no supported audio input block; use an audio-capable destination or transcribe the audio first.");
    error.code = "unsupported_parameter";
    error.param = audio ? `${path}.${part.type}` : path;
    throw error;
  });
}

export function rejectUnsupportedTranslationMedia(body, sourceFormat, targetFormat) {
  if (sourceFormat === targetFormat && targetFormat !== FORMATS.OPENAI) return;
  const google = [FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.VERTEX, FORMATS.ANTIGRAVITY];
  const responses = [FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSE, FORMATS.CODEX];
  visitRequestMedia(body, (part, path, toolResult) => {
    const native = part.inlineData || part.inline_data || part.fileData || part.file_data;
    const mime = native?.mimeType || native?.mime_type;
    let unsupported = typeof mime === "string" && !mime.toLowerCase().startsWith("image/") && google.includes(sourceFormat);
    const audio = [OPENAI_BLOCK.INPUT_AUDIO, OPENAI_BLOCK.AUDIO_URL].includes(part.type);
    const video = [OPENAI_BLOCK.INPUT_VIDEO, OPENAI_BLOCK.VIDEO_URL].includes(part.type);
    if ((audio || video) && (targetFormat === FORMATS.CLAUDE || responses.includes(targetFormat))) unsupported = true;
    if ((audio || video) && toolResult) unsupported = true;
    if ((google.includes(targetFormat) || targetFormat === FORMATS.CLAUDE) && (part.file?.file_id || (part.type === RESPONSES_ITEM.INPUT_FILE && part.file_id))) unsupported = true;
    if (targetFormat === FORMATS.CLAUDE && [OPENAI_BLOCK.FILE, RESPONSES_ITEM.INPUT_FILE].includes(part.type)) {
      const parsed = parseDataUri((part.file || part).file_data);
      if (!parsed || (parsed.mimeType !== "application/pdf" && !parsed.mimeType.toLowerCase().startsWith("image/"))) unsupported = true;
    }
    if (targetFormat === FORMATS.GEMINI && audio && part.type === OPENAI_BLOCK.AUDIO_URL && !parseDataUri(part.audio_url?.url)) unsupported = true;
    if (targetFormat === FORMATS.OPENAI && native && !normalizeMediaPart(part)) unsupported = true;
    if (!unsupported) return;
    const error = new Error("unsupported_parameter: This media input has no supported lossless mapping on the selected protocol route; use its native endpoint or supply a supported typed image/document. No media bytes were converted to prose or discarded.");
    error.code = "unsupported_parameter";
    error.param = path;
    throw error;
  });
}

export function rejectUnresolvedKiroImages(body) {
  visitRequestMedia(body, (part, path) => {
    const media = normalizeMediaPart(part);
    const url = media?.type === OPENAI_BLOCK.IMAGE_URL && media.image_url?.url;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
    const error = new Error("unsupported_parameter: This destination requires inline image bytes; the remote image could not be safely fetched. Supply a supported base64 image instead.");
    error.code = "unsupported_parameter";
    error.param = `${path}.${part.source ? "source.url" : "image_url"}`;
    throw error;
  });
}
