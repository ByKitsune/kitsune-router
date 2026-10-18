// SSRF guard: block internal/private/metadata targets for server-side fetch.
//
// Three layers, each closing a distinct bypass class documented in #3714:
//   1. assertPublicUrl        - synchronous literal-IP/hostname checks (cheap, for
//                                immediate rejection of obviously-bad input at request-build time).
//   2. assertPublicUrlResolved - adds DNS resolution so a hostname that merely
//                                *resolves* to a private/loopback address (e.g. a
//                                nip.io/sslip.io wildcard-DNS domain, or an attacker's
//                                own domain pointed at 127.0.0.1) is also rejected.
//   3. fetchPublic             - pins that validated DNS snapshot to the socket
//                                lookup, preserving the hostname for Host/TLS.
//                                Every redirect gets its own validated snapshot;
//                                patched global/proxy fetch cannot bypass it.

import dns from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch, Response } from "undici";

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);
const BLOCKED_SUFFIXES = [".internal", ".local", ".localhost"];
// DNS rebinding services that resolve to private IPs (CWE-918)
const BLOCKED_DNS_REBINDING_SUFFIXES = [".nip.io", ".sslip.io", ".xip.io"];
const BLOCKED_DNS_REBINDING_HOSTS = new Set(["localtest.me"]);

// Parse dotted IPv4 to 32-bit integer, or null if not a valid IPv4 literal.
function ipv4ToInt(host) {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

// Parse alternative numeric IPv4 encodings (CWE-918): decimal, octal, hex.
// Examples: 2130706433 (decimal), 0x7f000001 (hex), 0177.0.0.1 (octal), 0x7f.0.0.1 (mixed)
function parseOctetVariant(part) {
  if (/^0x[0-9a-f]+$/i.test(part)) return parseInt(part, 16);
  if (/^0[0-7]+$/.test(part) && part.length > 1) return parseInt(part, 8);
  if (/^\d+$/.test(part)) return Number(part);
  return NaN;
}

function parseAlternativeIpv4(host) {
  // Pure 32-bit decimal: 2130706433 -> 127.0.0.1
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (n >= 0 && n <= 0xffffffff) {
      return n >>> 0;
    }
    return null;
  }
  // Pure hex 32-bit: 0x7f000001
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = parseInt(host, 16);
    if (n >= 0 && n <= 0xffffffff) return n >>> 0;
    return null;
  }
  // Dotted variants with hex/octal octets
  if (host.includes(".")) {
    const parts = host.split(".");
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
      const octet = parseOctetVariant(part);
      if (!Number.isFinite(octet) || octet < 0 || octet > 255) return null;
      value = value * 256 + octet;
    }
    return value >>> 0;
  }
  return null;
}

// Private/reserved IPv4 ranges as [startInt, maskBits].
const BLOCKED_V4_RANGES = [
  [ipv4ToInt("0.0.0.0"), 8],       // Current network (RFC 1122)
  [ipv4ToInt("10.0.0.0"), 8],      // Private network (RFC 1918)
  [ipv4ToInt("100.64.0.0"), 10],   // Shared Address Space / CGNAT (RFC 6598)
  [ipv4ToInt("127.0.0.0"), 8],     // Loopback (RFC 1122)
  [ipv4ToInt("169.254.0.0"), 16],  // Link-local / Cloud Metadata (RFC 3927)
  [ipv4ToInt("172.16.0.0"), 12],   // Private network (RFC 1918)
  [ipv4ToInt("192.0.0.0"), 24],    // IETF Protocol Assignments (RFC 6890)
  [ipv4ToInt("192.0.2.0"), 24],    // Documentation TEST-NET-1 (RFC 5737)
  [ipv4ToInt("192.168.0.0"), 16],  // Private network (RFC 1918)
  [ipv4ToInt("198.18.0.0"), 15],   // Benchmarking (RFC 2544)
  [ipv4ToInt("198.51.100.0"), 24], // Documentation TEST-NET-2 (RFC 5737)
  [ipv4ToInt("203.0.113.0"), 24],  // Documentation TEST-NET-3 (RFC 5737)
  [ipv4ToInt("224.0.0.0"), 4],     // Multicast (RFC 5771)
  [ipv4ToInt("240.0.0.0"), 4],     // Reserved for Future Use (RFC 1112)
];

function isBlockedIpv4Int(ip) {
  return BLOCKED_V4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ip & mask) === (base & mask);
  });
}

export function isBlockedIpv4(host) {
  const ip = ipv4ToInt(host);
  if (ip === null) return false;
  return isBlockedIpv4Int(ip);
}

export function isBlockedAlternativeIpv4(host) {
  const ip = parseAlternativeIpv4(host);
  if (ip === null) return false;
  return isBlockedIpv4Int(ip);
}

