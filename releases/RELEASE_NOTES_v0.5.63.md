# 🌿 ZenRouter v0.5.63 — Hardened Security, Unified Translator Parity, Antigravity Strike-Fallback & Resilience Pool

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter **v0.5.63** pools critical upstream fixes and major stability enhancements: hardened SSRF & redirect protection, robust Antigravity strike-based quota fallback, Claude foreign tool ID dropping, Gemini 3.8 Flash catalog addition, Gemini thought signatures preservation, and automated Groq usage tracking.

---

## 🚀 Key Improvements in v0.5.63

### 1. 🛡️ Advanced Security & Hardened SSRF Guard
- **Strict SSRF & Redirect Re-validation**: Validates redirected URLs against SSRF policies (blocking loopback, link-local, private subnets, and AWS/GCP metadata endpoints).
- **Guarded Endpoints**: Added `/responses` to protected route prefixes to prevent authentication bypass.
- **Log Credential Redaction**: Automatically redacts API keys, bearer tokens, and sensitive headers across request logs, trusting validated server correlation IDs.
- **Dual-Auth & Settings Whitelist**: Hardened JWT rotation, dual-auth import/export validation, and restrictive settings whitelist.

### 2. ⚡ Antigravity Quota Resilience & Model Remapping
- **Strike-Based Quota Fallback**: Intelligent detection and fallback for lying quota APIs and keepalive connection timeouts.
- **Malformed Request Prevention**: Cleans empty message parts and automatically merges adjacent turns to prevent `400 INVALID_ARGUMENT` on Antigravity.
- **New Frontier Models**: Integrated Gemini 3.8 Flash and remapped all model aliases for IDE 2.11.0 compatibility.

### 3. 🔄 Format Translation & Engine Parity
- **Claude Foreign Tool ID Filtering**: Automatically drops foreign `server_tool_use` IDs that poison conversation history in Claude workloads.
- **Claude Model Echoing**: Accurately echoes requested models in Claude-format streaming responses.
- **1M Context Marker Sanitization**: Strips Claude Code `[1m]` context length markers prior to upstream routing.
- **Gemini Reasoning & Thought Signatures**: Preserves Gemini thought signatures and routes `reasoning_effort` for OpenAI-compatible Gemini providers.
- **Responses API Caching**: Preserves `prompt_cache_key` and parses rate-limit resets gracefully.

### 4. 📊 Enhanced Analytics & Provider Discovery
- **Groq Quota & Usage Tracking**: Native quota cadence tracking and usage bucketing for Groq provider accounts.
- **Generic Live Catalog**: Automated live catalog discovery and fallback handling for custom-compatible providers.

---

## 📦 Artifacts & Release Packages
- **CLI Package**: `@joyccn/zenrouter@0.5.63`
- **Docker Image**: `joyccn/zenrouter:latest` & `ghcr.io/zenrouter/zenrouter:latest`
