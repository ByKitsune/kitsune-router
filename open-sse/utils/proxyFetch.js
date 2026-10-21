import { Readable } from "stream";
import tls from "tls";
import { MEMORY_CONFIG, FETCH_CONNECT_TIMEOUT_MS } from "../config/runtimeConfig.js";
import { dbg } from "./debugLog.js";

let originalFetch = globalThis.fetch;
const proxyDispatchers = new Map();
let defaultUndiciAgent = null;

export async function getDefaultAgent() {
  if (!defaultUndiciAgent) {
    try {
      const { Agent, Dispatcher1Wrapper } = await import("undici");
      // Node's built-in fetch still uses Undici's legacy dispatcher handlers.
      defaultUndiciAgent = new Dispatcher1Wrapper(new Agent({
        keepAliveTimeout: 30000,
        keepAliveMaxTimeout: 60000,
        pipelining: 1,
        connections: 50,
      }));
    } catch {
      defaultUndiciAgent = null;
    }
  }
  return defaultUndiciAgent;
}

// ─── TLS fingerprinting via got-scraping (browser-like JA3) ───────────────
// Disabled: not in use. Kept commented for future re-enable.
// Restore the original block to re-enable per-host JA3 spoofing.
/*
let _gotScraping = null;
let _gotScrapingChecked = false;
const _gotScrapingLoggedHosts = new Set();

async function getGotScraping() {
  if (_gotScrapingChecked) return _gotScraping;
  _gotScrapingChecked = true;
  try {
    const mod = await import("got-scraping");
    _gotScraping = typeof mod.gotScraping === "function" ? mod.gotScraping : null;
    if (_gotScraping) dbg("TLS", "got-scraping loaded (browser-like JA3 enabled)");
  } catch (e) {
    console.warn(`[ProxyFetch] got-scraping unavailable, falling back to native fetch: ${e.message}`);
    _gotScraping = null;
  }
  return _gotScraping;
}

async function gotScrapingFetch(url, options) {
  const gs = await getGotScraping();
  if (!gs) return null;

  const method = (options.method || "GET").toUpperCase();
  const headersInit = options.headers || {};
  const headers = headersInit instanceof Headers
    ? Object.fromEntries(headersInit.entries())
    : { ...headersInit };

  return new Promise((resolve, reject) => {
    let settled = false;
    const stream = gs.stream({
      url,
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : options.body,
      throwHttpErrors: false,
      retry: { limit: 0 },
      timeout: { request: undefined },
      followRedirect: false,
      decompress: true,
    });

    if (options.signal) {
      const onAbort = () => { try { stream.destroy(new Error("aborted")); } catch { } };
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    stream.once("response", (res) => {
      if (settled) return;
      settled = true;
      const resHeaders = new Headers();
      for (const [k, v] of Object.entries(res.headers || {})) {
        if (Array.isArray(v)) v.forEach((x) => resHeaders.append(k, String(x)));
        else if (v != null) resHeaders.set(k, String(v));
      }
      const body = Readable.toWeb(stream);
      resolve(new Response(body, { status: res.statusCode, statusText: res.statusMessage || "", headers: resHeaders }));
    });

    stream.once("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

async function tryGotScrapingFetch(url, options) {
  try {
    const res = await gotScrapingFetch(url, options);
    if (res) {
      try {
        const host = new URL(typeof url === "string" ? url : url.toString()).hostname;
        if (!_gotScrapingLoggedHosts.has(host)) {
          _gotScrapingLoggedHosts.add(host);
          dbg("TLS", `using got-scraping for ${host}`);
        }
      } catch { }
    }
    return res;
  } catch (e) {
    console.warn(`[ProxyFetch] got-scraping request failed, fallback to native fetch: ${e.message}`);
    return null;
  }
}
*/

// DNS cache — use Map to avoid prototype pollution via malformed hostnames
const DNS_CACHE = new Map();
const MITM_BYPASS_HOSTS = [
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.googleapis.com",
  "api.individual.githubcopilot.com",
  "q.us-east-1.amazonaws.com",
  "codewhisperer.us-east-1.amazonaws.com",
  "api2.cursor.sh",
];
const GOOGLE_DNS_SERVERS = ["8.8.8.8", "8.8.4.4"];

