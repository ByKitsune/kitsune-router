# 🌿 ZenRouter v0.9.0 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.9.0` is a major milestone release delivering a comprehensive audit and precision alignment across **Claude Code, OpenAI Codex, Google Antigravity & Gemini CLI, xAI Grok, and all pooled OAuth / API-key providers**. It incorporates verified first-party specifications, adds the latest 2026 flagship models (**Claude Sonnet 5.5, GPT-6.1 Sol, Grok 4.7/4.3**), introduces native **long-context / tiered pricing calculation**, fixes critical protocol and role asymmetries on Google Antigravity, and establishes the passive foundation for **Gemini 4 Argon** (1M output tokens).

---

## 🚀 Key Highlights & New Models

### 1. New 2026 Flagship Model Support & Precision Pricing
- **Claude Sonnet 5.5** (Anthropic, released 2026-09-28):
  - Mapped with native **1,000,000 context window**, **128,000 max output tokens**, adaptive thinking, and `thinkingCanDisable: false` (Anthropic returns 400 on `type: "disabled"` for Sonnet 5.5; lowest allowed setting is `between_tools`).
  - Official pricing: **$2.00 input / $10.00 output / $0.20 cache read / $2.50 cache write** per 1M tokens.
  - Added to both `claude` (OAuth) and `anthropic` (API key) registries.
- **OpenAI GPT-6.1 Sol** (OpenAI, released 2026-09-29):
  - 1,050,000 context window, 128,000 max output, native image + document (PDF) input, and reasoning.
  - Official pricing: **$2.00 input / $10.00 output / $0.10 cache read / $2.50 cache write** per 1M tokens.
- **xAI Grok 4.7 & 4.3**:
  - `grok-4.7`: 500,000 context, 500,000 max output, vision + PDF, priced at **$2.00 in / $6.00 out / $0.50 cached**. Added to `grok-cli` registry and `supportsGrokCliReasoningEffort`.
  - `grok-4.3`: 1,000,000 context, 30,000 output, vision + PDF, priced at **$1.25 in / $2.50 out / $0.20 cached**.
- **Gemini 4 Argon Passive Foundation** (Google DeepMind, announced 2026-09-30):
  - Mapped pattern `*gemini-4*` with 1,048,576 context window, industry-first **1,000,000 max output tokens**, and full multimodality (vision, PDF, audio, video, reasoning, search).
  - Introductory pricing: **$2.00 in / $10.00 out / $0.10 cache read (95% discount)** per 1M tokens.
  - Model is omitted from default UI pickers until public API rollout begins, preventing premature 404s while guaranteeing immediate lossless routing for Fairwind / early testers.

---

## 🛠️ Protocol Alignment & Architectural Fixes

### 2. Google Antigravity Native Protocol Realignment
- **FunctionResponse Role Asymmetry**: Packet trace audits across 25,800+ tool turns confirmed that Gemini models require `role: "model"` for `functionResponse` tool turns, while Claude models proxied via Google's bridge require `role: "user"`. ZenRouter now branches on the model family instead of forcing `role = "user"` unconditionally, restoring tool calling on native Gemini.
- **Bypass Sentinel Preservation**: Preserved Google's documented sentinel `"skip_thought_signature_validator"` verbatim without overwriting it with fallback signatures.
- **Claude on Antigravity Bridge Limits**: Enforced Google's bridge limits for Claude models (**250,000 context tokens, 64,000 max output, `application/pdf: false`**), preventing over-budget errors.
- **Max Output Token Ceiling**: Raised `MAX_ANTIGRAVITY_OUTPUT_TOKENS` from `64000` to official **`65536`** for native Gemini Flash.
- **Tool Slicing**: Sliced tool declarations into individual `{ functionDeclarations: [decl] }` objects matching the Google TPU prefix-cache format.
- **Production Fallback Endpoints**: Added `https://cloudcode-pa.googleapis.com` and `https://daily-cloudcode-pa.sandbox.googleapis.com` to `transport.baseUrls`.

### 3. Native Long-Context / Tiered Pricing Engine
- Added `resolveEffectivePricing(pricing, inputTokens)` to `open-sse/providers/pricing.js`, automatically applying higher official rates for agent requests exceeding 200k or 272k prompt tokens:
  - **OpenAI (>272k tokens)**: GPT-6 Astra ($20/$75), GPT-6 Sol ($4/$15), GPT-5.6 Sol ($8/$30), GPT-5.4 ($5/$22.50).
  - **Gemini (>200k tokens)**: Gemini 3.1 Pro Preview ($4/$18).
  - **xAI Grok (≥200k tokens)**: Grok 4.7 ($4/$12), Grok 4.5 ($4/$12), Grok 4.3 ($2.50/$5).
