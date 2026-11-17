// Shared helpers for image provider adapters
import { setTimeout as delay } from "node:timers/promises";
import { canonicalizeUsage, extractUsage } from "../../utils/usageTracking.js";
import { MAX_UPSTREAM_ERROR_BYTES, parseUpstreamError } from "../../utils/error.js";
import { fetchImageAsBase64, parseDataUri } from "../../translator/concerns/image.js";
import { hasAccountProxyPolicy } from "../../utils/accountTransport.js";
import { IMAGE_POLLING_ORIGINS } from "../../config/imagePolling.js";

export const POLL_INTERVAL_MS = 1500;
export const POLL_TIMEOUT_MS = 120000;

export const sleep = (ms, signal) => delay(ms, undefined, { signal });

function imageRoutingError(message) {
  return Object.assign(new Error(message), { code: "unsafe_image_provider_route" });
}

export function assertImagePollingUrl(value, provider) {
  let url;
  try { url = new URL(value); } catch { throw imageRoutingError("Invalid image provider polling URL"); }
  if (typeof value !== "string" || url.protocol !== "https:" || url.username || url.password
    || !IMAGE_POLLING_ORIGINS[provider]?.includes(url.origin)) {
    throw imageRoutingError("Image provider polling URL is outside its allowed API origins");
  }
  return url.href;
}

// Account credentials cannot follow a provider redirect to a different route.
// The shared transport rejects redirects; retain the policy for custom callers.
export async function fetchImageProvider(transport, url, init = {}) {
  try {
    const response = await transport.fetch(url, { ...init, redirect: "error" });
    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => {});
      throw imageRoutingError("Image provider redirect refused");
    }
    return response;
  } catch (error) {
    // Native fetch exposes its redirect policy rejection as a TypeError with
    // this fixed cause. A response/malformed URL is handled above separately.
    if (error?.cause?.message === "unexpected redirect") throw imageRoutingError("Image provider redirect refused");
    throw error;
  }
}

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
  let complete = !reader;
  const onAbort = () => { void reader?.cancel(signal.reason).catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) onAbort();
    while (reader && length < MAX_UPSTREAM_ERROR_BYTES) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
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
  let validJson = false;
  try {
    const value = JSON.parse(text);
    validJson = !!value && typeof value === "object" && !Array.isArray(value);
    observeUsage?.(value);
  } catch {}
  const diagnostics = await parseUpstreamError(new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers }));
  return { ...diagnostics, bodyComplete: complete && validJson };
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

// Keep arbitrary image URLs behind the same pinned public-IP, byte-budget and
// image-signature policy used by chat media. A proxy cannot replace that guard.
export async function readImageUrl(url, signal, transport) {
  signal?.throwIfAborted();
  if (hasAccountProxyPolicy(transport?.proxyOptions)) {
    throw new Error("[ProxyFetch] Remote image downloads require inline data when an account proxy is configured");
  }
  const image = await fetchImageAsBase64(url, { signal });
  signal?.throwIfAborted();
  const parsed = image && parseDataUri(image.url);
  if (!parsed) throw Object.assign(new Error("Remote image download rejected or unavailable"), { code: "unsafe_image_asset" });
  return { base64: parsed.base64, mimeType: image.mimeType };
}

// Base64-only consumers (provider reference images) do not relabel the bytes.
export async function urlToBase64(url, signal, transport) {
  return (await readImageUrl(url, signal, transport)).base64;
}

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}
