// ElevenLabs TTS — voice id with optional model_id prefix
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { discardTtsBody, getTtsTransport, readTtsBuffer, readTtsJson, streamingTtsAudio } from "./_base.js";

const VOICES_TTL = 24 * 60 * 60 * 1000;
const _voicesCache = new Map(); // by API key

export async function fetchElevenLabsVoices(apiKey, options = {}) {
  if (!apiKey) throw new Error("ElevenLabs API key required");
  const { fetch, signal, proxyOptions } = getTtsTransport(options.credentials || { apiKey }, options);
  signal?.throwIfAborted();
  const cacheKey = createHash("sha256").update(JSON.stringify([apiKey, proxyOptions || null])).digest("hex");
  const now = Date.now();
  const cached = _voicesCache.get(cacheKey);
  if (cached && now - cached.time < VOICES_TTL) return cached.voices;

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    signal,
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
  });
  if (!res.ok) { discardTtsBody(res); throw new Error(`ElevenLabs voices fetch failed: ${res.status}`); }
  const data = await readTtsJson(res, signal);
  // Normalize: derive lang from labels for grouping
  const voices = (data.voices || []).map((v) => ({ ...v, lang: v.labels?.language || "en" }));
  for (const [key, entry] of _voicesCache) if (now - entry.time >= VOICES_TTL) _voicesCache.delete(key);
  if (_voicesCache.size >= 256) _voicesCache.delete(_voicesCache.keys().next().value);
  _voicesCache.set(cacheKey, { voices, time: now });
  return voices;
}

export default {
  async synthesize(text, model, credentials, responseFormat, options = {}) {
    const { fetch, signal } = getTtsTransport(credentials, options);
    if (!credentials?.apiKey) throw new Error("ElevenLabs API key required");
    let modelId = "eleven_flash_v2_5";
    let voiceId = model;
    if (model && model.includes("/")) [modelId, voiceId] = model.split("/");

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      signal,
      method: "POST",
      headers: { "xi-api-key": credentials.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      const err = await readTtsJson(res, signal).catch(() => { signal?.throwIfAborted(); return {}; });
      throw new Error(err?.detail?.message || `ElevenLabs TTS failed: ${res.status}`);
    }
    if (responseFormat && responseFormat !== "json") {
      const streaming = await streamingTtsAudio(res, "mp3", signal, 1024);
      if (streaming) return streaming;
    }
    const buf = await readTtsBuffer(res, signal);
    if (buf.byteLength < 1024) throw new Error("ElevenLabs TTS returned empty audio");
    return { base64: Buffer.from(buf).toString("base64"), format: "mp3" };
  },
};
