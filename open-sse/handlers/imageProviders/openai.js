// OpenAI-compatible adapter (used by openai, minimax, openrouter, recraft)
import { PROVIDER_MEDIA } from "../../providers/index.js";
import { MAX_OPENAI_IMAGE_COUNT } from "../../config/mediaConfig.js";

const imageCfg = (id) => PROVIDER_MEDIA[id]?.imageConfig || {};
const imageUrl = (id) => imageCfg(id).baseUrl;

export default function createOpenAIAdapter(providerId) {
  const cfg = imageCfg(providerId);
  return {
    buildUrl: () => imageUrl(providerId),
    buildHeaders: (creds) => {
      const headers = { "Content-Type": "application/json", ...(cfg.headers || {}) };
      const key = creds?.apiKey || creds?.accessToken;
      if (key) headers["Authorization"] = `Bearer ${key}`;
      return headers;
    },
    buildBody: (model, body) => {
      const gptImage = providerId === "openai" && model.startsWith("gpt-image-");
      if (gptImage && (body.stream === true || body.partial_images != null)) throw new Error("Progressive OpenAI image streaming is not supported on this route; request JSON output");
      const { prompt, quality, style, response_format } = body;
      const n = body.n ?? 1;
      const size = body.size ?? (gptImage ? "auto" : "1024x1024");
      if (gptImage && (!Number.isSafeInteger(n) || n < 1 || n > MAX_OPENAI_IMAGE_COUNT)) throw new Error("n must be an integer between 1 and 10");
      const full = { model, prompt, n, size };
      if (quality) full.quality = quality;
      if (style) full.style = style;
      if (response_format) full.response_format = response_format;
      if (gptImage) {
        for (const key of ["background", "output_format", "output_compression", "moderation"]) {
          if (body[key] !== undefined) full[key] = body[key];
        }
      }
      // bodyFields whitelist (e.g. xAI accepts only model/prompt/n/response_format)
      const bodyFields = cfg.modelBodyFields?.[model] || cfg.bodyFields;
      if (Array.isArray(bodyFields)) {
        const req = {};
        for (const f of bodyFields) {
          const value = full[f] ?? body[f];
          if (value !== undefined) req[f] = value;
        }
        return req;
      }
      return full;
    },
    normalize: (responseBody) => responseBody,
  };
}
