import { platform, arch } from "os";
import {
  CLAUDE_CODE_VERSION,
  CLAUDE_CLI_USER_AGENT,
  CLAUDE_BETA_FLAGS_BASE,
  CLAUDE_BETA_FLAGS_HEAVY_AGENT,
  CLAUDE_STAINLESS,
  ANTIGRAVITY_IDE_VERSION,
  ANTIGRAVITY_IDE_USER_AGENT,
  ANTIGRAVITY_CLI_VERSION,
  ANTIGRAVITY_CLI_USER_AGENT,
} from "../config/clientVersions.js";

// === OS/Arch helpers (Stainless fingerprint) ===
export function mapStainlessOs() {
  switch (platform()) {
    case "darwin": return "MacOS";
    case "win32": return "Windows";
    case "linux": return "Linux";
    case "freebsd": return "FreeBSD";
    default: return `Other::${platform()}`;
  }
}

export function mapStainlessArch() {
  switch (arch()) {
    case "x64": return "x64";
    case "arm64": return "arm64";
    case "ia32": return "x86";
    default: return `other::${arch()}`;
  }
}

// Anthropic API version (single source — reused across claude-format providers/executors)
export const ANTHROPIC_API_VERSION = "2023-06-01";

// Shared Claude-compatible API headers (reused across claude-format providers)
export const CLAUDE_API_HEADERS = {
  "Anthropic-Version": ANTHROPIC_API_VERSION,
  "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
};

// Full Claude CLI fingerprint — required by providers that gate on client identity (e.g. agentrouter).
// Versions and beta flags are sourced from open-sse/config/clientVersions.js so a single bump
// propagates everywhere; OS/Arch come from runtime so kitsunerouter passes host detection.
export const CLAUDE_CLI_SPOOF_HEADERS = {
  "Anthropic-Version": ANTHROPIC_API_VERSION,
  "Anthropic-Beta": [
    ...CLAUDE_BETA_FLAGS_BASE,
    ...CLAUDE_BETA_FLAGS_HEAVY_AGENT,
  ].join(","),
  "Anthropic-Dangerous-Direct-Browser-Access": "true",
  "User-Agent": CLAUDE_CLI_USER_AGENT,
  "X-App": "cli",
  "X-Stainless-Helper-Method": CLAUDE_STAINLESS.helperMethod,
  "X-Stainless-Retry-Count": CLAUDE_STAINLESS.retryCount,
  "X-Stainless-Runtime-Version": CLAUDE_STAINLESS.runtimeVersion,
  "X-Stainless-Package-Version": CLAUDE_STAINLESS.packageVersion,
  "X-Stainless-Runtime": CLAUDE_STAINLESS.runtime,
  "X-Stainless-Lang": "js",
  "X-Stainless-Arch": mapStainlessArch(),
  "X-Stainless-Os": mapStainlessOs(),
  "X-Stainless-Timeout": CLAUDE_STAINLESS.timeout
};

const ANTHROPIC_BETA_BASE = [...CLAUDE_BETA_FLAGS_BASE];
const ANTHROPIC_BETA_HEAVY_AGENT = [...CLAUDE_BETA_FLAGS_HEAVY_AGENT];
const ANTHROPIC_BETA_REDACT_THINKING = "redact-thinking-2026-02-12";

export function wantsThinkingSummaries(body) {
  return body?.thinking?.display === "summarized";
}

// Heavy-agent beta flags are gated to opus/sonnet — cheaper models don't need them.
// `redact-thinking` asks Anthropic to return signature-only thinking blocks, which
// is right for clients that never render thinking but blanks the summaries a
// client explicitly requested with `thinking.display: "summarized"`.
//
// `unsupported` carries flags the upstream rejected for THIS account in a prior
// 400 ("Unexpected value(s) `X` for the `anthropic-beta` header"). Anthropic
// gates some betas per organization: the flag string ships in the client binary
// but is only accepted once the server has handed that account an entitlement.
// A gateway cannot know that in advance, so it drops them after the first
// rejection instead of failing every subsequent turn the same way.
export function selectAnthropicBeta(model = "", body = null, unsupported = null) {
  const blocked = unsupported instanceof Set ? unsupported : null;
  const flags = ANTHROPIC_BETA_BASE.filter((flag) => {
    if (blocked?.has(flag)) return false;
    return flag !== ANTHROPIC_BETA_REDACT_THINKING || !wantsThinkingSummaries(body);
  });
  if (/(?:^|\/)claude-(opus|sonnet)/.test(model)) {
    for (const flag of ANTHROPIC_BETA_HEAVY_AGENT) {
      if (!blocked?.has(flag)) flags.push(flag);
    }
  }
  return flags.join(",");
}

// Extract the beta names an Anthropic 400 named as unexpected, so the caller can
// retry the same turn without them. Returns [] when the body is not that error.
// The upstream lists every offending value in one backtick-quoted phrase:
//   Unexpected value(s) `a`, `b` for the `anthropic-beta` header.
export function parseRejectedAnthropicBetaFlags(bodyText) {
  if (typeof bodyText !== "string" || !bodyText.includes("anthropic-beta")) return [];
  const match = bodyText.match(/Unexpected value\(s\)([\s\S]*?)for the `anthropic-beta` header/);
  if (!match) return [];
  const flags = [...match[1].matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
  // Never treat the header name itself as a flag.
  return flags.filter((flag) => flag !== "anthropic-beta");
}

// Re-export the Claude version for tests/inspectors that import from shared.
export const CLAUDE_CODE_VERSION_REEXPORT = CLAUDE_CODE_VERSION;

// Shared baseUrls
export const KIMI_CODING_BASE_URL = "https://api.kimi.com/coding/v1/messages";

// Default base for dynamic compat providers (openai-compatible-* / anthropic-compatible-*) when user gives no baseUrl
export const OPENAI_COMPAT_BASE = "https://api.openai.com/v1";
export const ANTHROPIC_COMPAT_BASE = "https://api.anthropic.com/v1";

// Native CLI and IDE profiles are separate, single-sourced identities.
export { ANTIGRAVITY_IDE_VERSION, ANTIGRAVITY_IDE_USER_AGENT, ANTIGRAVITY_CLI_VERSION, ANTIGRAVITY_CLI_USER_AGENT };
export const ANTIGRAVITY_IDE_BASE_URL = "https://daily-cloudcode-pa.googleapis.com";

// Antigravity OAuth client credentials (public CLI client — duplicated in usage.js + src/lib/oauth)
export const ANTIGRAVITY_OAUTH_CLIENT = {
  clientId: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
  clientSecret: "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"
};

// Gemini (Google) OAuth client credentials (public CLI client — shared by gemini, gemini-cli, src/lib/oauth)
export const GOOGLE_OAUTH_CLIENT = {
  clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
  clientSecret: "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"
};
