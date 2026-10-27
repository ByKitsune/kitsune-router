# ZenRouter v0.7.2 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.7.2` brings significant gateway reliability upgrades, security enhancements, complete Token Saver ecosystem synchronization (Headroom, Caveman v2.7.0, Ponytail v4.10.0, and RTK), upstream stability cherry-picks, and key bugfixes across provider integrations.

---

## Highlights

### 🛡️ Security & Proxy Hardening
- **Strict Proxy Enforcement (#4007)**: When `strictProxy: true` is configured, requests fail immediately if the proxy is unreachable or unconfigured, completely preventing accidental IP leakage via direct public fallbacks.
- **Proactive OAuth Refresh Epoch Timestamp Fix (#4000)**: Normalizes numeric timestamp strings (epoch ms/seconds) so tokens never fail to refresh silently due to `Invalid Date` / `NaN`.
- **Public Domain & Reverse Proxy OAuth Normalization**: Supports Cloudflare Tunnels and TLS-terminating proxies without throwing origin mismatch errors on `redirect_uri`.

### ⚡ Gateway & Model Routing Stability
- **Default `stream: false` on `/v1/chat/completions` (#4122)**: Accurately adheres to OpenAI API spec where `stream` defaults to `false`, preventing JSON parse crashes in LangChain, SDKs, and custom agent integrations.
- **Combo Fallback Strategy Override (#4094)**: Preserves explicit `fallback` strategy overrides per-combo instead of silently inheriting global Round Robin.
- **Combo Metadata Limits in `/v1/models` (#3486, #4096)**: Computes and exposes `context_length` and `max_completion_tokens` on combo entries (using the safe minimum envelope across members) to prevent agents from prematurely entering compaction loops.
- **Request-Scoped 4xx Protection (#20a43f5)**: Prevents payload/context-length client errors (400, 405, 413, 415, 422) from triggering account cooldowns, keeping healthy credentials active.
- **Stream Termination & Tool Call Logging (#4079, #4080)**: Emits synthesized terminal chunks (`finish_reason: "network_error"`) on truncated SSE streams so clients close gracefully, and records streamed tool calls in callbacks to eliminate deceptive `[Empty streaming response]` logs.
- **Retry-After & Terminal Billing Handling (#4147)**: Emits `Retry-After: <seconds>` headers on 429 responses and halts futile retry loops on permanent billing/credit errors (`余额不足`, `请充值`, `insufficient balance`, HTTP 402).
- **DeepSeek Reasoning Propagation (#4082)**: Symmetrically preserves both `delta.reasoning` and `delta.reasoning_content` in SSE streams so Cline and other agent clients render thinking traces seamlessly.

### 🧩 Provider & Agent Integrations
- **Cloudflare Workers AI Message Normalization (#1926, #4180)**: Added `@cf` alias support, flattens array message content, ensures string `content` presence, and rewrites `role: "tool"` to `"user"`.
- **OpenCode Free Tier Decoy Tools & Clamping (#4101, #4146, #4149)**: Injects cloaked decoy tools (`bash`, `read`) to bypass upstream 403 `FreeTierError` and clamps `xhigh`/`max`/`ultra` reasoning effort to `high` on `muse-spark` models to prevent HTTP 500 errors.
- **Antigravity Claude Header Stripping (#4138)**: Strips `x-anthropic-billing-header` from system prompts to prevent fake 429 quota locks and sanitizes Hermes agent identities (#f642295).
- **Claude Tool Schema Normalization (#4075)**: Enforces `type: "object"` and merges top-level `anyOf`/`oneOf`/`allOf` schemas to prevent HTTP 400 rejection from Anthropic API.
- **Claude Code Auto-Mode Safeguards (#4173)**: Passes through `safeguards` and `safeguard_results` to maintain free server-side classifier checks.
- **Codex Auto-Review Routing (#4135)**: Routes bare `codex-auto-review` virtual models to OAuth Codex instead of falling through to `openai` 404.
- **Custom Provider Live Discovery in Combos (#4177)**: Dynamically surfaces models discovered from local endpoints (Ollama, vLLM, LM Studio) in the Combo model selector.

### 🪨 Token Saver Ecosystem Overhaul
- **Headroom Gemini/Antigravity Adapter (#4070)**: Projects plain text and tool outputs from Gemini request envelopes into `/v1/compress` and writes back compressed text in-place, eliminating "unsupported antigravity request shape" skips. Normalizes token stats for alternative compressors (e.g. `lean-ctx` #4120).
- **Caveman Prompts v2.7.0**: Integrated ASD-STE100 Simplified Technical English standards, strict negation preservation (`not/never/no/only/except`), and direct tool firing with zero preamble.
- **Ponytail Prompts v4.10.0**: Upgraded to the complete 7-rung ladder with codebase pattern reuse as Rung 2, root-cause bug fix directives, and thorough pre-reading requirements.
- **RTK Filters**: Added new TOML filters for `df`, `du`, `jq`, `ollama`, and `gcc`.

### 📦 Dependency & Runtime Upgrades
- Bumped `undici` to `^7.29.1`, `jose` to `^6.2.12`, `better-sqlite3` to `^12.11.1`, `@xyflow/react` to `^12.11.6`, `monaco-editor` to `^0.56.0`, `marked` to `^18.0.13`, `open` to `^11.0.4`, and `esbuild` in CLI to `^0.28.2`.

---

## Verification
- Unit test suite: **All 63 tests passing 100%**.
- Linter: `eslint` clean with zero errors across all modules.
- Upstream compatibility verified against `decolua/9router@master`.
