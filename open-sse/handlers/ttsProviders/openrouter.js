// OpenRouter TTS — via chat completions + audio modality (SSE stream)
import { PROVIDER_MEDIA } from "../../providers/index.js";
import { getTtsTransport, readTtsJson, ttsBodyChunks } from "./_base.js";

const TTS_CFG = PROVIDER_MEDIA["openrouter"]?.ttsConfig || {};

export default {
  async synthesize(text, model, credentials, _responseFormat, options = {}) {
    const { fetch, signal } = getTtsTransport(credentials, options);
    if (!credentials?.apiKey) throw new Error("No OpenRouter API key configured");

    // model format: "tts-model/voice" e.g. "openai/gpt-4o-mini-tts/alloy"
    let ttsModel = TTS_CFG.defaultModel;
    let voice = "alloy";
    if (model && model.includes("/")) {
      const lastSlash = model.lastIndexOf("/");
      const maybVoice = model.slice(lastSlash + 1);
      const maybeModel = model.slice(0, lastSlash);
      if (maybeModel.includes("/")) {
        ttsModel = maybeModel;
        voice = maybVoice;
      } else {
        voice = model;
      }
    } else if (model) {
      voice = model;
    }

    const res = await fetch(TTS_CFG.baseUrl, {
      signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${credentials.apiKey}`,
        ...(TTS_CFG.headers || {}),
      },
      body: JSON.stringify({
        model: ttsModel,
        modalities: ["text", "audio"],
        audio: { voice, format: "wav" },
        stream: true,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!res.ok) {
      const err = await readTtsJson(res, signal).catch(() => { signal?.throwIfAborted(); return {}; });
      throw new Error(err?.error?.message || `OpenRouter TTS failed: ${res.status}`);
    }

    // Parse SSE stream, accumulate base64 audio chunks
    const chunks = [];
    const decoder = new TextDecoder();
    let buffer = "";
    const consumeLine = line => {
      if (!line.startsWith("data:")) return false;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return true;
      try {
        const json = JSON.parse(data);
        const audioData = json.choices?.[0]?.delta?.audio?.data;
        if (audioData) chunks.push(audioData);
      } catch {}
      return false;
    };
    for await (const value of ttsBodyChunks(res, signal)) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      let done = false;
      for (const line of lines) {
        if (consumeLine(line)) { done = true; break; }
      }
      if (done) { buffer = ""; break; }
    }
    buffer += decoder.decode();
    if (buffer) consumeLine(buffer);

    if (chunks.length === 0) throw new Error("OpenRouter TTS returned no audio data");
    return { base64: chunks.join(""), format: "wav" };
  },
};
