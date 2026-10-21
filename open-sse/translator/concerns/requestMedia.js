import { CLAUDE_BLOCK, OPENAI_BLOCK, RESPONSES_ITEM } from "../schema/index.js";
import { normalizeMediaPart } from "./multimodal.js";

// Only protocol content containers are traversed. Tool arguments, JSON results,
// annotations and strings are data, even when they look like media blocks.
export function visitRequestMedia(body, visit) {
  const parts = (content, path) => {
    if (!Array.isArray(content)) {
      if (content && typeof content === "object") parts([content], path);
      return;
    }
    for (const [index, part] of content.entries()) {
      if (!part || typeof part !== "object") continue;
      const location = `${path}.${index}`;
      visit(part, location);
      if (part.type === CLAUDE_BLOCK.TOOL_RESULT) parts(part.content, `${location}.content`);
      if (part.type === RESPONSES_ITEM.FUNCTION_CALL_OUTPUT || part.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL_OUTPUT) {
        parts(part.output, `${location}.output`);
      }
      const result = part.functionResponse;
      if (result) {
        parts(result.parts, `${location}.functionResponse.parts`);
        // Only typed content arrays are media containers; a free-form result
        // record (including its nested examples) must remain ordinary data.
        if (Array.isArray(result.response)) parts(result.response, `${location}.functionResponse.response`);
        else for (const key of ["parts", "content", "result", "output"]) {
          if (Array.isArray(result.response?.[key])) parts(result.response[key], `${location}.functionResponse.response.${key}`);
        }
      }
    }
  };
  for (const key of ["messages", "input"]) {
    if (!Array.isArray(body?.[key])) continue;
    for (const [index, message] of body[key].entries()) {
      parts(message?.content, `${key}.${index}.content`);
      if (message?.type === RESPONSES_ITEM.FUNCTION_CALL_OUTPUT || message?.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL_OUTPUT) {
        parts(message.output, `${key}.${index}.output`);
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
