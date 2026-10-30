/**
 * Generic live model catalog fetcher for API-key providers.
 *
 * Most built-in providers already declare a public /models endpoint in their
 * registry entry (modelsFetcher.url, transport.validateUrl or transport.baseUrl),
 * so instead of writing one resolver per provider we derive the URL from the
 * registry and fetch it with the connection's API key. Results are cached in
 * memory briefly so /v1/models and the dashboard don't hammer upstream.
 */

import REGISTRY from "open-sse/providers/registry/index.js";
import { inferModelKind, modelKind } from "open-sse/providers/models/schema.js";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { createHash } from "node:crypto";
import { getDbImportGeneration } from "@/lib/db/helpers/importGeneration.js";
import { readModelCatalogResponse } from "open-sse/utils/modelCatalog.js";
import {
  MODEL_CATALOG_CACHE_TTL_MS as CACHE_TTL_MS,
  MODEL_CATALOG_TIMEOUT_MS as TIMEOUT_MS,
  MODEL_CATALOG_MAX_BYTES as MAX_CATALOG_BYTES,
  MODEL_CATALOG_MAX_PAGES as MAX_CATALOG_PAGES,
  MODEL_CATALOG_MAX_CACHE_ENTRIES as MAX_CACHE_ENTRIES,
  MODEL_CATALOG_MAX_CACHE_BYTES as MAX_CACHE_BYTES,
} from "open-sse/config/modelCatalog.js";

export function normalizeLiveModel(providerId, model) {
  // Native Models APIs use type:"model" / type:"base" as object discriminators,
  // not as a gateway service kind. Keeping it would hide new native IDs from
  // the LLM catalog even after a successful authenticated discovery.
  if (["model", "base", "fine-tuned"].includes(model.type)) {
    const { type: _type, ...fields } = model;
    model = fields;
  }
  const entry = REGISTRY.find((r) => r.id === providerId);
  const registered = entry?.models?.find((m) => m.id === model.id);
  const kind = registered ? modelKind(registered) : (model.kind || model.type || inferModelKind(model));
  return { ...model, ...(kind ? { kind } : {}) };
}

const KNOWN_URL_SUFFIXES = ["/chat/completions", "/completions", "/messages"];

const cache = new Map(); // one credential-scoped catalog per provider
let cacheBytes = 0;
let generation = 0;
let importGeneration = getDbImportGeneration();

function removeCachedCatalog(providerId) {
  const previous = cache.get(providerId);
  if (previous) cacheBytes -= previous.bytes;
  cache.delete(providerId);
}

function cacheModels(providerId, entry) {
  removeCachedCatalog(providerId);
  const bytes = Buffer.byteLength(JSON.stringify(entry.models));
  if (bytes > MAX_CACHE_BYTES) return;
  const now = Date.now();
  for (const [id, previous] of cache) if (previous.expiresAt <= now) removeCachedCatalog(id);
  while (cache.size && (cache.size >= MAX_CACHE_ENTRIES || cacheBytes + bytes > MAX_CACHE_BYTES)) {
    removeCachedCatalog(cache.keys().next().value);
  }
  cache.set(providerId, { ...entry, models: structuredClone(entry.models), bytes, expiresAt: now + CACHE_TTL_MS });
  cacheBytes += bytes;
}

function discoveryConfig(entry) {
  // Server-side auth/pagination is deliberately separate from the public
  // suggested-models control. Its URLs/headers come only from the registry.
  const configured = entry?.transport?.modelsFetcher || entry?.modelsFetcher;
  return (Array.isArray(configured) ? configured[0] : configured) || {};
}

function selectAuthProfile(fetcher, name) {
  if (name === undefined) return fetcher;
  if (typeof name !== "string" || !Object.hasOwn(fetcher.authProfiles || {}, name)) {
    throw new Error("Unknown catalog authentication profile");
  }
  const profile = fetcher.authProfiles[name];
  // A profile changes only known authentication fields. The origin, parser and
  // pagination remain registry-owned rather than supplied by a request caller.
  return {
    ...fetcher,
    authHeader: profile.authHeader ?? fetcher.authHeader,
    authPrefix: profile.authPrefix ?? fetcher.authPrefix,
    headers: { ...fetcher.headers, ...profile.headers },
  };
}

const tokenLimit = value => (typeof value === "number" || typeof value === "string" && value.trim() !== "")
  && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;

