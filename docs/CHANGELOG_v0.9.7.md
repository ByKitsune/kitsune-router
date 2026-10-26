# ZenRouter 0.9.7 technical changelog

> **Kitsune Router archive:** this dated ZenRouter record keeps its original names, artifacts and evidence; it is not current installation or verification guidance. See [current docs](INSTALLATION.md) and [migration](MIGRATION.md).

Release date: **2026-10-06** · Previous release: **0.9.6**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.7) · [Complete changelog](../CHANGELOG.md) · [Release notes](../releases/RELEASE_NOTES_v0.9.7.md)

This release collects the complete previously merged Unreleased batch. The version bump does not introduce additional routing features. Historical [0.9.6 documentation](CHANGELOG_v0.9.6.md) remains unchanged.

## Runtime, installation and dependencies

- App, published CLI, independent tests and docs packages align to 0.9.7. The published identity remains `@joyccn/zenrouter`, with binary `zenrouter`.
- All four packages require **Node.js >=22.19.0**. Install with `npm install -g @joyccn/zenrouter@0.9.7` or run `npx @joyccn/zenrouter@0.9.7` after publication. Documentation preparation is not publication.
- The researched stable dependency refresh includes React/React DOM/React Is **19.3.0**, ESLint **10.12.0**, Vitest **5.0.3**, Vite **8.3.2**, Undici **8.11.2**, SQL.js **1.14.2** and Monaco **0.57.0**. Manifests and lockfiles are refreshed across the four packages; unused proxy dependencies and stale overrides are removed.
- Undici 8 dispatchers are adapted for Node 22 native fetch at proxy, pinned web-fetch and remote-image boundaries. CONNECT tunneling, DNS pinning, SSE cancellation and strict-proxy fail-closed behavior remain intact; plain-HTTP CONNECT-only relay checks do not silently become forward-proxy requests.
- The installer checks the exact runtime minimum before package/build operations and retains the validated Node/npm or Bun through provisioning, sudo, user-prefix/source fallback and verification. It verifies the freshly linked CLI, not a stale global binary found earlier on PATH.
- Native SQLite remains optional, with the existing driver fallback order. Node 22's genuine `node:sqlite` experimental warning is not suppressed.
- Narrow ESM boundaries remove ambiguous-module warnings without changing the root, CLI, custom-server, MITM, updater or MCP CommonJS scopes.

## Provider-scoped client and model reconciliation

[Detailed research and sources](CLIENT-MODEL-RECONCILIATION.md) · [Coverage inventory](model-catalog-coverage.json)

- Add **120 provider/model entries**: 100 chat, 8 image, 6 embedding and 6 TTS. **342 sourced factual metadata records** cover exact provider/model identities; **827 preserved historical entries remain not individually verified**. These are distinct coverage measures, not an entitlement count.
- Reconcile researched Claude Code, Kiro CLI, Kimchi, CodeBuddy CN and Command Code identities. Keep IDE/CLI, regional and API/OAuth identities separate. Correct Gemini OAuth and Copilot endpoint-specific headers without granting beta entitlements or guessing unverified runtime fingerprints.
- Canonical provider aliases and declared upstream pricing aliases agree across browser/server consumers. Native namespaces and paid/free identities are preserved; obsolete normalized catalog caches are invalidated. Coding-plan records are not interchangeable with direct API products.
- Model discovery retains no-auth providers, intentional chat/STT duplicate IDs, typed live metadata and operator declarations. Runtime custom capabilities are provider-scoped. Maximum input, total context and maximum output remain separate; undocumented maxima stay unknown.
- Per-model target transport selects the matching upstream endpoint, including gateway-declared Responses-only routes, while compatible native transport retains precedence and stale per-request transport state is cleared.
- Long-context reasoning rates, inclusive thresholds, partial custom tariffs and unknown-price display are corrected. Images, characters, duration, regional tariffs and subscription quotas remain labelled metadata rather than fabricated token prices. Numeric costs are estimates, not guaranteed invoices; automatic time-of-day selection for DeepSeek tariffs remains a limitation.
- Public catalog research and offline execution do **not** establish live model serving or account entitlement. Unsupported adapters/protocols and unverified hosted IDs are not inferred from model names.

## Reasoning budgets, terminals and actual usage

[Request and accounting contract](REASONING-BUDGETS.md)

- Preserve explicit positive output caps and nullable OpenAI alias fallback through repaired translation and final Gemini/Kiro/Ollama/CommandCode/GitHub/Antigravity serialization. Do not silently raise a caller cap to a universal reasoning floor; known endpoint ceilings can still clamp downward.
- Keep native provider thinking semantics and client intent distinct from gateway defaults. Responses-native reasoning fields survive. Claude manual thinking follows supported models and effective outbound interleaving betas, including rejected-beta retries; impossible generated combinations fail request-scoped before dispatch.
- Record actual usage for each exhausted attempt. Gemini candidate/thought tokens are folded once; inclusive provider totals do not add their reasoning breakdown again. Remove context-reserve inflation from actual counters.
- Preserve `response.incomplete`, partial output, refusals and valid terminal events. Reasoning-only exhaustion is not zero-cost success; terminal-then-cancel callbacks cannot persist the same attempt twice. Combo streams with meaningful reasoning or terminal content are not replayed as empty transports.
- No larger-paid-budget automatic retry was added. Existing configured account/model fallback remains, and every incurred attempt needs accounting. Codex OAuth, OpenCode Muse and Cursor retain unsupported-cap behavior. A token cap is not an aggregate monetary budget, and stream cancellation does not prove upstream billing stopped.

