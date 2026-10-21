import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { OAUTH_ENDPOINTS, GEMINI_CLI_API_CLIENT, geminiCLIUserAgent } from "../config/appConstants.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { FORMATS } from "../translator/formats.js";
import { applyThinking, captureThinking } from "../translator/concerns/thinkingUnified.js";

const GEMINI_CLI_REQUEST_BLACKLIST = [
  "output_config", "thinking", "reasoning_effort", "reasoning",
  "enable_thinking", "thinking_budget", "thinkingConfig", "budget_tokens",
];

export class GeminiCLIExecutor extends BaseExecutor {
  constructor() {
    super("gemini-cli", PROVIDERS["gemini-cli"]);
  }

  buildUrl(model, stream, urlIndex = 0) {
    const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return `${this.config.baseUrl}:${action}`;
  }

  buildHeaders(credentials, stream = true) {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${credentials.accessToken}`,
      "User-Agent": geminiCLIUserAgent(this._currentModel),
      "X-Goog-Api-Client": GEMINI_CLI_API_CLIENT,
      "Accept": stream ? "text/event-stream" : "application/json"
    };
  }

  transformRequest(model, body, stream, credentials) {
    // Store model for use in buildHeaders (called by base.execute after transformRequest)
    this._currentModel = model;
    // Cloud Code Assist wraps the Gemini payload: { project, model, request: <body> }
    const wrapped = !!(body?.request && body.model);
    const sourceRequest = wrapped ? body.request : body;
    const compatibilityControls = GEMINI_CLI_REQUEST_BLACKLIST.some(field =>
      body?.[field] !== undefined || sourceRequest?.[field] !== undefined);
    if (!compatibilityControls) {
      return wrapped ? body : { project: credentials?.projectId || body?.project, model, request: body };
    }

    const thinkingIntent = captureThinking(body) || captureThinking(sourceRequest);
    const request = { ...sourceRequest, generationConfig: { ...sourceRequest?.generationConfig } };
    const nativeThinking = request.generationConfig.thinkingConfig;
    if (thinkingIntent && nativeThinking?.thinkingBudget === undefined && nativeThinking?.thinkingLevel === undefined) {
      applyThinking(FORMATS.GEMINI_CLI, model, request, this.provider, thinkingIntent);
    }
    for (const field of GEMINI_CLI_REQUEST_BLACKLIST) delete request[field];

    if (wrapped) {
      const transformed = { ...body, request };
      for (const field of GEMINI_CLI_REQUEST_BLACKLIST) delete transformed[field];
      return transformed;
    }
    return { project: credentials?.projectId || body?.project, model, request };
  }

  // Parse RetryInfo.retryDelay from Google API 429 body to surface upstream retry hint
  parseError(response, bodyText, generic) {
    const base = super.parseError(response, bodyText, generic);
    if (response.status !== 429 || !bodyText) return base;
    try {
      const parsed = JSON.parse(bodyText);
      const details = parsed?.error?.details;
      if (Array.isArray(details)) {
        for (const d of details) {
          if (d?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo" && d?.retryDelay) {
            base.retryAfter = d.retryDelay;
            break;
          }
        }
      }
    } catch {}
    return base;
  }

  async refreshCredentials(credentials, log, proxyOptions = null, signal = null) {
    signal?.throwIfAborted();
    if (!credentials.refreshToken) return null;

    try {
      const response = await proxyAwareFetch(OAUTH_ENDPOINTS.google.token, {
        signal,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: credentials.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        })
      }, proxyOptions);

      if (!response.ok) return null;

      const tokens = await response.json();
      log?.info?.("TOKEN", "Gemini CLI refreshed");

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || credentials.refreshToken,
        expiresIn: tokens.expires_in,
        projectId: credentials.projectId
      };
    } catch (error) {
      signal?.throwIfAborted();
      log?.error?.("TOKEN", `Gemini CLI refresh error: ${error.message}`);
      return null;
    }
  }
}

export default GeminiCLIExecutor;
