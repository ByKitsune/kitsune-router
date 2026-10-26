// Shared helpers for image provider adapters
import { setTimeout as delay } from "node:timers/promises";
import { canonicalizeUsage, extractUsage } from "../../utils/usageTracking.js";
import { MAX_UPSTREAM_ERROR_BYTES, parseUpstreamError } from "../../utils/error.js";

export const POLL_INTERVAL_MS = 1500;
export const POLL_TIMEOUT_MS = 120000;

export const sleep = (ms, signal) => delay(ms, undefined, { signal });

export function reportedImageUsage(value) {
  const raw = value?.usage ?? value?.response?.usage ?? value?.usageMetadata ?? value?.response?.usageMetadata;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.estimated === true) return null;
  const prompt = raw.prompt_tokens ?? raw.input_tokens ?? raw.promptTokenCount;
  const thoughts = raw.thoughtsTokenCount ?? 0;
  const output = raw.completion_tokens ?? raw.output_tokens ?? raw.candidatesTokenCount ??
    (raw.totalTokenCount === undefined ? undefined : raw.totalTokenCount - prompt - thoughts);
  if (!Number.isSafeInteger(prompt) || prompt < 0 || !Number.isSafeInteger(output) || output < 0 ||
      !Number.isSafeInteger(thoughts) || thoughts < 0 || !Number.isSafeInteger(prompt + output + thoughts) || prompt + output + thoughts <= 0) return null;
  if (raw.total_tokens !== undefined && raw.total_tokens !== prompt + output) return null;
  if (raw.totalTokenCount !== undefined && raw.totalTokenCount !== prompt + output + thoughts) return null;
  const tokens = canonicalizeUsage(extractUsage(value));
  if (!tokens || tokens.usage_invalid === true || tokens.cache_write_invalid === true) return null;
  const tier = value?.response?.service_tier ?? value?.service_tier;
  return { ...structuredClone(raw), ...tokens, ...(typeof tier === "string" && tier ? { actualServiceTier: tier } : {}) };
}

export async function parseMediaError(response, observeUsage, signal) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let length = 0;
  const onAbort = () => { void reader?.cancel(signal.reason).catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) onAbort();
    while (reader && length < MAX_UPSTREAM_ERROR_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const piece = value.subarray(0, MAX_UPSTREAM_ERROR_BYTES - length);
      chunks.push(decoder.decode(piece, { stream: true }));
      length += piece.byteLength;
    }
  } catch {} finally {
    chunks.push(decoder.decode());
    signal?.removeEventListener("abort", onAbort);
    if (reader) {
      try { await reader.cancel(); } catch {}
      finally { reader.releaseLock(); }
    }
  }
  const text = chunks.join("");
  try { observeUsage?.(JSON.parse(text)); } catch {}
  return parseUpstreamError(new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers }));
}

// Map OpenAI size to provider-specific aspect ratio
export function sizeToAspectRatio(size) {
  if (!size || typeof size !== "string") return "1:1";
  const map = {
    "1024x1024": "1:1",
    "1024x1792": "9:16",
    "1792x1024": "16:9",
    "1024x1536": "2:3",
    "1536x1024": "3:2",
  };
  return map[size] || "1:1";
}

// Fetch URL → base64 (for providers returning image URLs)
export async function urlToBase64(url, signal) {
  signal?.throwIfAborted();
  const res = signal ? await fetch(url, { signal }) : await fetch(url);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`Failed to fetch image: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  signal?.throwIfAborted();
  return Buffer.from(buf).toString("base64");
}

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}
