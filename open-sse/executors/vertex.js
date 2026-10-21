import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { VERTEX_CONFIG } from "../config/vertexConfig.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { parseVertexSaJson, refreshVertexToken, refreshGoogleToken } from "../services/tokenRefresh.js";
import { getRefreshProxyKey } from "../services/tokenRefresh/dedup.js";
import { getEnvProxyUrl, proxyAwareFetch } from "../utils/proxyFetch.js";
import { createHash } from "node:crypto";

// Only digests and validated project IDs are retained, never raw API/proxy keys.
const projectIdCache = new Map();

function validateRouteSegment(value, pattern, name) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim() !== value || !pattern.test(value)) {
    // Never interpolate configuration or credential JSON into client errors.
    throw new Error(`Vertex: invalid ${name}. Use a plain identifier, not a URL or resource path.`);
  }
  return value;
}

function getRouteMetadata(credentials, saJson, adcJson) {
  const projectId = validateRouteSegment(
    saJson?.project_id || adcJson?.quota_project_id || credentials?.providerSpecificData?.projectId,
    VERTEX_CONFIG.projectPattern, "project_id"
  );
  const location = validateRouteSegment(
    credentials?.providerSpecificData?.location, VERTEX_CONFIG.locationPattern, "location"
  );
  return { projectId, location };
}

function resolveVertexProxyOptions(credentials, proxyOptions) {
  // Shared transport owns exclusions and fails closed for selected proxies.
  // Promoting strictness here would reject intentional account noProxy routes.
  return proxyOptions ?? credentials?.providerSpecificData ?? null;
}

