# Client compatibility and provider catalog sync — 2026-10-31

Review date uses Asia/Jakarta. Source base:
`5ca4aaf0b307ae527f472e597b4d390a05df14da`.
This is a source follow-up, separate from published application artifacts and
live account acceptance. Six parallel reviews covered client releases,
changelogs, wire identities, catalogs and selected upstream issues.

## Scope and source evidence

The registry contains **121 provider entries**, including **83 direct transport
providers** and 38 media/other entries. The transport baseline's 83 is not the
total registry size. Static rows change from **1,302 to 1,322**: 11 CodeBuddy INTL
and 17 OpenCode additions, minus eight explicitly retired Copilot fallbacks.
Operator-selected model IDs and existing provider defaults are preserved.

[Client/release evidence](data/client-compatibility-refresh-20261031.json)
records publisher URLs, exact tags/commits, package integrity, selected channels,
changelog dispositions, independent SDK/API pins and blocked sources.
[All-provider coverage](data/provider-catalog-coverage-20261031.json) classifies
every entry's public/dashboard discovery and source boundary. A derivable URL
or static row does not prove upstream availability for an account.

## Verified release pins

| Client surface | Previous | Selected |
| --- | --- | --- |
| Claude Code | 2.1.306 | 2.1.314 |
| Codex CLI | 0.163.0 | 0.166.0 |
| Gemini CLI | 0.65.0 | 0.66.0 |
| VS Code | 1.143.0 | 1.144.0 |
| Bundled Copilot Chat | 0.71.0 | 0.72.0 |
| Zed | 1.24.4 | 1.26.2 |
| OpenCode | 1.19.3 | 1.19.5 |
| Command Code | 1.88.0 | 1.88.2 |
| CodeBuddy CN CLI | 2.171.0 | 2.179.0 |
| Kimchi | 1.17.0 | 1.25.0 |
| Qoder CLI | 1.1.75 | 1.1.81 |

These are independently verified publisher stable/non-prerelease releases.
Claude follows the existing npm latest policy; its delayed stable channel is
2.1.308. Version numbers are not inferred from the 9Router fork.

Important changelog and artifact findings:

- Claude's seven published changes after 2.1.306 and Codex's three stable changes
  through 0.166.0 were reviewed. Claude's API-code migration skill mentioning
  `2026-10-21` does **not** change its native message header: the inspected native
  artifact still uses `2023-06-01`. Its Anthropic SDK remains **0.128.0**.
  Stainless runtime metadata now derives from the executing `process.version`,
  as its source does, while OS/architecture remain host-derived.
- Gemini CLI 0.66.0 retains GenAI **1.30.0** and google-auth-library **10.9.0**.
  Its Code Assist transport/model definitions are unchanged from 0.65.0. Local
  terminal/tool/MCP changes were not transplanted into the gateway. Its README
  cautions about Gemini 4 optimization; Antigravity model names were not copied
  into Gemini CLI merely because both are Google products.
- VS Code 1.144.0 independently bundles Copilot 0.72.0 and copilot-api **0.5.2**.
  The API header stays `2026-08-01`, with the separate token/user-info boundary
  retained. Zed's Bedrock additions do not establish hosted Zed model IDs.
- OpenCode's tagged documentation supplies exact per-model endpoint tables.
  CLI worker/packaging changes do not justify adding an unverified native TLS
  adapter or changing caller tool safety/schema semantics. Command Code's
  inspected version header follows its package; UA/environment remain `cli`
  and `production`.
- Qoder's unsigned OpenAPI UA is **`qoder/<release>`**, correcting the previous
  `qodercli/<release>`. Its separately signed Cosy protocol remains unchanged.
  Kimchi's new organization/catalog semantics informed account-isolation fixes.
  CodeBuddy's CN client version does not establish its independent INTL IDE pin.

## Authentication and metadata consistency

