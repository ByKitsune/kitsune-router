// Web Fetch handler — dispatches to firecrawl, jina-reader, tavily, exa
// Returns normalized shape across all providers

import { fetchPublic } from "../../../src/shared/utils/ssrfGuard.js";
import { getAccountRoutingPolicy, hasAccountProxyPolicy } from "../../utils/accountTransport.js";
import { DEFAULT_WEB_FETCH_FORMAT, getWebFetchFormatError } from "../../config/webFetchFormats.js";
import firecrawlProvider from "../../providers/registry/firecrawl.js";

const DEFAULT_TIMEOUT_MS = 15000;

/** Guarded fetch cannot delegate DNS validation to an account proxy. */
export function getFetchAccountTransportFailure(credentials, proxyOptions = null) {
  if (!hasAccountProxyPolicy(getAccountRoutingPolicy(credentials, proxyOptions))) return null;
  return {
    success: false, status: 502, localFailure: true, errorScope: "request",
    error: "[ProxyFetch] Configured account proxy cannot preserve guarded WebFetch URL safety; this fetch transport is unavailable for that account.",
  };
}

// Strip non-ASCII chars from header values (HTTP headers must be ByteString).
function sanitizeHeaders(headers) {
  if (!headers) return headers;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = typeof v === "string" ? v.replace(/[^\x00-\xFF]/g, "").trim() : v;
  }
  return out;
}

async function tryFetch(url, init, signal) {
  try {
    const res = await fetchPublic(url, {
      ...init, headers: sanitizeHeaders(init.headers), signal,
    }, { maxRedirects: 0 });
    return { ok: true, res };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, error: err?.message || String(err) };
  }
}

function truncate(text, max) {
  if (!text || typeof text !== "string") return text || "";
  if (!max || max <= 0) return text;
  return text.length > max ? text.slice(0, max) : text;
}

function parseJinaTitle(text) {
  const source = String(text || "");
  const metadataTitle = source.match(/^\s*Title:\s*(.+)$/mi);
  if (metadataTitle) return metadataTitle[1].trim();
  const m = source.match(/^\s*#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function buildData({ provider, url, title, format, text, links, costUsd, responseMs, upstreamMs }) {
  const data = {
    provider,
    url,
    title: title || null,
    content: { format, text: text || "", length: (text || "").length },
    metadata: { author: null, published_at: null, language: null },
    usage: { fetch_cost_usd: costUsd ?? null },
    metrics: { response_time_ms: responseMs, upstream_latency_ms: upstreamMs }
  };
  if (Array.isArray(links)) data.links = links;
  return data;
}

async function readJsonOrText(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return { json: await res.json() }; } catch { return { text: "" }; }
  }
  return { text: await res.text() };
}

/**
 * Main handler.
 * @param {Object} params
 * @param {string} params.url
 * @param {string} [params.format]
 * @param {number} [params.maxCharacters]
 * @param {string} params.provider
 * @param {Object} [params.providerConfig]
 * @param {Object} [params.credentials]
 * @param {Function} [params.log]
 * @returns {Promise<{success:boolean, status?:number, error?:string, data?:object}>}
 */
export async function handleFetchCore({ url, format, maxCharacters, provider, providerConfig, credentials, log, signal, proxyOptions = null }) {
  if (signal?.aborted) return { success: false, status: 499, error: "Client closed request", localFailure: true, errorScope: "request" };
  if (!url || typeof url !== "string") {
    return { success: false, status: 400, error: "url is required" };
  }
  if (!provider) {
    return { success: false, status: 400, error: "provider is required" };
  }

  const formatError = getWebFetchFormatError(provider, format);
  if (formatError) return { success: false, status: 400, error: formatError };

  const routingFailure = getFetchAccountTransportFailure(credentials, proxyOptions);
  if (routingFailure) return routingFailure;

  const fmt = format || DEFAULT_WEB_FETCH_FORMAT;
  const timeoutMs = providerConfig?.timeoutMs || DEFAULT_TIMEOUT_MS;
  const apiKey = credentials?.apiKey || credentials?.key || credentials?.token || "";
  const costPerQuery = providerConfig?.costPerQuery ?? null;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    const runners = { firecrawl: runFirecrawl, "jina-reader": runJina, tavily: runTavily, exa: runExa, ollama: runOllama };
    const run = Object.hasOwn(runners, provider) ? runners[provider] : null;
    if (!run) return { success: false, status: 400, error: `Unsupported provider: ${provider}` };
    const result = await run({ url, fmt, signal: requestSignal, apiKey, maxCharacters,
      costPerQuery, startedAt, baseUrl: providerConfig?.baseUrl });
    requestSignal.throwIfAborted();
    return result;
  } catch (err) {
    if (signal?.aborted) return { success: false, status: 499, error: "Client closed request", localFailure: true, errorScope: "request" };
    if (controller.signal.aborted) return { success: false, status: 504, error: err?.message || "Upstream timeout" };
    if (typeof log === "function") log("fetch handler error:", err?.message || err);
    else log?.error?.("FETCH", err?.message || "Internal fetch error");
    return { success: false, status: 502, error: err?.message || "Internal fetch error" };
  } finally {
    clearTimeout(timer);
  }
}