function parseHextets(s) {
  if (s === "") return [];
  const segs = s.split(":");
  const out = [];
  for (const seg of segs) {
    if (!/^[0-9a-f]{1,4}$/.test(seg)) return null;
    out.push(parseInt(seg, 16));
  }
  return out;
}

// Parse any textual IPv6 representation (including an embedded dotted-IPv4 tail,
// "::" compression in any position, and full/partial forms) into 8 16-bit groups.
// Returns null if the string isn't a valid IPv6 literal. Parsing into groups once
// and reasoning about the numeric value — rather than pattern-matching the source
// string — is what makes this immune to "which textual form did the URL parser
// pick" bugs: "::ffff:127.0.0.1" and "::ffff:7f00:1" produce identical groups.
function parseIPv6ToGroups(rawHost) {
  let host = rawHost.toLowerCase();

  const v4TailMatch = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  let v4Groups = null;
  if (v4TailMatch) {
    const v4Int = ipv4ToInt(v4TailMatch[1]);
    if (v4Int === null) return null;
    v4Groups = [(v4Int >>> 16) & 0xffff, v4Int & 0xffff];
    host = host.slice(0, host.length - v4TailMatch[1].length);
    if (host.endsWith("::")) {
      // "::" compression marker itself — leave both colons, the removed IPv4
      // fills the gap it represents.
    } else if (host.endsWith(":")) {
      host = host.slice(0, -1); // was just the "prevgroup:ipv4" separator
    }
  }

  const doubleColonParts = host.split("::");
  if (doubleColonParts.length > 2) return null;

  let groups;
  if (doubleColonParts.length === 2) {
    const head = parseHextets(doubleColonParts[0]);
    const tail = parseHextets(doubleColonParts[1]);
    if (head === null || tail === null) return null;
    const v4Len = v4Groups ? v4Groups.length : 0;
    const missing = 8 - head.length - tail.length - v4Len;
    if (missing < 0) return null;
    groups = [...head, ...new Array(missing).fill(0), ...tail, ...(v4Groups || [])];
  } else {
    const all = parseHextets(host);
    if (all === null) return null;
    groups = [...all, ...(v4Groups || [])];
  }
  return groups.length === 8 ? groups : null;
}

function isBlockedIpv6Groups(g) {
  const isZero = (n) => g[n] === 0;
  // loopback ::1
  if ([0, 1, 2, 3, 4, 5, 6].every(isZero) && g[7] === 1) return true;
  // unspecified ::
  if (g.every((x) => x === 0)) return true;
  // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfe80) return true;
  // unique local fc00::/7
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  // multicast ff00::/8
  if ((g[0] & 0xff00) === 0xff00) return true;
  // fec0::/10 Site-local (deprecated but still routable in some stacks)
  if ((g[0] & 0xffc0) === 0xfec0) return true;
  // IPv4-mapped ::ffff:0:0/96 (0:0:0:0:0:ffff:a.b.c.d — the 0xffff marker is
  // group index 5) and NAT64 well-known prefix 64:ff9b::/96 — both embed a
  // real IPv4 address in the low 32 bits; check it against the same IPv4
  // blocklist regardless of which prefix wraps it.
  const low32 = ((g[6] << 16) | g[7]) >>> 0;
  if ([0, 1, 2, 3, 4].every(isZero) && g[5] === 0xffff) return isBlockedIpv4Int(low32);
  if (g[0] === 0x0064 && g[1] === 0xff9b && [2, 3, 4, 5].every(isZero)) return isBlockedIpv4Int(low32);
  // IPv4-compatible ::a.b.c.d/96 (deprecated, still parseable) — excludes :: and ::1
  // which already matched above.
  if ([0, 1, 2, 3, 4, 5].every(isZero) && low32 !== 0 && low32 !== 1) return isBlockedIpv4Int(low32);
  return false;
}

export function isBlockedIpv6(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  const groups = parseIPv6ToGroups(h);
  if (groups) return isBlockedIpv6Groups(groups);
  // Fallback for non-standard textual forms not parsed as 8 groups — check old patterns
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fec") || h.startsWith("fed") || h.startsWith("fee") || h.startsWith("fef")) return true;
  return (
    h.startsWith("fe80:") ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("ff")
  );
}

export function assertPublicIp(ip) {
  if (isBlockedIpv4(ip)) throw new Error("Blocked URL: private IP");
  if (isBlockedAlternativeIpv4(ip)) throw new Error("Blocked URL: private IP (alt encoding)");
  if (isBlockedIpv6(ip)) throw new Error("Blocked URL: private IP");
}

function normalizeHost(hostname) {
  // A trailing dot marks an FQDN and is semantically insignificant
  // ("localhost." and "localhost" are the same host) but was being compared
  // as a literal character, letting it slip past every string-based check.
  return hostname.toLowerCase().replace(/\.+$/, "");
}

