import { NextResponse } from "next/server";
import { getProviderConnectionById } from "@/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { hasValidCliToken, isAuthenticated } from "@/dashboardGuard";

async function requireAuth(request) {
  if (await hasValidCliToken(request) || await isAuthenticated(request)) return true;
  return false;
}
import { GEMINI_CONFIG } from "@/lib/oauth/constants/oauth";
import { refreshGoogleToken, refreshCodexToken, updateProviderCredentials } from "@/sse/services/tokenRefresh";
import { resolveOllamaLocalHost } from "open-sse/config/providers.js";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { resolveKiroModels } from "open-sse/services/kiroModels.js";
import { resolveKimchiModels } from "open-sse/services/kimchiModels.js";
import { resolveQoderModels } from "open-sse/services/qoderModels.js";
import { resolveGrokCliModels } from "open-sse/services/grokCliModels.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { resolveCursorModels } from "open-sse/services/cursorModels.js";
import { resolveGoogleOAuthModels } from "open-sse/services/googleOAuthModels.js";
import { resolveCodexModels } from "open-sse/services/codexModels.js";
import { fetchProviderLiveModels, normalizeLiveModel } from "@/shared/utils/providerLiveModels";
import {
  VSCODE_VERSION,
  COPILOT_CHAT_VERSION,
  COPILOT_USER_AGENT,
  COPILOT_API_VERSION,
} from "open-sse/config/clientVersions.js";

const parseOpenAIStyleModels = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

const createOpenAIModelsConfig = (url) => ({
  url,
  method: "GET",
  headers: { "Content-Type": "application/json" },
  authHeader: "Authorization",
  authPrefix: "Bearer ",
  parseResponse: parseOpenAIStyleModels
});

const createNativeApiModelsConfig = (provider) => ({
  customResolver: async (connection, proxyOptions, signal) => {
    if (!connection.apiKey) return { error: "No valid API key found", status: 401 };
    let models;
    try {
      models = await fetchProviderLiveModels(provider, connection.apiKey, {
        useCache: false, proxyOptions, signal, allowEmptyCatalog: true, throwHttpErrors: true,
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) {
        return { error: `Failed to fetch native model catalog (${error.status})`, status: error.status };
      }
      throw error;
    }
    if (!models) return { error: "Failed to fetch native model catalog", status: 502 };
    return { models };
  },
});

const getStaticProviderModels = (providerId) =>
  getModelsByProviderId(providerId).map((model) => ({
    ...model,
    id: model.id,
    name: model.name || model.id,
  }));

const googleModelsResolver = provider => async (connection, proxyOptions, signal) => {
  if (!connection.accessToken) return provider === "antigravity"
    ? { models: getStaticProviderModels(provider), warning: "Live Google model catalog unavailable; using configured model suggestions." }
    : { error: "No valid token found", status: 401 };
  const onUnauthorized = provider === "gemini-cli" && connection.refreshToken ? async refreshSignal => {
    const refreshed = await refreshGoogleToken(connection.refreshToken, GEMINI_CONFIG.clientId, GEMINI_CONFIG.clientSecret, proxyOptions, refreshSignal);
    if (!refreshed?.accessToken) return null;
    await updateProviderCredentials(connection.id, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || connection.refreshToken,
      expiresIn: refreshed.expiresIn,
    });
    connection.accessToken = refreshed.accessToken;
    if (refreshed.refreshToken) connection.refreshToken = refreshed.refreshToken;
    return connection;
  } : undefined;
  const result = await resolveGoogleOAuthModels(provider, connection, { proxyOptions, signal, forceRefresh: true, onUnauthorized });
  if (result?.models?.length || result?.complete === true) return result;
  return { models: getStaticProviderModels(provider), warning: "Live Google model catalog unavailable; using configured model suggestions." };
};

