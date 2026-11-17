// OpenAI TTS — model format: "tts-model/voice"
import { Buffer } from "node:buffer";
import { PROVIDER_MEDIA } from "../../providers/index.js";
import { createErrorResult } from "../../utils/error.js";
import { HTTP_STATUS } from "../../config/runtimeConfig.js";
import { getTtsTransport, readTtsBuffer, readTtsJson, streamingTtsAudio } from "./_base.js";

const DEFAULT_TTS_MODEL = PROVIDER_MEDIA["openai"]?.ttsConfig?.defaultModel;

export default {
  async synthesize(text, model, credentials, responseFormat, options = {}) {
    const { fetch, signal } = getTtsTransport(credentials, options);
    if (!credentials?.apiKey) throw new Error("No OpenAI API key configured");

    let ttsModel = DEFAULT_TTS_MODEL;
    let voice = "alloy";
    if (model && model.includes("/")) {
      const parts = model.split("/");
      if (parts.length === 2) [ttsModel, voice] = parts;
    } else if (model) {
      voice = model;
    }
    if (!ttsModel) {
      return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Select an explicit OpenAI TTS model and voice; this Speech endpoint has no active default model.");
    }

    const baseUrl = (credentials.baseUrl || "https://api.openai.com").replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      signal,
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${credentials.apiKey}` },
      body: JSON.stringify({ model: ttsModel, voice, input: text }),
    });
    if (!res.ok) {
      const err = await readTtsJson(res, signal).catch(() => { signal?.throwIfAborted(); return {}; });
      throw new Error(err?.error?.message || `OpenAI TTS failed: ${res.status}`);
    }
    if (responseFormat && responseFormat !== "json") {
      const streaming = await streamingTtsAudio(res, "mp3", signal);
      if (streaming) return streaming;
    }
    const buf = await readTtsBuffer(res, signal);
    return { base64: Buffer.from(buf).toString("base64"), format: "mp3" };
  },
};
