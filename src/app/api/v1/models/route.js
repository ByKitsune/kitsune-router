import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS, getModelKind, getModelsByProviderId } from "@/shared/constants/models";
import {
  AI_PROVIDERS,
  getProviderAlias,
  isAnthropicCompatibleProvider,
  isOpenAICompatibleProvider,
} from "@/shared/constants/providers";
import { getProviderConnections, getCombos, getCustomModels, getModelAliases, getProviderNodes } from "@/lib/localDb";
import { getDisabledModels } from "@/lib/disabledModelsDb";
import { resolveKiroModels } from "open-sse/services/kiroModels.js";
import { resolveKimchiModels } from "open-sse/services/kimchiModels.js";
import { resolveQoderModels } from "open-sse/services/qoderModels.js";
import { resolveCopilotModels } from "open-sse/services/copilotModels.js";
import { resolveClinepassModels } from "open-sse/services/clinepassModels.js";
import { resolveGrokCliModels } from "open-sse/services/grokCliModels.js";
import { resolveCursorModels } from "open-sse/services/cursorModels.js";
import { resolveZedModels } from "open-sse/shared/zedAuth.js";
import { fetchProviderLiveModels } from "@/shared/utils/providerLiveModels";
import { updateProviderCredentials } from "@/sse/services/tokenRefresh";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { capabilitiesFromServiceKind, getCapabilitiesForModel, withDeclaredCapabilities } from "open-sse/providers/capabilities.js";
import { canonicalizeProviderId as resolveProviderAlias, PROVIDER_IDENTITIES } from "open-sse/providers/identity.js";
import { applyReviewedCapabilities, getReviewedModelMetadata } from "open-sse/providers/metadata/reviewed.js";
import { inferModelKind } from "open-sse/providers/models/schema.js";
import { API_CORS_HEADERS } from "@/shared/utils/cors.js";
import { getComboTokenLimits } from "./comboLimits.js";

// Per-provider live model resolvers. Each receives a connection record and
// returns { models: [{ id, name? }, ...] } | null on failure.
// Adding a provider here makes /v1/models prefer the live catalog for it.
const LIVE_MODEL_RESOLVERS = {
  kiro: async (conn, proxyOptions) => {
    const result = await resolveKiroModels({
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      providerSpecificData: conn.providerSpecificData || {}
    }, { log: console, proxyOptions });
    return result?.models?.length ? { models: result.models } : null;
  },
  qoder: async (conn, proxyOptions) => {
    const result = await resolveQoderModels({
      apiKey: conn.apiKey,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      email: conn.email,
      displayName: conn.displayName,
      providerSpecificData: conn.providerSpecificData || {}
    }, { proxyOptions });
    if (!result?.models?.length) return null;
    return {
      models: result.models,
    };
  },
  kimchi: async (conn, proxyOptions) => {
    const result = await resolveKimchiModels({
      accessToken: conn.accessToken,
      apiKey: conn.apiKey,
      providerSpecificData: conn.providerSpecificData || {}
    }, { log: console, proxyOptions });
    return result?.models?.length ? { models: result.models } : null;
  },
  github: async (conn, proxyOptions) => {
    const result = await resolveCopilotModels({
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      providerSpecificData: conn.providerSpecificData || {}
    }, {
      log: console,
      proxyOptions,
      onCredentialsRefreshed: async (refreshed) => {
        await updateProviderCredentials(conn.id, {
          copilotToken: refreshed.copilotToken,
          copilotTokenExpiresAt: refreshed.copilotTokenExpiresAt,
          existingProviderSpecificData: conn.providerSpecificData || {},
        });
      },
    });
    return result?.models?.length ? { models: result.models } : null;
  },
  clinepass: async (conn, proxyOptions) => {
    const result = await resolveClinepassModels({
      accessToken: conn.accessToken,
      apiKey: conn.apiKey,
    }, { proxyOptions });
    return result?.models?.length ? { models: result.models } : null;
  },
  "grok-cli": async (conn, proxyOptions) => {
    const result = await resolveGrokCliModels({
      ...conn,
      connectionId: conn.id,
    }, {
      log: console,
      proxyOptions,
      onCredentialsRefreshed: async (refreshed) => {
        await updateProviderCredentials(conn.id, {
          ...refreshed,
          existingProviderSpecificData: conn.providerSpecificData || {},
        });
      },
    });
    return result?.models?.length ? { models: result.models } : null;
  },
  cursor: async (conn, proxyOptions) => {
    const result = await resolveCursorModels({
      accessToken: conn.accessToken,
      providerSpecificData: conn.providerSpecificData || {},
    }, { log: console, proxyOptions });
    return result?.models?.length ? { models: result.models } : null;
  },
  zed: async (conn, proxyOptions) => {
    const result = await resolveZedModels({
      accessToken: conn.accessToken,
      providerSpecificData: conn.providerSpecificData || {},
    }, { proxyOptions });
    if (!result?.models?.length) return null;
    return {
      models: result.models
        .filter((m) => !m.isDisabled)
        .map((m) => ({
          ...m,
          capabilities: {
            ...(typeof m.supportsTools === "boolean" ? { tools: m.supportsTools } : {}),
            ...(typeof m.supportsImages === "boolean" ? { vision: m.supportsImages } : {}),
            ...(typeof m.supportsThinking === "boolean" ? { reasoning: m.supportsThinking } : {}),
            ...m.capabilities,
          },
        })),
    };
  },
};

