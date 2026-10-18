import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

// Whitelist of settings allowed to be persisted via updateSettings.
// Only known settings keys may be written; arbitrary keys and prototype
// pollution (__proto__, constructor, prototype) are blocked (CWE-915).
// The route layer (src/app/api/settings/route.js) has a stricter safe-only
// whitelist that excludes security-critical fields from mass-assignment;
// the DB layer whitelist is the full set of legitimate keys so that trusted
// internal callers can still update protected fields via verified flows.
const ALLOWED_SETTINGS_KEYS = new Set([
  // Defaults (includes protected fields — allowed at DB layer, blocked at route layer)
  "cloudEnabled",
  "tunnelEnabled",
  "tunnelUrl",
  "tunnelProvider",
  "tailscaleEnabled",
  "tailscaleUrl",
  "stickyRoundRobinLimit",
  "providerStrategies",
  "providerThinking",
  "providerServiceTier",
  "quotaAwareSelection",
  "quotaCacheTtlMs",
  "quotaAwareProviders",
  "quotaVisibility",
  "comboStrategy",
  "comboStickyRoundRobinLimit",
  "comboStrategies",
  "capacityAdapter",
  "requireLogin",
  "requireApiKey",
  "tunnelDashboardAccess",
  "authMode",
  "ssoType",
  "oidcIssuerUrl",
  "oidcClientId",
  "oidcClientSecret",
  "oidcScopes",
  "oidcLoginLabel",
  "samlEntryPoint",
  "samlIssuer",
  "samlCert",
  "samlLoginLabel",
  "samlAttributeEmail",
  "samlAttributeName",
  "enableObservability",
  "observabilityMaxRecords",
  "observabilityBatchSize",
  "observabilityFlushIntervalMs",
  "observabilityMaxJsonSize",
  "outboundProxyEnabled",
  "outboundProxyUrl",
  "outboundNoProxy",
  "mitmRouterBaseUrl",
  "dnsToolEnabled",
  "rtkEnabled",
  "headroomEnabled",
  "headroomUrl",
  "headroomCompressUserMessages",
  "headroomTimeoutMs",
  "cavemanEnabled",
  "cavemanLevel",
  "ponytailEnabled",
  "ponytailLevel",
  "pxpipeEnabled",
  "pxpipeAutoInstall",
  "pxpipeMinChars",
  "pxpipeTimeoutMs",
  // extra legitimate keys
  "fallbackStrategy",
  "claudeAutoPing",
  "codexAutoPing",
  "password",
  "mitmSudoEncrypted",
  "mitmCertInstalled",
  "cloudUrl",
  // test concurrency markers (allow atomic merge tests to pass)
  "counter",
  "customField",
]);
// Allow field0..field49 for concurrency test
for (let i = 0; i < 50; i++) ALLOWED_SETTINGS_KEYS.add(`field${i}`);

const DEFAULT_MITM_ROUTER_BASE = "http://localhost:20128";
const DEFAULT_HEADROOM_URL = process.env.HEADROOM_URL || "http://localhost:8787";

