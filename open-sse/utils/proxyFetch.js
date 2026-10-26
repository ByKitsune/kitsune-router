import { Readable } from "node:stream";
import tls from "node:tls";
import { MEMORY_CONFIG, UPSTREAM_TRANSPORT_CONFIG } from "../config/runtimeConfig.js";
import { getUpstreamDispatcher, trackBypassRequest } from "./transportPool.js";

export { closeUpstreamPools, configureUpstreamPools, getUpstreamPoolStats } from "./transportPool.js";

const FETCH_STATE_KEY = Symbol.for("zenrouter.proxy-fetch.v1");
const fetchState = (globalThis[FETCH_STATE_KEY] ??= { original: globalThis.fetch, patched: null, implementation: null });

export const getDefaultAgent = () => getUpstreamDispatcher();

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
const MITM_BYPASS_COOLDOWN_MS = 15 * 60 * 1000;
const mitmBypassCooldown = (globalThis.__mitmBypassCooldown ??= new Map());

function markMitmBypassCooldown(host) {
  mitmBypassCooldown.set(host, Date.now() + MITM_BYPASS_COOLDOWN_MS);
}

function isMitmBypassOnCooldown(targetUrl) {
  if (process.env.DISABLE_MITM_BYPASS === "1") return true;
  let host;
  try { host = new URL(targetUrl).hostname; } catch { return false; }
  const until = mitmBypassCooldown.get(host);
  if (!until) return false;
  if (Date.now() >= until) { mitmBypassCooldown.delete(host); return false; }
  return true;
}

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function throwIfCancelled(signal, error) {
  if (signal?.aborted) throw signal.reason ?? error ?? new DOMException("Aborted", "AbortError");
  if (error?.name === "AbortError" || error?.message === "aborted" || error?.code === "ABORT_ERR") throw error;
}

async function resolveRealIP(hostname, signal) {
  throwIfCancelled(signal);
  const cached = DNS_CACHE.get(hostname);
  if (cached && Date.now() < cached.expiry) return cached.ip;
  const { Resolver } = await import("node:dns/promises");
  throwIfCancelled(signal);
  const resolver = new Resolver({ timeout: UPSTREAM_TRANSPORT_CONFIG.connectTimeoutMs, tries: 1 });
  resolver.setServers(GOOGLE_DNS_SERVERS);
  try {
    const addresses = await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      const fail = error => { cleanup(); resolver.cancel(); reject(error); };
      const onAbort = () => fail(signal.reason);
      const timer = setTimeout(() => fail(new Error("Bypass DNS timed out")), UPSTREAM_TRANSPORT_CONFIG.connectTimeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      resolver.resolve4(hostname).then(
        addresses => { cleanup(); resolve(addresses); },
        error => { cleanup(); reject(error); },
      );
    });
    throwIfCancelled(signal);
    if (!addresses.length) return null;
    DNS_CACHE.set(hostname, { ip: addresses[0], expiry: Date.now() + MEMORY_CONFIG.dnsCacheTtlMs });
    return addresses[0];
  } catch (error) {
    throwIfCancelled(signal, error);
    return null;
  }
}

function shouldBypassMitmDns(url) {
  try { return MITM_BYPASS_HOSTS.includes(new URL(url).hostname); }
  catch { return false; }
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
  const patterns = noProxy.split(",").map(p => p.trim().toLowerCase()).filter(Boolean);
  return patterns.some(pattern => {
    if (pattern === "*") return true;
    if (pattern.startsWith(".")) return hostname.endsWith(pattern) || hostname === pattern.slice(1);
    return hostname === pattern || hostname.endsWith(`.${pattern}`);
  });
}

export function getEnvProxyUrl(targetUrl) {
  if (isLoopbackTarget(targetUrl)) return null;
  if (shouldBypassByNoProxy(targetUrl, process.env.NO_PROXY || process.env.no_proxy)) return null;
  let protocol;
  try { protocol = new URL(targetUrl).protocol; } catch { return null; }
  if (protocol === "https:") {
    return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy;
  }
  return process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy;
}

function normalizeProxyUrl(proxyUrl) {
  const input = normalizeString(proxyUrl);
  if (!input) return null;
  try { return new URL(input).href; }
  catch { return `http://${input}`; }
}

