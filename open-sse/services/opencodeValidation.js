import { getDefaultModel } from "../config/providerModels.js";
import { PROVIDERS } from "../config/providers.js";
import { readModelCatalogResponse } from "../utils/modelCatalog.js";

export async function validateOpenCodeKey(provider, apiKey, fetchRequest) {
  const cfg = PROVIDERS[provider];
  const signal = AbortSignal.timeout(10000);
  const response = await fetchRequest(cfg.baseUrl, {
    method: "POST", redirect: "error", signal,
    headers: { ...cfg.headers, "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: cfg.authProbeModel || getDefaultModel(provider),
      messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false,
    }),
  });

  let error = null;
  if (provider === "opencode-go" && response.status === 400 && response.body) {
    const payload = await readModelCatalogResponse(response, signal, { remaining: 16 * 1024 }).catch(() => null);
    if (payload?.error?.type === "MissingSessionID") error = "OpenCode Go requires a supported client session. The connection could not be verified.";
  }
  if (response.body && !response.bodyUsed) void response.body.cancel().catch(() => {});
  if (response.ok) return { valid: true, error: null };
  if (response.status === 401 || response.status === 403) error = "OpenCode rejected the key or its access permissions.";
  if (response.status === 429) error = "OpenCode rate limited the connection test.";
  return { valid: false, error: error || `OpenCode connection test returned HTTP ${response.status}.` };
}
