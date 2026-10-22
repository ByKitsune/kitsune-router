import { PROVIDER_MODELS } from "open-sse/config/providerModels.js";
import { AI_PROVIDERS, ALIAS_TO_ID } from "@/shared/constants/providers";
import { getModelKind } from "@/shared/constants/models";
import { getCustomModels } from "@/lib/localDb";
import { getCapabilitiesForModel, withDeclaredCapabilities } from "open-sse/providers/capabilities.js";
import { getReviewedModelMetadata, getPublicModelMetadata } from "open-sse/providers/metadata/reviewed.js";
import { canonicalizeProviderId } from "open-sse/providers/identity.js";
import { errorResponse } from "open-sse/utils/error.js";

const KIND_ENDPOINT = {
  llm: "/v1/chat/completions",
  image: "/v1/images/generations",
  video: "/v1/videos/generations",
  music: "/v1/audio/music",
  tts: "/v1/audio/speech",
  stt: "/v1/audio/transcriptions",
  embedding: "/v1/embeddings",
  imageToText: "/v1/chat/completions",
  webSearch: "/v1/search",
  webFetch: "/v1/web/fetch",
};

const TTS_VOICES_API = new Set(["elevenlabs", "edge-tts", "deepgram", "inworld", "local-device"]);

function buildInfo({ alias, providerId, model, kind, providerInfo }) {
  const out = {
    id: `${alias}/${model.id}`,
    name: model.name || model.id,
    kind,
    owned_by: alias,
    endpoint: KIND_ENDPOINT[kind] || null,
  };
  if (model.params) out.params = model.params;
  if (model.capabilities) out.capabilities = model.capabilities;
  const isChat = kind === "llm" || kind === "imageToText";
  const capabilities = isChat ? withDeclaredCapabilities(
    getCapabilitiesForModel(providerId, model.id), {
      ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
      ...(model.maxInput ? { maxInput: model.maxInput } : {}),
      ...(model.maxOutput ? { maxOutput: model.maxOutput } : {}),
      ...model.capabilities, ...model.caps,
    }, providerId, model.id,
  ) : undefined;
  if (capabilities) out.capabilities = capabilities;
  const metadata = getPublicModelMetadata(providerId, model.id, capabilities);
  if (metadata) out.metadata = metadata;
  if (model.options) out.options = model.options;
  if (model.dimensions) out.dimensions = model.dimensions;
  if (Number.isFinite(capabilities?.contextWindow)) out.contextWindow = capabilities.contextWindow;
  else if (!isChat && model.contextWindow) out.contextWindow = model.contextWindow;
  if (kind === "tts" && TTS_VOICES_API.has(providerId)) {
    out.voicesUrl = `/v1/audio/voices?provider=${providerId}`;
  }
  if (kind === "webSearch" && providerInfo?.searchConfig) {
    const cfg = providerInfo.searchConfig;
    if (cfg.searchTypes) out.searchTypes = cfg.searchTypes;
    if (cfg.maxMaxResults) out.maxResults = cfg.maxMaxResults;
    if (cfg.requiredOptions) out.required = cfg.requiredOptions;
  }
  if (kind === "webSearch" && providerInfo?.searchViaChat) {
    out.defaultModel = providerInfo.searchViaChat.defaultModel;
    out.required = ["query"];
    out.provider = alias;
  }
  return out;
}

// id format: "{alias}/{modelId}" - alias may also be providerId
// requestedKind: optional, disambiguates duplicate ids across kinds (e.g. gemini-2.5-pro llm vs stt)
async function lookup(fullId, requestedKind) {
  if (!fullId || !fullId.includes("/")) return null;
  const slash = fullId.indexOf("/");
  const alias = fullId.slice(0, slash);
  const modelId = fullId.slice(slash + 1);
  const providerId = ALIAS_TO_ID[alias] || alias;
  const providerInfo = AI_PROVIDERS[providerId];

  // PROVIDER_MODELS lookup (by alias key, fallback to providerId)
  const list = PROVIDER_MODELS[alias] || PROVIDER_MODELS[providerId] || [];
  const m = requestedKind
    ? list.find((x) => x.id === modelId && getModelKind(x, "llm") === requestedKind)
    : list.find((x) => x.id === modelId);
  let custom;
  try {
    custom = (await getCustomModels()).find(row => row.id === modelId
      && canonicalizeProviderId(row.providerAlias) === canonicalizeProviderId(providerId)
      && getModelKind(row, "llm") === (requestedKind || (m ? getModelKind(m, "llm") : getModelKind(row, "llm"))));
  } catch {
    // A missing declaration cannot override a known rejected built-in route.
  }
  if (m || custom) {
    const kind = requestedKind || getModelKind(m || custom, "llm");
    const customForKind = custom && getModelKind(custom, "llm") === kind ? custom : null;
    if ((m?.deprecated || getReviewedModelMetadata(providerId, modelId)?.limits?.routeAvailable === false) && !customForKind) return null;
    return buildInfo({ alias, providerId, model: { ...m, ...customForKind, id: modelId }, kind, providerInfo });
  }

  // Web search/fetch — virtual model id "search" / "fetch"
  if (modelId === "search" && (providerInfo?.searchConfig || providerInfo?.searchViaChat)) {
    return buildInfo({
      alias, providerId, kind: "webSearch", providerInfo,
      model: { id: "search", name: `${providerInfo.name} Search`, params: ["query", "max_results", "country", "language", "time_range", "domain_filter", "search_type"] },
    });
  }
  if (modelId === "fetch" && providerInfo?.fetchConfig) {
    return buildInfo({
      alias, providerId, kind: "webFetch", providerInfo,
      model: { id: "fetch", name: `${providerInfo.name} Fetch`, params: ["url", "format", "max_characters"] },
    });
  }
  return null;
}

export async function OPTIONS() {
  return new Response(null, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}

// GET /v1/models/info?id={alias}/{modelId} — metadata for a single model
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const kind = searchParams.get("kind");
  if (!id) {
    return errorResponse(400, "Missing required query param: id (e.g. ?id=openai/dall-e-3)", { code: "missing_model_id" });
  }
  const info = await lookup(id, kind);
  if (!info) {
    return errorResponse(404, "The requested model is not advertised. Select a model from /v1/models or check your custom declaration.", { code: "model_not_found" });
  }
  return Response.json(info, { headers: { "Access-Control-Allow-Origin": "*" } });
}
