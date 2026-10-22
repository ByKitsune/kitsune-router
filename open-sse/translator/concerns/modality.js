// Strip multimodal content blocks a model cannot read, BEFORE translation.
// Driven by getCapabilitiesForModel: vision/audioInput/pdf. Replaces removed
// media with a short text placeholder so messages never become empty.
import { FORMATS } from "../formats.js";
import { CLAUDE_BLOCK, OPENAI_BLOCK, RESPONSES_ITEM } from "../schema/index.js";
import { isExplicitToolMediaPart } from "./multimodal.js";

// Placeholder text inserted where a media block was removed.
// Current turn: explain the active model can't read what the user just sent.
const PLACEHOLDER_CURRENT = {
  vision: "[image omitted: model has no vision support]",
  audioInput: "[audio omitted: model has no audio support]",
  videoInput: "[video omitted: model has no video support]",
  pdf: "[file omitted: model has no document support]",
};
// Earlier turns: neutral (a combo may route to a different model each turn).
const PLACEHOLDER_PREV = {
  vision: "[Previous image omitted from context.]",
  audioInput: "[Previous audio omitted from context.]",
  videoInput: "[Previous video omitted from context.]",
  pdf: "[Previous file omitted from context.]",
};
const ph = (cap, isLast) => (isLast ? PLACEHOLDER_CURRENT : PLACEHOLDER_PREV)[cap];

// Map gemini inlineData/fileData mime prefix -> capability it requires.
function capForMime(mime) {
  if (typeof mime !== "string") return null;
  mime = mime.toLowerCase();
  if (mime.startsWith("image/")) return "vision";
  if (mime.startsWith("audio/")) return "audioInput";
  if (mime.startsWith("video/")) return "videoInput";
  if (mime === "application/pdf") return "pdf";
  return null;
}

// OpenAI chat content block -> required capability (null = plain text/other, keep).
function capForOpenAIBlock(block) {
  const t = block?.type;
  if (t === OPENAI_BLOCK.IMAGE_URL || t === CLAUDE_BLOCK.IMAGE || t === RESPONSES_ITEM.INPUT_IMAGE) return "vision";
  if (t === OPENAI_BLOCK.INPUT_AUDIO || t === OPENAI_BLOCK.AUDIO_URL) return "audioInput";
  if (t === OPENAI_BLOCK.VIDEO_URL || t === OPENAI_BLOCK.INPUT_VIDEO) return "videoInput";
  if (t === OPENAI_BLOCK.FILE || t === CLAUDE_BLOCK.DOCUMENT || t === RESPONSES_ITEM.INPUT_FILE) {
    const data = block.file?.file_data || block.file_data;
    const mime = block.source?.media_type || (typeof data === "string" ? data.match(/^data:([^;,]+)/)?.[1] : null);
    return capForMime(mime) || "pdf";
  }
  return null;
}

// Filter an array of content blocks; drop unsupported, inject one placeholder per kind.
// isLast = block belongs to the current user turn (picks the explanatory placeholder).
function filterBlocks(blocks, capOf, caps, removed, isLast, textType = OPENAI_BLOCK.TEXT) {
  const out = [];
  for (const block of blocks) {
    const cap = capOf(block);
    if (cap && caps[cap] === false) { removed.add(cap); continue; }
    if (block?.type === CLAUDE_BLOCK.TOOL_RESULT && Array.isArray(block.content)) {
      block.content = filterBlocks(block.content, capOf, caps, new Set(), isLast, textType);
    }
    out.push(block);
  }
  for (const cap of removed) out.push({ type: textType, text: ph(cap, isLast) });
  return out;
}

// OpenAI / OpenAI-compatible chat messages[].content[].
function stripOpenAI(body, caps) {
  if (!Array.isArray(body.messages)) return;
  const last = body.messages.length - 1;
  body.messages.forEach((msg, i) => {
    if (caps.vision === false) {
      if (Array.isArray(msg.images)) delete msg.images;
      if (Array.isArray(msg.experimental_attachments)) {
        msg.experimental_attachments = msg.experimental_attachments.filter(
          (a) => !((a?.contentType || a?.mediaType)?.startsWith("image/") || (typeof a?.url === "string" && a.url.startsWith("data:image/")))
        );
      }
      if (Array.isArray(msg.attachments)) {
        msg.attachments = msg.attachments.filter(
          (a) => !((a?.contentType || a?.mediaType)?.startsWith("image/") || (typeof a?.url === "string" && a.url.startsWith("data:image/")))
        );
      }
    }
    if (!Array.isArray(msg.content)) return;
    const removed = new Set();
    msg.content = filterBlocks(msg.content, capForOpenAIBlock, caps, removed, i === last);
  });
}