Claude's current native production selector verifies the subscription authorize
URL `https://claude.com/cai/oauth/authorize` and token URL
`https://platform.claude.com/v1/oauth/token`. The separate console authorize
surface is `https://platform.claude.com/oauth/authorize`. The existing client ID,
three scopes, PKCE, callback overrides and profile API paths are retained.
Deployments restricting OAuth egress to the old token host must permit the new
publisher token host. No real login or token exchange was performed here.

Native Anthropic API-key catalog requests use `x-api-key`; Claude OAuth catalogs
use Bearer authorization and the verified OAuth beta/CLI identity. Codex model
discovery uses the same selected destination account and current client identity
as execution. API-key Gemini, CloudCode Gemini CLI and Antigravity stay separate
products with their own auth, model IDs, headers and project selection.

Dashboard and public discovery share the native Anthropic/Gemini/Mistral
normalizers and the Codex/Google OAuth resolvers. The public `/v1/models` path
now consults Claude, Codex, Gemini CLI and Antigravity account catalogs, while
preserving the existing selected-active-connection and explicit-whitelist
policy. A complete empty catalog can suppress static suggestions; malformed,
incomplete or failed discovery retains its existing fallback policy. Public
metadata lookup does not rotate these providers' refresh credentials or perform
onboarding/inference. Existing explicit dashboard refresh policies remain.

The shared native reader and new OAuth resolvers enforce a five-second
metadata deadline, an 8 MiB response budget and same-origin bounded pagination
where applicable. Redirects are rejected. Cache state is bounded to 256 entries
and 16 MiB serialized data, credential/project/account/proxy/import scoped, and
returned without mutable shared model objects. These limits concern these
metadata paths, not paid-generation deadlines or every older provider adapter.

Parsers preserve explicit Boolean negatives and safe integer limits. A native
object discriminator such as `type: model` is not a service kind. Gemini input
and output limits remain separate, and ambiguous `maxTokens` is not treated as
context. Codex visibility follows its native picker contract; OAuth models with
`supported_in_api: false` are not incorrectly excluded as if they used API keys.
Internal/quota/private fields do not become public catalog facts.

Kimchi discovery/chat now share the configured endpoint and explicit
organization scope; its cache no longer substitutes one token's catalog for
another token on the same user or keeps global expired per-model metadata.
Gemini CLI's model-specific User-Agent uses an explicit request parameter rather
than mutable executor-instance state.

## Model additions, retirement and picker behavior

- CodeBuddy INTL gains 11 exact IDs from the integrity-checked publisher bundle.
  Its selected context budgets/output limits are scoped to that product;
  unsupported separate maximum-input limits and cash rates remain unknown.
- OpenCode gains seven Free and ten Go routes with their documented endpoint
  lanes. Free token/cache-read zeroes are explicit published quotes; unspecified
  cache writes remain unknown. Go quota references do not become cash invoices.
  Workspace/training permissions for contributor models are not enabled by the
  gateway. Newly added IDs are appended so existing defaults remain unchanged.
- Copilot removes eight fallback IDs with explicit past retirement dates in
  publisher documentation at `6167b6d08e8548a411a2ab1e0f3627fe6f89aaec`.
  Removal does not affect another provider's same-name model, historical prices,
  saved explicit routes, operator declarations or a fresh policy-authorized
  live catalog. Sonnet 4.6's documented annual-plan exception is preserved.
  The historical pricing verifier permits only the eight exact reviewed
  GitHub/model pairs to leave current advertisement. It still requires unique
  extraction rows, unchanged literal costs, product mapping and, when supplied,
  membership in the hash-verified original snapshot. Immutable reference counts
  remain 123 registry pairs, 16 eligible estimates and 163 references.
- The picker excludes disabled accounts and stale account catalogs. A failed
  Cursor account does not erase another enabled account's successful catalog.
  Passthrough providers such as ByKitsune now actually include fetched models,
  with operator naming and kind filters retained.