// Provider models endpoints configuration
const PROVIDER_MODELS_CONFIG = {
  claude: {
    customResolver: async (connection, proxyOptions, signal) => {
      // Match execution's credential priority and the publisher's separate
      // API-key/OAuth models.list profiles. Never use an OAuth proof as an API key.
      const token = connection.apiKey || connection.accessToken;
      if (!token) return { error: "No valid token found", status: 401 };
      const models = await fetchProviderLiveModels("claude", token, {
        authProfile: connection.apiKey ? undefined : "oauth",
        useCache: false,
        proxyOptions,
        signal,
      });
      // A failed or incomplete live catalog must not look like a successful
      // credential check or silently advertise a partially fetched model list.
      if (!models) return { error: "Failed to fetch complete Claude model catalog", status: 502 };
      return { models };
    },
  },
  gemini: createNativeApiModelsConfig("gemini"),
  codex: {
    customResolver: async (connection, proxyOptions, signal) => {
      if (!connection.accessToken) return { error: "No valid token found", status: 401 };
      const onUnauthorized = connection.refreshToken ? async refreshSignal => {
        const refreshed = await refreshCodexToken(connection.refreshToken, proxyOptions, refreshSignal);
        refreshSignal.throwIfAborted();
        if (!refreshed?.accessToken) return null;
        await updateProviderCredentials(connection.id, {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || connection.refreshToken,
          expiresIn: refreshed.expiresIn,
        });
        refreshSignal.throwIfAborted();
        connection.accessToken = refreshed.accessToken;
        if (refreshed.refreshToken) connection.refreshToken = refreshed.refreshToken;
        return refreshed;
      } : undefined;
      const result = await resolveCodexModels(connection, { proxyOptions, signal, forceRefresh: true, onUnauthorized });
      return result || { models: [], warning: "Live Codex model catalog unavailable." };
    },
  },
  antigravity: {
    customResolver: googleModelsResolver("antigravity")
  },
  github: {
    url: "https://api.githubcopilot.com/models",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Copilot-Integration-Id": "vscode-chat",
      "editor-version": `vscode/${VSCODE_VERSION}`,
      "editor-plugin-version": `copilot-chat/${COPILOT_CHAT_VERSION}`,
      "user-agent": COPILOT_USER_AGENT,
      "x-github-api-version": COPILOT_API_VERSION
    },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      if (!data?.data) return [];
      // Filter out embeddings, non-chat models, and disabled models
      return data.data
        .filter(m => m.capabilities?.type === "chat")
        .filter(m => m.policy?.state !== "disabled") // Only return explicitly enabled models
        .map(m => ({
          id: m.id,
          name: m.name || m.id,
          version: m.version,
          capabilities: m.capabilities,
          isDefault: m.model_picker_enabled === true
        }));
    }
  },
  openai: createOpenAIModelsConfig("https://api.openai.com/v1/models"),
  openrouter: createOpenAIModelsConfig("https://openrouter.ai/api/v1/models"),
  anthropic: createNativeApiModelsConfig("anthropic"),

  alicode: {
    url: "https://coding.dashscope.aliyuncs.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  "alicode-intl": {
    url: "https://coding-intl.dashscope.aliyuncs.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  "alims-intl": {
    url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  "volcengine-ark": createOpenAIModelsConfig("https://ark.cn-beijing.volces.com/api/coding/v3/models"),
  byteplus: createOpenAIModelsConfig("https://ark.ap-southeast.bytepluses.com/api/coding/v3/models"),

  // OpenAI-compatible API key providers
  deepseek: createOpenAIModelsConfig("https://api.deepseek.com/models"),
  groq: createOpenAIModelsConfig("https://api.groq.com/openai/v1/models"),
  xai: createOpenAIModelsConfig("https://api.x.ai/v1/models"),
  mistral: createNativeApiModelsConfig("mistral"),
  perplexity: createOpenAIModelsConfig("https://api.perplexity.ai/v1/models"),
  "perplexity-agent": createOpenAIModelsConfig("https://api.perplexity.ai/v1/models"),
  together: createOpenAIModelsConfig("https://api.together.xyz/v1/models"),
  fireworks: createOpenAIModelsConfig("https://api.fireworks.ai/inference/v1/models"),
  cerebras: createOpenAIModelsConfig("https://api.cerebras.ai/v1/models"),
  cohere: createOpenAIModelsConfig("https://api.cohere.ai/v1/models"),
  nebius: createOpenAIModelsConfig("https://api.studio.nebius.ai/v1/models"),
  siliconflow: createOpenAIModelsConfig("https://api.siliconflow.com/v1/models"),
  hyperbolic: createOpenAIModelsConfig("https://api.hyperbolic.xyz/v1/models"),
  paraloncloud: createOpenAIModelsConfig("https://paraloncloud.com/v1/models"),
  ollama: createOpenAIModelsConfig("https://ollama.com/api/tags"),
  // ollama-local: url resolved dynamically below via providerSpecificData.baseUrl
  nanobanana: createOpenAIModelsConfig("https://api.nanobananaapi.ai/v1/models"),
  chutes: createOpenAIModelsConfig("https://llm.chutes.ai/v1/models"),
  nvidia: createOpenAIModelsConfig("https://integrate.api.nvidia.com/v1/models"),
  assemblyai: createOpenAIModelsConfig("https://api.assemblyai.com/v1/models"),
  "vercel-ai-gateway": createOpenAIModelsConfig("https://ai-gateway.vercel.sh/v1/models"),
  kimchi: {
    customResolver: async (connection, proxyOptions, signal) => {
      const result = await resolveKimchiModels({
        id: connection.id,
        accessToken: connection.accessToken,
        apiKey: connection.apiKey,
        providerSpecificData: connection.providerSpecificData || {},
      }, { forceRefresh: true, log: console, proxyOptions, signal });
      if (result?.models?.length) {
        return { models: result.models };
      }
      return {
        models: getStaticProviderModels("kimchi"),
        warning: "Kimchi returned no live models; falling back to static catalog.",
      };
    }
  },
  cursor: {
    customResolver: async (connection, proxyOptions, signal) => {
      const result = await resolveCursorModels({
        id: connection.id,
        accessToken: connection.accessToken,
        providerSpecificData: connection.providerSpecificData || {},
      }, { forceRefresh: true, log: console, proxyOptions, signal });
      if (result?.models?.length) return { models: result.models };
      return {
        models: getStaticProviderModels("cursor"),
        warning: "Cursor returned no live models; falling back to static catalog.",
      };
    },
  },

  // Custom resolvers (non-OpenAI-shaped APIs / token-refresh flows)
  kiro: {
    customResolver: async (connection, proxyOptions, signal) => {
      const credentials = {
        id: connection.id,
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        providerSpecificData: connection.providerSpecificData || {}
      };
      let warning;
      try {
        const result = await resolveKiroModels(credentials, {
          log: console,
          proxyOptions,
          signal,
          onCredentialsRefreshed: async (refreshed) => {
            signal?.throwIfAborted();
            if (refreshed?.accessToken) {
              await updateProviderCredentials(connection.id, {
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken || connection.refreshToken,
                expiresIn: refreshed.expiresIn,
              });
              signal?.throwIfAborted();
              connection.accessToken = refreshed.accessToken;
              if (refreshed.refreshToken) connection.refreshToken = refreshed.refreshToken;
            }
          }
        });
        if (result?.models?.length) {
          return {
            models: result.models.map((m) => ({
              id: m.id,
              name: m.name,
              upstreamModelId: m.upstreamModelId,
              contextLength: m.contextLength,
              maxInputTokens: m.maxInputTokens,
              maxOutputTokens: m.maxOutputTokens,
              rateMultiplier: m.rateMultiplier,
              capabilities: m.capabilities,
              description: m.description
            }))
          };
        }
        warning = "Kiro returned no models; falling back to static catalog.";
      } catch (error) {
        signal?.throwIfAborted();
        if (error.message?.includes("strictProxy=true")) throw error;
        warning = `Failed to fetch Kiro models: ${error.message}`;
        console.log("Failed to fetch Kiro models dynamically, falling back to static:", error.message);
      }
      return { models: [], warning };
    }
  },
  qoder: {
    customResolver: async (connection, proxyOptions, signal) => {
      const credentials = {
        id: connection.id,
        accessToken: connection.accessToken,
        apiKey: connection.apiKey,
        refreshToken: connection.refreshToken,
        email: connection.email,
        displayName: connection.displayName,
        providerSpecificData: connection.providerSpecificData || {},
      };
      let warning;
      try {
        const result = await resolveQoderModels(credentials, { forceRefresh: true, proxyOptions, signal });
        if (result?.models?.length) {
          return {
            models: result.models.map((m) => ({
              // Use the canonical "qoder/<key>" id so the dashboard
              // surfaces the same identifier the chat router expects.
              id: `qoder/${m.id}`,
              name: m.name,
              contextLength: m.contextLength,
              maxInputTokens: m.maxInputTokens,
              isVL: m.isVL,
              isReasoning: m.isReasoning,
              maxOutputTokens: m.maxOutputTokens,
              description: m.description,
            })),
          };
        }
        warning = "Qoder returned no models; falling back to static catalog.";
      } catch (error) {
        signal?.throwIfAborted();
        if (error.message?.includes("strictProxy=true")) throw error;
        warning = `Failed to fetch Qoder models: ${error.message}`;
        console.log("Failed to fetch Qoder models dynamically, falling back to static:", error.message);
      }
      return { models: [], warning };
    },
  },
  zed: {
    // Zed serves a rotating hosted catalog; resolve it live through the LLM
    // token exchange so combos can pick current models (9router #4244).
    customResolver: async (connection, proxyOptions) => {
      if (!connection.accessToken) {
        return { error: "No valid token found", status: 401 };
      }
      try {
        const { resolveZedModels } = await import("open-sse/shared/zedAuth.js");
        const entry = await resolveZedModels({
          accessToken: connection.accessToken,
          apiKey: connection.apiKey,
          userId: connection.providerSpecificData?.userId,
          providerSpecificData: connection.providerSpecificData || {},
        }, { forceRefresh: true, proxyOptions });
        if (entry?.models?.length) return { models: entry.models };
        return { error: "Zed returned no models", status: 502 };
      } catch (error) {
        if (error.message?.includes("strictProxy=true")) throw error;
        return { error: `Failed to fetch Zed models: ${error.message}`, status: 500 };
      }
    },
  },
  "gemini-cli": {
    customResolver: googleModelsResolver("gemini-cli")
  },
  "grok-cli": {
    customResolver: async (connection, proxyOptions) => {
      const result = await resolveGrokCliModels({
        ...connection,
        connectionId: connection.id,
      }, {
        log: console,
        proxyOptions,
        onCredentialsRefreshed: async (refreshed) => {
          await updateProviderCredentials(connection.id, {
            ...refreshed,
            existingProviderSpecificData: connection.providerSpecificData || {},
          });
        },
      });
      if (result.models.length) return result;
      return {
        models: getStaticProviderModels("grok-cli"),
        warning: result.warning || "Grok CLI returned no live models; using static catalog.",
      };
    },
  },
  "ollama-local": {
    customResolver: async (connection, proxyOptions) => {
      const url = `${resolveOllamaLocalHost(connection)}/api/tags`;
      const response = await proxyAwareFetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      }, proxyOptions);
      if (!response.ok) {
        const errorText = await response.text();
        console.log("Error fetching models from ollama-local:", errorText);
        return { error: `Failed to fetch models: ${response.status}`, status: response.status };
      }
      const data = await response.json();
      return { models: parseOpenAIStyleModels(data) };
    }
  }
};

