import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";
import { resolveObservabilityEnabled } from "@/lib/db/repos/requestDetailsRepo.js";
import bcrypt from "bcryptjs";
import { EFFORT_LEVELS } from "open-sse/translator/concerns/thinking.js";
import { SERVICE_TIER_OPTIONS } from "open-sse/providers/serviceTiers.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

// Whitelist of settings allowed via generic PATCH (CWE-915 mass-assignment protection)
// Security-critical fields (auth, SSO, proxy, etc.) must be updated via
// dedicated secure flows with explicit verification, not mass-assigned.
const ALLOWED_SETTING_KEYS = new Set([
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
  "observabilityMaxRecords",
  "observabilityBatchSize",
  "observabilityFlushIntervalMs",
  "observabilityMaxJsonSize",
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
  // legacy / compatibility
  "fallbackStrategy",
  "claudeAutoPing",
  "codexAutoPing",
]);

// Security-critical keys that must never be mass-assigned (defense in depth,
// also enforced by ALLOWED whitelist). Kept for audit trail.
const PROTECTED_SETTING_KEYS = [
  "password",
  "mitmSudoEncrypted",
  "requireLogin",
  "requireApiKey",
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
  "tunnelDashboardAccess",
  "enableObservability",
  "outboundProxyEnabled",
  "outboundProxyUrl",
  "outboundNoProxy",
];

const THINKING_MODES = new Set(["auto", "on", "off", "none", "thinking", "ultra", ...EFFORT_LEVELS]);
const SERVICE_TIER_MODES = new Set(SERVICE_TIER_OPTIONS.map(option => option.value));
const UNSAFE_PROVIDER_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function validProviderModes(value, modes) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([provider, config]) =>
    provider && !UNSAFE_PROVIDER_KEYS.has(provider) && config && typeof config === "object" &&
    !Array.isArray(config) && modes.has(config.mode));
}

export async function GET() {
  try {
    const settings = await getSettings();
    const { password, oidcClientSecret, mitmSudoEncrypted, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";

    return NextResponse.json({
      ...safeSettings,
      enableRequestLogs,
      enableRequestLogsDefined: process.env.ENABLE_REQUEST_LOGS !== undefined,
      observabilityEnabled: resolveObservabilityEnabled(safeSettings),
      enableTranslator,
      hasPassword: !!password
    }, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const rawBody = await request.json();

    // Whitelist enforcement: only ALLOWED_SETTING_KEYS may be mass-assigned.
    // All other keys (including PROTECTED and arbitrary __proto__/constructor)
    // are dropped. Password is handled separately via newPassword flow.
    const body = {};
    for (const [key, value] of Object.entries(rawBody || {})) {
      if (ALLOWED_SETTING_KEYS.has(key)) {
        body[key] = value;
      }
    }
    // Defense in depth: explicitly strip any protected key that might have
    // slipped through if ALLOWED and PROTECTED ever overlap.
    for (const key of PROTECTED_SETTING_KEYS) delete body[key];

    if (Object.hasOwn(body, "providerThinking") && !validProviderModes(body.providerThinking, THINKING_MODES)) {
      return NextResponse.json({ error: "Invalid provider thinking settings" }, { status: 400 });
    }
    if (Object.hasOwn(body, "providerServiceTier") && !validProviderModes(body.providerServiceTier, SERVICE_TIER_MODES)) {
      return NextResponse.json({ error: "Invalid provider processing speed settings" }, { status: 400 });
    }

    // If updating password, hash it (handled outside whitelist)
    if (rawBody.newPassword) {
      const settings = await getSettings();
      const currentHash = settings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!rawBody.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(rawBody.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      } else {
        // First time setting password, no current password needed
        // Allow empty currentPassword or default "12345678"
        if (rawBody.currentPassword && rawBody.currentPassword !== "12345678" && rawBody.currentPassword !== "123456") {
           return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(rawBody.newPassword, salt);
    }

    // oidcClientSecret is protected and not in whitelist; it should not be
    // mass-assigned. It is intentionally ignored here. Dedicated SSO flows
    // should handle it via secure endpoints with re-auth.

    const settings = await updateSettings(body);

    // Apply outbound proxy settings immediately (no restart required) — note
    // outboundProxy* are PROTECTED and not mass-assignable via this whitelist;
    // this block is retained for backwards compat if they are allowed via
    // internal updates, but will not trigger for generic PATCH.
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Invalidate combo rotation state when strategy settings change
    if (
      Object.prototype.hasOwnProperty.call(body, "comboStrategy") ||
      Object.prototype.hasOwnProperty.call(body, "comboStickyRoundRobinLimit") ||
      Object.prototype.hasOwnProperty.call(body, "comboStrategies")
    ) {
      resetComboRotation();
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "claudeAutoPing") ||
      Object.prototype.hasOwnProperty.call(body, "codexAutoPing")
    ) {
      // Keep the scheduler absent when no account opted in; load its provider graph only on demand.
      import("@/shared/services/quotaAutoPing")
        .then(({ configureQuotaAutoPing }) => {
          configureQuotaAutoPing(settings);
        })
        .catch((error) => console.warn("[AutoPing] settings update failed:", error.message));
    }

    const { password, oidcClientSecret, mitmSudoEncrypted, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    return NextResponse.json(safeSettings, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
