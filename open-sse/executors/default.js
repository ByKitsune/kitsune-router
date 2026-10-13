import { BaseExecutor } from "./base.js";
import { PROVIDERS, PROVIDER_OAUTH } from "../config/providers.js";
import { ANTHROPIC_API_VERSION, OPENAI_COMPAT_BASE, ANTHROPIC_COMPAT_BASE, selectAnthropicBeta, parseRejectedAnthropicBetaFlags } from "../providers/shared.js";
import { resolveOpenAICompatibleApiType } from "../services/provider.js";
import { OAUTH_ENDPOINTS, buildKimiHeaders } from "../config/appConstants.js";
import { buildClineHeaders } from "../shared/clineAuth.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { KIRO_CLI_USER_AGENT } from "../config/clientVersions.js";
import { allowsClaudeManualInterleaving, reconcileClaudeThinkingBudget } from "../translator/concerns/thinking.js";

// Per-connection set of `anthropic-beta` flags the upstream rejected for that
// account. Process-local by design: getProviderCredentials() rebuilds
// providerSpecificData per request, so this cannot live on the credential.
const rejectedBetaByConnection = new Map();

// Stable identity for the denylist: connection id when present, else the
// credential itself. Distinct pooled accounts hold distinct tokens, so they
// never share a denylist entry.
function betaDenylistKey(credentials) {
  if (!credentials) return null;
  return credentials.connectionId
    || credentials.apiKey
    || credentials.accessToken
    || null;
}

// Flags already rejected for this connection (never null, so callers can pass
// it straight to selectAnthropicBeta's `unsupported` argument).
function rejectedBetaFlags(credentials) {
  return rejectedBetaByConnection.get(betaDenylistKey(credentials)) || null;
}

function rememberRejectedBeta(credentials, flags) {
  const key = betaDenylistKey(credentials);
  if (!key) return;
  const known = rejectedBetaByConnection.get(key) || new Set();
  for (const flag of flags) known.add(flag);
  rejectedBetaByConnection.set(key, known);
}
// Auth header descriptors — derived from registry transport.auth, fallback to hardcoded defaults.
const BEARER = { combined: true, header: "Authorization", scheme: "bearer" };
const XAPIKEY = { combined: true, header: "x-api-key", scheme: "raw" };
const AUTH_DESCRIPTORS = Object.fromEntries(
  Object.entries(PROVIDERS)
    .filter(([, t]) => t.auth)
    .map(([id, t]) => [id, t.auth])
);

// Apply a token to a header per scheme (matches legacy: combined always sets, even when undefined).
function setAuth(headers, spec, token) {
  headers[spec.header] = spec.scheme === "bearer" ? `Bearer ${token}` : token;
}

// Resolve auth onto headers from a descriptor.
function applyAuth(headers, desc, credentials) {
  if (desc.combined) {
    // combined providers always set the header (legacy behavior, incl. noAuth → "Bearer undefined")
    setAuth(headers, desc, credentials.apiKey || credentials.accessToken);
    if (desc.anthropicVersion && !headers["anthropic-version"]) headers["anthropic-version"] = ANTHROPIC_API_VERSION;
    return;
  }
  // split apiKey/oauth: set only the matching branch (legacy: anthropic-compatible skips when both absent)
  if (credentials.apiKey) setAuth(headers, desc.apiKey, credentials.apiKey);
  else if (credentials.accessToken) setAuth(headers, desc.oauth, credentials.accessToken);
  if (desc.anthropicVersion && !headers["anthropic-version"]) headers["anthropic-version"] = ANTHROPIC_API_VERSION;
}

// Provider-specific header quirks kept as small hooks (not pure auth).
const HEADER_HOOKS = {
  // Stable device_id from OAuth connection (CLIProxyAPI KimiTokenStorage.DeviceID)
  kimiHeaders: (h, c) => Object.assign(h, buildKimiHeaders(c?.providerSpecificData?.deviceId)),
  clineHeaders: (h, c) => Object.assign(h, buildClineHeaders(c.apiKey || c.accessToken)),
  kilocodeOrg: (h, c) => { if (c.providerSpecificData?.orgId) h["X-Kilocode-OrganizationID"] = c.providerSpecificData.orgId; },
};