function isBlockedHost(host) {
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_DNS_REBINDING_HOSTS.has(host)) return true;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (BLOCKED_DNS_REBINDING_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (isBlockedIpv4(host)) return true;
  if (isBlockedAlternativeIpv4(host)) return true;
  if (host.includes(":")) {
    const groups = parseIPv6ToGroups(host.replace(/^\[|\]$/g, ""));
    if (groups && isBlockedIpv6Groups(groups)) return true;
    // Fallback to legacy string check for edge forms
    if (isBlockedIpv6(host)) return true;
  }
  return false;
}

// Fast synchronous validation: protocol, blocked hostnames, and IP literals.
export function assertPublicUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked URL: unsupported protocol ${parsed.protocol}`);
  }
  const host = normalizeHost(parsed.hostname);
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new Error("Blocked URL: internal host");
  }
  if (BLOCKED_DNS_REBINDING_HOSTS.has(host) || BLOCKED_DNS_REBINDING_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new Error("Blocked URL: private IP (DNS rebinding host)");
  }
  if (isBlockedIpv4(host) || isBlockedAlternativeIpv4(host)) {
    throw new Error("Blocked URL: private IP");
  }
  if (host.includes(":")) {
    const groups = parseIPv6ToGroups(host.replace(/^\[|\]$/g, ""));
    if (groups ? isBlockedIpv6Groups(groups) : isBlockedIpv6(host)) {
      throw new Error("Blocked URL: private IP");
    }
  }
  // Fallback generic check (covers any other blocked host patterns)
  if (isBlockedHost(host)) throw new Error("Blocked URL: internal host");
}

// Resolve one immutable address snapshot. The transport must use this snapshot,
// not perform another DNS lookup after validation (DNS rebinding / TOCTOU).
async function resolveUrl(rawUrl, allowPrivate = false, signal) {
  if (allowPrivate) assertNotCloudMetadata(rawUrl);
  else assertPublicUrl(rawUrl);
  const parsed = new URL(rawUrl);
  const host = normalizeHost(parsed.hostname).replace(/^\[|\]$/g, "");
  const family = isIP(host);
  if (family) return [{ address: host, family }];

  let addresses;
  let onAbort;
  try {
    const resolution = dns.promises.lookup(host, { all: true, verbatim: true });
    addresses = signal ? await Promise.race([
      resolution,
      new Promise((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }),
    ]) : await resolution;
  } catch {
    signal?.throwIfAborted();
    throw new Error("Blocked URL: DNS resolution failed");
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
  if (!Array.isArray(addresses) || !addresses.length) throw new Error("Blocked URL: DNS returned no addresses");
  for (const { address, family: addressFamily } of addresses) {
    if (!isIP(address) || isIP(address) !== addressFamily) {
      throw new Error("Blocked URL: invalid DNS address");
    }
    if (allowPrivate) {
      assertNotCloudMetadata(`http://${addressFamily === 6 ? `[${address}]` : address}/`);
    } else {
      assertPublicIp(address);
    }
  }
  return addresses;
}

// Validation-only API: keep its historical void return value. A later fetch
// needs its own pinned snapshot; validation alone does not secure a transport.
export async function assertPublicUrlResolved(rawUrl) {
  await resolveUrl(rawUrl);
}

// Backward-compat alias for callers still importing assertPublicUrlAsync
export function assertPublicUrlAsync(rawUrl) {
  return assertPublicUrlResolved(rawUrl);
}

function isMetadataIpv4Int(ip) {
  // Link-local metadata and Alibaba's metadata endpoint in shared address space.
  return (ip >>> 16) === 0xa9fe || ip === 0x646464c8;
}

