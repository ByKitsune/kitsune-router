# 🌿 ZenRouter v0.8.5 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.8.5` is a major performance, accuracy, and ecosystem release featuring support for the latest **September 2026** models (OpenAI GPT-6 Astra/Sol/Luna, Z.ai GLM-5.3, Qwen 3.8, DeepSeek V4.1 Flash), enhanced Google Search grounding via Antigravity, multi-reference image generation & editing, exact prompt caching detection, accurate token cost calculation, and critical security hardening.

---

## 🚀 Highlights & New Features

### 🧠 Next-Gen 2026 Model Catalog & Capabilities
- **OpenAI GPT-6 Family**:
  - `gpt-6-astra`: Flagship frontier model for deep reasoning, computer use, and long-horizon tasks (1.05M context / 128k output, $10.00/$50.00).
  - `gpt-6-sol`: High-performance coding and multi-step workhorse model (1.05M context / 128k output, $2.00/$10.00).
  - `gpt-6-luna`: Lightweight high-speed tier for high-volume tasks (1.05M context / 128k output, $0.10/$0.50).
  - Full pricing and context mapping for `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`.
- **Z.ai / Zhipu AI GLM-5.3**:
  - `glm-5.3`: Frontier software engineering and deep reasoning (1M context / 131k output, $1.40/$4.40).
  - `glm-5.3-flash`: Native multimodal MoE model supporting text, image, and video inputs at high throughput ($0.15/$0.50, $0.03 cached).
- **Alibaba Qwen 3.8 Series**:
  - `qwen3.8-max`: 2.4T MoE flagship for enterprise-grade autonomous coding (1M context, $2.00/$6.00).
  - `qwen3.8-flash`: Fast multimodal vision/video architecture ($0.16/$0.47).
  - Capabilities and pricing mapped for `qwen3.7-max`, `qwen3.7-plus`, and `qwen3.6-plus`.
- **DeepSeek V4.1 Flash**:
  - `deepseek-v4.1-flash`: Asymmetric MoE model with native vision and 1M context ($0.14/$0.28, $0.0028 cache hit).

---

### 🎨 Antigravity Image Generation & Editing Pipeline
- **Multi-Reference Images**: Supports single and multiple reference images via `body.image` and `body.images[]` for image-to-image and inpainting/editing.
- **Remote Image URLs**: Downloads and validates HTTP/HTTPS remote image URLs safely via `fetchImageAsBase64` with SSRF and magic-byte MIME protection.
- **Response Modality Directive**: Enforces `responseModalities: ["TEXT", "IMAGE"]` and injects prompt directives so Gemini returns images instead of text-only answers.
- **Expanded Models in Registry**: Added `gemini-3-pro-image` (Nano Banana Pro), `gemini-2.5-flash-image`, `imagen-3.0-generate-002`, and `imagen-3.0-fast-generate-001`.
- **Aspect Ratio & Size Mapping**: Automatically maps `body.aspect_ratio` and OpenAI `body.size` into model ratio suffixes (`16:9`, `9:16`, `1:1`, etc.).

---

### 🔍 Antigravity Web Search Engine Grounding
- **Flexible Model Routing**: `/v1/search` now accepts `provider/model` syntax (e.g. `ag/gemini-3.8-flash`) and forwards custom grounding models directly to `handleChatSearch`.
- **Clean Grounding & Citations**: Extracts unified citations, titles, snippets, and expanded sentence contexts from Google Grounding metadata.

---

### 💰 Accurate Token Cost Calculation & Prompt Cache Detection
- **Eliminated Reasoning Double-Billing**: Reasoning tokens are now properly subtracted from total completion tokens before computing base output cost, eliminating overcharges.
- **Exact Component Cost Breakdown (#4191)**: Added `calculateCostBreakdown()` computing separate `inputCost`, `cachedCost`, `cacheCreationCost`, `outputCost`, and `reasoningCost`.
- **Enhanced Cache Detection**: Added native detection for DeepSeek `prompt_cache_hit_tokens` and OpenCode cache formats alongside Claude, Gemini, and OpenAI.
- **Accurate Dashboard Display**: `UsageStats` and `usageRepo` store and render exact per-component costs instead of blended average token shares.

---

### 🛡️ Security Hardening & Bug Fixes
- **Restricted Process Routes**: Added `/api/pxpipe/*` (install, start, stop, restart) to `LOCAL_ONLY_PATHS` to prevent remote execution via tunnels/reverse proxies.
- **DNS Hosts Injection Prevention**: Replaced shell string interpolation in `dnsConfig.js` with atomic temporary file copy.
- **SSRF Cloud Metadata Protection**: Added `assertNotCloudMetadata` blocking link-local/IMDS addresses (`169.254.169.254`).
- **Dedicated Change Password Endpoint**: Added `POST /api/auth/change-password` with session and password length validation.
- **Community Upstream Cherry-Picks**:
  - `6a81cdef`: Terminate OpenAI SSE streams with `data: [DONE]` sentinel (#4356, #4375).
  - `d93edb6d`: Carry streamed output items and usage in `response.completed` (#4307, #3432).
  - `56d629ca` & `7677df61`: Return Claude thinking text to OpenAI clients via `thinking.display: "summarized"`.
  - `80787ce8`: O(1) provider insert and typed 409 on name collision (#4311, #4350).
  - `844223d5` & `d374d7a1`: Global catalog source clearing and v2 provider-scoped modalities (#4344, #4351).
  - `1781ec05`: Replay raw byte chunks to preserve all CommandCode NDJSON lines (#4326).
  - `1814dce9`: Guard terminal model turns in Gemini normalization.
  - `a71f1f3f`: Suffix-stripping fallback for Claude tool decloaking (#4342).
  - `bc779c6e`: Zed OAuth modal fix with local IDE keyring auto-import (#4359).
  - `c4a11168`: Refresh Codex settings and preserve existing auth token (#4347).
  - `dfe5ba22`: Free tier pricing for `cline-free/*` (#4334).
  - `069e67d2`: Preserve user turns with unknown block types (#4383).
  - `0021ba4b`: Strip non-standard schema keywords from Gemini tools (#4391).
  - `d41a8a3d`: Correct reset/expiry labels for `codebuddy-intl` bonus packs (#4362).
  - `5f4ee809`: Clamp DeepSeek `reasoning_effort` for OpenCode Go backends (#4368).

---

## 🧪 Verification & Test Suite
- **27 test suites / 355 unit & translator tests passing, 0 failed** (`tests/vitest.config.js`).
- Complete CI pass on Linux and full cross-platform compatibility across Windows and Unix.