// MITM bypass negative cache: when direct-IP attempts fail (VPN/proxy networks
// refuse them), stop retrying per host for a cooldown window so requests don't
// pay a failed connect every time. Set DISABLE_MITM_BYPASS=1 to disable entirely.
const MITM_BYPASS_COOLDOWN_MS = 15 * 60 * 1000;
const MITM_BYPASS_DISABLED = process.env.DISABLE_MITM_BYPASS === "1";
// Shared across module instances (custom-server + Next server can each load
// this file) so a failure learned by one silences all of them.
const mitmBypassCooldown = (globalThis.__mitmBypassCooldown ??= new Map()); // host → retry-after

function markMitmBypassCooldown(host) {
  mitmBypassCooldown.set(host, Date.now() + MITM_BYPASS_COOLDOWN_MS);
}

function isMitmBypassOnCooldown(targetUrl) {
  if (MITM_BYPASS_DISABLED) return true;
  let host;
  try { host = new URL(targetUrl).hostname; } catch { return false; }
  const until = mitmBypassCooldown.get(host);
  if (!until) return false;
  if (Date.now() >= until) { mitmBypassCooldown.delete(host); return false; }
  return true;
}
const HTTPS_PORT = 443;
const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 300;

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function throwIfCancelled(signal, error) {
  if (signal?.aborted) throw signal.reason ?? error ?? new DOMException("Aborted", "AbortError");
  if (error?.name === "AbortError" || error?.message === "aborted" || error?.code === "ABORT_ERR") throw error;
}

/**
 * Resolve real IP using Google DNS (bypass system DNS)
 */
async function resolveRealIP(hostname) {
  const cached = DNS_CACHE.get(hostname);
  if (cached && Date.now() < cached.expiry) return cached.ip;

  try {
    const dns = await import("dns");
    const { promisify } = await import("util");
    const resolver = new dns.Resolver();
    resolver.setServers(GOOGLE_DNS_SERVERS);
    const resolve4 = promisify(resolver.resolve4.bind(resolver));
    const addresses = await resolve4(hostname);
    DNS_CACHE.set(hostname, { ip: addresses[0], expiry: Date.now() + MEMORY_CONFIG.dnsCacheTtlMs });
    return addresses[0];
  } catch {
    console.warn(`[ProxyFetch] DNS resolve failed for ${hostname}`);
    return null;
  }
}

/**
 * Check if request should bypass MITM DNS redirect
 */
function shouldBypassMitmDns(url) {
  try {
    const hostname = new URL(url).hostname;
    return MITM_BYPASS_HOSTS.includes(hostname);
  } catch { return false; }
}

export function isLoopbackTarget(targetUrl) {
  let hostname;
  try { hostname = new URL(targetUrl).hostname.toLowerCase(); } catch { return false; }
  const host = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;

  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (hexMapped) return ((parseInt(hexMapped[1], 16) >> 8) & 0xff) === 127;

  const dottedMapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  const ipv4 = dottedMapped ? dottedMapped[1] : host;
  return /^127(?:\.\d{1,3}){3}$/.test(ipv4);
}

function shouldBypassByNoProxy(targetUrl, noProxyValue) {
  const noProxy = normalizeString(noProxyValue);
  if (!noProxy) return false;

  let hostname;
  try { hostname = new URL(targetUrl).hostname.toLowerCase(); } catch { return false; }
  const patterns = noProxy.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);

  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.startsWith(".")) return hostname.endsWith(pattern) || hostname === pattern.slice(1);
    return hostname === pattern || hostname.endsWith(`.${pattern}`);
  });
}

/**
 * Get an applicable proxy URL from the environment. An unset proxy or explicit
 * exclusion permits direct transport; a selected proxy's failure does not.
 */
export function getEnvProxyUrl(targetUrl) {
  if (isLoopbackTarget(targetUrl)) return null;
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  if (shouldBypassByNoProxy(targetUrl, noProxy)) return null;

  let protocol;
  try { protocol = new URL(targetUrl).protocol; } catch { return null; }

  if (protocol === "https:") {
    return process.env.HTTPS_PROXY || process.env.https_proxy ||
      process.env.ALL_PROXY || process.env.all_proxy;
  }

  return process.env.HTTP_PROXY || process.env.http_proxy ||
    process.env.ALL_PROXY || process.env.all_proxy;
}

/**
 * Normalize proxy URL (allow host:port)
 */
