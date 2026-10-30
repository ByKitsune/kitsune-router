// Provider-scoped client versions and wire identities for gateway compatibility.
// App release, bundled SDK, API version and signed wire protocol are separate
// facts: a newer app does not establish a new SDK, API header or entitlement.
// Verified updates and retained/blocked pins are documented in:
// docs/audit/25-client-compatibility-and-catalog-sync-2026-10-31.md
// docs/audit/data/client-compatibility-refresh-20261031.json
// Publisher release/tag and integrity-checked artifact evidence must back each
// changed pin. Keep OAuth, model discovery, validation and execution aligned.
// Host/runtime metadata describes the executing gateway where upstream derives
// it dynamically; do not invent captured hardware, commits or account flags.

import { platform, arch } from "os";

// ─── Claude Code (claude-cli) ──────────────────────────────────────────
// npm latest/next 2.1.314; delayed stable is 2.1.308 (2026-10-31 review).
// Follow the existing non-prerelease latest policy, not the delayed stable tag.
export const CLAUDE_CODE_VERSION = "2.1.314";
export const CLAUDE_CLI_USER_AGENT = `claude-cli/${CLAUDE_CODE_VERSION} (external, sdk-cli)`;
export const CLAUDE_OAUTH_BETA_FLAG = "oauth-2025-04-20";

// Anthropic-Beta flag set — Anthropic adds/removes flags per release. We
// pass the full set; the heavy-agent flags (advanced-tool-use, effort) are
// gated to opus/sonnet via selectAnthropicBeta() in shared.js.
//
// Every flag here must be one Anthropic accepts for ANY enrolled account.
// Flags that are gated per-organization (the client only sends them once the
// server hands it an entitlement) must NOT be listed: the upstream answers the
// whole request with
//   400 Unexpected value(s) `timing-2026-09-09` for the `anthropic-beta` header
// `timing-2026-09-09` is exactly such a flag — it is the client's internal
// per-turn timing telemetry beta and carries no routing behavior for a gateway.
// selectAnthropicBeta() additionally strips any flag the upstream names in that
// 400 (see parseRejectedAnthropicBetaFlags), so a future entitlement change
// self-heals instead of breaking the turn.
export const CLAUDE_BETA_FLAGS_BASE = [
  "claude-code-20250219",
  CLAUDE_OAUTH_BETA_FLAG,
  "interleaved-thinking-2025-05-14",
  "context-management-2025-06-27",
  "prompt-caching-scope-2026-01-05",
  "structured-outputs-2025-12-15",
  "fast-mode-2026-02-01",
  "redact-thinking-2026-02-12",
  "tool-search-tool-2025-10-19",
  "dangerous-tool-use-2026-09-03",
  "inline-tools-2026-09-15",
];
export const CLAUDE_BETA_FLAGS_HEAVY_AGENT = [
  "advanced-tool-use-2025-11-20",
  "effort-2025-11-24",
];

// SDK 0.128.0 reverified in the SHA-512 integrity-checked native 2.1.314 bundle.
// Its Stainless source reports the executing process.version, independently of
// the app release. Report this gateway's runtime rather than an invented host pin.
export const CLAUDE_STAINLESS = {
  helperMethod: "stream",
  retryCount: "0",
  runtimeVersion: process.version || "unknown",
  packageVersion: "0.128.0",
  runtime: "node",
  timeout: "600",
};

// ─── OpenAI Codex ──────────────────────────────────────────────────────
// 0.166.0 (npm latest / rust-v0.166.0 non-prerelease, 2026-10-29). Two surfaces:
//   - codex_cli_rs/<v>  → User-Agent header on /responses, /chat, /v1/chat
//   - ?client_version=  → query param on /backend-api/codex/models (gating)
export const CODEX_CLI_VERSION = "0.166.0";
export const CODEX_USER_AGENT = `codex_cli_rs/${CODEX_CLI_VERSION}`;
// Antigravity-style codex_cli_rs gating is identical.
export const CODEX_MODELS_CLIENT_VERSION = CODEX_CLI_VERSION;