async function runFirecrawl({ url, fmt, signal, apiKey, maxCharacters, costPerQuery, startedAt }) {
  const upstreamStart = Date.now();
  const r = await tryFetch(firecrawlProvider.fetchConfig.baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ url, formats: [fmt] })
  }, signal);

  if (!r.ok) {
    return { success: false, status: 502, error: r.error };
  }
  const upstreamMs = Date.now() - upstreamStart;
  const { json } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    return { success: false, status: r.res.status, error: typeof json?.error === "string" ? json.error : `Firecrawl error: ${r.res.status}` };
  }
  const d = json?.data;
  if (json?.success !== true || !d || typeof d !== "object" || Array.isArray(d) || typeof d[fmt] !== "string") {
    return { success: false, status: 502, error: typeof json?.error === "string" ? json.error : "Firecrawl returned an invalid scrape document" };
  }
  // A native HTML request must not be relabeled markdown, including when its
  // legitimate content is empty and another returned format is nonempty.
  const text = truncate(d[fmt], maxCharacters);
  const title = typeof d.metadata?.title === "string" ? d.metadata.title : null;
  return {
    success: true,
    data: buildData({
      provider: "firecrawl", url, title, format: fmt, text,
      costUsd: costPerQuery, responseMs: Date.now() - startedAt, upstreamMs
    })
  };
}

async function runJina({ url, fmt, signal, apiKey, maxCharacters, costPerQuery, startedAt }) {
  const upstreamStart = Date.now();
  const r = await tryFetch("https://r.jina.ai/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-return-format": fmt,
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ url })
  }, signal);

  if (!r.ok) {
    return { success: false, status: 502, error: r.error };
  }
  const upstreamMs = Date.now() - upstreamStart;
  const body = await r.res.text();
  if (!r.res.ok) {
    return { success: false, status: r.res.status, error: body?.slice(0, 500) || `Jina error: ${r.res.status}` };
  }
  const text = truncate(body, maxCharacters);
  return {
    success: true,
    data: buildData({
      provider: "jina-reader", url, title: parseJinaTitle(body), format: fmt, text,
      costUsd: costPerQuery, responseMs: Date.now() - startedAt, upstreamMs
    })
  };
}

async function runTavily({ url, fmt, signal, apiKey, maxCharacters, costPerQuery, startedAt }) {
  const upstreamStart = Date.now();
  const r = await tryFetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ urls: [url], extract_depth: "basic", format: fmt })
  }, signal);

  if (!r.ok) {
    return { success: false, status: 502, error: r.error };
  }
  const upstreamMs = Date.now() - upstreamStart;
  const { json } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    return { success: false, status: r.res.status, error: json?.error || `Tavily error: ${r.res.status}` };
  }
  const first = json?.results?.[0] || {};
  const text = truncate(first.raw_content || "", maxCharacters);
  return {
    success: true,
    data: buildData({
      provider: "tavily", url, title: null, format: fmt, text,
      costUsd: costPerQuery, responseMs: Date.now() - startedAt, upstreamMs
    })
  };
}

async function runExa({ url, fmt, signal, apiKey, maxCharacters, costPerQuery, startedAt }) {
  const upstreamStart = Date.now();
  const r = await tryFetch("https://api.exa.ai/contents", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {})
    },
    body: JSON.stringify({ ids: [url], text: true })
  }, signal);

  if (!r.ok) {
    return { success: false, status: 502, error: r.error };
  }
  const upstreamMs = Date.now() - upstreamStart;
  const { json } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    return { success: false, status: r.res.status, error: json?.error || `Exa error: ${r.res.status}` };
  }
  const first = json?.results?.[0] || {};
  const text = truncate(first.text || "", maxCharacters);
  return {
    success: true,
    data: buildData({
      provider: "exa", url, title: first.title || null, format: fmt, text,
      costUsd: costPerQuery, responseMs: Date.now() - startedAt, upstreamMs
    })
  };
}

async function runOllama({
  url,
  fmt,
  signal,
  apiKey,
  maxCharacters,
  costPerQuery,
  startedAt,
  baseUrl,
}) {
  const upstreamStart = Date.now();
  const r = await tryFetch(baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ url })
  }, signal);

  if (!r.ok) {
    return { success: false, status: 502, error: r.error };
  }
  const upstreamMs = Date.now() - upstreamStart;
  const { json, text: responseText } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    const error = json?.error
      || json?.message
      || responseText?.slice(0, 500)
      || `Ollama error: ${r.res.status}`;
    return { success: false, status: r.res.status, error };
  }
  if (!json || typeof json.content !== "string") {
    return { success: false, status: 502, error: "Ollama returned an empty or invalid web fetch response" };
  }

  const text = truncate(json.content, maxCharacters);
  return {
    success: true,
    data: buildData({
      provider: "ollama",
      url,
      title: json.title || null,
      format: fmt,
      text,
      links: json.links,
      costUsd: costPerQuery,
      responseMs: Date.now() - startedAt,
      upstreamMs
    })
  };
}