function normalizeProxyUrl(proxyUrl) {
  const normalizedInput = normalizeString(proxyUrl);
  if (!normalizedInput) return null;

  try {

    new URL(normalizedInput);
    return normalizedInput;
  } catch {
    // Allow "127.0.0.1:7890" style values
    return `http://${normalizedInput}`;
  }
}

export function resolveConnectionProxyUrl(targetUrl, proxyOptions) {
  const enabled = proxyOptions?.enabled === true || proxyOptions?.connectionProxyEnabled === true;
  if (!enabled) return null;
  if (isLoopbackTarget(targetUrl)) return null;

  const proxyUrlRaw = normalizeString(proxyOptions?.url ?? proxyOptions?.connectionProxyUrl);
  if (!proxyUrlRaw) return null;

  const noProxy = normalizeString(proxyOptions?.noProxy ?? proxyOptions?.connectionNoProxy);
  if (noProxy && shouldBypassByNoProxy(targetUrl, noProxy)) return null;

  return normalizeProxyUrl(proxyUrlRaw);
}

/**
 * Create proxy dispatcher lazily (undici-compatible)
 */
async function getDispatcher(proxyUrl) {
  const normalized = normalizeProxyUrl(proxyUrl);
  if (!normalized) return null;

  if (!proxyDispatchers.has(normalized)) {
    // Evict oldest entry if max size reached — destroy socket to avoid FD leak (#3629)
    if (proxyDispatchers.size >= MEMORY_CONFIG.proxyDispatchersMaxSize) {
      const oldestKey = proxyDispatchers.keys().next().value;
      const oldest = proxyDispatchers.get(oldestKey);
      try { oldest?.destroy?.(); oldest?.close?.(); } catch {}
      proxyDispatchers.delete(oldestKey);
    }
    const { ProxyAgent, Dispatcher1Wrapper } = await import("undici");
    proxyDispatchers.set(normalized, new Dispatcher1Wrapper(new ProxyAgent({
      uri: normalized,
      // Preserve the pre-v8 CONNECT behavior for both HTTP and HTTPS targets.
      proxyTunnel: true,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    })));
  }

  return proxyDispatchers.get(normalized);
}

/**
 * Create HTTPS request with manual socket connection (bypass DNS)
 */
