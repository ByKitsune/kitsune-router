# 🌿 ZenRouter v0.5.62 — Enhanced Cache Anchoring, Session Continuity & PAT/Bulk Import Sync

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter **v0.5.62** delivers universal prompt cache breakpoint anchoring across all Anthropic-compatible workloads, expanded session continuity headers for modern AI agents (OpenCode 2, NaraCLI, Cline, Roo), and robust provider dashboard synchronization when adding PAT (Personal Access Tokens) and API keys.

---

## 🚀 Key Improvements in v0.5.62

### 1. 🧠 Universal Claude Cache Anchoring & High Hit-Rate
- **Universal Re-Anchoring**: `anchorClaudeCache` is now systematically applied to all outgoing workloads targeting Claude / Anthropic-compatible format (`finalFormat === FORMATS.CLAUDE`) after token savers (RTK, Caveman, Ponytail, PXPIPE) execute.
- **Cache Drift Elimination**: Guarantees byte-stable prefixes across conversation turns, maximizing upstream prompt cache hits (up to ~96%).

### 2. 🔄 Expanded Session Continuity & Agent Client Detection
- **Session Header Parity**: Added detection for `x-opencode-session`, `x-nara-session-id`, `x-naracli-session-id`, `x-cline-session-id`, and `x-roo-session-id`.
- **Client Detector**: Identifies OpenCode and Nara CLI ecosystems to maintain persistent upstream session affinity and KV prompt cache stickiness.

### 3. 🛠️ Provider UI & Auto-Sync on PAT / API Key Addition
- **Provider-Specific Bulk Validation**: Bulk import now validates credentials with their respective `providerSpecificData` (Cloudflare AI, Azure, Qoder, etc.).
- **Automatic Model Sync**: Adding PATs or API keys (in single or bulk mode) triggers instant custom model re-fetching and automatic Qoder model catalog discovery without requiring a manual page refresh.

### 4. 📊 Resilient Token Usage Extraction
- **Flexible Cached Token Reporting**: Added fallbacks for `prompt_cache_hit_tokens` and top-level `cached_tokens` in request detail logs to ensure comprehensive analytics across diverse LLM backends.

---

## 📦 Artifacts & Release Packages
- **CLI Package**: `@joyccn/zenrouter@0.5.62`
- **Docker Image**: `joyccn/zenrouter:latest` & `ghcr.io/zenrouter/zenrouter:latest`
