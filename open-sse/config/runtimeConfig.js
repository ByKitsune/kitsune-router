// HTTP status codes
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NOT_ACCEPTABLE: 406,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// Re-export error config (backward compat)
export { ERROR_TYPES, DEFAULT_ERROR_MESSAGES, BACKOFF_CONFIG, COOLDOWN_MS } from "./errorConfig.js";

// Cache TTLs (seconds)
export const CACHE_TTL = {
  userInfo: 300,    // 5 minutes
  modelAlias: 3600  // 1 hour
};

// Memory management config
export const MEMORY_CONFIG = {
  sessionTtlMs: 2 * 60 * 60 * 1000,
  sessionCleanupIntervalMs: 30 * 60 * 1000,
  dnsCacheTtlMs: 5 * 60 * 1000,
  proxyDispatchersMaxSize: 20,
};

// Parse a positive integer env override, falling back to a default.
function envMs(name, def) {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function envUrl(name, def) {
  const raw = process.env[name]?.trim();
  return raw || def;
}

// SearXNG endpoint used by the unauthenticated web-search provider.
// Configure this for a separate Docker service or remote SearXNG instance.
export const SEARXNG_URL = envUrl("SEARXNG_URL", "http://localhost:8888/search");

// Inter-chunk stall timeout (once tokens are flowing). Generous headroom so
// slow reasoning models aren't aborted mid-stream. Env: STREAM_STALL_TIMEOUT_MS.
export const STREAM_STALL_TIMEOUT_MS = envMs("STREAM_STALL_TIMEOUT_MS", 360 * 1000);

// Time-to-first-token timeout (prompt prefill). Env: STREAM_FIRST_CHUNK_TIMEOUT_MS.
export const STREAM_FIRST_CHUNK_TIMEOUT_MS = envMs("STREAM_FIRST_CHUNK_TIMEOUT_MS", 200 * 1000);

// SSE keepalive ping interval (ms) during upstream silence / reasoning thinking.
// Set to 0 to disable. Env: SSE_KEEPALIVE_MS.
export const SSE_KEEPALIVE_MS = envMs("SSE_KEEPALIVE_MS", 15 * 1000);

// Fetch connect timeout: abort if upstream doesn't return response headers within this duration
export const FETCH_CONNECT_TIMEOUT_MS = envMs("FETCH_CONNECT_TIMEOUT_MS", 60 * 1000);

export const UPSTREAM_TRANSPORT_CONFIG = {
  connectionsPerOrigin: envMs("UPSTREAM_CONNECTIONS_PER_ORIGIN", 50),
  maxOriginsPerRoute: envMs("UPSTREAM_MAX_ORIGINS_PER_ROUTE", 32),
  maxLivePools: envMs("UPSTREAM_MAX_LIVE_POOLS", 64),
  maxProxyRoutes: envMs("UPSTREAM_MAX_PROXY_ROUTES", MEMORY_CONFIG.proxyDispatchersMaxSize),
  maxQueuedPerOrigin: envMs("UPSTREAM_MAX_QUEUED_PER_ORIGIN", 256),
  maxQueuedTotal: envMs("UPSTREAM_MAX_QUEUED_TOTAL", 2048),
  keepAliveTimeoutMs: envMs("UPSTREAM_KEEP_ALIVE_TIMEOUT_MS", 30_000),
  keepAliveMaxTimeoutMs: envMs("UPSTREAM_KEEP_ALIVE_MAX_TIMEOUT_MS", 60_000),
  poolIdleTimeoutMs: envMs("UPSTREAM_POOL_IDLE_TIMEOUT_MS", 60_000),
  connectTimeoutMs: envMs("UPSTREAM_CONNECT_TIMEOUT_MS", 10_000),
  headersTimeoutMs: envMs("UPSTREAM_HEADERS_TIMEOUT_MS", STREAM_FIRST_CHUNK_TIMEOUT_MS),
  bypassRequestTimeoutMs: envMs("UPSTREAM_BYPASS_REQUEST_TIMEOUT_MS", FETCH_CONNECT_TIMEOUT_MS),
  closeTimeoutMs: envMs("UPSTREAM_CLOSE_TIMEOUT_MS", 10_000),
};

// Codex preheader error inspection must hand off quickly so SSE keepalives can start.
export const CODEX_SSE_PEEK_TIMEOUT_MS = 1000;

// Qoder preheader inspection is bounded by time and bytes before handing off SSE.
export const QODER_SSE_PEEK_TIMEOUT_MS = 1000;
export const QODER_SSE_PEEK_MAX_BYTES = 256 * 1024;

// Gemini native TTS fetch timeout: abort if Google does not return response headers in time.
export const GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS = envMs("GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS", 45 * 1000);

// Default token limits
export const DEFAULT_MAX_TOKENS = 64000;
export const DEFAULT_MIN_TOKENS = 32000;
export const REASONING_MIN_OUTPUT_FLOOR = 65536;
export const CLAUDE_MIN_THINKING_BUDGET = 1024;
// CommandCode /alpha/generate rejects max_tokens above this with a 400
// ("integer above maximum value"). Clients send the advertised model ceiling
// (384000 for deepseek-v4-pro, 1000000 elsewhere), so every output-cap
// spelling is clamped to it (9router #4691).
export const COMMANDCODE_MAX_OUTPUT_TOKENS = 200000;
export const TOKEN_SAVER_HEADER = "x-zenrouter-token-saver";

// Retry config for 429 responses (legacy - kept for backward compatibility)
export const RETRY_CONFIG = {
  maxAttempts: 2,
  delayMs: 2000
};

// Default retry config by status code: { attempts, delayMs }
// Backward compat: if value is a number, treated as attempts with RETRY_CONFIG.delayMs
export const DEFAULT_RETRY_CONFIG = {
  429: { attempts: 0, delayMs: 0 },
  502: { attempts: 3, delayMs: 3000 },
  503: { attempts: 3, delayMs: 2000 },
  504: { attempts: 2, delayMs: 3000 }
};

// Normalize a retry entry to { attempts, delayMs }
export function resolveRetryEntry(entry) {
  if (entry == null) return { attempts: 0, delayMs: RETRY_CONFIG.delayMs };
  if (typeof entry === "number") return { attempts: entry, delayMs: RETRY_CONFIG.delayMs };
  return {
    attempts: entry.attempts || 0,
    delayMs: entry.delayMs != null ? entry.delayMs : RETRY_CONFIG.delayMs
  };
}

// Requests containing these texts will bypass provider
export const SKIP_PATTERNS = [
  "Please write a 5-10 word title for the following conversation:"
];
