# Kitsune Router 1.0.6 — provider safety, routing and runtime follow-up

Date: **2026-11-05**. All four application/CLI/tests/documentation manifest and
lockfile pairs are synchronized to **1.0.6**. Provider client, SDK and API versions
remain separate identities.

## Source coverage

The root changelog previously covered source commit `7496e20d`. This revision
also documents the five subsequent source commits:

| Commit | Result |
| --- | --- |
| `5412f004` | Matching SQL.js JS/WASM included and verified in the actual packed CLI |
| `aad49386` | Verified client identities, signature structure, credential/destination checks and draft-scoped UI results |
| `4c5b73c0` | Signed history/account/OAuth safety, native Responses/search, 121-provider catalog review and structured Usage content |
| `d598b149` | Reviewed exact-version dependency install-script approvals |
| `e03cec82` | Measured request/SSE CPU improvements, local npm runtime repair and web-fetch format fidelity |

The reviewed Codex PR #6 integration and lifecycle hardening, stable dependency
refresh and source-version synchronization are detailed in the
[November 5 readiness audit](audit/32-pr6-codex-entitlement-and-106-readiness-2026-11-05.md).
Exact source identities and per-check evidence belong to that dated record.

## Provider request and account integrity

Preserve complete original opaque Claude/Google signed histories, redacted
content and native tool/media structure. Missing required continuity fails
explicitly without captured replacement signatures or cross-account recovery.
Google project onboarding uses actual account binding and bounded denial-aware
polling. OAuth/Kiro responses and regions are validated before use; credentials
cannot follow redirects. Local terminal validation does not cool healthy accounts.

Credential Check and Save use the same endpoint, region and selected egress.
Stale results cannot validate another draft. Native Responses namespace tools
remain native or fail explicitly before lossy Chat dispatch. Codex session
identity is request-local. Structured Usage response content renders as escaped
JSON. OpenAI web search uses Responses; Jina/Tavily receive supported format
intent in native fields with validation before credentials, preserving SSRF,
proxy, cancellation and raw text/HTML fidelity.

The dated catalog review covers all **121 registered providers**, with **52 new
verified rows** and **59 newly deprecated flags**. Deprecated suggestions/defaults
are hidden without deleting historical routes or explicit custom models/aliases.
Catalog membership is not proof of account, subscription or regional eligibility.

## Scoped Codex model-plan routing

Learn hints only from canonical HTTP 400 ChatGPT-plan denials naming the requested
wire model, including the known exact internal `[400]` prefix. SHA-256 keys bind
the database, selection import generation, connection, actual credential/account/
workspace and wire-model identity. The stored persistent import revision is also
checked before using or changing a hint. Hints expire at **30 minutes**, are capped
at **500 entries**, and retain no raw credentials or upstream error bodies.
Parenthesized effort variants share an authoritative wire-model family; review
quota stays distinct. Legacy executor `-high` aliases can safely miss a hint.

Quota, locks and exclusions determine genuine eligibility before hint preference.
A denied-only eligible pool still asks upstream, expiry permits another probe and
a current success clears the hint. Stale/cancelled canonical entitlement failures
cannot poison newer credentials' hints; stale Codex successes cannot clear newer
hints or health. Existing generic failure-health semantics remain unchanged. A
transactional revision/identity fence also guards late health cleanup against
import or reauthentication. Legacy no-context callers retain zero-cooldown
fallback without caching a hint. These are observed-error routing rules, not a
live entitlement guarantee or a change to credential-health cooldown policy.

## Performance and runtime reliability

Request preparation avoids impossible-JSON parser exceptions, redundant OAuth
copies and quadratic schema/history searches. SSE framing and Claude tool-delta
lowering reduce measured CPU work while preserving lazy delivery, UTF-8/CRLF,
event limits, ordering, signed data, cancellation and terminal usage. The dated
[benchmark evidence](audit/31-translator-performance-and-upstream-followup-2026-11-04.md)
is workload-specific and synthetic; it does not establish provider/network
latency, subscription speed or retained-memory guarantees.