// Trusted-local access still excludes metadata, including IPv4 embedded in IPv6.
export function assertNotCloudMetadata(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked URL: unsupported protocol ${parsed.protocol}`);
  }
  const host = normalizeHost(parsed.hostname);
  if (
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host === "instance-data" ||
    host.endsWith(".metadata.google.internal")
  ) {
    throw new Error("Blocked URL: cloud metadata host");
  }

  const bracketless = host.replace(/^\[|\]$/g, "");
  const ip4 = ipv4ToInt(bracketless) ?? parseAlternativeIpv4(bracketless);
  if (ip4 !== null && isMetadataIpv4Int(ip4)) {
    throw new Error("Blocked URL: cloud metadata IP");
  }

  if (bracketless.includes(":")) {
    const groups = parseIPv6ToGroups(bracketless);
    if (groups) {
      const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
      const compatible = groups.slice(0, 6).every((group) => group === 0);
      const nat64 = groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0);
      const low32 = ((groups[6] << 16) | groups[7]) >>> 0;
      if ((mapped || compatible || nat64) && isMetadataIpv4Int(low32)) {
        throw new Error("Blocked URL: cloud metadata IP");
      }
      if (groups[0] === 0xfd00 && groups[1] === 0xec2 &&
          groups.slice(2, 7).every((group) => group === 0) && groups[7] === 0x254) {
        throw new Error("Blocked URL: cloud metadata IP");
      }
      if ((groups[0] & 0xffc0) === 0xfe80) {
        throw new Error("Blocked URL: link-local IPv6");
      }
    }
  }
}

function createPinnedAgent(addresses) {
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        const family = typeof options === "number" ? options : options.family;
        const candidates = family ? addresses.filter((entry) => entry.family === family) : addresses;
        if (!candidates.length) {
          callback(new Error("Blocked URL: no validated address for requested family"));
        } else if (options.all) {
          callback(null, candidates);
        } else {
          callback(null, candidates[0].address, candidates[0].family);
        }
      },
    },
  });
}

// Response ownership follows the caller's stream lifetime, not fetch's header
// completion. This also handles readers, text/json, clone(), cancel and abort.
function ownResponse(response, agent, signal) {
  let released = false;
  const release = (abort = false) => {
    if (released) return Promise.resolve();
    released = true;
    signal?.removeEventListener("abort", onAbort);
    return (abort ? agent.destroy() : agent.close()).catch(() => {});
  };
  const onAbort = () => { void release(true); };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  if (!response.body) {
    void release();
    return response;
  }
  const reader = response.body.getReader();
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await release();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        await release(true);
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await release();
      }
    },
  }, { highWaterMark: 0 });
  const owned = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  for (const key of ["url", "type", "redirected"]) {
    Object.defineProperty(owned, key, { value: response[key] });
  }
  return owned;
}

// Use Undici directly: global fetch may have been replaced by a proxy wrapper
// which ignores dispatchers. Each redirect gets a new validated, pinned Agent.
export async function fetchPublic(url, init = {}, options = {}) {
  return fetchGuarded(url, init, options);
}

// Callers must establish peer trust before selecting this private-network policy.
export async function fetchTrustedLocal(url, init = {}, options = {}) {
  return fetchGuarded(url, init, options, true);
}

async function fetchGuarded(url, init, { maxRedirects = 5 } = {}, allowPrivate = false) {
  const getProxyUrl = allowPrivate ? (await import("open-sse/utils/proxyFetch.js")).getEnvProxyUrl : null;
  let currentUrl = new URL(url);
  let currentInit = { ...init, headers: new Headers(init.headers) };
  for (let hop = 0; ; hop++) {
    currentInit.signal?.throwIfAborted();
    if (allowPrivate) {
      assertNotCloudMetadata(currentUrl);
      // A proxy resolves targets itself, bypassing this pinned DNS boundary.
      if (getProxyUrl(currentUrl)) {
        throw new Error("Blocked URL: configured proxy cannot validate metadata targets; configure NO_PROXY for this trusted server");
      }
    }
    const addresses = await resolveUrl(currentUrl, allowPrivate, currentInit.signal);
    currentInit.signal?.throwIfAborted();
    const agent = createPinnedAgent(addresses);
    let response;
    try {
      response = ownResponse(await undiciFetch(currentUrl, {
        ...currentInit,
        dispatcher: agent,
        redirect: "manual",
      }), agent, currentInit.signal);
    } catch (error) {
      await agent.destroy().catch(() => {});
      throw error;
    }
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    const location = isRedirect ? response.headers.get("location") : null;
    if (!location) return response;
    await response.body?.cancel();
    if (hop >= maxRedirects) throw new Error("Blocked URL: too many redirects");
    const nextUrl = new URL(location, currentUrl);
    const method = (currentInit.method || "GET").toUpperCase();
    const rewriteToGet = ((response.status === 301 || response.status === 302) && method === "POST") ||
      (response.status === 303 && method !== "GET" && method !== "HEAD");
    const headers = new Headers(currentInit.headers);
    if (rewriteToGet) {
      currentInit = { ...currentInit, method: "GET", body: undefined };
      for (const name of ["content-encoding", "content-language", "content-location", "content-type", "content-length"]) {
        headers.delete(name);
      }
    }
    if (nextUrl.origin !== currentUrl.origin) {
      // A 307/308 must not carry credential-bearing POST bodies to another
      // origin. Refuse rather than silently change its method/semantics.
      if (currentInit.body != null) throw new Error("Blocked URL: cross-origin body redirect");
      for (const name of ["authorization", "proxy-authorization", "cookie", "cookie2", "x-api-key", "api-key", "x-goog-api-key", "mcp-session-id", "host"]) {
        headers.delete(name);
      }
    }
    currentInit = { ...currentInit, headers };
    currentUrl = nextUrl;
  }
}
