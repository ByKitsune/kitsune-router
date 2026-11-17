import { DefaultExecutor } from "./default.js";
import { readOutputTokenCap, requiresMaxCompletionTokens } from "../translator/formats/maxTokens.js";

export class AzureExecutor extends DefaultExecutor {
  constructor() {
    super("azure");
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    const azureEndpoint = credentials?.providerSpecificData?.azureEndpoint
      || process.env.AZURE_ENDPOINT
      || "https://api.openai.com";

    const apiVersion = credentials?.providerSpecificData?.apiVersion
      || process.env.AZURE_API_VERSION
      || "2024-10-01-preview";

    const deployment = credentials?.providerSpecificData?.deployment
      || model
      || process.env.AZURE_DEPLOYMENT
      || "gpt-4";
    // URL parsers normalize both literal and percent-encoded dot segments.
    // Such values cannot identify a deployment and must not change the route.
    if (deployment === "." || deployment === "..") {
      throw Object.assign(new Error("Deployment must not be a dot path segment."), { code: "unsupported_parameter", param: "deployment" });
    }

    const endpoint = azureEndpoint.replace(/\/$/, "");
    return `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  }

  buildHeaders(credentials, stream = true) {
    const headers = {
      "Content-Type": "application/json",
      ...this.config.headers
    };

    const apiKey = credentials?.apiKey
      || credentials?.accessToken
      || process.env.OPENAI_API_KEY;

    if (apiKey) {
      headers["api-key"] = apiKey;
    }

    const organization = credentials?.providerSpecificData?.organization
      || process.env.AZURE_ORGANIZATION;

    if (organization) {
      headers["OpenAI-Organization"] = organization;
    }

    if (stream) {
      headers["Accept"] = "text/event-stream";
    }

    return headers;
  }

  transformRequest(model, body, stream, credentials) {
    const outputCap = readOutputTokenCap(body);
    if (outputCap !== undefined && (requiresMaxCompletionTokens(model) || body.max_completion_tokens !== undefined)) {
      const transformed = { ...body, max_completion_tokens: outputCap };
      delete transformed.max_tokens;
      return transformed;
    }
    return body;
  }
}
