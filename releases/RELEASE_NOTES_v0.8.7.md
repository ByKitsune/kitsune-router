# 🌿 ZenRouter v0.8.7 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.8.7` is a focused Claude-provider reliability release. It fixes a header flag that broke **every** `claude` request, restores the stream terminator that OpenAI-compatible clients need, and closes a translator gap that failed Zed tool round-trips.

---

## 🛠️ Claude Provider Auth & Streaming Fixes

### 🔑 `timing-2026-09-09` no longer breaks every Claude request
- **Symptom**: every request to the `claude` provider failed with
  `400 Unexpected value(s) \`timing-2026-09-09\` for the \`anthropic-beta\` header`.
- **Cause**: the flag was added in `3137197a` as one of the "latest stable beta flags" and sent unconditionally. It is in fact Claude Code's internal *per-turn timing telemetry* beta, **gated per organization**: the string ships inside the client binary (`q1=O("per_turn_timing","timing-2026-09-09")`) but the server only accepts it once the account holds the entitlement. Verified against the official Claude Code 2.1.284 native binary and Anthropic's documented beta list.
- **Fix**: removed from `CLAUDE_BETA_FLAGS_BASE`.
- **Self-healing**: `parseRejectedAnthropicBetaFlags()` parses the flag names out of that specific 400, and `DefaultExecutor` records them in a per-connection denylist, retries the turn once without them, and omits them on all later turns. Any future entitlement change now costs one extra round-trip instead of a hard failure.
- The denylist is a process-local map keyed by `connectionId` — deliberately **not** stored on the credential, because `getProviderCredentials()` rebuilds `providerSpecificData` on every request. Pooled accounts on different subscriptions stay isolated.

### ✅ `data: [DONE]` restored on CommandCode streams (#4461)
- **Symptom**: OpenAI-compatible clients (deepseek-acp, Cline SDK) reported `SSE stream ended without [DONE]` and treated every turn as truncated.
- **Cause**: `CommandCodeExecutor` already decodes upstream NDJSON into OpenAI `chat.completion.chunk` SSE *and* appends the sentinel, but `execute()` never set `responseFormat`. `handleChatCore` therefore kept the provider format as `commandcode` and ran the body through the SSE translator a **second** time, where `[DONE]` was parsed into `{done:true}` and dropped.
- **Fix**: declare `responseFormat: FORMATS.OPENAI` — the same pattern `cursor.js` uses after decoding to OpenAI SSE.

### 🧰 `is_error` always emitted on `tool_result` (#4463)
- **Symptom**: Zed IDE → ZenRouter → Zed hosted AI with a Claude model. First turn succeeded; the follow-up carrying tool results returned `400 failed to parse Anthropic request: missing field \`is_error\``.
- **Cause**: Zed's Anthropic wire type declares `is_error: bool` as **required**. Anthropic's public API treats it as optional, so the translator only spread it when truthy.
- **Fix**: `openai-to-claude` now always emits a boolean `is_error` (default `false`) on both the OpenAI `role:"tool"` path and the Claude-shaped passthrough. Harmless for Anthropic's public API; required by strict parsers.

---

## 🔍 Upstream Audit (decolua/9router, 2026-09-28/29)

Verified **already fixed** in Zen — no change needed:

| Issue | Subject | Zen status |
| :--- | :--- | :--- |
| **#4465** | CommandCode drops first SSE deltas | Immune — Zen replays raw byte chunks |
| **#4306** | Gemini fails when a tool property is named `"properties"` | Fixed — `SCHEMA_MAPS` guard |
| **#4276** | `custom` tool returned as `function_call` | Fixed — all 4 emit paths branch on `custom` |
| **#4345** | Gemini 400 on terminal model turn | Fixed — `normalizeGeminiContents` appends the user turn |
| **#4295** | `killAllAppProcesses` SIGKILLs unrelated processes | Fixed — `ps -o pid=,args=` + `/proc` verification |
| **#4326** | CommandCode drops NDJSON on multi-line packets | Fixed — raw-byte replay |
| **#4311** | O(n) `POST /api/providers` | Fixed — O(1) insert |

### ⚠️ Known issue, not yet fixed
- **GLM-5.3-Flash intermittent `400 code 1210` (#4409)** — Zen routes `glm` over two transports (`/api/coding/paas/v4` OpenAI, `/api/anthropic/v1/messages` Claude), and `resolveFormat` prefers a model's `zai` thinking format over the resolved target format. A native `/messages` transport can therefore receive OpenAI-dialect thinking fields (`reasoning_effort`). Not patched in this release: the upstream report does not confirm which transport was in use, and Zen already clamps `reasoning_effort` to `low|high|max`. Tracked for the next round.

---

## 🧪 Verification & Test Suite
- **New regression suites**:
  - `tests/unit/anthropic-beta-flag-rejection.test.js` — 11 tests (parser, selector, executor retry path).
  - `tests/unit/commandcode-done-sentinel-and-tool-result-is-error.test.js` — 9 tests.
- **No regressions**: full suite compared against the pre-change baseline. Failing-suite set is identical (112 suites), with the new suites replacing them in the passing set.
- Golden snapshot updated for the one intended delta: `+ "is_error": false` on a `tool_result`.
- Full CI test + build verification passing on GitHub Actions.
