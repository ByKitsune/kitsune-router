# 🌿 ZenRouter v0.8.6 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.8.6` is a stability and reliability release addressing critical protocol translation leaks, accurate token usage accounting, robust CLI configuration management, and upstream compatibility fixes.

---

## 🚀 Key Improvements & Fixes

### 🧠 Protocol & Thinking Block Translation
- **Eliminated Visible Thinking Notice Leak**:
  - Fixed an issue where Claude assistant thinking blocks mistakenly fell through to the default block handler on the `Claude → OpenAI` translation route, injecting literal `[thinking block omitted: not supported on this route]` strings into prompt histories.
  - Now properly preserves and maps Claude `thinking` blocks to `reasoning_content` on assistant messages while cleanly ignoring `redacted_thinking` without injecting placeholder text.
  - Updated `filterToOpenAIFormat` to retain assistant messages carrying `reasoning_content` even when the text body is initially empty.

---

### 📊 Accurate Token Usage Accounting (#4444)
- **Codex Cache & Reasoning Extraction**:
  - Resolved an issue on `/v1/chat/completions` where Codex provider usage was recorded as `cached_tokens: 0` despite high upstream prompt caching rates.
  - `normalizeUsage` and `extractUsageFromChunk` now read `input_tokens_details.cached_tokens` and `output_tokens_details.reasoning_tokens` across all OpenAI/Responses paths.

---

### 🛠️ CLI Tools & Key Configuration Resilience (#4399)
- **Resolved 401 `sk_zenrouter` Overwrites**:
  - Fixed CLI Tools (Codex, Cline, Copilot, OpenCode, Kilo, DeepSeek TUI, Grok Build) writing the placeholder key `sk_zenrouter` when local configuration existed or when empty values were passed, causing `401 Unauthorized` errors when `requireApiKey` is active.
  - `ApiKeySelect` now automatically initializes parent state with the primary active key.
  - Server-side routes now resolve active keys directly from `apiKeysRepo` when missing or set to placeholder strings.

---

### 🔄 Multi-Model Combo & Schema Fallback (#4447, #4369)
- **Gemini Free-Form Tool Schema Sanitization (#4447)**:
  - Enhanced `cleanJSONSchemaForAntigravity` to infer default types for untyped properties and expand boolean schema values into valid object schemas.
  - Added classification rules for `function_declarations` and `unsupported schema` with `0ms` cooldown so model combo routing advances to fallback members instead of failing on schema rejections.
- **Codex ChatGPT Account Restriction Fallback (#4369)**:
  - Classified ChatGPT account model restrictions (`"not supported when using codex with a chatgpt account"`) and early stream failures (`"response.failed"`) with `0ms` cooldown.
  - Enhanced `_peekSseTransientError` to detect `response.failed` before stream commitment, enabling automated fallback to available models.

---

### 💬 System Prompt Preservation (#4401)
- **Preserved User Directives on CodeBuddy**:
  - Fixed `CodeBuddyIntlExecutor` discarding user `system` and `developer` directives in favor of a static prompt. User prompts are now preserved and appended to the base instruction.
  - Updated `CodeBuddyExecutor` (`codebuddy-cn`) to sanitize agent identity markers via pattern replacement rather than erasing system prompts exceeding 2,000 characters.

---

### 🧹 Dependency & Code Cleanliness
- **Pruned Dead Banner Imports**:
  - Removed unreferenced legacy file `src/lib/oauth/utils/banner.js` requiring uninstalled packages (`figlet`, `gradient-string`, `chalk-animation`).

---

## 🧪 Verification & Test Suite
- Comprehensive suite coverage with **6 newly authored dedicated regression tests**:
  - `tests/translator/claude-to-openai-thinking.test.js`
  - `tests/unit/cached-token-usage.test.js`
  - `tests/unit/gemini-freeform-schema-fallback.test.js`
  - `tests/unit/cli-tools-api-key-resolution.test.js`
  - `tests/unit/codebuddy-system-prompt.test.js`
  - `tests/unit/codex-chatgpt-account-fallback.test.js`
- Full CI test & build verification passing on GitHub Actions.
