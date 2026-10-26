# 🌿 ZenRouter v0.6.0 — Full Dependabot Remediation, Web Fetch Providers, Theme Pre-Hydration & Complete Localization

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter **v0.6.0** is a major milestone release delivering zero-vulnerability security hardening, native Ollama Cloud web fetch capability, instant pre-hydration theme loading, CLI custom key preset management, and a complete, brand-sanitized Indonesian localization.

---

## 🚀 Key Improvements in v0.6.0

### 1. 🛡️ Complete Security Hardening (51 Dependabot Alerts Resolved)
- **Zero Vulnerabilities**: Cleaned all 51 open Dependabot alerts across the repository, achieving `0 vulnerabilities` on both root and `gitbook` audits.
- **Next.js Core Upgrade**: Updated `gitbook/package.json` to Next.js `^16.3.2`, eliminating 31 advisories (including all 13 High-severity CVEs related to SSRF, DoS, and cache poisoning).
- **Dependency Overrides**: Pinned `dompurify` to `^3.4.14` and `qs` to `^6.16.0` via npm overrides in root `package.json`, completely resolving 18 DOMPurify XSS/bypass vulnerabilities and 2 `qs` array-limit/DoS vulnerabilities.

### 2. ⚡ Claude & Routing Integrity
- **Foreign `server_tool_use` Sanitization**: Strips foreign tool call IDs (e.g. `call_` from OpenAI/GLM) in Anthropic Claude Message requests, preventing multi-provider session poisoning and HTTP 400 rejection.
- **1M Context Marker Stripping**: Automatically strips Claude Code `[1m]` beta markers before model resolution in routing.
- **Claude Code 2.1.258 & Fable 5.1**: Updated client compatibility to 2.1.258 with native support for `claude-fable-5-1` and adaptive thinking configurations.
- **OpenAI-Wire Thinking**: Ensured models with native thinking capabilities (Gemini, Claude) always resolve to `openai` wire format (`reasoning_effort`) when routed to OpenAI-compatible endpoints.

### 3. 🌐 Web Fetch Providers & Model Catalog
- **Ollama Cloud Web Fetch**: Added Ollama Cloud as a full `webFetch` provider supporting markdown extraction, page titles, and discovered link harvesting.
- **Capability-Scoped Locks**: Isolated web fetch rate-limit locks (`webfetch:<providerId>`), ensuring web fetch errors never take account credentials offline for LLM chat requests.
- **Model Catalog Hygiene**: Automatically filters unavailable `deepseek-v4-flash-free` from OpenCode suggested free models and declared zero-cost pricing for `z-ai/glm-5.3-free`.
- **Missing Provider Assets**: Added missing 128x128 provider icons for Aliyun, Fish Audio, and Self-hosted media services.

### 4. 🎨 Dashboard UI/UX & Localization
- **Zero White-Flash Theme Loading**: Added an inline pre-hydration blocking script in `<head>` to immediately apply `.dark` before first paint, eliminating reload flicker.
- **Provider Connection Scroll Container**: Wrapped provider connections list in a `max-h-[500px] overflow-y-auto` container to maintain a clean layout with dozens of accounts.
- **CLI Custom API Key Presets**: Enabled saving, naming, and deleting custom API key presets directly from tool cards.
- **Complete Indonesian Localization**: Fully localized 1,450 literals in `public/i18n/literals/id.json` with strict adherence to ZenRouter branding.

---

## 📦 Artifacts & Release Packages
- **CLI Package**: `@joyccn/zenrouter@0.6.0`
- **Docker Image**: `joyccn/zenrouter:latest` & `ghcr.io/zenrouter/zenrouter:latest`
- **GitHub Release**: `v0.6.0`
