// Single source of truth for upstream client versions, user-agents, and
// editor/CLI fingerprints that zenrouter spoofs in outbound requests.
//
// Why this exists: previously each provider scattered its User-Agent,
// editor-version, client_version, and plugin-version strings across
// the registry, executor, oauth service, and tests. That caused split-
// brain (Cursor transport said 3.12.17 while OAuth said 3.12.17 but the
// usage handler said something else) and made it impossible to bump
// versions in one place.
//
// App releases checked 2026-10-06 against publisher-controlled sources:
//   https://registry.npmjs.org/@anthropic-ai/claude-code (latest 2.1.289;
//     explicit stable channel 2.1.285). Use the non-prerelease latest release.
//   https://registry.npmjs.org/@openai/codex/latest (0.160.0, 2026-10-01)
//   https://registry.npmjs.org/@google/gemini-cli/latest (0.62.0, 2026-09-29);
//     v0.62.0/packages/core/package.json pins @google/genai exactly 1.30.0.
//   https://antigravity.google/docs/changelog.md: native CLI 1.4.0
//     (2026-10-16; rechecked 2026-10-17), App 2.24.0, IDE 2.5.5.
//     These are separate surfaces; an App/Hub release is not an IDE version.
//   https://update.code.visualstudio.com/api/update/win32-x64-user/stable/latest:
//     VS Code 1.140.0; tagged extensions/copilot/package.json is 0.68.0.
//   https://kiro.dev/changelog/ide/1-2 (IDE 1.2.4) and /cli/2-27 (CLI 2.27.0).
//   https://registry.npmjs.org/@tencent-ai/codebuddy-code/latest (2.161.3; CN only).
//   https://x.ai/cli/stable (1.0.46; alpha releases are not selected).
//   https://github.com/getkimchi/kimchi/releases/tag/v1.6.0 (2026-10-05).
//   https://github.com/zed-industries/zed/releases/tag/v1.22.0 (unchanged).
//   Cursor golden download redirects to 3.22.12; OpenCode 1.18.34,
//     Qoder CLI 1.1.65 and Devin Desktop 3.10.48 remain current.
//   Trae stable download manifest: 3.5.104 (source pin only; provider inactive).
//   https://registry.npmjs.org/command-code/latest (1.74.1); inspected bundle
//     maps x-command-code-version to CLI release and User-Agent to cli.
//
// App release verification does not verify bundled SDK/runtime or entitlement
// flags. Retain unverified wire pins rather than substituting public SDK latest;
// validate outbound protocol behavior and regression baselines after changes.

import { platform, arch } from "os";

// ─── Claude Code (claude-cli) ──────────────────────────────────────────
// npm latest channel 2.1.289; delayed stable is 2.1.285; 2.1.290 is next-only.
export const CLAUDE_CODE_VERSION = "2.1.289";
export const CLAUDE_CLI_USER_AGENT = `claude-cli/${CLAUDE_CODE_VERSION} (external, sdk-cli)`;

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
  "oauth-2025-04-20",
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

// SDK 0.128.0 verified in the integrity-checked native 2.1.289 bundle.
// Retain the legacy runtime pin: native source reads process.version; neither
// launcher Node minimum nor static binary strings verify a fixed runtime.
export const CLAUDE_STAINLESS = {
  helperMethod: "stream",
  retryCount: "0",
  runtimeVersion: "v24.14.0",
  packageVersion: "0.128.0",
  runtime: "node",
  timeout: "600",
};

// ─── OpenAI Codex ──────────────────────────────────────────────────────
// 0.160.0 (npm latest non-prerelease, 2026-10-01). Two surfaces:
//   - codex_cli_rs/<v>  → User-Agent header on /responses, /chat, /v1/chat
//   - ?client_version=  → query param on /backend-api/codex/models (gating)
export const CODEX_CLI_VERSION = "0.160.0";
export const CODEX_USER_AGENT = `codex_cli_rs/${CODEX_CLI_VERSION}`;
// Antigravity-style codex_cli_rs gating is identical.
export const CODEX_MODELS_CLIENT_VERSION = CODEX_CLI_VERSION;

// ─── GitHub Copilot ────────────────────────────────────────────────────
// VSCode 1.140.0 is the latest stable. The copilot-chat version
// that matters is the one BUNDLED in the VS Code release tag `1.140.0`
// (extensions/copilot/package.json → 0.68.0); the marketplace standalone
// standalone lags the bundled extension. Pairing
// vscode/1.140.0 with anything other than 0.68.0 looks inconsistent upstream.
export const VSCODE_VERSION = "1.140.0";
export const COPILOT_CHAT_VERSION = "0.68.0";
export const COPILOT_USER_AGENT = `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`;
// Final @vscode/copilot-api 0.5.2 mixin (bundled with VS Code 1.140.0).
// Token and Copilot user-info requests bypass that mixin.
export const COPILOT_API_VERSION = "2026-08-01";
export const COPILOT_TOKEN_API_VERSION = "2025-04-01";

// ─── Cursor ────────────────────────────────────────────────────────────
// 3.22.12 (2026-09-30). The checksum (jyh cipher: XOR rolling key + base64)
// in open-sse/utils/cursorChecksum.js is upstream's algorithm; if Cursor
// changes it, the import flow must be revalidated end-to-end with a real
// credential before bumping. Verified algorithm unchanged as of 2026-08-25.
export const CURSOR_VERSION = "3.22.12";
export const CURSOR_CONNECT_ES_VERSION = "1.6.1";

