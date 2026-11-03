import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { GEMINI_CLI_API_CLIENT, geminiCLIUserAgent } from "../config/appConstants.js";
import { refreshGoogleToken } from "../services/tokenRefresh/providers.js";
import { readCloudCodeProjectId, requireCloudCodeProjectId } from "../utils/cloudCodeProject.js";
import { FORMATS } from "../translator/formats.js";
import { applyThinking, captureThinking, stripThinkingSuffix } from "../translator/concerns/thinkingUnified.js";
import { validateGoogleThoughtSignatures } from "../translator/concerns/thoughtSignature.js";

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

  buildHeaders(credentials, stream = true, _url = null, model = "unknown") {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${credentials.accessToken}`,
      "User-Agent": geminiCLIUserAgent(stripThinkingSuffix(model)),
      "X-Goog-Api-Client": GEMINI_CLI_API_CLIENT,
      "Accept": stream ? "text/event-stream" : "application/json"
    };
  }

  transformRequest(model, body, stream, credentials) {
    // Cloud Code Assist wraps the Gemini payload: { project, model, request: <body> }
    const wrapped = !!(body?.request && body.model);
    const sourceRequest = wrapped ? body.request : body;
    const wireModel = stripThinkingSuffix(wrapped ? body.model : model);
    const compatibilityControls = GEMINI_CLI_REQUEST_BLACKLIST.some(field =>
      body?.[field] !== undefined || sourceRequest?.[field] !== undefined);
    const project = readCloudCodeProjectId(credentials);
    const contents = validateGoogleThoughtSignatures(sourceRequest?.contents, wireModel);
    const normalizedRequest = contents === sourceRequest?.contents ? sourceRequest : { ...sourceRequest, contents };
    if (!compatibilityControls) {
      return wrapped ? { ...body, project, model: wireModel, request: normalizedRequest } : { project, model: wireModel, request: normalizedRequest };
    }

    const thinkingIntent = captureThinking(body) || captureThinking(sourceRequest);
    const request = { ...normalizedRequest, generationConfig: { ...normalizedRequest?.generationConfig } };
    const nativeThinking = request.generationConfig.thinkingConfig;
    if (thinkingIntent && nativeThinking?.thinkingBudget === undefined && nativeThinking?.thinkingLevel === undefined) {
      applyThinking(FORMATS.GEMINI_CLI, model, request, this.provider, thinkingIntent);
    }
    for (const field of GEMINI_CLI_REQUEST_BLACKLIST) delete request[field];

    if (wrapped) {
      const transformed = { ...body, project, model: wireModel, request };
      for (const field of GEMINI_CLI_REQUEST_BLACKLIST) delete transformed[field];
      return transformed;
    }
    return { project, model: wireModel, request };
  }

  async execute(args) {
    args.signal?.throwIfAborted();
    requireCloudCodeProjectId(args.credentials);
    return super.execute(args);
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
    const refreshed = await refreshGoogleToken(credentials.refreshToken, this.config.clientId,
      this.config.clientSecret, log, proxyOptions, signal);
    return refreshed ? { ...refreshed, projectId: credentials.projectId } : null;
  }
}

export default GeminiCLIExecutor;
