# 🌿 ZenRouter v0.9.5 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.9.5` is a major milestone release delivering a comprehensive audit across core translation pipelines, real-time distributed compute mesh architecture, upstream 9Router cherry-picks, root-cause resolution for thinking block omission, universal 1M context window alignment with `models.dev`, and dynamic reasoning budget auto-adjustment.

---

## 🚀 Key Highlights & Architectural Additions

### 1. Real-Time Distributed Compute Mesh (`scripts/worker-mesh.mjs`)
- Established an encrypted, zero-friction, bidirectional development compute mesh across 3 nodes:
  - **Local Host**: Workstation development environment.
  - **Worker Node 1 (`159.223.88.62`)**: Ubuntu 26.04 x64 (8 vCPU / 8 GB RAM) dedicated test execution engine running full Vitest suites (3,500+ tests across 431 test files).
  - **Worker Node 2 (`157.230.34.190`)**: Ubuntu 26.04 x64 (8 vCPU / 8 GB RAM) compilation and static analysis engine running Next.js standalone webpack builds and ESLint checks.
  - **Live Production VPS (`187.127.214.246`)**: Strict read-only audit and live telemetry inspection.
- **Two-Way-Safe Synchronization**: Continuous file synchronization via Mutagen with strict exclusion of secrets, `.env*`, and databases (`*.sqlite`, `*.db`).
- **Resumable Real-Time Job Streaming**: Isolated execution directories under `/root/zenrouter-worker-mesh/jobs/` with live streaming of stdout/stderr, exit codes, and artifact preservation.

---

### 2. Root-Cause Fix: Thinking Block Omission Bug
- **Problem**: User streams previously encountered `"[thinking block omitted: not supported on this route]"`, caused by format pivot omissions, non-preserved reasoning tokens during stream-to-JSON conversion, and fallback overrides.
- **Solution**:
  - Maintained structured readable thinking across Claude, Gemini, and OpenAI Chat histories.
  - Preserved `reasoning_tokens` through all format transitions, Responses stream-to-JSON conversion, and token accounting (`open-sse/transformer/streamToJsonConverter.js`, `open-sse/translator/response/openai-responses.js`, `open-sse/translator/response/openai-to-claude.js`, `open-sse/utils/usageTracking.js`).
  - Allowed client-requested model identifiers to echo in Claude `message_start` events, resolving strict CLI tool validation rejections (Cline, Roo Code) when using model combos or aliases.

---

### 3. Universal 1M Context Windows Aligned with `models.dev`
- Conducted exhaustive batch research against `models.dev/api.json` covering 225 providers.
- **Deprecated `[1m]` Suffix Requirement**: Modern flagship models natively support 1,000,000+ context tokens without requiring bracketed context annotations. The `[1m]` suffix is retained purely as a backward-compatible fallback.
- **Flagship Claude Models**:
  - `claude-sonnet-5.5`, `claude-sonnet-5`, `claude-opus-5.5`, `claude-opus-5`, `claude-fable-5.1`, `claude-fable-5`, `claude-opus-4.8`, `claude-opus-4.7`, `claude-opus-4.6`, `claude-sonnet-4.7`, `claude-sonnet-4.6`, `claude-sonnet-4.5`, and `claude-sonnet-4` natively map to **1,000,000 (1M)** context window.
  - Claude 4.6+ models use `claude-adaptive` thinking, while Claude 4.5/4/3.7 use `claude-budget`.
  - Older Opus (`claude-opus-4-5-20251101`) is correctly preserved at the standard 200,000 context ceiling.
- **OpenAI & Codex Family**:
  - `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-*`, `gpt-5.5`, `gpt-5.4` map to official **1,050,000 (1.05M)** context window and 128,000 max output tokens across both OpenAI direct and Codex OAuth backends.
- **DeepSeek & Qwen**:
  - `*deepseek-v4*` and `*deepseek-flash*` models map to **1,000,000 (1M)** context window and 384,000 max output tokens.
  - `*qwen3*`, `*qwen*max*`, `*qwen*plus*` models map to **1,000,000 (1M)** context window.

---

### 4. Dynamic Reasoning Budget Auto-Adjustment & Output Floor
- Added `REASONING_MIN_OUTPUT_FLOOR = 65536` in `open-sse/config/runtimeConfig.js` and wired through `open-sse/translator/formats/maxTokens.js` and `thinkingUnified.js`.
- **Automatic Budget Bump**: When reasoning effort (`medium`, `high`, `max`, `ultra`) or adaptive thinking is active and a client supplies a restrictive `max_tokens` cap (e.g. 1000 or 2000), ZenRouter dynamically raises the ceiling to **65,536** tokens (bounded by model ceiling). This prevents models from consuming all tokens on thinking and aborting before generating the final text response.
- **Zero-Regression Contract**: Non-reasoning requests retain the standard **64,000** default ceiling, preserving byte-for-byte snapshot compatibility.

---

### 5. Upstream 9Router Selective Cherry-Picks (Sept 27 - Oct 2, 2026)
- **PR #4513**: Model name echo in Claude `message_start` events for routed streams, ensuring client CLI tools receive the requested model name.
- **PR #4536**: Canonical `reasoning_tokens` extraction from `reasoning_tokens`, `completion_tokens_details.reasoning_tokens`, and `output_tokens_details.reasoning_tokens`.
- **PR #4537**: Experimental audio-stream translation and speech-to-text endpoints.
- **PR #4486**: Proper surface of blocked and truncated Gemini responses with explicit error reasons (`safety_filter_blocked`, `output_budget_exhausted`).
- **PR #4515**: Antigravity tool result role correction and trailing user turn guarantee, preventing Google Cloud Code 400 errors.
- **PR #4517**: Automatic base64 URI prefetching for remote image URLs dispatched to Anthropic Claude `/v1/messages`.

---

### 6. Security Hardening & Build Modernization
- **Strict TLS Verification**: Mandatory upstream certificate and hostname verification in MITM ALPN, HTTP/2, and HTTPS forwarding; rejects untrusted connections with HTTP 502.
- **ESLint 9 & React 19 Compatibility**: Integrated `eslint-plugin-react-hooks` with flat config, deferred synchronous effect state calls in `BaseUrlSelect.js`, and eliminated cascading render warnings.

---

## 🧪 Comprehensive Verification & Test Proof

| Verification Gate | Target Node | Result | Notes |
| :--- | :--- | :---: | :--- |
| **Full Vitest Suite** | Worker Node 1 (`159.223.88.62`) | **PASSED (100% all-green)** | **3,461 passed**, 8 expected fail, 100 skipped, **0 failed** across **413 test files**. |
| **Next.js Standalone Build** | Worker Node 2 (`157.230.34.190`) | **PASSED (exit 0)** | Compiled in 31.6s, TypeScript checks passed, production bundles ready. |
| **ESLint 9 Audit** | Worker Node 2 (`157.230.34.190`) | **PASSED (exit 0)** | 0 errors across entire workspace. |
| **Baseline Snapshots** | Local Workstation | **PASSED (exact match)** | `PROVIDERS` (81 providers), alias resolution (117 tokens), and OAuth URLs byte-for-byte equal. |