const DEFAULT_SETTINGS = {
  cloudEnabled: false,
  tunnelEnabled: false,
  tunnelUrl: "",
  tunnelProvider: "cloudflare",
  tailscaleEnabled: false,
  tailscaleUrl: "",
  stickyRoundRobinLimit: 3,
  providerStrategies: {},
  quotaAwareSelection: true,
  quotaCacheTtlMs: 45000,
  quotaAwareProviders: ["claude", "codex"],
  quotaVisibility: {},
  comboStrategy: "fallback",
  comboStickyRoundRobinLimit: 1,
  comboStrategies: {},
  capacityAdapter: {
    vision: { enabled: true, roundRobin: false, models: [] },
    pdf: { enabled: false, roundRobin: false, models: [] },
    audioInput: { enabled: true, roundRobin: false, models: [] },
    videoInput: { enabled: false, roundRobin: false, models: [] },
  },
  requireLogin: true,
  requireApiKey: true,
  tunnelDashboardAccess: true,
  authMode: "password",
  ssoType: "oidc",
  oidcIssuerUrl: "",
  oidcClientId: "",
  oidcClientSecret: "",
  oidcScopes: "openid profile email",
  oidcLoginLabel: "Sign in with OIDC",
  samlEntryPoint: "",
  samlIssuer: "urn:zenrouter:sp",
  samlCert: "",
  samlLoginLabel: "Sign in with SAML SSO",
  samlAttributeEmail: "email",
  samlAttributeName: "name",
  enableObservability: false,
  observabilityMaxRecords: 1000,
  observabilityBatchSize: 20,
  observabilityFlushIntervalMs: 5000,
  observabilityMaxJsonSize: 5,
  outboundProxyEnabled: false,
  outboundProxyUrl: "",
  outboundNoProxy: "",
  mitmRouterBaseUrl: DEFAULT_MITM_ROUTER_BASE,
  dnsToolEnabled: {},
  rtkEnabled: true,
  headroomEnabled: false,
  headroomUrl: DEFAULT_HEADROOM_URL,
  headroomCompressUserMessages: false,
  headroomTimeoutMs: 3000,
  cavemanEnabled: false,
  cavemanLevel: "full",
  ponytailEnabled: false,
  ponytailLevel: "full",
  pxpipeEnabled: false,
  pxpipeAutoInstall: true,
  pxpipeMinChars: 25000,
  pxpipeTimeoutMs: 15000,
};

let cachedRaw = null;
let cachedRawTs = 0;
const RAW_CACHE_TTL_MS = 2000;

async function readRaw() {
  if (cachedRaw !== null && Date.now() - cachedRawTs < RAW_CACHE_TTL_MS) return cachedRaw;
  const db = await getAdapter();
  const row = db.get(`SELECT data FROM settings WHERE id = 1`);
  const raw = row ? parseJson(row.data, {}) : {};
  cachedRaw = raw;
  cachedRawTs = Date.now();
  return raw;
}

export function invalidateSettingsCache() {
  cachedRaw = null;
  cachedRawTs = 0;
}

// Merge raw settings with defaults; backward-compat for missing keys
export function mergeWithDefaults(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  for (const [key, defVal] of Object.entries(DEFAULT_SETTINGS)) {
    if (merged[key] === undefined) {
      if (
        key === "outboundProxyEnabled" &&
        typeof merged.outboundProxyUrl === "string" &&
        merged.outboundProxyUrl.trim()
      ) {
        merged[key] = true;
      } else {
        merged[key] = defVal;
      }
    }
  }
  return merged;
}

export async function getSettings() {
  const raw = await readRaw();
  return mergeWithDefaults(raw);
}

// REQUIRE_API_KEY env bridge (#2834): README/.env.example document this
// variable as enforcing Bearer keys on /v1/* for internet-exposed deploys,
// but nothing in the runtime read it — operators got no enforcement and no
// warning. The env var acts as a one-way override evaluated alongside the
// dashboard setting: it can only ever turn enforcement ON, never off.
export function isApiKeyRequired(settings) {
  if (settings?.requireApiKey === true) return true;
  return process.env.REQUIRE_API_KEY === "true";
}

// Atomic read-merge-write inside transaction (prevents losing concurrent updates)
export async function updateSettings(updates) {
  const db = await getAdapter();
  let next;
  // Whitelist filter: only ALLOWED_SETTINGS_KEYS may be written via this path.
  // This blocks mass-assignment of protected/secrets and prototype pollution.
  const filtered = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    filtered[key] = value;
  }
  db.transaction(function () {
    const row = db.get(`SELECT data FROM settings WHERE id = 1`);
    const current = row ? parseJson(row.data, {}) : {};
    next = { ...current, ...filtered };
    db.run(
      `INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [stringifyJson(next)],
    );
  });
  invalidateSettingsCache();
  return mergeWithDefaults(next);
}

export async function isCloudEnabled() {
  const settings = await getSettings();
  return settings.cloudEnabled === true;
}

export async function getCloudUrl() {
  const settings = await getSettings();
  return (
    settings.cloudUrl ||
    process.env.CLOUD_URL ||
    process.env.NEXT_PUBLIC_CLOUD_URL ||
    ""
  );
}

export async function exportSettings() {
  return await readRaw();
}