The CLI copies the matching locked SQL.js JS/WASM and tests actual tarball
fallback/persistence/restart. Nested runtime repairs force a local npm project
even under inherited global selectors, retaining proxy/TLS/registry authentication
and parent configuration. Ubuntu 24.04/Node 24.19.0 verification runners and exact
installer approvals remain separate from the **Node >=22.19.0** runtime floor.

## Stable dependency refresh

All **67 direct declaration rows / 56 packages** match the reviewed November 5
publisher stable snapshot. **18 declarations / 14 packages** advance, including
Next/third-parties 16.4.5, Undici 8.12.4, Vite 8.3.6 and Vitest 5.1.0. The scoped minimatch override
advances to 11.0.4 while retaining the existing adapter and behavioral coverage.
No application API source migration or new lifecycle-script approval is required.

The graph retains **885 locked locations**, with **165 version changes**:
108 patch, 55 minor and two magic-string major-version locations selected by the
updated Tailwind publisher range. Recharts' exact reselect 5.2.0 requirement is
retained even where another consumer permits 5.3. Existing native/runtime pins
already match the reviewed stable branches. Publisher-bundled WASM internals are
preserved. The unchanged optional Sharp WASM rows remain recorded even where npm
lists them as extraneous on this host; dependency checks exit successfully without
concealing platform-specific entries or claiming upstream peer ranges changed.

## Stable publication preparation

A later stable publisher readback selects Undici 8.12.4 while retaining Node
>=22.19.0 and existing install-script policy. The canonical GHCR workflow now
uses authenticated structured manifest evidence for preparation, verification
and latest promotion, and tests the actual default container entrypoint with
isolated state before promoting latest. The
[publication follow-up](audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)
separates this refreshed source and its actual publication/readback evidence
from the morning's source/CI candidate below.

## Verification and distribution boundary

Before the source bump, [CI run 41997372229](https://github.com/ByKitsune/kitsune-router/actions/runs/41997372229)
passed all four jobs on `17be4150`: **10,975 tests passed, 99 gated skips, zero
failures**, **32 browser cases**, **18 docs tests**, strict lint, builds, all four
audits and the unpublished CLI package. The verified pre-bump archive also passes
health/login/models and session/API-key persistence on actual Node 22.19.0 and
22.23.4. The readiness audit records provenance, source-version ordering and
runtime boundaries. Post-bump exact-SHA evidence is retained in CI artifacts.

The local pre-bump preflight records **10,973 passed tests, 99 gated skips and zero
failures**, **32 production-dashboard browser cases**, **18 documentation tests**,
and application/documentation builds. Dependency verification records four
warning-free locked installs, installed checks, four zero-finding low-threshold
audits, 167 focused compatibility tests and two focused documentation checks.
Codex verification records 132 focused tests including temporary SQLite/public
loopback lifecycle, direct scope and the original PR cases.

The [readiness audit](audit/32-pr6-codex-entitlement-and-106-readiness-2026-11-05.md)
and its linked machine-readable evidence distinguish each checked source,
local preflight, exact-source CI, version synchronization and artifact/runtime
verification. Earlier dated counts are not relabeled as final 1.0.6 results.

Source versioning does not establish npm/GHCR publication, latest promotion,
GitHub Release creation or production deployment. November 5 GitHub reads found
no v1.0.5 Release/source tag; earlier 1.0.2 publication/access evidence remains
historical. Preserve old tags/artifacts, complete private state and existing
secrets; follow the [migration guide](MIGRATION.md). Live account entitlement,
paid inference and native Windows/macOS installation require their own evidence.


## Publication attempt boundary

Immutable `v1.0.6` remains at `f9d4c50c`. Its original publication workflows
stopped at source verification before producing artifacts. The
[1.0.7 follow-up](../releases/RELEASE_NOTES_v1.0.7.md) repairs the missing runner prerequisites;
current per-channel results are recorded in the publication audit.
