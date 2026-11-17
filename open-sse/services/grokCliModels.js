import {
  GROK_CLI_BASE_URL,
} from "../config/grokCli.js";
import {
  GROK_CLI_CLIENT_IDENTIFIER,
  GROK_CLI_USER_AGENT,
  GROK_CLI_VERSION,
} from "../config/clientVersions.js";
import { refreshProviderCredentials } from "./oauthCredentialManager.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { readModelCatalogResponse } from "../utils/modelCatalog.js";
import { MODEL_CATALOG_TIMEOUT_MS } from "../config/modelCatalog.js";
import { safeRefreshErrorType } from "../utils/oauthDiagnostics.js";

const MODELS_URL = `${GROK_CLI_BASE_URL}/models`;

function modelEntries(data) {
  const value = Array.isArray(data) ? data : data?.data ?? data?.models ?? data?.results;
  if (Array.isArray(value)) return value.map((item) => [null, item]);
  if (value && typeof value === "object") return Object.entries(value);
  return null;
}

const modelId = (key, item) => item?.id ?? item?.model_id ?? item?.modelId ?? item?.model ?? item?.slug ?? key ?? item?.name;
const positiveLimit = value => (typeof value === "number" || typeof value === "string" && value.trim() !== "")
  && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;

export function parseGrokCliModels(data) {
  const seen = new Set();
  const models = [];

  for (const [key, raw] of modelEntries(data) || []) {
    const item = typeof raw === "string" ? { id: raw } : raw;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const suppliedId = modelId(key, item);
    if (typeof suppliedId !== "string") continue;
    const id = suppliedId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const model = {
      ...item,
      id,
      name: [item.display_name, item.displayName, item.name].find(value => typeof value === "string" && value.trim()) || id,
    };
    const contextLength = positiveLimit(
      item.context_length ?? item.contextLength ?? item.context_window ?? item.contextWindow,
    );
    const maxOutputTokens = positiveLimit(item.max_output_tokens ?? item.maxOutputTokens);
    if (contextLength !== undefined) model.contextLength = contextLength;
    if (maxOutputTokens !== undefined) {
      model.maxOutputTokens = maxOutputTokens;
    }
    models.push(model);
  }

  return models;
}

function buildHeaders(accessToken, providerSpecificData = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "User-Agent": GROK_CLI_USER_AGENT,
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-client-version": GROK_CLI_VERSION,
    "x-grok-client-identifier": GROK_CLI_CLIENT_IDENTIFIER,
    "x-grok-client-mode": "headless",
  };
  const email = providerSpecificData?.email;
  const userId = providerSpecificData?.userId || providerSpecificData?.principalId;
  if (email) headers["x-email"] = email;
  if (userId) headers["x-userid"] = userId;
  return headers;
}

export async function resolveGrokCliModels(credentials, options = {}) {
  options.signal?.throwIfAborted();
  const {
    fetchFn = proxyAwareFetch,
    log = console,
    proxyOptions = null,
    onCredentialsRefreshed,
  } = options;
  let accessToken = credentials?.accessToken;
  if (!accessToken) return { models: [], warning: "Grok CLI access token is missing." };
  const policy = proxyOptions ? Object.freeze({ ...proxyOptions }) : null;
  const providerData = { ...credentials.providerSpecificData };
  const deadline = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
  const timer = setTimeout(() => deadline.abort(new DOMException("Model catalog deadline exceeded", "TimeoutError")), MODEL_CATALOG_TIMEOUT_MS);
  const discard = response => { try { void response?.body?.cancel().catch(() => {}); } catch { /* Already owned. */ } };
  // Bound injected fetch callbacks as well as native transports. A late body
  // belongs to this abandoned request and must not leak into a later read.
  const wait = async pending => {
    let abandoned = false;
    let onAbort;
    const abort = new Promise((_, reject) => {
      onAbort = () => { abandoned = true; reject(signal.reason); };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    try {
      return await Promise.race([Promise.resolve(pending).then(value => {
        if (abandoned) discard(value);
        return value;
      }), abort]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  };
  const request = token => wait(Promise.resolve().then(() => {
    signal.throwIfAborted();
    return fetchFn(MODELS_URL, {
      method: "GET", redirect: "error", signal,
      headers: buildHeaders(token, providerData),
    }, policy);
  }));

  try {
    let response = await request(accessToken);
    if ((response.status === 401 || response.status === 403) && credentials?.refreshToken && options.allowRefresh !== false) {
      discard(response);
      const refreshed = await refreshProviderCredentials(
        "grok-cli",
        credentials,
        log,
        policy,
        signal,
      );
      if (refreshed?.accessToken) {
        accessToken = refreshed.accessToken;
        // Persist acquired rotations even if the HTTP caller leaves during
        // the commit. Cancellation still prevents the subsequent catalog GET.
        await onCredentialsRefreshed?.(refreshed);
        signal.throwIfAborted();
        response = await request(accessToken);
      }
    }

    if (!response.ok) {
      discard(response);
      return {
        models: [],
        warning: `Grok CLI model discovery failed (${response.status}).`,
      };
    }

    const data = await readModelCatalogResponse(response, signal);
    const rows = modelEntries(data);
    if (!rows || !rows.every(([key, raw]) => {
      const item = typeof raw === "string" ? { id: raw } : raw;
      return item && typeof item === "object" && !Array.isArray(item)
        && typeof modelId(key, item) === "string" && !!modelId(key, item).trim();
    }) || data?.has_more === true || data?.nextPageToken || data?.next_cursor) {
      return { models: [], warning: "Grok CLI returned an incomplete or invalid model catalog." };
    }
    const models = parseGrokCliModels(data);
    return models.length
      ? { models, complete: true }
      : { models: [], complete: true, warning: "Grok CLI returned no selectable models." };
  } catch (error) {
    options.signal?.throwIfAborted();
    if (policy?.strictProxy === true || error?.message?.startsWith("[ProxyFetch]")) throw error;
    if (deadline.signal.aborted) return { models: [], warning: "Grok CLI model discovery timed out." };
    log?.warn?.("Grok CLI model discovery failed", { error: safeRefreshErrorType(error) });
    return { models: [], warning: "Grok CLI model discovery failed." };
  } finally {
    clearTimeout(timer);
  }
}
