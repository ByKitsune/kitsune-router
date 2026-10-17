// Build a base64 data URI from mime + base64 payload
export function encodeDataUri(mimeType, base64) {
  return `data:${mimeType};base64,${base64}`;
}

// Parse the header without scanning or copying the base64 payload.
export function parseDataUri(url) {
  if (typeof url !== "string" || !url.startsWith("data:")) return null;
  const separator = url.indexOf(";", 5);
  const dataStart = separator + 8;
  if (separator <= 5 || !url.startsWith(";base64,", separator) || dataStart >= url.length) return null;
  return { mimeType: url.slice(5, separator), base64: url.slice(dataStart) };
}

import { lookup } from "node:dns/promises";
import { Agent, fetch as undiciFetch } from "undici";
import { MAX_IMAGE_BYTES, FETCH_TIMEOUT_MS, IMAGE_SIGNATURES, BLOCKED_HOSTS } from "../../config/mediaConfig.js";

// True if an IPv4/IPv6 address is private/reserved (SSRF target).
function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip.includes(":")) {
    // Canonicalize expanded/dotted IPv6 before checking unspecified and mapped IPv4.
    try { ip = new URL(`http://[${ip}]/`).hostname.slice(1, -1); } catch { return true; }
    if (ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
    const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(ip);
    if (!mapped) return false;
    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    ip = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  const parts = ip.split(".").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

// Resolve host once and return only public IPs (SSRF guard).
// Rejects if any resolved record is private/reserved (defeats multi-A tricks).
async function resolvePinnedIps(hostname, signal) {
  if (!hostname || BLOCKED_HOSTS.has(hostname.toLowerCase()) || signal.aborted) return null;
  let onAbort;
  try {
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const records = await Promise.race([lookup(hostname, { all: true }), aborted]);
    if (signal.aborted || !records.length || records.some((r) => isPrivateIp(r.address))) return null;
    return records;
  } catch {
    return null;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

// Verify buffer magic bytes match a known image signature; return its mime or null.
export function detectImageMime(buf) {
  for (const { sig, offset, mime, verifyWebp } of IMAGE_SIGNATURES) {
    if (buf.length < offset + sig.length) continue;
    let match = true;
    for (let i = 0; i < sig.length; i++) {
      if (buf[offset + i] !== sig[i]) { match = false; break; }
    }
    if (!match) continue;
    // WEBP: RIFF....WEBP — bytes 8..11 must be "WEBP".
    if (verifyWebp && !(buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)) continue;
    return mime;
  }
  return null;
}

/**
 * Fetch a remote image URL and return it as a base64 data URI.
 * Hardened against SSRF (private/metadata IPs), memory DoS (size cap),
 * and disguised non-image payloads (magic-byte verification).
 * Returns null on any failure or rejection.
 *
 * @param {string} imageUrl - HTTP(S) URL of the image
 * @param {object} options - { signal, timeoutMs, maxBytes }
 * @returns {Promise<{url: string, mimeType: string}|null>}
 */
export async function fetchImageAsBase64(imageUrl, options = {}) {
  const { signal, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_IMAGE_BYTES } = options;
  if (!imageUrl || (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://"))) {
    return null;
  }

  let url;
  try { url = new URL(imageUrl); } catch { return null; }
  if (signal?.aborted) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  let dispatcher;
  try {
    const pinnedIps = await resolvePinnedIps(url.hostname, fetchSignal);
    if (!pinnedIps || fetchSignal.aborted) return null;

    // Pin connect to the validated IP so no second DNS resolution can rebind (TOCTOU fix).
    dispatcher = new Agent({
      connect: {
        lookup(_host, options, callback) {
          if (options.all) callback(null, pinnedIps);
          else callback(null, pinnedIps[0].address, pinnedIps[0].family);
        },
      },
    });
    // redirect:"manual" prevents a public URL redirecting to a private one (SSRF bypass).
    const response = await undiciFetch(imageUrl, { signal: fetchSignal, redirect: "manual", dispatcher });
    if (!response.ok || !response.body) return null;

    // Stream-read with a hard byte cap to avoid loading huge payloads into memory.
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } return null; }
      chunks.push(value);
    }

    const buf = Buffer.concat(chunks, total);
    const mimeType = detectImageMime(buf);
    if (!mimeType) return null; // not a recognized image — reject disguised payloads

    return { url: `data:${mimeType};base64,${buf.toString("base64")}`, mimeType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    dispatcher?.destroy().catch(() => {});
  }
}