// Claude messages[].content[].
function stripClaude(body, caps) {
  if (!Array.isArray(body.messages)) return;
  const last = body.messages.length - 1;
  body.messages.forEach((msg, i) => {
    if (!Array.isArray(msg.content)) return;
    const removed = new Set();
    msg.content = filterBlocks(msg.content, capForOpenAIBlock, caps, removed, i === last);
  });
}

// Responses tool outputs carry their typed media in output[], not content[].
function stripResponses(body, caps) {
  if (!Array.isArray(body.input)) return;
  const last = body.input.length - 1;
  for (const [i, item] of body.input.entries()) {
    if (!item || typeof item !== "object") continue;
    for (const key of ["content", ...(item.type === RESPONSES_ITEM.FUNCTION_CALL_OUTPUT || item.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL_OUTPUT ? ["output"] : [])]) {
      if (!Array.isArray(item[key])) continue;
      const removed = new Set();
      item[key] = filterBlocks(item[key], capForOpenAIBlock, caps, removed, i === last, RESPONSES_ITEM.INPUT_TEXT);
    }
  }
}

function filterGeminiParts(parts, caps, isLast, struct = false) {
  const removed = new Set();
  const out = [];
  for (const part of parts) {
    if (struct && !isExplicitToolMediaPart(part)) { out.push(part); continue; }
    const inline = part?.inlineData || part?.inline_data;
    const file = part?.fileData || part?.file_data;
    const cap = capForMime(inline?.mimeType || inline?.mime_type || file?.mimeType || file?.mime_type) || capForOpenAIBlock(part);
    if (cap && caps[cap] === false) { removed.add(cap); continue; }
    const result = part?.functionResponse;
    if (result) {
      if (Array.isArray(result.parts)) result.parts = filterGeminiParts(result.parts, caps, isLast);
      if (Array.isArray(result.response)) result.response = filterGeminiParts(result.response, caps, isLast, true);
      else if (result.response && typeof result.response === "object") {
        for (const key of ["parts", "content", "result", "output"]) {
          if (Array.isArray(result.response[key])) result.response[key] = filterGeminiParts(result.response[key], caps, isLast, true);
        }
      }
    }
    out.push(part);
  }
  for (const cap of removed) out.push({ text: ph(cap, isLast) });
  return out;
}

// Gemini / gemini-cli contents[].parts[], including multimodal tool responses.
function stripGeminiParts(contents, caps) {
  if (!Array.isArray(contents)) return;
  const last = contents.length - 1;
  contents.forEach((content, i) => {
    if (Array.isArray(content?.parts)) content.parts = filterGeminiParts(content.parts, caps, i === last);
  });
}

/**
 * Remove media blocks the model can't read, in-place on the source-format body.
 * @param {object} body - request body (source format)
 * @param {string} sourceFormat - one of FORMATS
 * @param {object} caps - capabilities from getCapabilitiesForModel
 * @returns {boolean} true if anything was stripped-eligible (cap false for some modality)
 */
export function stripUnsupportedModalities(body, sourceFormat, caps) {
  if (!body || !caps) return false;
  // Fast exit: model supports everything we'd strip.
  if (caps.vision !== false && caps.audioInput !== false && caps.videoInput !== false && caps.pdf !== false) return false;
  switch (sourceFormat) {
    case FORMATS.OPENAI:
    case FORMATS.OLLAMA:
    case FORMATS.KIRO:
    case FORMATS.CURSOR:
    case FORMATS.COMMANDCODE:
      stripOpenAI(body, caps);
      break;
    case FORMATS.CLAUDE:
      stripClaude(body, caps);
      break;
    case FORMATS.OPENAI_RESPONSES:
    case FORMATS.OPENAI_RESPONSE:
    case FORMATS.CODEX:
      stripResponses(body, caps);
      break;
    case FORMATS.GEMINI:
    case FORMATS.GEMINI_CLI:
    case FORMATS.VERTEX:
      stripGeminiParts(body.contents, caps);
      break;
    case FORMATS.ANTIGRAVITY:
      stripGeminiParts(body?.request?.contents, caps);
      break;
    default:
      stripOpenAI(body, caps);
  }
  return true;
}