export function resolveConnectionProxyUrl(targetUrl, proxyOptions) {
  if (proxyOptions?.enabled !== true && proxyOptions?.connectionProxyEnabled !== true) return null;
  if (isLoopbackTarget(targetUrl)) return null;
  const raw = normalizeString(proxyOptions?.url ?? proxyOptions?.connectionProxyUrl);
  if (!raw) return null;
  const noProxy = normalizeString(proxyOptions?.noProxy ?? proxyOptions?.connectionNoProxy);
  if (noProxy && shouldBypassByNoProxy(targetUrl, noProxy)) return null;
  return normalizeProxyUrl(raw);
}

async function createBypassRequest(parsedUrl, realIP, options = {}) {
  throwIfCancelled(options.signal);
  const { default: https } = await import("node:https");
  const { isIP } = await import("node:net");
  throwIfCancelled(options.signal);
  return new Promise((resolve, reject) => {
    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, "");
    const port = parsedUrl.port ? Number(parsedUrl.port) : 443;
    const agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
    let req;
    let res;
    let socket;
    let receivedHeaders = false;
    let finished = false;
    let release;
    let connectTimer;
    let deadlineTimer;
    const cleanup = () => {
      clearTimeout(connectTimer);
      clearTimeout(deadlineTimer);
      options.signal?.removeEventListener("abort", onAbort);
      agent.destroy();
      if (!socket || socket.closed) release?.();
      else {
        socket.once("close", () => release?.());
        socket.destroy();
      }
    };
    const fail = error => {
      if (finished) return;
      finished = true;
      if (!receivedHeaders) reject(error);
      res?.destroy(error);
      req?.destroy(error);
      cleanup();
    };
    const onAbort = () => fail(options.signal.reason ?? new DOMException("Aborted", "AbortError"));
    try {
      release = trackBypassRequest(fail);
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) { onAbort(); return; }
      const timeoutMs = options.requestTimeoutMs ?? UPSTREAM_TRANSPORT_CONFIG.bypassRequestTimeoutMs;
      deadlineTimer = setTimeout(() => fail(new Error("Bypass request deadline exceeded")), timeoutMs);
      connectTimer = setTimeout(() => fail(new Error("Bypass TLS connect timed out")), UPSTREAM_TRANSPORT_CONFIG.connectTimeoutMs);
      agent.createConnection = () => {
        socket = tls.connect({
          host: realIP, port,
          ...(isIP(hostname) ? {} : { servername: hostname }),
          checkServerIdentity: (_host, cert) => tls.checkServerIdentity(hostname, cert),
          ...(options.rejectUnauthorized === undefined ? {} : { rejectUnauthorized: options.rejectUnauthorized }),
        });
        socket.once("secureConnect", () => clearTimeout(connectTimer));
        return socket;
      };
      const headers = new Headers(options.headers);
      headers.set("Host", parsedUrl.host);
      req = https.request({
        hostname, port, agent,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || "POST",
        headers: Object.fromEntries(headers),
      }, response => {
        res = response;
        if (finished) { res.destroy(); return; }
        res.on("error", fail);
        res.once("close", () => {
          if (!res.complete) fail(new Error("Bypass response closed prematurely"));
          else if (!finished) { finished = true; cleanup(); }
        });
        res.once("end", () => { if (!finished) { finished = true; cleanup(); } });
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) value.forEach(item => responseHeaders.append(name, String(item)));
          else if (value != null) responseHeaders.set(name, String(value));
        }
        try {
          const noBody = options.method === "HEAD" || [204, 205, 304].includes(res.statusCode);
          const result = new Response(noBody ? null : Readable.toWeb(res), {
            status: res.statusCode, statusText: res.statusMessage || "", headers: responseHeaders,
          });
          receivedHeaders = true;
          if (noBody) res.resume();
          resolve(result);
        } catch (error) { fail(error); }
      });
      req.on("error", fail);
      if (options.body != null) {
        req.write(typeof options.body === "string" || Buffer.isBuffer(options.body) ? options.body : JSON.stringify(options.body));
      }
      req.end();
    } catch (error) { fail(error); }
  });
}

export const __testing = { createBypassRequest };