// Config-driven OAuth refresh grants — derived from registry oauth.refresh.
const REFRESH_GRANTS = Object.fromEntries(
  Object.entries(PROVIDER_OAUTH)
    .filter(([, o]) => o.refresh)
    .map(([id, o]) => {
      const tokenUrl = o.tokenUrl;
      const encoding = o.refresh.encoding;
      const extraParams = o.refresh.scope ? { scope: o.refresh.scope } : {};
      return [id, {
        encoding,
        url: () => tokenUrl,
        params: (ex) => id === "gemini"
          ? { client_id: ex.config.clientId, client_secret: ex.config.clientSecret, ...extraParams }
          : { client_id: o.clientId, ...extraParams },
      }];
    })
);

export class DefaultExecutor extends BaseExecutor {
  constructor(provider) {
    super(provider, PROVIDERS[provider] || PROVIDERS.openai);
  }

  transformRequest(model, body, stream = false, credentials = null) {
    // Final thinking reconciliation is request-local; retries/accounts reuse body.
    const requestBody = /^claude-/.test(model || "") && body?.thinking?.type === "enabled" ? { ...body } : body;
    const transformed = this.applyJsonSchemaFallback(requestBody);

    if (transformed && typeof transformed === "object") {
      // quirk: some openai-compatible providers reject Anthropic's client_metadata field
      if (this.config.quirks?.dropClientMetadata) {
        delete transformed.client_metadata;
      }
      // Ask the upstream for usage on SSE. Without include_usage OpenAI-compatible
      // gateways (Alibaba MaaS etc.) omit the final usage chunk, and the stream
      // path falls back to chars/4 estimation — inflating prompt_tokens and
      // dropping cached_tokens entirely, so cache hits get billed at full rate
      // (9router #4633, verified live on kimi-k3: estimated {prompt 50116, no
      // cache} became real {prompt 34349, cached 32256}). Custom executors that
      // reject the field (codex, grok-cli, antigravity) delete it themselves;
      // only the OpenAI-compatible chat path is touched.
      if (stream === true && this.provider?.startsWith?.("openai-compatible-")
        && resolveOpenAICompatibleApiType(this.provider, credentials) === "chat"
        && Array.isArray(transformed.messages) && !transformed.stream_options) {
        transformed.stream_options = { include_usage: true };
      }
    }

    return injectReasoningContent({ provider: this.provider, model, body: transformed });
  }