// ─── Antigravity ───────────────────────────────────────────────────────
// Keep the IDE identity separate for optional MITM compatibility overrides.
// Native gateway calls use the CLI surface; Argon is not offered on the IDE.
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
// 0.62.0 core bundles genai 1.30.0, but OAuth Code Assist uses the nested
// google-auth-library 10.9.0 interceptor, NOT the GoogleGenAI API-key branch.
// Tagged source strips the leading v from the executing Node runtime.
export const GEMINI_CLI_VERSION = "0.62.0";
export const GEMINI_AUTH_LIBRARY_VERSION = "10.9.0";
export const GEMINI_AUTH_USER_AGENT = `google-api-nodejs-client/${GEMINI_AUTH_LIBRARY_VERSION}`;
export const GEMINI_CLI_API_CLIENT = `gl-node/${process.version?.replace(/^v/, "") || "unknown"}`;

// ─── Kiro ──────────────────────────────────────────────────────────────
// Two distinct upstream lines:
//   - IDE line 1.2.x (1.2.4 is the newest published, 2026-09-30: Workflows) → client fingerprint
//   - CLI line 2.27.0 (2026-10-01)
//
// The runtime UA uses kiro-ide/<v> as the dominant client identifier;
// the aws-sdk-js wrapper is the underlying SDK prefix.
export const KIRO_IDE_VERSION = "1.2.4";
export const KIRO_CLI_VERSION = "2.27.0";
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
// 3.5.104 (publisher stable download manifest; provider remains inactive).
// appVersion is sent in common_params of SOLO session init.
export const TRAE_APP_VERSION = "3.5.104";
export const TRAE_USER_AGENT = "Trae/1.0.0 antigravity-cockpit-tools";

// ─── CodeBuddy (Tencent) ───────────────────────────────────────────────
// CLI 2.161.3 (npm latest, 2026-10-05) verifies the CN CLI surface only.
// INTL IDE identity remains unverified: retain its independent legacy wire pin,
// not a claim about the published IDE release. Keep each region's OAuth paired.
export const CODEBUDDY_CLI_VERSION = "2.161.3";
export const CODEBUDDY_INTL_WIRE_VERSION = "2.161.1";
export const CODEBUDDY_CN_TRANSPORT_UA = `CLI/${CODEBUDDY_CLI_VERSION} CodeBuddy/${CODEBUDDY_CLI_VERSION}`;
export const CODEBUDDY_INTL_TRANSPORT_UA = `IDE/${CODEBUDDY_INTL_WIRE_VERSION} CodeBuddy/${CODEBUDDY_INTL_WIRE_VERSION}`;
export const CODEBUDDY_CN_OAUTH_UA = CODEBUDDY_CN_TRANSPORT_UA;
export const CODEBUDDY_INTL_OAUTH_UA = CODEBUDDY_INTL_TRANSPORT_UA;

// ─── Grok CLI / Grok Build ─────────────────────────────────────────────
// 1.0.46 (official stable channel, 2026-09-30). Preserve the existing wire shape;
// update version-dependent OAuth/runtime/catalog/billing identity together.
export const GROK_CLI_VERSION = "1.0.46";
export const GROK_CLI_CLIENT_IDENTIFIER = "grok-shell";
export const GROK_CLI_USER_AGENT =
  `grok-pager/${GROK_CLI_VERSION} grok-shell/${GROK_CLI_VERSION} (linux; x86_64)`;
// xAI discovery-time UA — not pinned to a specific version (xAI does
// not gate on user-agent for api.x.ai).
export const XAI_USER_AGENT = "grok-cli/zenrouter";

// ─── Kimchi ────────────────────────────────────────────────────────────
// Public CLI v1.6.0 (2026-10-05); tagged source uses kimchi/<release>.
export const KIMCHI_GATEWAY_VERSION = "1.6.0";
export const KIMCHI_USER_AGENT = `kimchi/${KIMCHI_GATEWAY_VERSION}`;

// ─── Command Code ──────────────────────────────────────────────────────
// Published 1.74.1 bundle verifies these headers and /alpha/generate; this
// release identity does not claim live body/stream compatibility.
export const COMMAND_CODE_VERSION = "1.74.1";
export const COMMAND_CODE_USER_AGENT = "cli";

// ─── Zed ───────────────────────────────────────────────────────────────
// 1.22.0 (stable channel, 2026-09-30). x-zed-version header fallback when the client
// does not provide appVersion via providerSpecificData.
export const ZED_VERSION = "1.22.0";
export const ZED_USER_AGENT = "zenrouter/zed";
export const ZED_DEFAULT_APP_VERSION = ZED_VERSION;

// ─── iFlow ─────────────────────────────────────────────────────────────
// Static identity, not an app pin. Official CLI/API shutdown: 2026-04-17.
export const IFLOW_USER_AGENT = "iFlow-Cli";

// ─── Windsurf / Devin Desktop (Codeium) ────────────────────────────────
// 3.10.48 — latest STABLE desktop release (windsurf.com/changelog, 2026-09-29).
// Retain the existing IDE/extension wire pairing; the published desktop release
// alone does not independently verify its bundled extension protocol identity.
export const WINDSURF_IDE_VERSION = "3.10.48";

// ─── OpenCode (free-tier identity) ─────────────────────────────────────
// 1.18.34 (npm opencode-ai latest). The free-tier backend gates on client
// identity: `User-Agent: opencode` and non-canonical x-opencode-session values
// fail with 403 FreeTierError, so the version must stay a real release at or
// above the minimum it enforces.
export const OPENCODE_VERSION = "1.18.34";
export const OPENCODE_USER_AGENT = `opencode/${OPENCODE_VERSION}`;

// ─── Qoder CLI ─────────────────────────────────────────────────────────
// 1.1.65 (@qoder-ai/qodercli npm latest). Used for model discovery; the
// Cosy-Version header is signature-bound separately in shared/qoder/cosy.js.
export const QODER_CLI_VERSION = "1.1.65";
