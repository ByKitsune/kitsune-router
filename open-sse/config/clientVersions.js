// Single source of truth for upstream client versions, user-agents, and
// editor/CLI fingerprints that kitsunerouter spoofs in outbound requests.
//
// Why this exists: previously each provider scattered its User-Agent,
// editor-version, client_version, and plugin-version strings across
// the registry, executor, oauth service, and tests. That caused split-
// brain (Cursor transport said 3.12.17 while OAuth said 3.12.17 but the
// usage handler said something else) and made it impossible to bump
// versions in one place.
//
// Primary app releases rechecked 2026-10-21 against publisher-controlled sources:
//   https://registry.npmjs.org/@anthropic-ai/claude-code (latest/next 2.1.306;
//     explicit delayed stable channel 2.1.304). Retain the non-prerelease latest
//     policy: https://code.claude.com/docs/en/setup.md#configure-release-channel.
//   https://registry.npmjs.org/@openai/codex/latest (0.163.0, 2026-10-15),
//     https://github.com/openai/codex/releases/tag/rust-v0.163.0 (not alpha).
//   https://registry.npmjs.org/@google/gemini-cli/latest (0.65.0, 2026-10-20);
//     v0.65.0/packages/core/package.json still pins @google/genai 1.30.0
//     and google-auth-library 10.9.0. Preview/nightly releases are not selected.
//   https://antigravity.google/docs/changelog.md: native CLI 1.4.0
//     (2026-10-16), App 2.24.0, IDE 2.5.5. All three remain unchanged.
//     These are separate surfaces; an App/Hub release is not an IDE version.
// Secondary releases rechecked 2026-10-21 (separate app/SDK identities):
//   https://update.code.visualstudio.com/api/update/win32-x64-user/stable/latest:
//     VS Code 1.143.0; bundled extensions/copilot/package.json is 0.71.0
//     at exact stable commit 2d0b7506a36c1d6db9a466440131a8e01eab2289.
//   https://prod.download.desktop.kiro.dev/stable/metadata-win32-x64-user-stable.json:
//     IDE 1.4.13; https://prod.download.cli.kiro.dev/stable/latest/manifest.json:
//     CLI 2.33.0. Stable manifests are newer than the website changelogs.
//   https://registry.npmjs.org/@tencent-ai/codebuddy-code/latest (2.171.0; CN CLI).
//   https://x.ai/cli/stable (1.0.62; alpha releases are not selected).
//   https://github.com/getkimchi/kimchi/releases/tag/v1.17.0.
//   https://github.com/zed-industries/zed/releases/tag/v1.24.4.
//   https://api2.cursor.sh/updates/download/golden/linux-x64-deb/cursor/3.24:
//     Cursor 3.24.18; actual IDE archive still bundles Connect 1.6.1.
//   https://registry.npmjs.org/opencode-ai/latest (1.19.3),
//     https://registry.npmjs.org/@qoder-ai/qodercli/latest (1.1.75).
//   https://docs.devin.ai/desktop/changelog.md: desktop 3.10.67;
//     actual stable IDE archive independently verifies extension metadata 1.48.2.
//   https://icube-normal.trae.ai/icube/api/v1/native/version/trae/latest:
//     stable app 3.6.4 (source pin only; provider remains inactive).
//   https://registry.npmjs.org/command-code/latest (1.86.3); integrity-checked
//     bundle maps release header to CLI version, UA to cli, environment to production.
//
// App release verification does not verify bundled SDK/runtime or entitlement
// flags. Retain unverified wire pins rather than substituting public SDK latest;
// validate outbound protocol behavior and regression baselines after changes.

import { platform, arch } from "os";

// ─── Claude Code (claude-cli) ──────────────────────────────────────────
// npm latest/next 2.1.306; delayed stable is 2.1.304 (2026-10-21 capture).
// Follow the existing non-prerelease latest policy, not the delayed stable tag.
export const CLAUDE_CODE_VERSION = "2.1.306";
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

// SDK 0.128.0 reverified in the SHA-512 integrity-checked native 2.1.306 bundle
// (@anthropic-ai/claude-code-linux-x64); it did not change with the app release.
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
// 0.163.0 (npm latest / rust-v0.163.0 non-prerelease, 2026-10-15). Two surfaces:
//   - codex_cli_rs/<v>  → User-Agent header on /responses, /chat, /v1/chat
//   - ?client_version=  → query param on /backend-api/codex/models (gating)
export const CODEX_CLI_VERSION = "0.163.0";
export const CODEX_USER_AGENT = `codex_cli_rs/${CODEX_CLI_VERSION}`;
// Antigravity-style codex_cli_rs gating is identical.
export const CODEX_MODELS_CLIENT_VERSION = CODEX_CLI_VERSION;

// ─── GitHub Copilot ────────────────────────────────────────────────────
// Stable VS Code 1.143.0 bundles Copilot Chat 0.71.0 at
// 2d0b7506a36c1d6db9a466440131a8e01eab2289 (extensions/copilot/package.json).
// Pair that bundled extension with its editor; do not use marketplace latest.
export const VSCODE_VERSION = "1.143.0";
export const COPILOT_CHAT_VERSION = "0.71.0";
export const COPILOT_USER_AGENT = `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`;
// Final @vscode/copilot-api 0.5.2 mixin (still bundled with VS Code 1.143.0).
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
// v0.65.0 core still bundles genai 1.30.0, but OAuth Code Assist uses the nested
// google-auth-library 10.9.0 interceptor, NOT the GoogleGenAI API-key branch.
// Tagged source strips the leading v from the executing Node runtime.
export const GEMINI_CLI_VERSION = "0.65.0";
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
// CLI 2.171.0 (npm latest, 2026-10-20) verifies the CN CLI surface only.
// INTL IDE identity remains unverified: retain its independent legacy wire pin,
// not a claim about the published IDE release. Keep each region's OAuth paired.
export const CODEBUDDY_CLI_VERSION = "2.171.0";
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
// Public CLI v1.17.0 (2026-10-20); tagged source uses kimchi/<release>.
export const KIMCHI_GATEWAY_VERSION = "1.17.0";
export const KIMCHI_USER_AGENT = `kimchi/${KIMCHI_GATEWAY_VERSION}`;

// ─── Command Code ──────────────────────────────────────────────────────
// Published 1.86.3 bundle verifies these headers and /alpha/generate; this
// release identity does not claim live body/stream compatibility.
export const COMMAND_CODE_VERSION = "1.86.3";
export const COMMAND_CODE_USER_AGENT = "cli";

// ─── Zed ───────────────────────────────────────────────────────────────
// 1.24.4 (stable channel, 2026-10-20). x-zed-version header fallback when the client
// does not provide appVersion via providerSpecificData.
export const ZED_VERSION = "1.24.4";
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
// 1.19.3 (npm opencode-ai latest). The free-tier backend gates on client
// identity: `User-Agent: opencode` and non-canonical x-opencode-session values
// fail with 403 FreeTierError, so the version must stay a real release at or
// above the minimum it enforces.
export const OPENCODE_VERSION = "1.19.3";
export const OPENCODE_USER_AGENT = `opencode/${OPENCODE_VERSION}`;

// ─── Qoder CLI ─────────────────────────────────────────────────────────
// 1.1.75 (@qoder-ai/qodercli npm latest). Used for unsigned PAT discovery/userinfo
// UA only; legacy Cosy-Version remains signature-bound in shared/qoder/cosy.js.
export const QODER_CLI_VERSION = "1.1.75";