function googleApiKind(model, entry) {
  const methods = model?.supportedGenerationMethods;
  if (!Array.isArray(methods)) return null;
  if (methods.includes("generateContent")) {
    const id = typeof model.name === "string" ? model.name.replace(/^models\//, "") : model.id;
    const registered = entry.models?.find(row => row.id === id);
    return registered ? modelKind(registered) : inferModelKind({ ...model, id }) || "llm";
  }
  if (methods.includes("embedContent")) return "embedding";
  // predict/long-running video, batch-only and interactions are different
  // endpoints. Their presence does not make them callable as chat completions.
  return null;
}

/**
 * Derive the /models URL for a provider from its registry entry, or null when
 * no reliable URL can be found (callers then keep their static fallback).
 */
export function deriveModelsUrl(providerId) {
  const entry = REGISTRY.find((r) => r.id === providerId);
  if (!entry) return null;

  const fetcher = discoveryConfig(entry);
  if (fetcher?.url) return fetcher.url;

  const validateUrl = entry.transport?.validateUrl;
  if (validateUrl && /\/models(\?|$)/.test(validateUrl)) return validateUrl.split("?")[0];

  const baseUrl = entry.transport?.baseUrl;
  if (!baseUrl) return null;
  for (const suffix of KNOWN_URL_SUFFIXES) {
    if (baseUrl.endsWith(suffix)) return `${baseUrl.slice(0, -suffix.length)}/models`;
  }
  return null;
}

/**
 * Fetch the live model catalog for an API-key provider.
 * @returns {Promise<Array<{id: string, name?: string}>|null>} null on failure; strict transport errors propagate
 */
export async function fetchProviderLiveModels(providerId, apiKey, {
  useCache = true, proxyOptions = null, authProfile, allowEmptyCatalog = false, throwHttpErrors = false, signal: callerSignal,
} = {}) {
  callerSignal?.throwIfAborted();
  if (!apiKey) return null;
  if (importGeneration !== getDbImportGeneration()) clearProviderLiveModelsCache();
  const version = generation;
  const importedVersion = importGeneration;
  const credential = createHash("sha256").update(String(apiKey)).digest("hex");

  // Configured account egress must not reuse another account's cached catalog.
  const cacheAllowed = !proxyOptions?.strictProxy && !proxyOptions?.connectionProxyEnabled && !proxyOptions?.vercelRelayUrl;
  if (useCache && cacheAllowed) {
    const cached = cache.get(providerId);
    if (cached?.credential === credential && cached.authProfile === authProfile && Date.now() < cached.expiresAt) {
      cache.delete(providerId);
      cache.set(providerId, cached);
      if (!cached.models.length && !allowEmptyCatalog) return null;
      return structuredClone(cached.models);
    }
  }

  const url = deriveModelsUrl(providerId);
  if (!url) return null;

  let tid;
  try {
    const provider = REGISTRY.find(entry => entry.id === providerId);
    const fetcher = selectAuthProfile(discoveryConfig(provider), authProfile);
    const controller = new AbortController();
    const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
    tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const authHeader = fetcher.authHeader || "Authorization";
    const authPrefix = fetcher.authPrefix ?? (authHeader.toLowerCase() === "authorization" ? "Bearer " : "");
    const headers = { "Content-Type": "application/json", ...fetcher.headers, [authHeader]: `${authPrefix}${apiKey}` };
    let pageUrl = new URL(url);
    if (fetcher.pagination === "anthropic") pageUrl.searchParams.set("limit", "1000");
    if (fetcher.pagination === "google") pageUrl.searchParams.set("pageSize", "1000");
    const raw = [];
    const cursors = new Set();
    const budget = { remaining: MAX_CATALOG_BYTES };
    for (let page = 0; ; page++) {
      if (page >= MAX_CATALOG_PAGES) throw new Error("Catalog pagination exceeds page limit");
      const res = await proxyAwareFetch(pageUrl.toString(), {
        headers, cache: "no-store", signal,
        // Native x-api-key headers are not automatically stripped by fetch on
        // every redirect. A fixed catalog contract must not redirect its proof.
        redirect: "error",
      }, proxyOptions);
      if (!res.ok) {
        void res.body?.cancel().catch(() => {});
        if (throwHttpErrors) {
          const error = new Error(`Model catalog request failed (${res.status})`);
          error.status = res.status;
          throw error;
        }
        return null;
      }
      const data = await readModelCatalogResponse(res, signal, budget);
      // OpenAI-style { data: [...] }, { models: [...] }, or a bare array.
      const rows = Array.isArray(data) ? data : (data?.data ?? data?.models);
      if (!Array.isArray(rows)) throw new Error("Invalid catalog model list");
      raw.push(...rows);
      let cursor;
      if (fetcher.pagination === "anthropic") {
        if (data?.has_more !== true) break;
        cursor = data.last_id;
      } else if (fetcher.pagination === "google") {
        if (data?.nextPageToken === undefined || data?.nextPageToken === "") break;
        cursor = data.nextPageToken;
      } else break;
      if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) throw new Error("Incomplete catalog pagination");
      cursors.add(cursor);
      // Only advance a cursor on the registry-owned origin; never follow an
      // upstream-supplied next URL with this connection's credentials.
      pageUrl = new URL(url);
      if (fetcher.pagination === "google") {
        pageUrl.searchParams.set("pageSize", "1000");
        pageUrl.searchParams.set("pageToken", cursor);
      } else {
        pageUrl.searchParams.set("limit", "1000");
        pageUrl.searchParams.set("after_id", cursor);
      }
    }
    if (raw.some(row => !row || typeof row !== "object" || Array.isArray(row)
      || typeof (row.id || row.name) !== "string" || !(row.id || row.name).trim())) {
      throw new Error("Invalid catalog model record");
    }
    const seenModels = new Set();
    const models = raw
      .filter(model => {
        if (fetcher.type === "gemini") return googleApiKind(model, provider) !== null;
        if (fetcher.type !== "mistral" || model?.capabilities?.completion_chat !== false) return true;
        const registered = provider.models?.find(row => row.id === model.id);
        const kind = registered ? modelKind(registered) : inferModelKind(model);
        // The endpoint also returns audio/FIM/classifier cards. Preserve known
        // supported media, but never publish an unsupported surface as an LLM.
        return kind && kind !== "llm";
      })
      .map((m) => {
        const nativeId = m?.id || m?.name;
        const id = fetcher.type === "gemini" && typeof nativeId === "string" ? nativeId.replace(/^models\//, "") : nativeId;
        const name = m?.display_name || m?.displayName || m?.name || m?.id;
        const contextWindow = tokenLimit(
          m?.context_length ?? m?.context_window ?? m?.contextWindow ?? m?.max_context_length ?? m?.max_context_tokens ?? m?.top_provider?.context_length
        );
        const maxInput = tokenLimit(m?.max_input_tokens ?? m?.maxInput ?? m?.maxInputTokens ?? m?.per_request_limits?.prompt_tokens
          ?? (fetcher.type === "gemini" ? m?.inputTokenLimit : undefined));
        const maxOutput = tokenLimit(
          m?.max_completion_tokens ?? m?.max_output_tokens ?? m?.maxOutput ?? m?.maxOutputTokens ?? m?.max_tokens ?? m?.top_provider?.max_completion_tokens ?? m?.per_request_limits?.completion_tokens
          ?? (fetcher.type === "gemini" ? m?.outputTokenLimit : undefined)
        );
        const caps = {};
        if (Number.isFinite(contextWindow) && contextWindow > 0) caps.contextWindow = contextWindow;
        if (Number.isFinite(maxInput) && maxInput > 0) caps.maxInput = maxInput;
        if (Number.isFinite(maxOutput) && maxOutput > 0) caps.maxOutput = maxOutput;
        if (fetcher.type === "anthropic") {
          for (const [native, key] of [["image_input", "vision"], ["pdf_input", "pdf"], ["thinking", "reasoning"], ["structured_outputs", "structuredOutput"]]) {
            if (typeof m?.capabilities?.[native]?.supported === "boolean") caps[key] = m.capabilities[native].supported;
          }
        }
        if (fetcher.type === "mistral" && typeof m?.capabilities?.function_calling === "boolean") {
          caps.tools = m.capabilities.function_calling;
        }
        if (fetcher.type === "gemini" && typeof m?.thinking === "boolean") caps.reasoning = m.thinking;
        const declared = { ...caps, ...m?.capabilities, ...m?.caps };
        for (const key of ["contextWindow", "maxInput", "maxOutput"]) {
          if (!Object.hasOwn(declared, key) || declared[key] === null) continue;
          const value = tokenLimit(declared[key]);
          if (value === undefined) delete declared[key];
          else declared[key] = value;
        }
        return normalizeLiveModel(providerId, {
          id,
          name,
          ...(fetcher.type === "gemini" ? { kind: googleApiKind(m, provider) } : m?.kind ? { kind: m.kind } : {}),
          ...(m?.type ? { type: m.type } : {}),
          ...(m?.architecture ? { architecture: m.architecture } : {}),
          ...(m?.input_modalities ? { input_modalities: m.input_modalities } : {}),
          ...(m?.output_modalities ? { output_modalities: m.output_modalities } : {}),
          ...(Object.keys(declared).length ? { capabilities: declared } : {}),
          ...(Number.isFinite(contextWindow) && contextWindow > 0 ? { context_length: contextWindow } : {}),
          ...(Number.isFinite(maxInput) && maxInput > 0 ? { max_input_tokens: maxInput } : {}),
          ...(Number.isFinite(maxOutput) && maxOutput > 0 ? { max_completion_tokens: maxOutput } : {}),
        });
      })
      .filter((m) => typeof m.id === "string" && m.id.trim() !== "")
      .filter(model => {
        const key = JSON.stringify([model.id, model.kind || null]);
        if (seenModels.has(key)) return false;
        seenModels.add(key);
        return true;
      });

    if (!models.length && !allowEmptyCatalog) return null;
    // Do not publish a catalog requested with pre-import credentials or policy.
    if (version !== generation || importedVersion !== getDbImportGeneration()) return null;
    if (cacheAllowed) cacheModels(providerId, { credential, authProfile, models });
    return models;
  } catch (error) {
    callerSignal?.throwIfAborted();
    if (throwHttpErrors && Number.isInteger(error?.status)) throw error;
    if (proxyOptions?.strictProxy === true) throw error;
    return null;
  } finally {
    clearTimeout(tid);
  }
}

export function clearProviderLiveModelsCache() {
  cache.clear();
  cacheBytes = 0;
  generation++;
  importGeneration = getDbImportGeneration();
}