// ─── GitHub Copilot ────────────────────────────────────────────────────
// Stable VS Code 1.144.0 bundles Copilot Chat 0.72.0 in its tagged
// extensions/copilot/package.json. Keep the editor and extension paired.
// Pair that bundled extension with its editor; do not use marketplace latest.
export const VSCODE_VERSION = "1.144.0";
export const COPILOT_CHAT_VERSION = "0.72.0";
export const COPILOT_USER_AGENT = `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`;
// Final @vscode/copilot-api 0.5.2 mixin (still bundled with VS Code 1.144.0).
// Token and Copilot user-info requests bypass that mixin.
export const COPILOT_API_VERSION = "2026-08-01";
export const COPILOT_TOKEN_API_VERSION = "2025-04-01";

// ─── Cursor ────────────────────────────────────────────────────────────
// Stable 3.24.18 IDE archive verifies the unchanged Jyh checksum algorithm
// and Connect 1.6.1. Public requests omit the Anysphere-only client commit.
// Static bundle inspection is not live credential/protocol validation.
export const CURSOR_VERSION = "3.24.18";
export const CURSOR_CONNECT_ES_VERSION = "1.6.1";

// ─── Antigravity ───────────────────────────────────────────────────────
// Keep the IDE identity separate for optional MITM compatibility overrides.
// Native gateway calls use the CLI surface; Argon is not offered on the IDE.
// https://antigravity.google/docs/models.md restricts availability by plan;
// a CLI User-Agent does not grant a paid subscription or Enterprise license.
// https://antigravity.google/docs/install.md documents distinct API-key/ADC
// auth paths; retain the verified OAuth/CloudCode binding, not a guessed port.
export const ANTIGRAVITY_IDE_VERSION = "2.5.5";
export const ANTIGRAVITY_IDE_USER_AGENT = (() => {
  // Match the gateway host's platform; this is not a fixed captured macOS UA.
  const os = platform();
  const a = arch();
  const osToken = os === "darwin"
    ? (a === "arm64" ? "darwin/arm64" : "darwin/x64")
    : os === "win32"
      ? (a === "arm64" ? "windows/arm64" : "windows/x64")
      : (a === "arm64" ? "linux/arm64" : "linux/x64");
  return `antigravity/ide/${ANTIGRAVITY_IDE_VERSION} ${osToken}`;
})();

// Minimal CLI identity avoids inventing a captured host/build fingerprint.
export const ANTIGRAVITY_CLI_VERSION = "1.4.0";
export const ANTIGRAVITY_CLI_USER_AGENT = `antigravity/cli/${ANTIGRAVITY_CLI_VERSION}`;

// Antigravity MITM override is now opt-in. Default OFF — upstream
// 2.x rejects the legacy 1.x fingerprint and forcing it breaks
// production IDE users. Set MITM_ANTIGRAVITY_VERSION_OVERRIDE=true to
// re-enable for compatibility tests.
export const ANTIGRAVITY_MITM_VERSION_OVERRIDE_ENABLED =
  process.env.MITM_ANTIGRAVITY_VERSION_OVERRIDE === "true";
export const ANTIGRAVITY_MITM_VERSION = ANTIGRAVITY_IDE_VERSION;

// ─── Gemini CLI ────────────────────────────────────────────────────────
// v0.66.0 core still bundles genai 1.30.0, but OAuth Code Assist uses the nested
// google-auth-library 10.9.0 interceptor, NOT the GoogleGenAI API-key branch.
// Tagged source strips the leading v from the executing Node runtime.
export const GEMINI_CLI_VERSION = "0.66.0";
export const GEMINI_AUTH_LIBRARY_VERSION = "10.9.0";
export const GEMINI_AUTH_USER_AGENT = `google-api-nodejs-client/${GEMINI_AUTH_LIBRARY_VERSION}`;
export const GEMINI_CLI_API_CLIENT = `gl-node/${process.version?.replace(/^v/, "") || "unknown"}`;