async function readProjectProbeJson(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let bytes = 0;
  const onAbort = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > VERTEX_CONFIG.projectProbeMaxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

/**
 * Parse Google ADC user credential JSON from apiKey string.
 * This is the format produced by `gcloud auth application-default login`.
 */
function parseVertexAdcJson(apiKey) {
  if (typeof apiKey !== "string") return null;
  try {
    const parsed = JSON.parse(apiKey);
    if (
      parsed.type === "authorized_user" &&
      parsed.client_id &&
      parsed.client_secret &&
      parsed.refresh_token
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve GCP project ID from a raw Vertex API key.
 * Sends a dummy 404 request and parses "projects/{id}" from the error message.
 */
async function resolveProjectId(apiKey, proxyOptions, signal) {
  signal?.throwIfAborted();
  if (typeof apiKey !== "string" || !apiKey) return null;
  const cacheKey = createHash("sha256").update(JSON.stringify([
    apiKey, getRefreshProxyKey(proxyOptions), getEnvProxyUrl(VERTEX_CONFIG.origin) || "",
  ])).digest("hex");
  const now = Date.now();
  for (const [key, entry] of projectIdCache) {
    if (entry.expiresAt <= now) projectIdCache.delete(key);
  }
  const cached = projectIdCache.get(cacheKey);
  if (cached) return cached.projectId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Vertex: project discovery timed out.")), VERTEX_CONFIG.projectProbeTimeoutMs);
  const probeSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const url = new URL(`${VERTEX_CONFIG.origin}/${VERTEX_CONFIG.apiVersion}/${VERTEX_CONFIG.publisherPath}/${VERTEX_CONFIG.projectProbeModel}:${VERTEX_CONFIG.generateAction}`);
  url.searchParams.set("key", apiKey);

  try {
    const res = await proxyAwareFetch(url.toString(), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      signal: probeSignal, redirect: "error",
    }, proxyOptions);
    probeSignal.throwIfAborted();
    // Only the expected missing-model response can identify a project. Never
    // turn an auth/quota/policy denial into an automatic generation request.
    if (res.status !== HTTP_STATUS.NOT_FOUND) {
      await res.body?.cancel();
      return null;
    }
    const json = await readProjectProbeJson(res, probeSignal);
    probeSignal.throwIfAborted();
    const msg = json?.[0]?.error?.message || json?.error?.message;
    const match = typeof msg === "string" ? msg.match(/projects\/([^/]+)\//) : null;
    const projectId = match?.[1];
    if (!projectId || !VERTEX_CONFIG.projectPattern.test(projectId)) return null;

    if (projectIdCache.size >= VERTEX_CONFIG.projectCacheMaxEntries) {
      projectIdCache.delete(projectIdCache.keys().next().value);
    }
    projectIdCache.set(cacheKey, { projectId, expiresAt: Date.now() + VERTEX_CONFIG.projectCacheTtlMs });
    return projectId;
  } catch {
    signal?.throwIfAborted();
    if (controller.signal.aborted) throw controller.signal.reason;
    // Transport errors can contain ?key=, proxy passwords or upstream bodies.
    throw new Error("Vertex: project discovery failed. Please configure project_id manually or check the proxy.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * VertexExecutor - Google Cloud Vertex AI
 *
 * "vertex"         → Gemini models via regional/global Vertex endpoint
 * "vertex-partner" → Partner models (Llama, Mistral, GLM, DeepSeek, Qwen)
 *                    via global OpenAI-compatible endpoint
 *
 * Auth: SA JSON (stored as apiKey) → JWT assertion → Bearer token (via jose)
 * Token is minted/cached in tokenRefresh.js, not here.
 */
export class VertexExecutor extends BaseExecutor {
  constructor(providerId = "vertex") {
    super(providerId, PROVIDERS[providerId] || {});
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    const saJson = parseVertexSaJson(credentials?.apiKey);
    const adcJson = parseVertexAdcJson(credentials?.apiKey);
    const usesOAuth = !!saJson || !!adcJson || !!credentials?.accessToken;
    const rawKey = !usesOAuth ? credentials?.apiKey : null;
    const { projectId, location: configuredLocation } = getRouteMetadata(credentials, saJson, adcJson);

    if (this.provider === "vertex-partner") {
      // Partner models require project_id in path regardless of auth method
      if (!projectId) throw new Error("Vertex partner models require a project_id. Add it in providerSpecificData or use Service Account JSON.");
      const url = new URL(`${VERTEX_CONFIG.origin}/${VERTEX_CONFIG.apiVersion}/projects/${encodeURIComponent(projectId)}/locations/${VERTEX_CONFIG.defaultLocation}/${VERTEX_CONFIG.partnerPath}`);
      if (rawKey) url.searchParams.set("key", rawKey);
      return url.toString();
    }

    // Gemini on Vertex
    const modelId = validateRouteSegment(model, VERTEX_CONFIG.modelPattern, "model");
    if (!modelId) throw new Error("Vertex: model is required.");
    const action = stream ? VERTEX_CONFIG.streamAction : VERTEX_CONFIG.generateAction;

    if (usesOAuth) {
      // SA JSON / ADC / pre-set accessToken: must use project-scoped path to avoid RESOURCE_PROJECT_INVALID
      if (!projectId) {
        throw new Error(
          "Vertex OAuth/ADC requires a project_id. " +
          "Add quota_project_id to your ADC JSON or set providerSpecificData.projectId."
        );
      }
    }

    // G04 / upstream 9c141910: explicit raw-key projects honor their location,
    // defaulting to global. OAuth retains its regional default; projectless
    // raw-key connections retain the legacy publishers endpoint.
    const location = configuredLocation || (usesOAuth ? VERTEX_CONFIG.oauthDefaultLocation : VERTEX_CONFIG.defaultLocation);
    const scope = projectId ? `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/` : "";
    const url = new URL(`${VERTEX_CONFIG.origin}/${VERTEX_CONFIG.apiVersion}/${scope}${VERTEX_CONFIG.publisherPath}/${encodeURIComponent(modelId)}:${action}`);
    if (stream) url.searchParams.set("alt", "sse");
    if (rawKey) url.searchParams.set("key", rawKey);
    return url.toString();
  }

  buildHeaders(credentials, stream = true) {
    const headers = { "Content-Type": "application/json" };

    // Only set Bearer token if using SA JSON flow (raw key goes in URL ?key=)
    if (credentials.accessToken) {
      headers["Authorization"] = `Bearer ${credentials.accessToken}`;
    }

    if (stream) headers["Accept"] = "text/event-stream";

    return headers;
  }

  async refreshCredentials(credentials, log, proxyOptions = null, signal = null) {
    signal?.throwIfAborted();
    const saJson = parseVertexSaJson(credentials?.apiKey);
    if (!saJson) return null;

    const result = await refreshVertexToken(saJson, log, resolveVertexProxyOptions(credentials, proxyOptions), signal);
    signal?.throwIfAborted();
    if (!result) return null;

    return { accessToken: result.accessToken, expiresAt: result.expiresAt };
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    signal?.throwIfAborted();
    const saJson = parseVertexSaJson(credentials?.apiKey);
    const adcJson = parseVertexAdcJson(credentials?.apiKey);
    const { projectId } = getRouteMetadata(credentials, saJson, adcJson);
    const usesOAuth = !!saJson || !!adcJson || !!credentials?.accessToken;
    const transportOptions = resolveVertexProxyOptions(credentials, proxyOptions);

    // Validate the complete route before any token refresh/network request.
    // Projectless raw-key partners are the sole case requiring discovery first.
    if (this.provider !== "vertex-partner" || projectId || usesOAuth) {
      this.buildUrl(model, stream, 0, credentials);
    }

    let requestCredentials = credentials;
    if (this.provider === "vertex-partner" && !usesOAuth && !projectId) {
      const resolvedProjectId = await resolveProjectId(credentials?.apiKey, transportOptions, signal);
      signal?.throwIfAborted();
      if (!resolvedProjectId) throw new Error("Vertex: could not resolve project_id from API key. Please add it manually in provider settings.");
      // Do not promote inferred policy-specific metadata to caller configuration.
      requestCredentials = { ...credentials, providerSpecificData: { ...credentials?.providerSpecificData, projectId: resolvedProjectId } };
    }

    // SA JSON flow: mint Bearer token via JWT assertion (cached)
    if (saJson) {
      const result = await refreshVertexToken(saJson, log, transportOptions, signal);
      signal?.throwIfAborted();
      if (!result?.accessToken) throw new Error("Vertex: failed to mint access token from Service Account JSON");
      credentials.accessToken = result.accessToken;
    }

    // ADC user credential flow: refresh Bearer token via Google OAuth2 token endpoint
    if (adcJson) {
      const result = await refreshGoogleToken(
        adcJson.refresh_token,
        adcJson.client_id,
        adcJson.client_secret,
        log,
        transportOptions,
        signal
      );
      signal?.throwIfAborted();
      if (!result?.accessToken) throw new Error("Vertex: failed to refresh access token from ADC JSON (authorized_user)");
      credentials.accessToken = result.accessToken;
    }

    signal?.throwIfAborted();
    const url = this.buildUrl(model, stream, 0, requestCredentials);
    const headers = this.buildHeaders(requestCredentials, stream);
    const transformedBody = this.transformRequest(model, body, stream, requestCredentials);

    let response;
    try {
      response = await proxyAwareFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(transformedBody),
        signal,
        redirect: "error",
      }, transportOptions);
    } catch {
      signal?.throwIfAborted();
      throw new Error("Vertex: upstream request failed. Check the configured proxy or network.");
    }

    return { response, url, headers, transformedBody };
  }
}

export default VertexExecutor;