## Reference catalog and historical pricing

Official models.dev commit `971a07c53cdb688185015776b76151d514b7bde5` was
reconstructed with its exact generator/default filter: 234 products and 8,930
default rows, SHA-256
`d8efcc4d8abe4748b0739826df309d7af8de15f3026d71cac6db8dc459f66b9c`.
This is a reproducible source reconstruction, **not an HTTP API capture**.

The final registry comparison covers all 1,322 rows: 409 exact chat references,
117 non-chat rows and 796 unmatched rows. It records 406 deduplicated capability
references, zero unqualified actionable mismatches, 22 older primary-reference
conflicts and 339 unknown fields. Those conflicts/unknowns are explicit limits
of the evidence, not certification that every model fact was newly verified.

The new pricing observation holds 1,410 references and 357 eligible token
estimates under the unchanged product/unit policy. Missing quotes do not imply
retirement or free usage. The previously shipped complete October 29 observation
is retained in an immutable module alongside the earlier seed and latest
observation: refreshing the current source must not erase an older in-flight
instant or change an accepted usage quote. Verification time is not an asserted
historical tariff-effective date.

## Upstream selections and remaining access boundaries

9Router master remains `1fe586bb1cf35e1ed0cb2150a8ef7d1db040b21d` from October 28.
[The review](data/9router-client-refresh-review-20261031.json) inventories 85
commit subjects/selected diffs and 39 actual issues, excluding PRs. Six issue
pages were freshly inspected; unchanged earlier evidence is explicitly linked.
The useful related fix from #4681 is the enabled-account/passthrough picker work.
Existing capability provenance already addresses part of #5045. Account
stickiness, custom adapters, diagnostic headers and empty-stream timeout policy
remain separate designs; existing stronger stream/accounting guards are kept.

Antigravity, Cursor, Kiro, Windsurf/Devin, Trae and Grok have retained version
pins where current official feeds were blocked. Independent signed/runtime pins
are retained separately. iFlow's publisher shutdown remains in effect. These
surfaces are **not claimed freshly latest**. A draft adding 17 exact official
domains was saved for environment review/save/publication; the running session
still had no custom host additions at the last check. Unrestricted network/TLS
workarounds were not used.

## Integrated verification

The frozen implementation passed its local gates:

- **10,201 passed, 100 skipped, zero failed across 815 files** in the complete
  CI Vitest run. The strict report validator confirmed complete collection and
  matching assertion totals: 10,301 cases.
- **27/27 production Playwright cases passed** in 55.0 seconds, including the
  enabled-account ByKitsune/Cursor picker, navigation, routing map, pricing and
  recorded-request details.
- The production Webpack build and standalone asset copy completed with exit
  zero. Application source was frozen before this build; subsequent corrections
  affected tests and the historical pricing audit tool only.
- Full composed lint passed with `--max-warnings=0`; subsequent test/audit-tool
  corrections also passed strict composed lint. Whitespace checks passed.
- **18 documentation tests** and **one CommonJS compatibility test** passed.
  Provider (83), alias (117), OAuth URL and branding checks passed. The i18n
  audit covers 1,892 source literals with zero missing Indonesian translations.

The first integrated run found eight failures: dated catalog/pricing expectations
needed refresh, and historical price verification incorrectly required retired
models to remain advertised. Those failures were corrected without changing
historical costs, extraction hashes or immutable counts. The six affected files
then passed 56 tests before the complete green rerun. Seven added assertions
reject unapproved missing models, wrong-provider/case aliases, duplicate rows,
changed costs and absent supplied-snapshot evidence.

Independent source and audit consistency reviews found no introduced blocker.
All application/account behavior here used synthetic fixtures and isolated local
state. No real OAuth login, paid inference or customer database was used; local
gates do not establish real account availability or invoice accuracy. Blocked
publisher feeds listed above remain unverified. Exact outcomes and report digest
are recorded in the client/release evidence JSON.
