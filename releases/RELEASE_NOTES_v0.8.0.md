# ZenRouter v0.8.0 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.8.0` is a full-ecosystem refresh: every supported provider's models, pricing, and capabilities were re-verified against official sources at the **23 September 2026** snapshot, plus a second round of upstream 9Router cross-check fixes (models, security, streaming) and a new session-sticky routing strategy.

---

## Highlights

### 🗂️ Full Ecosystem Refresh (23 Sep 2026 snapshot)
- **New routable models**: GPT-6 Astra/Sol/Luna, GPT-5.6 trio, GPT-5.5/5.4-pro, o1-pro, gpt-transcribe, gpt-image-2; Gemini 3.5-flash/3.1-flash-lite + stable Nano-Banana image IDs; Grok 4.7/4.3/Build; Mistral Small 4; MiniMax M2 + highspeeds; GLM flashx/turbo/4.5 variants; Qwen 3.8/3.7/3.6/3.5 + coder-flash; MiMo v2.5-asr; ERNIE 5.1/5.0/4.5-turbo/X1; Hy3 preview; host seeds (gpt-oss-20b, Qwen3.8, V4-dated, Kimi-K3, GLM-5.3, MiniMax-M3, Chutes TEE); Cohere Command family; Sonar reasoning-pro/deep-research; Voyage-4 embeddings; Jina v4; Eleven v3/Flash; Cartesia 3.5/3.6; FLUX.2 + Recraft V4 families; Runway gen4.5/aleph; current Copilot and Ollama Cloud pins.
- **Repricing to official schedules**: OpenAI (GPT-5+ 10% cache reads, 5.6 promo, o-series, 4.1 family), Gemini (2.5-pro/lite cuts), DeepSeek off-peak, per-model Grok, Mistral slugs, Kimi k2.6 hit rate, MiniMax M2 tier, full Z.ai GLM table, Qwen base tiers, MiMo PAYG, Qianfan ERNIE, Sonar, Cohere, Voyage.
- **Retired IDs removed** (DALL-E, retired Codex slugs, Gemini previews, DeepSeek chat/reasoner, Grok 3/fast/code, Kimi k2.5, MiMo V2, retired host/Copilot pins) and deprecated surfaces labelled (PlayHT, Google PSE, Perplexity chat-completions transport).
- **Transports**: Nebius → `api.tokenfactory.nebius.com`; HuggingFace images → Inference Providers router.

### 🧭 Session-Sticky Routing + Live Zed Catalog
- **Session-sticky account strategy**: stable-hash each conversation onto one account to preserve upstream prompt caches; degrades to fill-first without a session key; dashboard toggle included.
- **Live Zed catalog**: provider models endpoint resolves Zed's hosted catalog so combos can select current models.

### 🛡️ Security & Compatibility Fixes
- **Rightmost XFF hop** behind loopback proxies (unspoofable rate-limit keys).
- **OAuth org-denial 403 is terminal** (15m, no refresh storm); model-scoped permanent 4xx falls through with zero cooldown; disabled models gated at routing (403); far-future manual locks survive activation; `killAllAppProcesses` re-verifies via /proc.
- **Translator**: `custom_tool_call` round-trip for declared custom tools; Claude mid-stream `error` events surfaced; truncated-into-nothing completions fail over instead of blank 200s; single retry on sporadic 5xx.

## Verification
- Full suite: **339 files / 2687 tests passing, 0 failed** (config: `tests/vitest.config.js`).
- Baselines byte-equal: `verify-providers.mjs`, `verify-oauth-urls.mjs`, `verify-alias.mjs`; golden snapshots updated for the Nebius endpoint.
- ESLint clean on all touched files.