async function createBypassRequest(parsedUrl, realIP, options) {
  const httpsModule = await import("https");
  const netModule = await import("net");
  // CJS modules expose exports via .default in ESM dynamic import context
  const https = httpsModule.default ?? httpsModule;
  const net = netModule.default ?? netModule;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    // Bounded connect/idle timeout — a hung socket would otherwise pin the
    // request promise indefinitely (the surrounding fetch path doesn't impose
    // a default deadline).
    socket.setTimeout(FETCH_CONNECT_TIMEOUT_MS);

    // Honor caller abort: destroy the socket so the in-flight TLS handshake
    // and any pending body write are torn down instead of leaking.
    let abortHandler = null;
    const onAbort = () => {
      try { socket.destroy(new Error("aborted")); } catch { /* socket already closed */ }
    };
    if (options.signal) {
      if (options.signal.aborted) {
        socket.destroy();
        reject(new Error("aborted"));
        return;
      }
      abortHandler = onAbort;
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    const cleanup = () => {
      socket.removeListener("error", onSocketError);
      socket.removeListener("timeout", onSocketTimeout);
      if (abortHandler && options.signal) {
        options.signal.removeEventListener("abort", abortHandler);
      }
    };

    const onSocketError = (err) => { cleanup(); reject(err); };
    const onSocketTimeout = () => {
      cleanup();
      socket.destroy(new Error("Bypass request socket timed out"));
    };
    socket.on("error", onSocketError);
    socket.on("timeout", onSocketTimeout);

    // Honor an explicit port from the URL (e.g. test servers on 127.0.0.1:<random>)
    const bypassPort = parsedUrl.port ? Number(parsedUrl.port) : HTTPS_PORT;
    socket.connect(bypassPort, realIP, () => {
      // Wrap the pre-connected TCP socket in TLS ourselves. Passing `socket`
      // directly to https.request is not supported by modern Node — the
      // documented hook is createConnection.
      const isIpHost = net.isIP(parsedUrl.hostname) !== 0;
      const tlsOptions = {
        socket,
        ...(isIpHost ? {} : { servername: parsedUrl.hostname }),
      };
      if (options.rejectUnauthorized !== undefined) {
        // Explicit opt-out hook for hermetic fixtures against self-signed
        // local servers. Production calls leave this unset → full public-CA
        // verification stays enforced.
        tlsOptions.rejectUnauthorized = options.rejectUnauthorized;
      }
      const tlsSocket = tls.connect(tlsOptions);

      const reqOptions = {
        createConnection: () => tlsSocket,
        // SNI + cert hostname are validated against the hostname the caller
        // asked for, not the IP we connected to. This keeps the DNS-bypass
        // (avoiding /etc/hosts MITM) while still rejecting on-path attackers
        // that present a different cert. The MITM_BYPASS_HOSTS targets are
        // all public-CA-issued (Google / GitHub / AWS / Cursor) so default
        // verification works without any extra trust store.
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || "POST",
        headers: {
          ...options.headers,
          Host: parsedUrl.host,
        },
      };

      let settled = false;
      const req = https.request(reqOptions, (res) => {
        if (settled) return;
        settled = true;
        cleanup();
        // Normalize Node's lowercased header record into a real Headers
        // instance. A bare Map looks similar but breaks downstream consumers
        // that hand `response.headers` to `new Response(...)` (Map isn't a
        // valid HeadersInit) or that call case-insensitive `.get()`.
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) v.forEach((x) => headers.append(k, String(x)));
          else if (v != null) headers.set(k, String(v));
        }
        // Drain the response body once into a Buffer so the various body
        // accessors all agree on the same bytes and we don't race the
        // underlying Readable. Whoever consumes first wins; subsequent
        // accessors replay the cached buffer.
        let bodyPromise = null;
        const readAll = () => {
          if (!bodyPromise) {
            bodyPromise = (async () => {
              const chunks = [];
              for await (const chunk of res) chunks.push(chunk);
              return Buffer.concat(chunks);
            })();
          }
          return bodyPromise;
        };
        const bodyStream = Readable.toWeb(res);
        const response = {
          ok: res.statusCode >= HTTP_SUCCESS_MIN && res.statusCode < HTTP_SUCCESS_MAX,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers,
          body: bodyStream,
          text: async () => (await readAll()).toString(),
          json: async () => JSON.parse(await (await readAll()).toString()),
          arrayBuffer: async () => {
            const buf = await readAll();
            // Hand back a tight ArrayBuffer covering exactly the response
            // bytes — Buffer#buffer is a wider pool view, .slice() copies
            // the used region into a standalone ArrayBuffer.
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          },
        };
        resolve(response);
      });

      req.on("error", (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });
      if (options.body) {
        if (typeof options.body === "string" || Buffer.isBuffer(options.body)) {
          req.write(options.body);
        } else {
          req.write(JSON.stringify(options.body));
        }
      }
      req.end();
    });
  });
}

/**
 * Internal export so unit tests can drive the bypass path against a local
 * HTTPS server without spinning up the full global fetch monkey-patch.
 * Not part of the supported public API.
 */
export const __testing = { createBypassRequest };

