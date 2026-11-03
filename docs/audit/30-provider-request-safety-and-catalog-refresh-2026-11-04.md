# Provider request safety and catalog refresh — 2026-11-04

Review date uses Asia/Jakarta. Source base:
`aad493863fc12385edbdefe555642179a5ce3d55`.
This review replaces fabricated request material with original provider data,
preserves request/account ownership, and refreshes all registered provider
catalog dispositions. It does not guarantee account eligibility or freedom
from provider restrictions.

## Official source comparisons

The official repositories were cloned for read-only source inspection. Native
executables from provider packages were not executed.

| Source | Version-matched reference | What it establishes |
| --- | --- | --- |
| [OpenAI Codex](https://github.com/openai/codex) | `rust-v0.166.0`, `6ff1e1ca3b30fc8b914720681fcf5fe62e95f856` | Request/session ownership and supported request fields. Main/alpha fields are not automatically imported. |
| [Claude Code public repository](https://github.com/anthropics/claude-code) | `964d69565952a176ac1975ed218362991db71433` | Public documentation/changelog; it is not the complete proprietary client runtime. |
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) | `sdk-v0.128.0`, `1926adb4d292090975e6b5d19ebafe2274d2469e` | The SDK actually bundled by the verified Claude client: optional metadata, opaque signatures and API header contract. Newer SDK main does not establish a new bundled API version. |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `v0.66.0`, `970413207732f5d4d8c50540c7fc359c44fdaaf2` | OAuth/project onboarding and current-turn/parallel-call signature rules. |
| [Google GenAI SDK](https://github.com/googleapis/js-genai) | `v1.30.0`, `38cac5bbf4941ec5fa760238bd423c0ecc2c6f04` | The CLI's actual SDK dependency, per-Part opaque signatures and history copying. |

Antigravity and the current Kiro product do not expose their complete current
implementation as an equivalent public source checkout. Their boundaries are
documented using publisher documentation, version-matched related sources and
the existing verified artifact evidence; unrelated forks are not treated as
official runtime source.

Detailed evidence:

- [Claude/Codex identity and source evidence](data/request-identity-refresh-20261104.json)
- [Google protocol review](data/google-protocol-review-20261104.md)
- [Kiro/OAuth source review](data/kiro-official-auth-review-20261104.md)

## Protocol and account safeguards

- Removed captured fallback signatures, token-derived fabricated account/device
  identities, random billing suffixes, injected application-identity prompts
  and unavailable decoy tools. Caller-authored instructions and genuine opaque
  thinking/redacted history remain unchanged.
- Claude active tool continuations retain the complete original signed thinking
  sequence. Missing/malformed continuity fails explicitly rather than receiving
  a replacement signature. Multi-round continuation and adaptive thinking are
  handled separately.
- Google signatures stay attached to their original Parts, including native
  thoughts and image-edit inputs. A signature on preceding text/thinking cannot
  certify another unsigned tool call. First parallel-call/current-turn rules
  are checked without requiring new signatures on every parallel call.
- The documented Google migrated-history marker is accepted only when supplied
  explicitly; the gateway does not inject it as a replacement for lost history.
- Antigravity/Gemini CLI dispatch requires the account's actual project binding.
  Onboarding/polling is bounded and definitive denials stop. No random project
  ID is generated. Existing resolved Antigravity model/tier mapping is retained.
- OAuth refresh validates token responses and refuses credential-bearing
  redirects. Kiro region and poll responses are validated before endpoint/cache
  use. Authentication/permission failures are not reclassified as capacity
  retries merely because their text contains a transient-looking word.
- Codex sessions are request-local, including concurrent accounts; explicit
  `parallel_tool_calls` and caller `include[]` survive final serialization.
- Local signature/project validation returns actionable HTTP 400 with
  `x-should-retry: false`; these failures cannot cool down credentials or replay
  the same incomplete signed history across accounts/combos.
- Responses namespace tools remain intact on native OpenAI Responses/Codex
  routes. Lossy Responses-to-Chat conversion rejects them explicitly with
  `unsupported_parameter` and the tool index before dispatch, credential
  refresh or account-health updates.
- OpenAI web search uses the verified Responses endpoint, required `web_search`,
  `store: false`, and flat citation normalization while preserving proxy/deadline
  policy. It does not fetch arbitrary citation URLs.
- Kimchi's source-bound release identity is updated to 1.28.0. Independent
  application, SDK, API, signed-protocol and entitlement identities are retained.

Structured response content in the Usage request drawer is rendered as escaped,
readable JSON instead of being passed as an invalid React child. Strings and
empty content retain their existing display behavior. The upstream follow-up
[records the original probes and final dispositions](data/upstream-issue-followup-20261104.json).

Standard OpenAI `reasoning_content` is a string. A client that discards native
provider extensions cannot reconstruct every original signed Part. Required
missing continuity produces a validation error; no undocumented reasoning schema
or other account's signature is invented.

## Catalog refresh and deprecations

[The complete coverage inventory](data/provider-catalog-coverage-20261104.json)
matches every one of the **121 registered providers** with no missing or
duplicate provider IDs. It records 1,374 raw registry rows, **52 verified new
rows**, and **59 newly deprecated row flags**. There are 80 deprecated rows in
total, including previously recorded deprecations. Rows can describe separate
modalities/aliases and do not represent distinct account entitlements.

The review includes 14 public native catalog captures in the API/media shard,
current publisher lifecycle documentation, and per-provider private-discovery
boundaries. Missing public entries do not establish retirement. Deprecated rows
are excluded from public suggestions, defaults, dashboard/media/basic-chat and
CLI selectors; explicit historical routes, operator custom models, usage and
pricing provenance are retained. Matching deprecated built-in IDs no longer
hide an explicitly declared custom model or alias in the model picker. Empty retired catalogs do not silently choose
another endpoint/model or reinterpret a voice as a model.

No authenticated provider catalogs or paid inference were exercised: the
environment contains no upstream provider credentials. Full account-specific
availability therefore remains a separate validation requirement. Publisher
catalog membership does not grant subscription or region access.

## CI and reproducibility

Git identity for this repository is `joyccn <ohmyarthurr@gmail.com>`.
Verification runners use Node 24.19.0 and Ubuntu 24.04 consistently; the declared
Node >=22.19 compatibility floor remains unchanged. Narrow module scopes and
`.mjs` helper boundaries replace typeless reparsing warnings without changing
CommonJS helpers into ESM. Global warning interception was removed; Playwright
color inputs are normalized before workers start.

The runner bundles npm 11.17.0, whose new lifecycle-policy warnings were also
checked in complete Actions logs. Canonical installer sources/integrity were
reviewed before adding exact-version `allowScripts` entries for
`better-sqlite3@13.0.3` in the app and `esbuild@0.28.2` in CLI/documentation.
Fresh isolated installs with that exact npm version produce zero npm warnings
or errors; native SQLite and esbuild work, and all lockfiles remain byte-identical.

Legacy database fixtures now acquire and clean up only their own state. A
missing temporary directory no longer makes teardown assign `undefined` to
`process.emit`. Native child regressions check missing-root recovery and that
real filesystem setup errors stay reportable. Expected negative-case diagnostic
logs have exact scoped assertions; unexpected warnings are not globally muted.

[Final local verification data](data/verification-20261104.json) records
**10,867 passed tests, 99 explicitly gated skips, zero failed suites**, and the
strict baseline gate across 851 test files. The final default-reporter log has
zero stderr sections and zero Node warning lines. Live, E2E, cache and benchmark
suites retain their explicit flags; skipped cases are not counted as passes.

All **32 production-dashboard browser checks** and **18 documentation tests**
pass. Whole-repository lint passes with `--max-warnings=0`; branding, translation,
generated identity, provider/alias/OAuth baselines and HTTP/2 compatibility gates
also pass. All four locked dependency audits report zero vulnerabilities.

Production application/documentation builds and the unpublished CLI package
pass. The packed CLI verifies matching SQL.js JS/WASM, forced fallback,
persistence and restart. The final Node 22.23.4 container verifies database
readiness, rejected invalid login, authenticated dashboard, temporary key/model
requests, secret-file mode `0600`, and an existing session after restart using
a generated persistent secret. The temporary smoke container is removed.

Machine-readable evidence includes artifact/log hashes and hashes of final
changed source/tests/workflows. Remote Actions creates its own exact-commit
verification evidence after push. Release/image publication is outside this
review; container and CLI artifacts are validated without publishing them.