- Eliminates ~50% under-billing in usage history logs for deep agentic workflows.

### 4. Client Fingerprint Synchronization & Cleanups
- **Windsurf Correction**: Fixed fabricated version **3.14.0** to official latest stable **3.10.48** (2026-09-29).
- **Client Bumps**:
  - Claude Code: 2.1.280 → **2.1.286** (Stainless SDK 0.80.0 → **0.127.0**; removed hallucinated `token-efficient-tools-2026-03-28` flag; aligned billing header `cch=00000; cc_entrypoint=cli;`).
  - OpenAI Codex CLI: 0.156.1 → **0.159.3** (emits `session-id`, `version`, `originator: "codex_cli_rs"`; full reasoning levels `[none, minimal, low, medium, high, xhigh, max, ultra]`; added `gpt-image-2`).
  - Gemini CLI: 0.60.0 → **0.62.0**.
  - VS Code & Copilot Chat: 1.137.0 / 0.65.0 → **1.140.0 / 0.68.0** (preserves live catalog limits and vision).
  - Kiro IDE & CLI: 1.1.0 / 2.21.0 → **1.2.4 / 2.26.0** (Workflows release; centralized `kiro-cli` UA).
  - CodeBuddy CLI: 2.151.0 → **2.161.0**.
  - Grok Build: 1.0.34 → **1.0.44**.
  - Kimchi: 1.1.23 → **1.3.0**.
  - Zed: 1.18.1 → **1.22.0**.
  - Cursor: 3.17.8 → **3.22.12**, OpenCode: 1.18.31 → **1.18.34**.

### 5. Multi-Provider Capabilities & Normalization
- **Spelling Invariance (233 models)**: Normalizes version separators (hyphen between digits → dot) and presentation suffixes (`-thinking`, `-agentic`), preventing multimodal models (`glm-5.3-flash`, `qwen3.8-*`) from having images stripped when requested with dash spellings.
- **Document (PDF) Input**: Enabled `pdf: true` across all Gemini 2.5/3.x models and all OpenAI/Grok vision models.
- **Asia & EU Alignment**:
  - DeepSeek: Aligned Flash pricing ($0.15/$0.60/$0.003) and enabled case-insensitive exact matching.
  - GLM: Upgraded `glm-5.2` context to 1,000,000; forced thinking on `glm-5.3`.
  - Qwen: Aligned Singapore USD schedule (`qwen3.7-max` $2.50/$7.50, `qwen3.7-plus` $0.40/$1.60); added `qwen3.8-omni-flash`.
  - MiniMax: `MiniMax-M3` context 1,000,000, output 524,288, video input.
  - Xiaomi MiMo: Added `mimo-v2.6-flash` and `mimo-v2.6-pro` (1M context, reasoning: true).
  - Mistral: Upgraded `mistral-medium-latest` and `small` to 256k context and hybrid reasoning.

### 6. High-Value Upstream 9Router Cherry-Picks
- **Codex Auto-Ping Refresh**: Reduced `refreshLeadMs` from 5 days to 10 minutes and re-read latest DB tokens before refreshing, stopping session revocation caused by stale token reuse.
- **Responses Deferred Usage Trailer & Watchdog**: Translation waits for the real usage trailer before emitting `response.completed`, bounded by a 3s watchdog against stalled upstreams. Fixed upstream bug where `state.targetFormat` was undefined.
- **Claude Tool Caching & Prefill**: Caches a tool loop's final tool results with the 4th breakpoint and hoists tool screenshots out of `tool_result` for non-Anthropic endpoints. Preserves intentional client assistant prefill.
- **xhigh Thinking**: Enabled `xhigh` effort level for Claude-adaptive models and passed it through to Kiro.
- **DeepSeek Tool Deduplication**: Deduplicated same-name tools from multiple toolkits.

---

## 🧪 Verification & Test Suite

- **104 unit & integration tests passing across 18 specialized suites.**
- **Baseline snapshots verified:** `PROVIDERS` (81 providers) and OAuth URLs byte-for-byte equal.
- **CI Build:** 100% green on GitHub Actions.