export async function proxyAwareFetch(url, options = {}, proxyOptions = null) {
  throwIfCancelled(options.signal);
  const targetUrl = typeof url === "string" ? url : url.toString();
  const fetchImpl = globalThis.fetch !== patchedFetch ? globalThis.fetch : originalFetch;
  const connectionProxyEnabled = proxyOptions?.enabled === true || proxyOptions?.connectionProxyEnabled === true;
  const poolId = normalizeString(proxyOptions?.proxyPoolId ?? proxyOptions?.connectionProxyPoolId);
  const hasPool = !!poolId && poolId !== "__none__";
  const configuredRelayUrl = normalizeString(proxyOptions?.vercelRelayUrl);
  const hasConfiguredProxy = connectionProxyEnabled || hasPool || !!configuredRelayUrl;
  const noProxy = proxyOptions?.noProxy ?? proxyOptions?.connectionNoProxy;
  // Relays have always supported explicit loopback targets; only ordinary
  // connection/environment proxies carry the automatic loopback exclusion.
  const excluded = (!configuredRelayUrl && isLoopbackTarget(targetUrl)) ||
    (hasConfiguredProxy && shouldBypassByNoProxy(targetUrl, noProxy));
  const vercelRelayUrl = excluded ? "" : configuredRelayUrl;
  const connectionProxyUrl = excluded ? null : resolveConnectionProxyUrl(targetUrl, proxyOptions);
  // Account exclusions are intentional direct routes, not a request to try an
  // environment proxy instead. An unusable selected account proxy is not an
  // unconfigured route either, even when strictProxy is false.
  const envProxyUrl = hasConfiguredProxy || excluded ? null : normalizeProxyUrl(getEnvProxyUrl(targetUrl));
  const proxyUrl = connectionProxyUrl || envProxyUrl;

  if (proxyOptions?.strictProxy === true && !proxyUrl && !vercelRelayUrl) {
    throw new Error("[ProxyFetch] Proxy required but no proxy URL configured (strictProxy=true)");
  }
  if (hasConfiguredProxy && !excluded && !proxyUrl && !vercelRelayUrl) {
    throw new Error("[ProxyFetch] Configured proxy unavailable; direct egress is disabled");
  }

  // Vercel relay: forward request via relay headers
  if (vercelRelayUrl) {
    try {
      const parsed = new URL(targetUrl);
      const relayHeaders = {
        ...options.headers,
        "x-relay-target": `${parsed.protocol}//${parsed.host}`,
        "x-relay-path": `${parsed.pathname}${parsed.search}`,
      };
      // A relay Location must not move credentials/body onto an unselected
      // direct connection. Override caller redirect policy on this path only.
      return await fetchImpl(vercelRelayUrl, { ...options, headers: relayHeaders, redirect: "error" });
    } catch (error) {
      throwIfCancelled(options.signal, error);
      throw new Error(`[ProxyFetch] Relay required but failed${proxyOptions?.strictProxy === true ? " (strictProxy=true)" : ""}; direct egress is disabled`);
    }
  }

  // Proxy DNS is external to local MITM redirects. Keep this path ahead of
  // every direct transport, with no direct-IP or native-fetch retry on failure.
  if (proxyUrl) {
    try {
      const dispatcher = await getDispatcher(proxyUrl);
      throwIfCancelled(options.signal);
      return await fetchImpl(url, { ...options, dispatcher });
    } catch (error) {
      throwIfCancelled(options.signal, error);
      // Transport exceptions can contain proxy userinfo or credential headers.
      // Do not attach the raw exception as a cause or send it to the logger.
      throw new Error(`[ProxyFetch] Proxy required but failed${proxyOptions?.strictProxy === true ? " (strictProxy=true)" : ""}; direct egress is disabled`);
    }
  }

  // Preserve the direct-fetch test/instrumentation seam, but only after route
  // selection, cancellation and required-proxy guards have been applied.
  if (globalThis.fetch !== patchedFetch) {
    return fetchImpl(url, options);
  }

  // MITM DNS bypass: for known MITM-intercepted hosts, resolve real IP to avoid DNS spoof
  if (shouldBypassMitmDns(targetUrl) && !isMitmBypassOnCooldown(targetUrl)) {
    // No proxy — manually resolve real IP to bypass DNS spoof
    const bypassHost = new URL(targetUrl).hostname;
    try {
      const parsedUrl = new URL(targetUrl);
      const realIP = await resolveRealIP(parsedUrl.hostname);
      throwIfCancelled(options.signal);
      if (realIP) {
        const res = await createBypassRequest(parsedUrl, realIP, options);
        mitmBypassCooldown.delete(bypassHost); // success — re-enable immediately next time
        return res;
      }
      // DNS itself failed → nothing to pin, cool down too
      markMitmBypassCooldown(bypassHost);
    } catch (error) {
      throwIfCancelled(options.signal, error);
      markMitmBypassCooldown(bypassHost);
      console.warn(`[ProxyFetch] MITM bypass failed — skipping direct-IP attempts for ${Math.round(MITM_BYPASS_COOLDOWN_MS / 60000)}m on ${bypassHost}`);
    }
  }

  // Attach default keep-alive Agent for direct upstream connections if no dispatcher provided
  const agent = options.dispatcher || await getDefaultAgent();
  throwIfCancelled(options.signal);
  return originalFetch(url, agent ? { ...options, dispatcher: agent } : options);
}

/**
 * Patched global fetch with env-proxy support and MITM DNS bypass
 */
async function patchedFetch(url, options = {}) {
  return proxyAwareFetch(url, options, null);
}

// Idempotency guard — only patch once to avoid wrapping multiple times
if (globalThis.fetch !== patchedFetch) {
  globalThis.fetch = patchedFetch;
}

export default patchedFetch;