// LLM kind sentinel — combos/models with no explicit kind default to LLM
const LLM_KIND = "llm";

// Map per-model `type` field (in PROVIDER_MODELS) to service kind.
// Models without `type` are treated as LLM.
// For dynamic/unknown model IDs (compatible providers, alias map, custom models)
// fall back to provider-level kind matching when per-model type is unavailable.
function inferKindFromUnknownModelId(modelId) {
  return inferModelKind({ id: modelId }) || LLM_KIND;
}

// Provider matches kindFilter when its serviceKinds intersect the requested kinds.
// LLM is the default kind for providers missing serviceKinds.
function providerMatchesKinds(providerId, kindFilter) {
  const provider = AI_PROVIDERS[providerId];
  const kinds = Array.isArray(provider?.serviceKinds) && provider.serviceKinds.length > 0
    ? provider.serviceKinds
    : [LLM_KIND];
  return kindFilter.some((k) => kinds.includes(k));
}

// Combo matches kindFilter when its `kind` field is in the list.
// Combos with no kind are treated as LLM.
function comboMatchesKinds(combo, kindFilter) {
  const kind = combo?.kind || LLM_KIND;
  return kindFilter.includes(kind);
}

// Known typed catalog fields only; absent values must not erase capability floors.
function modelMetadata(row) {
  if (!row) return {};
  const caps = {};
  const inputs = row.architecture?.input_modalities || row.input_modalities;
  if (Array.isArray(inputs)) {
    caps.vision = inputs.includes("image");
    if (inputs.includes("audio")) caps.audioInput = true;
  }
  for (const [key, value] of Object.entries({
    contextWindow: row.contextWindow ?? row.contextLength ?? row.context_length ?? row.context_window,
    maxInput: row.maxInput ?? row.maxInputTokens ?? row.max_input_tokens,
    maxOutput: row.maxOutput ?? row.maxOutputTokens ?? row.max_completion_tokens ?? row.max_output_tokens,
  })) {
    if (Number.isFinite(value) && value > 0) caps[key] = value;
  }
  return { ...caps, ...row.capabilities, ...row.caps };
}

function indexModelRows(rows, staticRows = new Map()) {
  const index = new Map();
  for (const row of rows) {
    if (!row?.id) continue;
    if (!index.has(row.id)) index.set(row.id, new Map());
    const knownKinds = staticRows.get(row.id);
    const kind = row.kind || row.type || inferModelKind(row)
      || (knownKinds?.size === 1 ? knownKinds.keys().next().value : LLM_KIND);
    index.get(row.id).set(kind, row);
  }
  return index;
}

/**
 * Build OpenAI-format models list filtered by service kinds.
 * @param {string[]} kindFilter - List of service kinds to include (e.g. ["llm"], ["webSearch","webFetch"]).
 */
