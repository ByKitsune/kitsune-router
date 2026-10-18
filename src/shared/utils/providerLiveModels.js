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

export function normalizeLiveModel(providerId, model) {
  const entry = REGISTRY.find((r) => r.id === providerId);
  const registered = entry?.models?.find((m) => m.id === model.id);
  const kind = registered ? modelKind(registered) : (model.kind || model.type || inferModelKind(model));
  return { ...model, ...(kind ? { kind } : {}) };
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TIMEOUT_MS = 5000;

const KNOWN_URL_SUFFIXES = ["/chat/completions", "/completions", "/messages"];

const cache = new Map(); // one credential-scoped catalog per provider
let generation = 0;
let importGeneration = getDbImportGeneration();

/**
 * Derive the /models URL for a provider from its registry entry, or null when
 * no reliable URL can be found (callers then keep their static fallback).
 */
export function deriveModelsUrl(providerId) {
  const entry = REGISTRY.find((r) => r.id === providerId);
  if (!entry) return null;

  const fetcher = Array.isArray(entry.modelsFetcher)
    ? entry.modelsFetcher[0]
    : entry.modelsFetcher;
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
export async function fetchProviderLiveModels(providerId, apiKey, { useCache = true, proxyOptions = null } = {}) {
  if (!apiKey) return null;
  if (importGeneration !== getDbImportGeneration()) clearProviderLiveModelsCache();
  const version = generation;
  const importedVersion = importGeneration;
  const credential = createHash("sha256").update(String(apiKey)).digest("hex");

  // Configured account egress must not reuse another account's cached catalog.
  const cacheAllowed = !proxyOptions?.strictProxy && !proxyOptions?.connectionProxyEnabled && !proxyOptions?.vercelRelayUrl;
  if (useCache && cacheAllowed) {
    const cached = cache.get(providerId);
    if (cached?.credential === credential && Date.now() < cached.expiresAt) return cached.models;
  }

  const url = deriveModelsUrl(providerId);
  if (!url) return null;

  let tid;
  try {
    const controller = new AbortController();
    tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await proxyAwareFetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    }, proxyOptions);
    clearTimeout(tid);
    if (!res.ok) return null;

    const data = await res.json();
    // OpenAI-style { data: [...] }, { models: [...] }, or a bare array.
    const raw = Array.isArray(data) ? data : (data?.data || data?.models || []);
    const models = raw
      .map((m) => {
        const id = m?.id || m?.name;
        const name = m?.name || m?.id;
        const contextWindow = Number(
          m?.context_length ?? m?.context_window ?? m?.contextWindow ?? m?.max_context_tokens ?? m?.top_provider?.context_length
        );
        const maxInput = Number(m?.max_input_tokens ?? m?.maxInput ?? m?.maxInputTokens ?? m?.per_request_limits?.prompt_tokens);
        const maxOutput = Number(
          m?.max_completion_tokens ?? m?.max_output_tokens ?? m?.maxOutput ?? m?.maxOutputTokens ?? m?.max_tokens ?? m?.top_provider?.max_completion_tokens ?? m?.per_request_limits?.completion_tokens
        );
        const caps = {};
        if (Number.isFinite(contextWindow) && contextWindow > 0) caps.contextWindow = contextWindow;
        if (Number.isFinite(maxInput) && maxInput > 0) caps.maxInput = maxInput;
        if (Number.isFinite(maxOutput) && maxOutput > 0) caps.maxOutput = maxOutput;
        return normalizeLiveModel(providerId, {
          id,
          name,
          ...(m?.kind ? { kind: m.kind } : {}),
          ...(m?.type ? { type: m.type } : {}),
          ...(m?.architecture ? { architecture: m.architecture } : {}),
          ...(m?.input_modalities ? { input_modalities: m.input_modalities } : {}),
          ...(m?.output_modalities ? { output_modalities: m.output_modalities } : {}),
          ...((Object.keys(caps).length || m?.capabilities || m?.caps) ? { capabilities: { ...caps, ...m?.capabilities, ...m?.caps } } : {}),
          ...(Number.isFinite(contextWindow) && contextWindow > 0 ? { context_length: contextWindow } : {}),
          ...(Number.isFinite(maxInput) && maxInput > 0 ? { max_input_tokens: maxInput } : {}),
          ...(Number.isFinite(maxOutput) && maxOutput > 0 ? { max_completion_tokens: maxOutput } : {}),
        });
      })
      .filter((m) => typeof m.id === "string" && m.id.trim() !== "");

    if (!models.length) return null;
    // Do not publish a catalog requested with pre-import credentials or policy.
    if (version !== generation || importedVersion !== getDbImportGeneration()) return null;
    if (cacheAllowed) cache.set(providerId, { credential, models, expiresAt: Date.now() + CACHE_TTL_MS });
    return models;
  } catch (error) {
    if (proxyOptions?.strictProxy === true) throw error;
    return null;
  } finally {
    clearTimeout(tid);
  }
}

export function clearProviderLiveModelsCache() {
  cache.clear();
  generation++;
  importGeneration = getDbImportGeneration();
}