export async function proxyAwareFetch(url, options = {}, proxyOptions = null) {
  throwIfCancelled(options.signal);
  const targetUrl = typeof url === "string" ? url : url instanceof Request ? url.url : url.toString();
  const fetchImpl = globalThis.fetch === fetchState.patched ? fetchState.original : globalThis.fetch;
  const enabled = proxyOptions?.enabled === true || proxyOptions?.connectionProxyEnabled === true;
  const poolId = normalizeString(proxyOptions?.proxyPoolId ?? proxyOptions?.connectionProxyPoolId);
  const hasPool = !!poolId && poolId !== "__none__";
  const configuredRelayUrl = normalizeString(proxyOptions?.vercelRelayUrl);
  const hasConfiguredProxy = enabled || hasPool || !!configuredRelayUrl;
  const noProxy = proxyOptions?.noProxy ?? proxyOptions?.connectionNoProxy;
  const excluded = (!configuredRelayUrl && isLoopbackTarget(targetUrl)) ||
    (hasConfiguredProxy && shouldBypassByNoProxy(targetUrl, noProxy));
  const relayUrl = excluded ? "" : configuredRelayUrl;
  const connectionProxyUrl = excluded ? null : resolveConnectionProxyUrl(targetUrl, proxyOptions);
  const envProxyUrl = hasConfiguredProxy || excluded ? null : normalizeProxyUrl(getEnvProxyUrl(targetUrl));
  const proxyUrl = connectionProxyUrl || envProxyUrl;

  if (proxyOptions?.strictProxy === true && !proxyUrl && !relayUrl) {
    throw new Error("[ProxyFetch] Proxy required but no proxy URL configured (strictProxy=true)");
  }
  if (hasConfiguredProxy && !excluded && !proxyUrl && !relayUrl) {
    throw new Error("[ProxyFetch] Configured proxy unavailable; direct egress is disabled");
  }

  if (relayUrl) {
    try {
      const parsed = new URL(targetUrl);
      const headers = new Headers(options.headers);
      headers.set("x-relay-target", `${parsed.protocol}//${parsed.host}`);
      headers.set("x-relay-path", `${parsed.pathname}${parsed.search}`);
      const dispatcher = await getUpstreamDispatcher({ relayUrl: new URL(relayUrl).origin, headersTimeoutMs: options.upstreamHeadersTimeoutMs });
      throwIfCancelled(options.signal);
      return await fetchImpl(relayUrl, { ...options, headers, dispatcher, redirect: "error" });
    } catch (error) {
      throwIfCancelled(options.signal, error);
      throw new Error(`[ProxyFetch] Relay required but failed${proxyOptions?.strictProxy === true ? " (strictProxy=true)" : ""}; direct egress is disabled`);
    }
  }

  if (proxyUrl) {
    try {
      const dispatcher = await getUpstreamDispatcher({ proxyUrl, headersTimeoutMs: options.upstreamHeadersTimeoutMs });
      throwIfCancelled(options.signal);
      return await fetchImpl(url, { ...options, dispatcher });
    } catch (error) {
      throwIfCancelled(options.signal, error);
      throw new Error(`[ProxyFetch] Proxy required but failed${proxyOptions?.strictProxy === true ? " (strictProxy=true)" : ""}; direct egress is disabled`);
    }
  }

  if (options.dispatcher || globalThis.fetch !== fetchState.patched || !/^https?:/i.test(targetUrl)) {
    return fetchImpl(url, options);
  }

  if (shouldBypassMitmDns(targetUrl) && !isMitmBypassOnCooldown(targetUrl)) {
    const parsedUrl = new URL(targetUrl);
    const started = Date.now();
    try {
      const realIP = await resolveRealIP(parsedUrl.hostname, options.signal);
      throwIfCancelled(options.signal);
      if (realIP) {
        const requestTimeoutMs = Math.max(1, UPSTREAM_TRANSPORT_CONFIG.bypassRequestTimeoutMs - (Date.now() - started));
        const response = await createBypassRequest(parsedUrl, realIP, { ...options, requestTimeoutMs });
        mitmBypassCooldown.delete(parsedUrl.hostname);
        return response;
      }
      markMitmBypassCooldown(parsedUrl.hostname);
    } catch (error) {
      throwIfCancelled(options.signal, error);
      markMitmBypassCooldown(parsedUrl.hostname);
      console.warn(`[ProxyFetch] MITM bypass failed — skipping direct-IP attempts for ${Math.round(MITM_BYPASS_COOLDOWN_MS / 60000)}m on ${parsedUrl.hostname}`);
    }
  }

  const dispatcher = await getUpstreamDispatcher({ headersTimeoutMs: options.upstreamHeadersTimeoutMs });
  throwIfCancelled(options.signal);
  return fetchState.original(url, { ...options, dispatcher });
}

fetchState.implementation = proxyAwareFetch;
if (!fetchState.patched) {
  fetchState.patched = (url, options = {}) => fetchState.implementation(url, options, null);
  globalThis.fetch = fetchState.patched;
}

export default fetchState.patched;
