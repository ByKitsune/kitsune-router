// Pre-fetch remote image URLs into base64 BEFORE translation, for target
// formats whose upstream providers cannot fetch remote URLs themselves
// (they require inline base64). Runs on the source-format body.
import { FORMATS } from "../formats.js";
import { fetchImageAsBase64, parseDataUri } from "./image.js";
import { CLAUDE_BLOCK, OPENAI_BLOCK, RESPONSES_ITEM } from "../schema/index.js";
import { visitRequestMedia } from "./requestMedia.js";

// Targets that require inline base64 images (cannot accept remote URLs).
const TARGETS_NEED_BASE64 = new Set([
  FORMATS.CLAUDE,
  FORMATS.CODEX,
  FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.VERTEX,
  FORMATS.ANTIGRAVITY, FORMATS.OLLAMA, FORMATS.KIRO,
]);

function isRemoteUrl(url) {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

function collectImageRefs(body) {
  const refs = [];
  visitRequestMedia(body, part => {
    if (part.type === OPENAI_BLOCK.IMAGE_URL || part.type === RESPONSES_ITEM.INPUT_IMAGE) {
      const get = () => typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
      if (isRemoteUrl(get())) refs.push({ get, set: fetched => {
        if (typeof part.image_url === "string") part.image_url = fetched.url;
        else part.image_url = { ...part.image_url, url: fetched.url };
      } });
    } else if (part.type === CLAUDE_BLOCK.IMAGE && part.source?.type === "url" && isRemoteUrl(part.source.url)) {
      refs.push({ get: () => part.source.url, set: fetched => {
        part.source = { type: "base64", media_type: fetched.mimeType, data: parseDataUri(fetched.url).base64 };
      } });
    }
    const file = part.fileData || part.file_data;
    const mime = file?.mimeType || file?.mime_type;
    const uri = file?.fileUri || file?.file_uri;
    if (typeof mime === "string" && mime.toLowerCase().startsWith("image/") && isRemoteUrl(uri)) {
      refs.push({ get: () => (part.fileData || part.file_data)?.fileUri || (part.fileData || part.file_data)?.file_uri, set: fetched => {
        delete part.fileData;
        delete part.file_data;
        part.inlineData = { mimeType: fetched.mimeType, data: parseDataUri(fetched.url).base64 };
      } });
    }
  });
  return refs;
}

/**
 * Replace remote image URLs with base64 data when the target needs inline data.
 * No-op when the target accepts remote URLs or the body has no remote images.
 * @returns {Promise<number>} count of images converted
 */
export async function prefetchRemoteImages(body, sourceFormat, targetFormat, options = {}) {
  if (!body || !TARGETS_NEED_BASE64.has(targetFormat)) return 0;
  const refs = collectImageRefs(body);
  if (!refs.length) return 0;

  let converted = 0;
  const fetchedByUrl = new Map();
  for (const ref of refs) {
    if (options.signal?.aborted) break;
    const url = ref.get();
    if (parseDataUri(url)) continue;
    let fetched;
    if (fetchedByUrl.has(url)) fetched = fetchedByUrl.get(url);
    else {
      fetched = await fetchImageAsBase64(url, options);
      fetchedByUrl.set(url, fetched);
    }
    if (options.signal?.aborted) break;
    if (!fetched) continue;
    ref.set(fetched);
    converted++;
  }
  return converted;
}