// ─── Kiro ──────────────────────────────────────────────────────────────
// Two distinct upstream lines:
//   - IDE stable manifest 1.4.13 (2026-10-21) → client fingerprint
//   - CLI stable manifest 2.33.0 (2026-10-20)
//
// The runtime UA uses kiro-ide/<v> as the dominant client identifier;
// the aws-sdk-js wrapper is a retained legacy wire pin, NOT a claim that the
// current IDE bundles SDK 3.0.0. Native runtime/host defaults remain unverified.
export const KIRO_IDE_VERSION = "1.4.13";
export const KIRO_CLI_VERSION = "2.33.0";
export const KIRO_AWS_SDK_VERSION = "3.0.0";
export const KIRO_RUNTIME_SDK_VERSION = "3.0.0";
export const KIRO_USER_AGENT = `AWS-SDK-JS/${KIRO_AWS_SDK_VERSION} kiro-ide/${KIRO_IDE_VERSION}`;
export const KIRO_AMZ_USER_AGENT = `aws-sdk-js/${KIRO_AWS_SDK_VERSION} KiroIDE-${KIRO_IDE_VERSION}`;
// Token refresh / profile-discovery surface identifies as the CLI, not the IDE.
// Was hardcoded as "kiro-cli/1.0.0" in executors/default.js and
// services/tokenRefresh/providers.js, which drifted from KIRO_CLI_VERSION.
export const KIRO_CLI_USER_AGENT = `kiro-cli/${KIRO_CLI_VERSION}`;

// Build the per-request fingerprint (matches Kiro IDE >1.0.228 where
// GenerateAssistantResponse moved to POST / + x-amz-target header).
export const KIRO_FINGERPRINT = ({
  kiroAgentOs = "windows",
  kiroAgentOsVersion = "10.0.26200",
  kiroNodeVersion = "22.21.1",
  machineId = "",
} = {}) => ({
  userAgent:
    `aws-sdk-js/${KIRO_RUNTIME_SDK_VERSION} ua/2.1 ` +
    `os/${kiroAgentOs}#${kiroAgentOsVersion} ` +
    `lang/js md/nodejs#${kiroNodeVersion} ` +
    `api/codewhispererruntime#${KIRO_RUNTIME_SDK_VERSION} m/N,E ` +
    `KiroIDE-${KIRO_IDE_VERSION}-${machineId}`,
  amzUserAgent:
    `aws-sdk-js/${KIRO_RUNTIME_SDK_VERSION} KiroIDE-${KIRO_IDE_VERSION}-${machineId}`,
});

// ─── Trae ──────────────────────────────────────────────────────────────
// 3.6.4 (publisher stable download manifest; provider remains inactive).
// appVersion is sent in common_params of SOLO session init.
export const TRAE_APP_VERSION = "3.6.4";
export const TRAE_USER_AGENT = "Trae/1.0.0 antigravity-cockpit-tools";

// ─── CodeBuddy (Tencent) ───────────────────────────────────────────────
// CLI 2.179.0 (integrity-checked npm latest) verifies the CN CLI surface only.
// INTL IDE identity remains unverified: retain its independent legacy wire pin,
// not a claim about the published IDE release. Keep each region's OAuth paired.
export const CODEBUDDY_CLI_VERSION = "2.179.0";
export const CODEBUDDY_INTL_WIRE_VERSION = "2.161.1";
export const CODEBUDDY_CN_TRANSPORT_UA = `CLI/${CODEBUDDY_CLI_VERSION} CodeBuddy/${CODEBUDDY_CLI_VERSION}`;
export const CODEBUDDY_INTL_TRANSPORT_UA = `IDE/${CODEBUDDY_INTL_WIRE_VERSION} CodeBuddy/${CODEBUDDY_INTL_WIRE_VERSION}`;
export const CODEBUDDY_CN_OAUTH_UA = CODEBUDDY_CN_TRANSPORT_UA;
export const CODEBUDDY_INTL_OAUTH_UA = CODEBUDDY_INTL_TRANSPORT_UA;

