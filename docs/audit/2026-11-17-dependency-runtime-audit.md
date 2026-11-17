# Dependency and runtime audit — 2026-11-17

Base checkout: `2ba52e092acf606fef08df6f4dc96f4933af4dad`. The application,
CLI, tests and documentation retain version **1.0.8**; these changes belong to
the Unreleased source section. No npm package, container, GitHub release,
immutable tag or deployment was published by this work. Historical release
receipts and their test counts remain unchanged.

A later source review found additional cross-modality account-routing and remote
asset-read gaps. Their follow-up is recorded in the
[upstream reconciliation audit](2026-11-17-upstream-reconciliation.md#cross-modality-account-transport-follow-up);
the dependency/runtime-phase results below do not validate those later changes.

## Dependency ownership and lockfiles

The review covers the four independent installable projects at the repository
root, `tests/`, `cli/` and `gitbook/`. Smaller manifests under source directories
declare module type; they are not missing independent lockfiles. Direct imports
must be declared by their owning project rather than happen to resolve through
a parent or transitively installed package.

The [public metadata receipt](data/dependency-refresh-20261117.json) records the
complete before/after declarations, current publisher versions, integrity
metadata, peer/engine information and registry audit summaries. The main updates
are:

| Package | Previous declaration | Current declaration |
| --- | --- | --- |
| `next`, `@next/third-parties` | `^16.4.5` | `^16.4.6` |
| `@xyflow/react` | `^12.12.1` | `^13.0.1` |
| `jose` | `^6.2.15` | `^6.2.17` |
| `lucide-react` | `^1.70.0` | `^1.73.0` |
| `material-symbols` | `^0.48.3` | `^0.49.0` |
| `motion` | `^14.10.1` | `^14.14.0` |
| `sql.js` | `^1.15.2` | `^1.16.0` |
| `better-sqlite3` | `^13.0.3` | `^13.2.0` |
| `@playwright/test` | `^1.65.0` | `^1.65.1` |
| `eslint` | `^10.14.0` | `^10.15.0` |
| `oxlint` | `^1.92.0` | `^1.94.0` |
| `postcss` | `^8.5.32` | `^8.5.33` |
| test-package `vite` | `^8.3.6` | `^8.3.8` |

The root now declares its direct tooling imports `minimatch` 11.0.9,
`playwright` 1.65.1 and `sharp` 0.35.5. The independent test project declares
`xml-crypto` 6.4.0 for its SAML fixtures. Security overrides retain their intended
scope while updating minimatch, DOMPurify and brace-expansion patches.
The patched minimatch rejects over-budget optimization with `RangeError`;
tests preserve that explicit rejection instead of demanding unbounded expansion.

The CLI's managed SQLite runtime uses better-sqlite3 **13.2.0** and sql.js
**1.16.0**, aligned with source installation. Its separate legacy native branch
remains 12.11.1 and is not a new support claim below the CLI's Node requirement.
Managed `systray2` remains at the current publisher version 2.1.4. These managed
packages are intentional runtime installations, not undeclared source imports.

All four frozen `npm ci` installations completed. Their direct dependency checks
reported root **51**, tests **3**, CLI **5** and docs **12**, with no optional
direct dependency omitted. `npm outdated --depth=0` returned an empty object for
each project. Each registry `npm audit` response reported zero vulnerabilities
at every severity at this observation; this is the registry's current advisory
result for those four dependency graphs, not a general security certification.
Two platform-optional WASM artifacts were reported as extraneous by `npm ls`;
no required missing dependency was reported and its complete-tree command
exited successfully.

React Flow 13 changes numeric fit padding to pixels. The routing map now uses
an explicit percentage preserving the earlier 0.12 normalized margin. This is
an application migration backed by the
[publisher changelog](https://github.com/xyflow/xyflow/blob/main/packages/react/CHANGELOG.md),
not just a major-version declaration change.

## Concrete runtime repairs

### Rotating OAuth grants and diagnostics

The 500-entry refresh cache previously evicted its oldest entry even when that
grant was still running. A reproduction using 501 distinct synthetic tokens
started 502 refresh calls: the oldest token lost its single-flight owner and
was refreshed twice. A provider can rotate a refresh token during the first
grant, making that duplicate harmful even when the transport later cancels.

The cache now evicts completed results first and never forgets an active grant.
An existing key still joins the same work. When every slot is pending, a new
key receives `TOKEN_REFRESH_CAPACITY_EXCEEDED` without new I/O; it can retry after
capacity becomes available. This keeps both memory and work bounded rather than
silently trading a memory cap for duplicate credential rotation.

OAuth failure logs retain allowlisted error codes, HTTP status and error type.
Raw error payloads, provider messages and JSON parser excerpts are excluded from
those diagnostics because they can include credentials. This is a focused
logging repair, not a claim that every possible integration log was certified.

### SQLite transactions and statement memory

Native prepared-statement caches previously retained every distinct SQL template
for the process lifetime. They now retain a 256-entry LRU working set; Bun
statements are finalized when evicted, while Node/better-sqlite3 release removed
references through their normal native lifecycle.

The node:sqlite and sql.js adapters previously accepted a Promise-returning
transaction callback and committed its synchronous writes. They now reject the
Promise/thenable before commit or savepoint release and roll those writes back,
consistent with the synchronous better-sqlite3 contract. Asynchronous
continuations themselves are unsupported: callers must finish asynchronous work
before entering a transaction. New regressions inspect actual persisted writes
and nested rollback, not only an error message.

Optional native SQLite now loads through the shared synchronous runtime resolver
rather than a webpack-resolved static dependency. An absent addon can therefore
reach the existing node:sqlite fallback without inventing a stub package;
CLI-managed `NODE_PATH` resolution remains available. Installed addon files,
including native binaries, are explicitly retained by standalone tracing.
Cursor's read-only credential database also closes in `finally` when a query
fails. Focused loader tests cover real addon resolution and native fallback;
package-present/physically-absent production builds remain separate checks.

### Login attempt tracking

The in-memory login limiter retains at most 4,096 individual address entries
and one overflow bucket. Activity periodically sweeps inactive expired entries;
active lockouts are preserved. Under an address-cardinality flood, additional
addresses share overflow throttling instead of causing unbounded memory growth
or evicting an already locked address. The tradeoff is shared throttling for
untracked new addresses under that flood; successful login does not remove the
shared protection for other addresses.

### Video request ownership and complete responses

Video caller cancellation is terminal during account lookup, refresh, dispatch
and response consumption, including `AbortController.abort(new Error(...))`.
It returns the cancellation result without another account, request or account
health mutation. The 120-second `VIDEO_FETCH_TIMEOUT_MS` deadline begins inside
the video core and covers its 401/403 refresh retry, fetch and body consumption;
a deadline expiry is distinct from caller cancellation. The application's
proactive credential refresh precedes that core deadline and observes the caller
signal; this is not a claim of one 120-second bound around every application step.

Successful video metadata must be a complete valid UTF-8 JSON object and fit
within **1 MiB**. Truncated, malformed or oversized successful metadata returns
an upstream error instead of empty HTTP 200. Error diagnostics retain at most
**8 KiB**. Readers, bodies and abort listeners are released on terminal paths.
Submission POSTs remain non-retrying after ambiguous transport/body failures:
the upstream may already have created a billable job. Successful response bytes,
status and job identifiers retain their upstream meaning.

The application resolves and freezes the selected account's proxy policy once.
Video POST, polling, proactive token refresh and the one permitted 401 refresh
retry all use that same policy through the proxy-aware transport. Missing or
inactive pools and broken relays fail closed as local routing failures without
another account, direct-egress fallback or an account-health mutation. New tests
exercise a real HTTP relay and a direct-egress trap, not only mocked fetch calls.

### Streamed tool consistency

Streamed Chat deltas and forced-SSE-to-JSON aggregation now share tool-delta
normalization. Null/empty placeholders are no-ops and cannot crash aggregation
or manufacture an empty tool call. Valid tool IDs, partial names/arguments,
ordering and per-tool opaque signatures keep their original stream meaning.
This closes a behavior difference between two response paths rather than
treating a green parser result as provider acceptance.

## Provider contracts and release inventory

The [provider source receipt](data/provider-contract-review-20261117.json)
records the four requested official repositories, exact inspected commits and
public npm metadata. The [complete client-pin inventory](data/provider-inventory-20261117.json)
accounts for all 20 application client/version pins, independently scoped SDK/API
values, source-tag evidence and actual blocked metadata requests. Publisher code
was inspected, not executed. Native
signatures remain opaque provider-owned bytes; structural/history checks cannot
verify cryptographic authenticity, account ownership or upstream acceptance.

| Published client/source observed | Version observed | Disposition |
| --- | --- | --- |
| Claude Code npm | 2.1.326 | Release inventory; no inferred new SDK/API/signature profile. |
| Codex stable | 0.169.0 | Explicit prompt-cache TTL contract implemented from tagged source. |
| VS Code / bundled Copilot Chat | 1.146.0 / 0.74.0 | Immutable tagged source reverified; Copilot API SDK remains independently 0.5.2. |
| Gemini CLI npm | 0.68.0 | Rechecked; no new wire migration inferred. |
| Antigravity CLI changelog / Python SDK | 1.5.9 / 0.1.23 | CLI, IDE, agent/interactions and raw CloudCode surfaces remain distinct. |
| CodeBuddy CN CLI npm | 2.184.0 | Release inventory; region-specific wire identity retained. |
| Command Code npm | 1.89.2 | Release inventory; no speculative transport change. |
| Qoder CLI npm | 1.1.89 | Release inventory; signed legacy COSY profile remains independent. |
| Kimchi stable tag | 1.35.0 | New release observed; retained gateway pin 1.34.2 is not relabeled as current. |
| Zed stable tag | 1.28.1 | Immutable tagged source reverified unchanged. |
| OpenCode npm | 1.19.5 | Rechecked unchanged. |
| iFlow npm | 0.5.19 | Does not reverse the separately recorded service shutdown. |

Official current-version feeds for Cursor, Kiro IDE/CLI, Trae, Windsurf,
Grok CLI, Antigravity IDE/signed CLI artifacts and CodeBuddy INTL returned
proxy 403. Their existing pins are retained with **current release unknown**;
unreachable metadata is not evidence that no newer release exists. The inventory
retains each public destination and observed outcome without claiming live VPN,
publisher availability or provider account readiness.

No User-Agent, client fingerprint, SDK/API version or identity pin changed just
to resemble a newer installed application. A published release is not evidence
of a complete gateway client migration and does not grant provider entitlement.
No anti-detection, quota bypass, fabricated signature or ban-avoidance mechanism
was introduced.

Codex tag `rust-v0.169.0`, commit
`a41fe5b443652cbdbee57717fbb9fd78d8d8b32a`, provides the concrete new contract:

- Its [request schema](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/codex-api/src/common.rs)
  serializes explicit `prompt_cache_options`.
- Its [TTL type](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/protocol/src/turn_input.rs)
  permits `30m` and `12h`.
- Its [submission tests](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/core/tests/suite/turn_input_submission.rs)
  preserve absence instead of injecting a default cache lifetime.

The gateway previously removed that explicit field at its final request
allowlist. It now validates and forwards the supported caller intent, rejects
malformed options before dispatch, and keeps concurrent caller objects isolated.
Other discovered fields such as `access_programs` and `stream_options` need their
own account-policy/telemetry review and were not added speculatively. The
Antigravity SDK's `Thought.signature` type alone does not establish compatibility
for raw `/v1internal` CloudCode requests.

## Active documentation and deferred work

The Markdown inventory contains 244 tracked files at the review base. Current
source setup examples were synchronized in 19 active English/localized guides
and contributor instructions. They now generate a private external runtime file
once, preserve an existing file, use random JWT/API/identity secrets and password,
and choose an absolute ignored state path. Node loads that file explicitly;
production builds cannot embed it through repository `.env` tracing. Archived
release receipts, dates, artifact identities and historical results were retained.

The development launcher uses a data-only Node env-file parent that spawns the
Next CLI with explicit child arguments. Direct Node `--env-file` on the Next CLI
was found to leak that flag into a worker's `NODE_OPTIONS`; standalone startup
does not require that development-worker workaround. The JSON-quoted runtime
file is not executed as shell code, preserving literal path metacharacters.

The remaining `TODO(firebase)` in token refresh is deliberate: implementing
short-lived Firebase JWT refresh requires a supported provider contract and
credentials. It was not replaced with a guessed endpoint or invented auth flow.
Unsupported media mappings, account entitlements and native signature semantics
likewise remain explicit limits. No measured throughput/latency improvement is
claimed merely from dependency bumps or bounded memory behavior.

## Validation

Dependency/runtime-phase integrated regression validation passed: **11,491 tests passed**, **99 skipped**,
zero failed assertions or suites across **899 selected files** (881 passed,
18 skipped), in **199.60 seconds**. The repository's nonempty regression report
gate passed. The [compact validation receipt](data/runtime-validation-20261117.json)
retains the original JSON report hash and counts; this is current working-tree
validation, not a new immutable release/CI receipt. Later upstream reconciliation
has its own source and validation boundary; these results must not silently be
reused as proof for code changed afterward.

Focused and separate workflow results:

| Check | Observed result |
| --- | --- |
| Dependency and managed-runtime regressions | 66 passed across 5 files; report gate passed. |
| SQLite, login limiter and related regressions | 42 passed across 7 files. |
| Codex transport/cache regressions | 42 passed across 5 files, including 12 new cases; before the fix, 11 of the new cases failed. |
| Shared stream/tool aggregation regressions | 72 passed across 4 files. |
| Video regressions | 129 passed across 4 files, including 32 new cases and 8 proxy-policy security cases. |
| OAuth failure diagnostic regressions | 60 passed across 4 files. |
| Diagnostic integration regressions | 34 passed across 2 files. |
| OAuth cache capacity/cancellation regressions | 10 passed across 3 files. |
| Optional native SQLite loader and runtime regressions | 20 passed across 3 files; targeted strict lint passed. |
| Documentation tests and static build | 18 tests passed; 109 pages generated. |
| Application production build and strict composed lint | Passed for this dependency/runtime phase. |
| Production browser suite | 47 passed for this dependency/runtime phase. |
| CLI package and physically-absent-addon production build | Completed later in the final [reconciliation validation](2026-11-17-upstream-reconciliation.md#validation-and-remaining-boundaries), separate from this earlier phase. |

Live provider inference, account/plan acceptance and paid video generation were
not run. Bun is not installed in this cloud instance; its branch is covered only
to the extent stated by source/mock regressions. Platform/optional dependency
packaging needs its own target-runtime checks. GitHub API requests returned a
proxy 403 during research while scoped Git and npm metadata reads succeeded;
no TLS or artifact checksum verification was disabled.
