# ZenRouter v0.7.4 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.7.4` introduces official support for Anthropic's newly launched **Claude Opus 5.5** (`claude-opus-5-5`), updates CLI and IDE spoofing signatures across all supported clients, resolves upstream 9Router issues, and fixes critical stream stall and timeout cleanup bugs that previously caused orphaned background requests, runaway loops, and 0-token spam.

---

## Highlights

### 🚀 Claude Opus 5.5 Official Launch Support
- **Official Model Registry & Aliasing**: Added `claude-opus-5-5`, `claude-opus-5-5-20260922`, and `claude-opus-5.5` across provider registries (`claude`, `tokenrouter`, `kiro`).
- **Full Capabilities & Modalities**: Configured 1M context window (1,000,000 tokens), 128k max output tokens, native PDF document support (`pdf: true`), tool use / function calling (`tools: true`), vision (`vision: true`), web search, and permanent adaptive thinking (`thinkingFormat: "claude-adaptive"`, `thinkingCanDisable: false`).
- **Pricing Integration**: Updated pricing registry for `anthropic/claude-opus-5-5` ($4.00/MTok input, $20.00/MTok output, $0.20/MTok cache read, $5.00/MTok cache write).
- **Bidirectional Model Normalization**: Added seamless dot-and-dash version normalization (`claude-opus-5.5` ↔ `claude-opus-5-5`) across providers so clients specifying either notation resolve without 404 errors.

### 🛡️ Critical Stream Stall & Timeout Fix (No More Hanging / Zero-Output Spam)
- **Immediate Upstream Cancellation**: Fixed bug where `stream stall timeout` (360,000ms) or TTFT timeouts triggered `streamController.abort()` without cancelling the underlying upstream fetch stream. `pipeWithDisconnect` now immediately cancels `providerResponse.body` and aborts transform streams upon stall or signal abort, terminating upstream requests instantly.
- **Client Disconnect Signal Propagation**: `createDisconnectAwareStream` now listens directly to `streamController.signal`'s abort event, immediately terminating reader locks, aborting writer, and properly closing or erroring the client SSE connection.
- **Combo Empty-Stream Leak Prevention**: `peekStreamForContent` now cancels readers immediately on timeout when no content is received, and combo iteration properly cancels discarded model streams, preventing orphaned background requests from continuing to run for minutes.
- **Structured Terminal Event Delivery**: Extended `onAbortTerminal` for OpenAI Responses API clients (`sourceFormat: "openai-responses"`) to ensure clients calling `/v1/responses` cleanly receive `response.failed` and `[DONE]` instead of hanging when upstream streams fail.

### 🔄 CLI / IDE Client Spoofing & Upstream 9Router Fixes
- **Claude Code 2.1.280**: Bumped User-Agent (`claude-cli/2.1.280 (external, sdk-cli)`), billing header (`cc_version=2.1.280`), and added latest beta flags (`tool-search-tool-2025-10-19`, `dangerous-tool-use-2026-09-03`, `timing-2026-09-09`, `inline-tools-2026-09-15`).
- **OpenAI Codex CLI 0.156.1**: Updated User-Agent (`codex_cli_rs/0.156.1`) and client version identifiers.
- **Google Gemini CLI 0.60.0 & Tencent Codebuddy 2.156.0**: Updated SDK versions and signatures.
- **Kiro IDE 1.1.0**: Updated IDE version `1.1.0`, CLI `2.21.0`, AWS SDK `3.0.0`.
- **Upstream #1468 Fix (`context_management`)**: Automatically drops `context_management` parameters when routing to third-party / non-Anthropic endpoints to prevent HTTP 400 rejection errors.
- **GitHub Copilot Extended Thinking Support**: Relaxed param-stripping regex to permit `thinking` and `reasoning_effort` on Claude Opus 5, Opus 5.5, and Sonnet 5 via GitHub Copilot.

---

## Verification
- Baseline suites (`verify-providers.mjs`, `verify-oauth-urls.mjs`, `verify-alias.mjs`) 100% byte-for-byte passing.
- Vitest unit & integration tests passing cleanly.