// ─── Grok CLI / Grok Build ─────────────────────────────────────────────
// 1.0.62 (official stable channel, 2026-10-16). Preserve the existing wire shape;
// update version-dependent OAuth/runtime/catalog/billing identity together.
export const GROK_CLI_VERSION = "1.0.62";
export const GROK_CLI_CLIENT_IDENTIFIER = "grok-shell";
export const GROK_CLI_USER_AGENT =
  `grok-pager/${GROK_CLI_VERSION} grok-shell/${GROK_CLI_VERSION} (linux; x86_64)`;
// xAI discovery-time UA — not pinned to a specific version (xAI does
// not gate on user-agent for api.x.ai).
export const XAI_USER_AGENT = "grok-cli/kitsunerouter";

// ─── Kimchi ────────────────────────────────────────────────────────────
// Public CLI v1.25.0; tagged source uses the injected release version in its UA.
export const KIMCHI_GATEWAY_VERSION = "1.25.0";
export const KIMCHI_USER_AGENT = `kimchi/${KIMCHI_GATEWAY_VERSION}`;

// ─── Command Code ──────────────────────────────────────────────────────
// Integrity-checked CLI 1.88.2 uses its package release in this header.
// Artifact inspection does not establish live account/stream acceptance.
export const COMMAND_CODE_VERSION = "1.88.2";
export const COMMAND_CODE_USER_AGENT = "cli";
export const COMMAND_CODE_CLI_SURFACE = "cli";
export const COMMAND_CODE_TASTE_LEARNING = "false";

// ─── Zed ───────────────────────────────────────────────────────────────
// 1.26.2 (publisher stable release, 2026-10-31 review). Header fallback when the client
// does not provide appVersion via providerSpecificData.
export const ZED_VERSION = "1.26.2";
export const ZED_USER_AGENT = "kitsunerouter/zed";
export const ZED_DEFAULT_APP_VERSION = ZED_VERSION;

// ─── iFlow ─────────────────────────────────────────────────────────────
// Static identity, not an app pin. Official CLI/API shutdown: 2026-04-17.
export const IFLOW_USER_AGENT = "iFlow-Cli";

// ─── Windsurf / Devin Desktop (Codeium) ────────────────────────────────
// Stable Devin desktop 3.10.67 (2026-10-12) independently bundles metadata
// extensionVersion 1.48.2 via languageServerVersion, not extension package 0.2.0
// or base VS Code 1.126.0. Identity values do not verify the legacy protobuf layout.
export const WINDSURF_IDE_VERSION = "3.10.67";
export const WINDSURF_EXTENSION_VERSION = "1.48.2";

// ─── OpenCode (free-tier identity) ─────────────────────────────────────
// 1.19.5 (npm opencode-ai latest and tagged source). The free-tier backend gates on client
// identity: `User-Agent: opencode` and non-canonical x-opencode-session values
// fail with 403 FreeTierError, so the version must stay a real release at or
// above the minimum it enforces.
export const OPENCODE_VERSION = "1.19.5";
export const OPENCODE_USER_AGENT = `opencode/${OPENCODE_VERSION}`;

// ─── Qoder CLI ─────────────────────────────────────────────────────────
// 1.1.81 (@qoder-ai/qodercli npm latest). Its unsigned OpenAPI requests use
// qoder/<release>; legacy Cosy-Version remains signature-bound separately.
export const QODER_CLI_VERSION = "1.1.81";
export const QODER_CLI_USER_AGENT = `qoder/${QODER_CLI_VERSION}`;