export async function buildModelsList(kindFilter) {
  let connections = [];
  let hasConfiguredConnections = false;
  try {
    connections = await getProviderConnections();
    hasConfiguredConnections = connections.length > 0;
    connections = connections.filter(c => c.isActive !== false);
  } catch (e) {
    console.log("Could not fetch providers, returning all models");
  }

  let combos = [];
  try {
    combos = await getCombos();
  } catch (e) {
    console.log("Could not fetch combos");
  }

  let customModels = [];
  try {
    customModels = await getCustomModels();
  } catch (e) {
    console.log("Could not fetch custom models");
  }

  let modelAliases = {};
  try {
    modelAliases = await getModelAliases();
  } catch (e) {
    console.log("Could not fetch model aliases");
  }

  let disabledByAlias = {};
  try {
    disabledByAlias = await getDisabledModels();
  } catch (e) {
    console.log("Could not fetch disabled models");
  }
  const isDisabled = (alias, modelId) => Array.isArray(disabledByAlias[alias]) && disabledByAlias[alias].includes(modelId);

  const activeConnectionByProvider = new Map();
  for (const conn of connections) {
    const providerId = resolveProviderAlias(conn.provider);
    if (!activeConnectionByProvider.has(providerId)) activeConnectionByProvider.set(providerId, conn);
  }

  let providerNodes = [];
  if (connections.some((conn) => isOpenAICompatibleProvider(conn.provider) || isAnthropicCompatibleProvider(conn.provider))) {
    try {
      providerNodes = await getProviderNodes();
    } catch {
      console.log("Could not fetch provider prefixes, using connection metadata");
    }
  }
  const nodesByProvider = new Map(providerNodes.map((node) => [node.id, node]));
  const providerByPrefix = new Map();
  for (const conn of connections) {
    const prefix = nodesByProvider.get(conn.provider)?.prefix || conn.providerSpecificData?.prefix;
    if (typeof prefix === "string" && prefix && !Object.hasOwn(PROVIDER_IDENTITIES, prefix)) {
      providerByPrefix.set(prefix, resolveProviderAlias(conn.provider));
    }
  }
  const resolveComboProvider = (prefix) => Object.hasOwn(PROVIDER_IDENTITIES, prefix)
    ? resolveProviderAlias(prefix) : providerByPrefix.get(prefix) || resolveProviderAlias(prefix);

  const models = [];
  const catalogModels = new Map();
  const llmCombos = [];

  // Combos first (filtered by kind). Web combos expose `kind` so AI knows search vs fetch.
  for (const combo of combos) {
    if (!comboMatchesKinds(combo, kindFilter)) continue;
    const entry = {
      id: combo.name,
      object: "model",
      owned_by: "combo",
    };
    if (combo.kind === "webSearch" || combo.kind === "webFetch") {
      entry.kind = combo.kind;
    }
    if (!combo.kind || combo.kind === LLM_KIND) llmCombos.push({ combo, entry });
    models.push(entry);
  }

  // Static fallback and credential-free providers share the same overlays and filters.
  if (!hasConfiguredConnections) {
    for (const alias of Object.keys(PROVIDER_MODELS)) {
      const providerId = resolveProviderAlias(alias);
      activeConnectionByProvider.set(providerId, null);
    }
    for (const row of customModels) {
      if (row?.providerAlias) activeConnectionByProvider.set(resolveProviderAlias(row.providerAlias), null);
    }
  }
  for (const [providerId, provider] of Object.entries(AI_PROVIDERS)) {
    if (provider.noAuth && !activeConnectionByProvider.has(providerId)) activeConnectionByProvider.set(providerId, null);
  }
  for (const [providerId, conn] of activeConnectionByProvider.entries()) {
    if (!providerMatchesKinds(providerId, kindFilter) && !(kindFilter.includes("imageToText") && providerMatchesKinds(providerId, [LLM_KIND]))) continue;

    const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
    const outputAlias = (
      conn?.providerSpecificData?.prefix
      || (!hasConfiguredConnections ? staticAlias : getProviderAlias(providerId))
      || staticAlias
    ).trim();
    const providerModels = [...getModelsByProviderId(providerId)];
    if (AI_PROVIDERS[providerId]?.noAuth) {
      for (const row of AI_PROVIDERS[providerId]?.ttsConfig?.models || []) {
        if (!providerModels.some((m) => m.id === row.id)) providerModels.push({ ...row, kind: "tts" });
      }
    }
    const enabledModels = conn?.providerSpecificData?.enabledModels;
    const hasExplicitEnabledModels =
      Array.isArray(enabledModels) && enabledModels.length > 0;
    const isCompatibleProvider =
      isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

    const staticRows = indexModelRows(providerModels);
    let liveRows = new Map();

    let rawModelIds = isCompatibleProvider
      ? []
      : (hasExplicitEnabledModels
          ? Array.from(
              new Set(
                enabledModels.filter(
                  (modelId) => typeof modelId === "string" && modelId.trim() !== "",
                ),
              ),
            )
          : providerModels.map((model) => model.id));

    // Config-driven live catalog override (e.g. Kiro returns dynamic
    // -thinking/-agentic variants per account). On failure, fall back to
    // whatever rawModelIds already holds.
    const liveResolver = LIVE_MODEL_RESOLVERS[providerId];
    const proxyOptions = conn && !hasExplicitEnabledModels && (liveResolver || (!isCompatibleProvider && conn?.apiKey))
      ? await resolveConnectionProxyConfig(conn.providerSpecificData || {})
      : null;
    if (conn && liveResolver && !hasExplicitEnabledModels) {
      try {
        const live = await liveResolver(conn, proxyOptions);
        if (live?.models?.length) {
          rawModelIds = live.models.map((m) => m.id);
          liveRows = indexModelRows(live.models, staticRows);
        }
      } catch (err) {
        console.log(`Live model fetch failed for ${providerId}: ${err?.message || err}`);
      }
    }

    // Generic live catalog for built-in API-key providers (nvidia, openrouter,
    // groq, ...): fetch the provider's /models endpoint and UNION it with the
    // static list so newly released models appear immediately. Skipped when the
    // user configured an explicit model whitelist (enabledModels), for
    // compatible nodes (they have their own /models fetch above), or for
    // providers with a dedicated live resolver.
    if (
      !liveResolver &&
      !isCompatibleProvider &&
      !hasExplicitEnabledModels &&
      conn?.apiKey
    ) {
      try {
        const live = await fetchProviderLiveModels(providerId, conn.apiKey, { proxyOptions });
        if (live?.length) {
          rawModelIds = Array.from(new Set([...live.map((m) => m.id), ...rawModelIds]));
          liveRows = indexModelRows(live, staticRows);
        }
      } catch (err) {
        console.log(`Generic live model fetch failed for ${providerId}: ${err?.message || err}`);
      }
    }

    const modelIds = rawModelIds
      .map((modelId) => {
        // Registry/live rows are native wire IDs. Only configured whitelist
        // values may carry a router prefix; an exact native match wins.
        if (typeof modelId !== "string" || !hasExplicitEnabledModels || providerModels.some((m) => m.id === modelId)) return modelId;
        if (modelId.startsWith(`${outputAlias}/`)) {
          return modelId.slice(outputAlias.length + 1);
        }
        if (modelId.startsWith(`${staticAlias}/`)) {
          return modelId.slice(staticAlias.length + 1);
        }
        if (modelId.startsWith(`${providerId}/`)) {
          return modelId.slice(providerId.length + 1);
        }
        return modelId;
      })
      .filter((modelId) => typeof modelId === "string" && modelId.trim() !== "");

    // Index ALL declarations before filtering; provider and service kind form identity.
    const customRows = indexModelRows(customModels.filter((m) =>
      m?.id && (m.providerAlias === outputAlias || resolveProviderAlias(m.providerAlias) === providerId)
    ).map((m) => ({ ...m, kind: getModelKind(m) || LLM_KIND, id: String(m.id).trim() })));
    const customModelIds = [...customRows.keys()];

    const aliasModelIds = Object.values(modelAliases || {})
      .filter((fullModel) => {
        if (typeof fullModel !== "string" || !fullModel.includes("/")) return false;
        return (
          fullModel.startsWith(`${outputAlias}/`) ||
          fullModel.startsWith(`${staticAlias}/`) ||
          fullModel.startsWith(`${providerId}/`)
        );
      })
      .map((fullModel) => {
        if (fullModel.startsWith(`${outputAlias}/`)) {
          return fullModel.slice(outputAlias.length + 1);
        }
        if (fullModel.startsWith(`${staticAlias}/`)) {
          return fullModel.slice(staticAlias.length + 1);
        }
        if (fullModel.startsWith(`${providerId}/`)) {
          return fullModel.slice(providerId.length + 1);
        }
        return fullModel;
      })
      .filter((modelId) => typeof modelId === "string" && modelId.trim() !== "");

    const mergedModelIds = Array.from(new Set([...modelIds, ...customModelIds, ...aliasModelIds]));

    for (const modelId of mergedModelIds) {
      const kinds = new Set([
        ...(staticRows.get(modelId)?.keys() || []),
        ...(liveRows.get(modelId)?.keys() || []),
        ...(customRows.get(modelId)?.keys() || []),
      ]);
      if (!kinds.size) kinds.add(inferKindFromUnknownModelId(modelId));
      const kind = [...kinds].find((k) => kindFilter.includes(k)
        || (k === "imageToText" && kindFilter.includes(LLM_KIND))
        || (k === LLM_KIND && kindFilter.includes("imageToText")));
      if (!kind) continue;
      const allowAsLlm = kind === "imageToText" && kindFilter.includes(LLM_KIND);
      if (isDisabled(outputAlias, modelId) || isDisabled(staticAlias, modelId) || isDisabled(providerId, modelId)) continue;

      // Do not advertise a model its own registry entry marks deprecated.
      // Without this the flag was UI-only and the id still reached clients (e.g.
      // deepseek/deepseek-v4-flash, a retired compatibility alias). An operator's
      // explicit custom declaration is honoured regardless.
      const isCustomDeclared = customRows.has(modelId);
      const isDeprecated = [staticRows.get(modelId), liveRows.get(modelId)]
        .some((byKind) => byKind && [...byKind.values()].some((row) => row?.deprecated === true));
      if (isDeprecated && !isCustomDeclared) continue;

      const model = {
        id: `${outputAlias}/${modelId}`,
        object: "model",
        owned_by: outputAlias,
      };
      // Live-catalog resolvers (kiro/qoder/github/clinepass) mostly only return
      // { id, name } — no per-model capability data. Fall back to the same
      // pattern-matched capabilities the dashboard uses (useModelCaps.js) so
      // dynamically-discovered LLM models still surface vision/reasoning/search/tools.
      const baseCaps = {
        ...applyReviewedCapabilities({
          ...(kind === LLM_KIND || kind === "imageToText"
            ? getCapabilitiesForModel(providerId, modelId)
            // Explicit unknowns also block chat defaults in the declaration overlay.
            // Static, reviewed, live and operator numeric limits still take precedence.
            : { tools: false, reasoning: false, search: false, contextWindow: null, maxInput: null, maxOutput: null }),
          ...modelMetadata(staticRows.get(modelId)?.get(kind)),
          ...capabilitiesFromServiceKind(kind),
        }, providerId, modelId),
        ...modelMetadata(liveRows.get(modelId)?.get(kind)),
      };
      const metadata = getReviewedModelMetadata(providerId, modelId);
      if (metadata) model.metadata = metadata;
      const customRow = customRows.get(modelId)?.get(kind)
        || (kind === LLM_KIND ? customRows.get(modelId)?.get("imageToText") : null);
      const declared = {
        ...(customRow?.kind === "imageToText" ? capabilitiesFromServiceKind("imageToText") : {}),
        ...modelMetadata(customRow),
      };
      const caps = withDeclaredCapabilities(baseCaps, declared, providerId, modelId);
      if (Number.isFinite(declared.maxInput) && declared.maxInput > 0) caps.maxInput = declared.maxInput;
      if (kindFilter.includes("imageToText") && !kindFilter.includes(LLM_KIND)
        && (kind === LLM_KIND || kind === "imageToText") && !caps?.vision) continue;
      if (caps) model.capabilities = caps;
      // Token limits under the snake_case names the OpenAI/OpenRouter
      // convention uses. `capabilities.contextWindow` is camelCase and nested,
      // so clients matching context_length find nothing, fall back to guessing
      // the window from the model name, and guess high — a 372k model read as
      // 1.05M never reaches its compaction threshold and hard-fails upstream.
      // Emitted at top level because not every client recurses into nested
      // objects; the camelCase `capabilities` block stays for compatibility.
      if (kind === LLM_KIND || allowAsLlm) {
        let contextWindow = caps?.contextWindow;
        let maxOutput = caps?.maxOutput;
        // Live-catalog and service-kind capabilities are usually partial
        // (often just { tools: true }), so fill the gaps from the static
        // table rather than emitting null and leaving clients to guess.
        if (!Number.isFinite(contextWindow) || !Number.isFinite(maxOutput)) {
          const fallback = getCapabilitiesForModel(providerId, modelId);
          if (!Number.isFinite(contextWindow)) contextWindow = fallback.contextWindow;
          if (!Number.isFinite(maxOutput)) maxOutput = fallback.maxOutput;
        }
        if (Number.isFinite(contextWindow)) model.context_length = contextWindow;
        if (Number.isFinite(caps?.maxInput) && caps.maxInput > 0) model.max_input_tokens = caps.maxInput;
        if (Number.isFinite(maxOutput)) model.max_completion_tokens = maxOutput;
      }
      if (kind === LLM_KIND || allowAsLlm) catalogModels.set(`${providerId}/${modelId}`, model);
      models.push(model);
    }

    // Web search/fetch — provider IS the model, expose as {alias}/search and/or {alias}/fetch with explicit kind
    const providerInfo = AI_PROVIDERS[providerId];
    if (kindFilter.includes("webSearch") && providerInfo?.searchConfig && !isDisabled(outputAlias, "search") && !isDisabled(staticAlias, "search") && !isDisabled(providerId, "search")) {
      models.push({
        id: `${outputAlias}/search`,
        object: "model",
        kind: "webSearch",
        owned_by: outputAlias,
      });
    }
    if (kindFilter.includes("webFetch") && providerInfo?.fetchConfig && !isDisabled(outputAlias, "fetch") && !isDisabled(staticAlias, "fetch") && !isDisabled(providerId, "fetch")) {
      models.push({
        id: `${outputAlias}/fetch`,
        object: "model",
        kind: "webFetch",
        owned_by: outputAlias,
      });
    }

  }

  const declaredModels = new Map();
  for (const row of customModels) {
    if (!row?.providerAlias || typeof row.id !== "string") continue;
    const kind = getModelKind(row) || LLM_KIND;
    if (kind !== LLM_KIND && kind !== "imageToText") continue;
    const key = `${resolveComboProvider(row.providerAlias)}/${row.id.trim()}`;
    if (kind === LLM_KIND || !declaredModels.has(key)) declaredModels.set(key, row);
  }
  const comboContext = {
    combosByName: new Map(combos.map((combo) => [combo.name, combo])),
    modelAliases,
    resolveModel(memberId) {
      const slash = memberId.indexOf("/");
      const providerId = resolveComboProvider(memberId.slice(0, slash));
      const modelId = memberId.slice(slash + 1);
      if (!modelId || (hasConfiguredConnections && !activeConnectionByProvider.has(providerId) && !AI_PROVIDERS[providerId]?.noAuth)) return null;
      const key = `${providerId}/${modelId}`;
      const listed = catalogModels.get(key);
      if (listed) return { contextWindow: listed.context_length, maxOutput: listed.max_completion_tokens };
      return withDeclaredCapabilities(
        getCapabilitiesForModel(providerId, modelId),
        modelMetadata(declaredModels.get(key)),
        providerId, modelId,
      );
    },
  };
  for (const { combo, entry } of llmCombos) {
    const limits = getComboTokenLimits(combo, comboContext);
    if (Number.isFinite(limits.contextWindow)) entry.context_length = limits.contextWindow;
    if (Number.isFinite(limits.maxOutput)) entry.max_completion_tokens = limits.maxOutput;
  }

  const dedupedModels = [];
  const seenModelIds = new Set();
  for (const model of models) {
    if (!model?.id || seenModelIds.has(model.id)) continue;
    seenModelIds.add(model.id);
    dedupedModels.push(model);
  }

  return dedupedModels;
}

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": API_CORS_HEADERS["Access-Control-Allow-Headers"],
    },
  });
}

/**
 * GET /v1/models - OpenAI compatible models list (LLM/chat models only by default).
 * For other capabilities use /v1/models/{kind} (image, tts, stt, embedding, image-to-text, web).
 */
const modelsCache = new Map();
const MODELS_CACHE_TTL_MS = 30_000;

export async function GET() {
  try {
    const cacheKey = "all";
    const cached = modelsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return Response.json({ object: "list", data: cached.data }, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      });
    }
    const data = await buildModelsList([LLM_KIND]);
    modelsCache.set(cacheKey, { data, expiresAt: Date.now() + MODELS_CACHE_TTL_MS });
    return Response.json({ object: "list", data }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.log("Error fetching models:", error);
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}
