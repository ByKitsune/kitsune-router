import { OLLAMA_LOCAL_DEFAULT_HOST } from "../../config/providers.js";

// Only connection configuration supplies this URL, never an inference body.
// Retain a reverse-proxy prefix while accepting common pasted endpoint forms.
export function buildOllamaLocalEndpoint(credentials, endpointPath) {
  // Relay implementations can follow the target's redirects internally, even
  // when the fetch to the relay itself uses redirect:error. Do not send local
  // inference data through a transport whose redirect policy we cannot enforce.
  const relay = credentials?.providerSpecificData?.vercelRelayUrl;
  if (relay != null && String(relay).trim()) {
    const error = new Error("Configured relay cannot guarantee redirect refusal for this endpoint");
    error.isConfigError = true;
    throw error;
  }
  const configured = credentials?.providerSpecificData?.baseUrl;
  if (configured != null && typeof configured !== "string") throw new Error("Invalid Ollama Local base URL");
  const raw = configured?.trim() || OLLAMA_LOCAL_DEFAULT_HOST;
  if (/[\\?#\u0000-\u001f\u007f]/.test(raw)) throw new Error("Invalid Ollama Local base URL");
  let url;
  try { url = new URL(raw); } catch { throw new Error("Invalid Ollama Local base URL"); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("Ollama Local base URL must be an HTTP(S) URL without credentials");
  }
  let prefix = url.pathname.replace(/\/+$/, "");
  for (const suffix of ["/v1/audio/speech", "/v1/embeddings", "/api/chat", "/v1"]) {
    if (prefix.endsWith(suffix)) {
      prefix = prefix.slice(0, -suffix.length);
      break;
    }
  }
  url.pathname = `${prefix}${endpointPath}`;
  return url.href;
}

// embeddingsCore enforces redirect refusal on every attempt and catches
// normalization errors, including Ollama's HTTP-200 JSON error responses.
export default {
  requestOptions: Object.freeze({ redirect: "error" }),
  buildUrl: (_model, credentials) => {
    if (!credentials || typeof credentials !== "object") throw new Error("No active connection configured");
    return buildOllamaLocalEndpoint(credentials, "/v1/embeddings");
  },
  buildHeaders: (credentials) => ({
    "Content-Type": "application/json",
    ...(credentials?.apiKey ? { Authorization: `Bearer ${credentials.apiKey}` } : {}),
  }),
  buildBody: (model, { input, encoding_format, dimensions }) => ({
    model, input,
    ...(encoding_format !== undefined ? { encoding_format } : {}),
    ...(dimensions !== undefined ? { dimensions } : {}),
  }),
  normalize: (responseBody) => {
    if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) {
      throw new Error("Invalid Ollama embeddings response");
    }
    if (responseBody.error != null) {
      const message = typeof responseBody.error === "string"
        ? responseBody.error : responseBody.error?.message;
      throw new Error(message || "Ollama embeddings returned an error");
    }
    if (!Array.isArray(responseBody.data)) throw new Error("Invalid Ollama embeddings response");
    return responseBody;
  },
};