/**
 * GET /api/providers/[id]/models - Get models list from provider
 */
export async function GET(request, { params }) {
  const refresh = request.nextUrl?.searchParams?.get("refresh") === "1";
  if (!(await requireAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    request.signal?.throwIfAborted();
    const { id } = await params;
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const proxyOptions = await resolveConnectionProxyConfig(connection.providerSpecificData || {});
    request.signal?.throwIfAborted();

    if (isOpenAICompatibleProvider(connection.provider)) {
      const baseUrl = connection.providerSpecificData?.baseUrl;
      if (!baseUrl) {
        return NextResponse.json({ error: "No base URL configured for OpenAI compatible provider" }, { status: 400 });
      }
      const url = `${baseUrl.replace(/\/$/, "")}/models`;
      const response = await proxyAwareFetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${connection.apiKey}`,
        },
      }, proxyOptions);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Error fetching models from ${connection.provider}:`, errorText);
        return NextResponse.json(
          { error: `Failed to fetch models: ${response.status}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      const models = (data.data || data.models || []).map((m) => {
        if (!m || typeof m !== "object") return { id: String(m), name: String(m) };
        return { ...m, name: m.name || m.label || m.id };
      });

      return NextResponse.json({
        provider: connection.provider,
        connectionId: connection.id,
        models
      });
    }

    if (isAnthropicCompatibleProvider(connection.provider)) {
      let baseUrl = connection.providerSpecificData?.baseUrl;
      if (!baseUrl) {
        return NextResponse.json({ error: "No base URL configured for Anthropic compatible provider" }, { status: 400 });
      }

      baseUrl = baseUrl.replace(/\/$/, "");
      if (baseUrl.endsWith("/messages")) {
        baseUrl = baseUrl.slice(0, -9);
      }

      const url = `${baseUrl}/models`;
      const response = await proxyAwareFetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": connection.apiKey,
          "anthropic-version": "2023-06-01",
          "Authorization": `Bearer ${connection.apiKey}`
        },
      }, proxyOptions);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Error fetching models from ${connection.provider}:`, errorText);
        return NextResponse.json(
          { error: `Failed to fetch models: ${response.status}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      const models = (data.data || data.models || []).map((m) => {
        if (!m || typeof m !== "object") return { id: String(m), name: String(m) };
        return { ...m, name: m.name || m.label || m.id };
      });

      return NextResponse.json({
        provider: connection.provider,
        connectionId: connection.id,
        models
      });
    }

    const config = PROVIDER_MODELS_CONFIG[connection.provider];
    if (!config) {
      // Generic fallback for API-key providers that declare a /models endpoint in
      // their registry entry (nvidia, openrouter, groq, ...). The caller falls
      // back to the static list when this returns empty.
      if (connection.apiKey) {
        const live = await fetchProviderLiveModels(connection.provider, connection.apiKey, { useCache: !refresh, proxyOptions });
        if (live?.length) {
          return NextResponse.json({
            provider: connection.provider,
            connectionId: connection.id,
            models: live,
          });
        }
      }
      return NextResponse.json(
        { error: `Provider ${connection.provider} does not support models listing` },
        { status: 400 }
      );
    }

    // Config-driven custom resolver path (OAuth refresh, non-OpenAI shape, etc.)
    if (typeof config.customResolver === "function") {
      const result = await config.customResolver(connection, proxyOptions, request.signal);
      request.signal?.throwIfAborted();
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status || 500 });
      }
      return NextResponse.json({
        provider: connection.provider,
        connectionId: connection.id,
        models: result.models,
        ...(result.warning ? { warning: result.warning } : {})
      });
    }

    // Get auth token
    const token = connection.providerSpecificData?.copilotToken || connection.accessToken || connection.apiKey;
    if (!token) {
      return NextResponse.json({ error: "No valid token found" }, { status: 401 });
    }

    // Build request URL
    let url = config.url;
    if (config.authQuery) {
      url += `?${config.authQuery}=${token}`;
    }

    // Build headers
    const headers = { ...config.headers };
    if (config.authHeader && !config.authQuery) {
      headers[config.authHeader] = (config.authPrefix || "") + token;
    }

    // Make request
    const fetchOptions = {
      method: config.method,
      headers
    };

    if (config.body && config.method === "POST") {
      fetchOptions.body = JSON.stringify(config.body);
    }

    const response = await proxyAwareFetch(url, fetchOptions, proxyOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Error fetching models from ${connection.provider}:`, errorText);
      return NextResponse.json(
        { error: `Failed to fetch models: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const models = config.parseResponse(data).map((model) => normalizeLiveModel(connection.provider, model));

    return NextResponse.json({
      provider: connection.provider,
      connectionId: connection.id,
      models
    });
  } catch (error) {
    const proxyRejected = error.message?.includes("strictProxy=true");
    const message = proxyRejected ? "Configured account proxy unavailable (strictProxy=true)" : "Failed to fetch models";
    console.log("Error fetching provider models:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