## Grounded web search

[Selectors, request examples and error policy](WEB-SEARCH.md)

- Bare providers and advertised `provider/search` IDs select a provider/service default, not an upstream model literally named `gemini` or `search`. Explicit provider/model pairs and combo members retain ownership; malformed selectors fail before account dispatch. Nested upstream namespaces are preserved.
- Antigravity search uses its dedicated sandbox host, search model and real project/request/session envelope, rather than chat normalization. Preserve explicit alias/thinking mapping, `googleSearch`, citations and each account's proxy/relay/strict-proxy policy. No project IDs are fabricated.
- Exclude returned `thought: true` parts from visible answers and citation context without disabling native thinking or changing total usage.
- The specific Gemini missing-model 404 is request-scoped after one account attempt. The exact ambiguous Antigravity resource-not-found 404 is bounded to **three eligible account attempts**, without healthy-credential cooldown writes. Other authentication/quota fallback is unchanged; this is not a general removal of 404 handling.
- Success clears only the matching web-search health scope, leaving unrelated chat/model locks intact. Logger tag/message calls no longer produce undefined diagnostics.
- Dedicated-search protocol alignment does not verify current Google availability or the entitlement of any real account.

## Dashboard, editor and documentation runtime

- Bundle the installed Monaco ESM editor and explicit same-origin JSON/editor workers instead of a stale wrapper CDN default; preserve CSP and verify real edits and worker round trips.
- Keep the docs markdown wrapper compatible with react-markdown 10 and fix the language-switcher runtime crash.
- Resolve the nine existing React lint warnings without disabling rules. Codex/Claude settings retain unsaved drafts and placeholder-key fallback; OAuth uses hydration-safe browser-location state.
- Add localized release changelogs, Help navigation and introduction links in English, Vietnamese, Simplified Chinese, Spanish and Japanese.

## Security and remaining limits

TLS certificate and hostname verification remain enabled. Self-signed test exceptions are per-request; the MITM fixture no longer sets process-wide `NODE_TLS_REJECT_UNAUTHORIZED=0`. Real HTTPS controls verify default rejection.

Upstream **node-forge** and **braces** advisory debt remains. This dependency refresh is **not vulnerability-free**, does not hide audit findings and does not force a downgrade. A scoped assessment of a direct consumer is not a blanket statement of non-reachability for every transitive consumer.

No production account access, authenticated upstream inference, new charge retry or automatic deployment was performed. Public metadata is not proof of availability, quota, price acceptance, invoice parity or entitlement.

## Release publication safeguards

Both manual workflows require a real stable tag and its exact commit; npm provenance additionally requires the dispatch ref/SHA to match. The original version/SHA-bound CLI tarball is retained before publication and recovered with immutable registry SHA512 verification on retries. Global publication serialization and numeric version checks prevent older repairs from replacing npm, GitHub or Docker `latest`. Missing/expired original artifacts fail closed rather than rebuilding a different tarball.

## Verification evidence and release-gate boundary

Final 0.9.7 verification on Node 22.23.2 passes **494 Vitest files: 4,091 passed, 100 skipped, 1 todo, zero failed tests or suites**, plus zero-error/zero-warning ESLint. Release checks validate all package/lock versions, literal stable tags, publication configuration and every localized changelog. App/CLI and Docker runtime acceptance remain separate from upstream availability.

Prior acceptance includes app/CLI production builds, docs static export, native SQLite, h2c, Undici SSE/abort/strict-proxy transport, packaging, authenticated missing-model API checks and real browser form/hydration/editor checks. Installer checks execute real Bash function bodies inside mock-only harnesses, not host provisioning.

Real loopback relay/CONNECT and production standalone acceptance use isolated SQLite and disposable provider rows. Search checks cover defaults/aliases, grounding/citations, hidden thought exclusion, scope-only health clearing and bounded 404 behavior. Reasoning checks read actual stored usage for preserved caps, reasoning-only exhaustion and exactly-once terminal cancellation. These fixtures establish gateway behavior, not live provider inference or account entitlement.

## Container upgrade guidance

The publication workflow targets **linux/amd64 only**, not native ARM64/multi-architecture images. Pin `joyccn/zenrouter:0.9.7` or `ghcr.io/zenrouter/zenrouter:0.9.7` after publication. Persist **/app/data** (`DATA_DIR=/app/data`), retain and back up that volume before upgrading, and review the [Docker guide](../DOCKER_README.md). Versioned image examples do not certify that publication has already completed.
