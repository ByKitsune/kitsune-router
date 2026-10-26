# ZenRouter v0.6.1 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.6.1` is a stability, security, and frontier capability release.

## Highlights

### 🛡️ Security & Content Security Policy Hotfix
- **Monaco Editor Support on `/dashboard/translator`**: Whitelisted `https://cdn.jsdelivr.net` across script, style, font, and connect directives in `next.config.mjs`, ensuring the internal prompt & translator Monaco editor loads seamlessly without triggering CSP violations or unhandled runtime exceptions.

### 🎨 Defensive UI & Model Search Resilience
- **Safe Filtering in `ModelSelectModal.js`**: Hardened lowercase query search and alphabetical sorting against missing or null model/combo names, eliminating `TypeError: can't access property "toLowerCase", t.name is undefined` and `localeCompare` crashes on the dashboard.

### 🤖 Official GPT-6 Astra Mapping & Routing
- **Frontier AI Integration**: Formalized `*gpt-6-astra*` and `*gpt-6*` capability pattern supporting 1,050,000 token context window, 128,000 output tokens, full vision, native reasoning, and OpenAI thinking format.
- **Pricing & Aliases**: Exact pricing definitions configured at 10/50 token rates with automatic mapping across OpenAI and upstream high-throughput lines (`luo/*`).

### 🔒 Core Stability & Database Integrity Guards
- **Fail-Closed on DB Corruption**: Pre-migration integrity gate (`PRAGMA quick_check`) protects SQLite databases before executing schema mutations.
- **Critical Engine Backports**: Tool call null guards, SSRF guards for Cowork MCP tools, and Claude adaptive effort mappings.
- **Automated Test Validation**: 2,352 unit & integration tests passing 100% green.
