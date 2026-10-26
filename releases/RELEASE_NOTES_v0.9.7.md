# ZenRouter 0.9.7 release notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

**2026-10-06** · Previous release: **0.9.6** · Requires **Node.js >=22.19.0**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.7) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/CHANGELOG.md) · [Technical changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/docs/CHANGELOG_v0.9.7.md)

0.9.7 collects the complete merged Unreleased batch: dependency/runtime maintenance, provider-scoped catalog reconciliation, reasoning budget/accounting repairs and grounded-search fixes. The release bump adds no separate product feature. [0.9.6 release notes](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/releases/RELEASE_NOTES_v0.9.6.md) remain historical and unchanged.

## Highlights

- **Catalog evidence, not entitlement:** 120 added provider/model entries (100 chat, 8 image, 6 embedding, 6 TTS), 342 sourced metadata records and 827 preserved historical entries still not individually verified. Keep API, IDE/OAuth and coding-plan limits/prices distinct; undocumented values remain unknown.
- **Consistent discovery and transport:** repair provider/pricing aliases, native namespaces and paid/free IDs, no-auth listing, cross-kind IDs, live/operator capabilities and separate input/context/output limits. Use the matching per-model target transport without overriding compatible native formats.
- **Respect caller reasoning caps:** preserve explicit/nullable caps and native provider thinking across translation and final serialization. No universal silent paid-cap increase; effective Claude interleaving support is checked, including rejected-beta retries.
- **Account actual usage once:** retain reasoning-inclusive usage and exhausted attempts, Responses incomplete terminals, partial output and refusals. Avoid terminal-then-cancel double persistence and false empty-combo replays. No automatic larger-budget charge retry is introduced.
- **Grounded-search correctness:** bare providers and `provider/search` use search defaults; explicit/combo ownership and validation survive. Antigravity uses the dedicated sandbox envelope with real project/request/session IDs, model/thinking mapping, Google Search and per-account strict proxy. Hide thought parts from answers/citation context, not from accounting.
- **Bound search-specific errors:** the specific Gemini model 404 returns after one attempt; the exact ambiguous Antigravity resource 404 tries at most three eligible accounts without healthy-credential cooldowns. Successful search clears only its scope; other auth/quota handling remains.
- **Stable tooling refresh:** React 19.3.0, ESLint 10.12.0, Vitest 5.0.3/Vite 8.3.2 and Undici 8.11.2, with Node 22 dispatcher compatibility, CONNECT, DNS pinning, cancellation and fail-closed strict proxy preserved. Remove unused dependencies/stale overrides and retain optional SQLite fallback.
- **Installer and UI repairs:** validate Node's exact minimum and the freshly linked CLI rather than a stale PATH binary. Bundle Monaco 0.57.0 plus same-origin workers; repair docs markdown/language switching and nine React lint warnings while retaining drafts and hydration safety. Narrow ESM scopes leave CommonJS launchers unchanged.

## Publication safeguards

Manual publication is bound to the actual stable tag and commit, including truthful npm provenance. Integrity-checked original tarballs can be reused after a partial release; serialized publication and numeric version checks keep historical repairs from rolling back `latest`.

## Upgrade

After publication:

```bash
# Node.js >=22.19.0
npm install -g @joyccn/zenrouter@0.9.7
zenrouter --version
# Or: npx @joyccn/zenrouter@0.9.7
```

The npm package remains **@joyccn/zenrouter** and the binary remains **zenrouter**. App, CLI, independent tests and docs package versions align to 0.9.7. Back up your persistent data before upgrading.

Container examples pin **joyccn/zenrouter:0.9.7** or **ghcr.io/zenrouter/zenrouter:0.9.7**. The publication workflow builds **linux/amd64 only**; do not assume native ARM64/multi-architecture support. Persist **/app/data**, not `/root/.zenrouter`; see the [Docker guide](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/DOCKER_README.md). Preparing these notes does not publish a package, GitHub release or image, nor certify tag availability.

## Verification and caveats

Final 0.9.7 local verification passes **494 Vitest files: 4,091 passed, 100 skipped, 1 todo, zero failed tests or suites** on Node 22.23.2, with zero-error/zero-warning ESLint. Release guards validate all package/lock versions, literal stable tags, publication inputs and all five localized changelogs. CLI packaging and an isolated network-disabled Docker runtime also pass.

Prior acceptance covered app/CLI builds, docs export, packaging, native SQLite, h2c, transport and browser checks. Real loopback relay/CONNECT and production standalone tests read isolated SQLite state for search locks and exact reasoning usage, including reasoning-only exhaustion and terminal-then-cancel. Installer harnesses are mock-only. No production accounts, live upstream inference, automatic spending retries or deployment were used.

**Known limits:** public catalog metadata and fixture responses do not prove account entitlement, model availability or upstream invoice parity. Codex OAuth, OpenCode Muse and Cursor retain unsupported output-cap behavior; a token cap is not a total spending limit across tool loops/fallback. Native provider thinking rules differ. Non-token prices stay labelled metadata, unknown tariffs are not free, and time-of-day tariff automation remains limited.

**Security:** TLS verification stays enabled; self-signed fixture opt-outs are per-request, not global. Upstream **node-forge** and **braces** advisories remain. The dependency refresh is **not a vulnerability-free claim** and does not conceal advisories or force downgrades.

## References

- [Client/model evidence and deferred coverage](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/docs/CLIENT-MODEL-RECONCILIATION.md) · [Machine-readable coverage](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/docs/model-catalog-coverage.json)
- [Reasoning budgets and actual usage](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/docs/REASONING-BUDGETS.md)
- [Grounded-search selectors and health policy](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/docs/WEB-SEARCH.md)
- Localized changelogs: [English](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/gitbook/content/en/changelog.md), [Tiếng Việt](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/gitbook/content/vi/changelog.md), [简体中文](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/gitbook/content/zh-CN/changelog.md), [Español](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/gitbook/content/es/changelog.md), [日本語](https://github.com/ZenRouter/ZenRouter/blob/v0.9.7/gitbook/content/ja/changelog.md).
