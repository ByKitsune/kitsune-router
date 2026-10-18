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
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { MAX_IMAGE_BYTES, FETCH_TIMEOUT_MS, IMAGE_SIGNATURES, BLOCKED_HOSTS, BLOCKED_IMAGE_IPV4_RANGES, BLOCKED_IMAGE_IPV6_RANGES, IMAGE_EMBEDDED_IPV4_PREFIXES } from "../../config/mediaConfig.js";

const ipv4Number = (ip) => ip.split(".").reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
function ipv6Number(ip) {
  // URL canonicalization converts an embedded dotted IPv4 tail to hextets.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split("::");
  const head = left ? left.split(":") : [];
  const tail = right ? right.split(":") : [];
  const groups = right === undefined ? head : [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}
function ranges(cidrs, width, parse) {
  return cidrs.map((cidr) => {
    const [ip, bits] = cidr.split("/");
    const shift = BigInt(width - Number(bits));
    return { prefix: parse(ip) >> shift, shift };
  });
}
const blockedV4 = ranges(BLOCKED_IMAGE_IPV4_RANGES, 32, ipv4Number);
const blockedV6 = ranges(BLOCKED_IMAGE_IPV6_RANGES, 128, ipv6Number);
const embeddedV4 = IMAGE_EMBEDDED_IPV4_PREFIXES.map((ip) => ipv6Number(ip) >> 32n);
const inRanges = (ip, prefixes) => prefixes.some(({ prefix, shift }) => (ip >> shift) === prefix);

// True if an IPv4/IPv6 address is private/reserved (SSRF target).
function isPrivateIp(ip) {
  const family = isIP(ip);
  if (family === 4) return inRanges(ipv4Number(ip), blockedV4);
  if (family !== 6 || ip.includes("%")) return true;
  const value = ipv6Number(ip);
  if (embeddedV4.includes(value >> 32n)) return inRanges(value & 0xffffffffn, blockedV4);
  return inRanges(value, blockedV6);
}

// Resolve host once and return only public IPs (SSRF guard).
// Rejects if any resolved record is private/reserved (defeats multi-A tricks).
async function resolvePinnedIps(hostname, signal) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host) || signal.aborted) return null;
  const family = isIP(host);
  if (family) return isPrivateIp(host) ? null : [{ address: host, family }];
  let onAbort;
  try {
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const records = await Promise.race([lookup(hostname, { all: true }), aborted]);
    if (signal.aborted || !Array.isArray(records) || !records.length ||
        records.some((r) => isIP(r.address) !== r.family || isPrivateIp(r.address))) return null;
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