  // Fallback json_schema → json_object for openai-compatible providers without native Structured Output.
  applyJsonSchemaFallback(body) {
    if (!this.provider?.startsWith?.("openai-compatible-")) return body;
    const rf = body?.response_format;
    if (rf?.type !== "json_schema" || !rf.json_schema?.schema) return body;

    const schemaJson = JSON.stringify(rf.json_schema.schema, null, 2);
    const prompt = `You must respond with valid JSON that strictly follows this JSON schema:\n\`\`\`json\n${schemaJson}\n\`\`\`\nRespond ONLY with the JSON object, no other text.`;

    const messages = Array.isArray(body.messages) ? body.messages.map(m => ({ ...m })) : [];
    const sys = messages.find(m => m.role === "system");
    if (sys) {
      if (typeof sys.content === "string") sys.content = `${sys.content}\n\n${prompt}`;
      else if (Array.isArray(sys.content)) sys.content.push({ type: "text", text: `\n\n${prompt}` });
    } else {
      messages.unshift({ role: "system", content: prompt });
    }
    return { ...body, messages, response_format: { type: "json_object" } };
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    // Runtime transport (multi-endpoint providers): use the sourceFormat-matched endpoint
    const rt = credentials?.runtimeTransport;
    if (rt?.baseUrl) {
      return rt.urlSuffix ? `${rt.baseUrl}${rt.urlSuffix}` : rt.baseUrl;
    }
    if (this.provider?.startsWith?.("openai-compatible-")) {
      const baseUrl = credentials?.providerSpecificData?.baseUrl || OPENAI_COMPAT_BASE;
      const normalized = baseUrl.replace(/\/$/, "");
      const path = resolveOpenAICompatibleApiType(this.provider, credentials) === "responses" ? "/responses" : "/chat/completions";
      return `${normalized}${path}`;
    }
    if (this.provider?.startsWith?.("anthropic-compatible-")) {
      const baseUrl = credentials?.providerSpecificData?.baseUrl || ANTHROPIC_COMPAT_BASE;
      const normalized = baseUrl.replace(/\/$/, "");
      return `${normalized}/messages`;
    }
    // gemini-format: build :streamGenerateContent / :generateContent path
    if (this.config.format === "gemini") {
      return `${this.config.baseUrl}/${model}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;
    }
    // urlSuffix (e.g. ?beta=true) declared per-provider in registry
    if (this.config.urlSuffix) {
      return `${this.config.baseUrl}${this.config.urlSuffix}`;
    }
    const url = this.config.baseUrl;
    if (url?.includes("{accountId}")) {
      const accountId = credentials?.providerSpecificData?.accountId;
      if (!accountId) throw new Error(`${this.provider} requires accountId in providerSpecificData`);
      return url.replace("{accountId}", accountId);
    }
    return url;
  }

  // Fallback descriptor for providers without an explicit entry in AUTH_DESCRIPTORS.
  resolveAuthDescriptor() {
    if (this.provider?.startsWith?.("anthropic-compatible-")) {
      return { apiKey: { header: "x-api-key", scheme: "raw" }, oauth: { header: "Authorization", scheme: "bearer" }, anthropicVersion: true };
    }
    if (this.config?.format === "claude") {
      return { ...XAPIKEY, anthropicVersion: true };
    }
    return BEARER;
  }

  // Header forwarding is deliberately allowlisted; never overlay client auth.
  readClientHeader(credentials, name) {
    const raw = credentials?.rawHeaders;
    if (typeof raw?.get === "function") return raw.get(name);
    if (!raw || typeof raw !== "object") return null;
    const key = Object.keys(raw).find(key => key.toLowerCase() === name);
    return key ? raw[key] : null;
  }

  buildHeaders(credentials, stream = true, url, model, body = null) {
    const rt = credentials?.runtimeTransport;
    const headers = { "Content-Type": "application/json", ...(rt ? rt.headers : this.config.headers) };
    const desc = rt?.auth || AUTH_DESCRIPTORS[this.provider] || this.resolveAuthDescriptor();
    // Hooks run BEFORE auth so dynamic overlays can't clobber the token.
    for (const hook of desc.hooks || []) HEADER_HOOKS[hook]?.(headers, credentials);
    applyAuth(headers, desc, credentials);

    let isOfficialAnthropic = false;
    try {
      const endpoint = url || this.buildUrl(model, stream, 0, credentials);
      isOfficialAnthropic = new URL(endpoint).hostname === "api.anthropic.com";
    } catch { /* No valid endpoint: do not forward client identity. */ }
    if (this.provider === "claude" && isOfficialAnthropic) {
      const blocked = rejectedBetaFlags(credentials);
      const configured = model ? selectAnthropicBeta(model, body, blocked) : headers["Anthropic-Beta"] || headers["anthropic-beta"] || "";
      const incoming = this.readClientHeader(credentials, "anthropic-beta");
      const flags = new Set(configured.split(",").map(flag => flag.trim()).filter(Boolean));
      for (const flag of typeof incoming === "string" ? incoming.split(",") : []) {
        const value = flag.trim();
        if (/^[a-z0-9][a-z0-9-]*-(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(value)
          && !blocked?.has(value)
          && !(body?.thinking?.display === "summarized" && value === "redact-thinking-2026-02-12")) flags.add(value);
      }
      delete headers["anthropic-beta"];
      headers["Anthropic-Beta"] = [...flags].join(",");

      // Session identity is request-local, never stored on pooled credentials.
      if (credentials.accessToken && !credentials.apiKey) {
        let sessionId = this.readClientHeader(credentials, "x-claude-code-session-id");
        if (!sessionId) {
          try { sessionId = JSON.parse(body?.metadata?.user_id || "null")?.session_id; }
          catch { /* Non-JSON user_id is valid metadata, not a session identity. */ }
        }
        if (typeof sessionId === "string" && sessionId && !/[\r\n]/.test(sessionId)) {
          headers["x-claude-code-session-id"] = sessionId;
        }
      }
    }

    // Strip first-party Claude Code identity headers for non-Anthropic anthropic-compatible upstreams
    if (this.provider?.startsWith?.("anthropic-compatible-")) {
      // Resolve the actual outbound URL, not a substring in configured metadata.
      if (!isOfficialAnthropic) {
        // Some third-party Anthropic-compatible gateways require Bearer auth in
        // addition to x-api-key. Send both (x-api-key already set above) so
        // gateways that read either header succeed.
        if (credentials.apiKey && !headers["Authorization"]) {
          headers["Authorization"] = `Bearer ${credentials.apiKey}`;
        }
        delete headers["anthropic-dangerous-direct-browser-access"];
        delete headers["Anthropic-Dangerous-Direct-Browser-Access"];
        delete headers["x-app"];
        delete headers["X-App"];
        delete headers["x-claude-code-session-id"];
        delete headers["X-Claude-Code-Session-Id"];
        // Strip claude-code-20250219 from Anthropic-Beta / anthropic-beta
        for (const betaKey of ["anthropic-beta", "Anthropic-Beta"]) {
          if (headers[betaKey]) {
            const filtered = headers[betaKey]
              .split(",")
              .map(s => s.trim())
              .filter(f => f && f !== "claude-code-20250219")
              .join(",");
            if (filtered) {
              headers[betaKey] = filtered;
            } else {
              delete headers[betaKey];
            }
          }
        }
      }
    }

    // Final wire reconciliation must follow header selection, including the
    // per-account rejected-beta denylist on retries. A reseller beta header is
    // not evidence that it implements Anthropic's manual-interleaving contract.
    if ((rt?.format || this.config.format) === "claude" || this.provider?.startsWith?.("anthropic-compatible-")) {
      const interleaved = this.provider === "claude" && isOfficialAnthropic &&
        allowsClaudeManualInterleaving(body, model, headers);
      // Other Claude-format vendors (e.g. DeepSeek) have unrelated thinking modes.
      if (/^claude-/.test(model || "")) reconcileClaudeThinkingBudget(body, interleaved);
    }
    if (stream) headers["Accept"] = "text/event-stream";
    return headers;
  }

  // Anthropic gates some `anthropic-beta` flags per organization. A gateway
  // cannot know an account's entitlements in advance, so the first 400 naming
  // the offending flags is absorbed here: they are recorded for that connection
  // and the same turn is retried once without them. Later turns skip them at
  // buildHeaders() time, so the cost is paid once per connection, not per
  // request. Any non-beta 400 falls straight through unchanged.
  //
  // The denylist is kept in a process-local map rather than on the credential:
  // getProviderCredentials() rebuilds providerSpecificData on every request, so
  // a write there would never be visible to the next call. Keyed by connection
  // id (falling back to the API key / access token) so pooled accounts on
  // different subscriptions don't share each other's entitlements.
  async execute(options) {
    const result = await super.execute(options);
    if (this.provider !== "claude" || result.response.status !== HTTP_STATUS.BAD_REQUEST) return result;

    let bodyText;
    try {
      bodyText = await result.response.clone().text();
    } catch {
      return result;
    }
    const rejected = parseRejectedAnthropicBetaFlags(bodyText);
    if (rejected.length === 0) return result;

    rememberRejectedBeta(options.credentials, rejected);
    options.log?.debug?.("RETRY", `claude rejected beta flag(s) ${rejected.join(", ")} — retrying without them`);
    return super.execute(options);
  }

  // Generic OAuth refresh for the common {grant_type, refresh_token, client_id[, ...]} shape.
  // grant = REFRESH_GRANTS[provider]; client creds resolved from PROVIDERS or this.config.
  refreshFromGrant(credentials, proxyOptions) {
    const grant = REFRESH_GRANTS[this.provider];
    const params = { grant_type: "refresh_token", refresh_token: credentials.refreshToken, ...grant.params(this) };
    return grant.encoding === "json"
      ? this.refreshWithJSON(grant.url(), params, proxyOptions)
      : this.refreshWithForm(grant.url(), params, proxyOptions);
  }

  async refreshCredentials(credentials, log, proxyOptions = null) {
    if (!credentials.refreshToken) return null;

    const refreshers = {
      claude: () => this.refreshFromGrant(credentials, proxyOptions),
      codex: () => this.refreshFromGrant(credentials, proxyOptions),
      iflow: () => this.refreshIflow(credentials.refreshToken, proxyOptions),
      gemini: () => this.refreshFromGrant(credentials, proxyOptions),
      kiro: () => this.refreshKiro(credentials.refreshToken, proxyOptions),
      cline: () => this.refreshCline(credentials.refreshToken, proxyOptions),
      clinepass: () => this.refreshCline(credentials.refreshToken, proxyOptions),
      kimi: () => this.refreshKimi(credentials, proxyOptions),
      "kimi-coding": () => this.refreshKimi(credentials, proxyOptions),
      kilocode: () => this.refreshKilocode(credentials.refreshToken, proxyOptions)
    };

    const refresher = refreshers[this.provider];
    if (!refresher) return null;

    try {
      const result = await refresher();
      if (result) log?.info?.("TOKEN", `${this.provider} refreshed`);
      return result;
    } catch (error) {
      log?.error?.("TOKEN", `${this.provider} refresh error: ${error.message}`);
      return null;
    }
  }

  async refreshWithJSON(url, body, proxyOptions = null) {
    const response = await proxyAwareFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body)
    }, proxyOptions);
    if (!response.ok) return null;
    const tokens = await response.json();
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || body.refresh_token, expiresIn: tokens.expires_in };
  }

  async refreshWithForm(url, params, proxyOptions = null) {
    const response = await proxyAwareFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams(params)
    }, proxyOptions);
    if (!response.ok) return null;
    const tokens = await response.json();
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || params.refresh_token, expiresIn: tokens.expires_in };
  }

  async refreshIflow(refreshToken, proxyOptions = null) {
    const basicAuth = btoa(`${PROVIDERS.iflow.clientId}:${PROVIDERS.iflow.clientSecret}`);
    const response = await proxyAwareFetch(OAUTH_ENDPOINTS.iflow.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json", "Authorization": `Basic ${basicAuth}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: PROVIDERS.iflow.clientId, client_secret: PROVIDERS.iflow.clientSecret })
    }, proxyOptions);
    if (!response.ok) return null;
    const tokens = await response.json();
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || refreshToken, expiresIn: tokens.expires_in };
  }

  async refreshKiro(refreshToken, proxyOptions = null) {
    const response = await proxyAwareFetch(PROVIDERS.kiro.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": KIRO_CLI_USER_AGENT },
      body: JSON.stringify({ refreshToken })
    }, proxyOptions);
    if (!response.ok) return null;
    const tokens = await response.json();
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken || refreshToken, expiresIn: tokens.expiresIn };
  }

  async refreshCline(refreshToken, proxyOptions = null) {
    const response = await proxyAwareFetch(PROVIDERS.cline.refreshUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ refreshToken, grantType: "refresh_token", clientType: "extension" })
    }, proxyOptions);
    if (!response.ok) return null;
    const payload = await response.json();
    const data = payload?.data || payload;
    const expiresAtIso = data?.expiresAt;
    const expiresIn = expiresAtIso ? Math.max(1, Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 1000)) : undefined;
    let accessToken = data?.accessToken;
    if (accessToken && !accessToken.startsWith("workos:")) {
      accessToken = `workos:${accessToken}`;
    }
    return { accessToken, refreshToken: data?.refreshToken || refreshToken, expiresIn };
  }

  // CLIProxyAPI DeviceFlowClient.RefreshToken — form body + X-Msh-* headers + stable device_id
  async refreshKimi(credentials, proxyOptions = null) {
    const refreshToken = credentials.refreshToken;
    const cfg = PROVIDERS.kimi || PROVIDERS["kimi-coding"];
    if (!cfg?.refreshUrl || !cfg?.clientId) return null;
    const kimiHeaders = buildKimiHeaders(credentials?.providerSpecificData?.deviceId);
    const response = await proxyAwareFetch(cfg.refreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        ...kimiHeaders
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: cfg.clientId })
    }, proxyOptions);
    if (!response.ok) return null;
    const tokens = await response.json();
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || refreshToken, expiresIn: tokens.expires_in };
  }

  async refreshKilocode(refreshToken, proxyOptions = null) {
    // Kilocode uses device code flow, no refresh token support
    return null;
  }
}

export default DefaultExecutor;
