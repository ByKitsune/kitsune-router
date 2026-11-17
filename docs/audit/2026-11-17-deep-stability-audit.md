# Deep provider, persistence and translation audit — 2026-11-17

This phase starts from Kitsune commit
`c787fb45d80392b2fbd546eb7af911d6766f1606`, after the earlier
[dependency/runtime](2026-11-17-dependency-runtime-audit.md) and
[upstream reconciliation](2026-11-17-upstream-reconciliation.md) work. Their
11,772-pass/99-skip result belongs to that earlier source. Application and package
versions remain **1.0.8**; these are Unreleased changes, not a new published
archive, moved tag or deployment. Final current-source validation is recorded in
the [deep validation receipt](data/deep-stability-validation-20261117.json).

## Actual upstream issues and review scope

The [new issue receipt](data/deep-upstream-issues-20261117.json) records 17
successful HTML index requests, **200 distinct recently updated OPEN issues**,
**289 distinct actual issues**, **62 verified detailed issue pages**, and **51
substantive local applicability reviews**. Counts overlap; they are not counts
of independent bugs fixed. Actual issue item types and page routes were checked;
no pull-request search, issue comments or issue closures were performed.

The captured issue comparisons describe discovery-time source observations.
Completed local repairs and their tests are separate evidence below. A report
can already be handled in Kitsune, describe an unavailable provider/account,
require a different feature, or remain unconfirmed. The survey is not exhaustive
coverage of every issue, line of source or live provider combination.

| Issue/source | Local disposition |
| --- | --- |
| [#3817: SQLite corruption](https://github.com/decolua/9router/issues/3817) | Startup integrity refusal already existed. The reported historical corruption is not independently reproduced; no automatic reset or replacement with an older backup was added. |
| [#4726: orphan custom models](https://github.com/decolua/9router/issues/4726) | Reproduced node-owned declaration/account cleanup gap; the persistence repair makes the owned mutation atomic and preserves unrelated/history data. |
| [#4936: Azure output caps](https://github.com/decolua/9router/issues/4936) | Reproduced transport/cap boundary; modern cap selection and safe URL component handling are tested without changing provider identity. |
| [#2069: cache markers](https://github.com/decolua/9router/issues/2069) | Preserve caller-supplied system/text markers only on the four existing Alibaba opt-in routes; no automatic marker injection. |
| [#5573: legacy Gemini Schema](https://github.com/decolua/9router/issues/5573) | Legacy Gemini-CLI/Antigravity lowering removes unsupported `~optional`; modern JSON Schema paths retain their annotations. |
| [#5596: streaming cache usage](https://github.com/decolua/9router/issues/5596) | Earlier trailer handling was already present; this phase closes additional alias, malformed-counter and cross-format loss cases. Native OpenAI 30m/12h writes remain distinct from Anthropic 5m/1h creation. |
| [#5663: STT timestamp fields](https://github.com/decolua/9router/issues/5663) | Reproduced multipart wire omission; repeated timestamp granularities are retained in order with original audio/format/offsets. |
| [#5590: Firecrawl scrape version](https://github.com/decolua/9router/issues/5590) | Use the verified v2 scrape contract and validate its result envelope/selected format. The reported December 10 shutdown date remains unverified. |
| [#5468: Codex image failures](https://github.com/decolua/9router/issues/5468) | Current official standalone Images source differs from the old Responses-tool route. The native repair below follows the pinned contract; local tests do not establish account entitlement or provider rollout. |

## Automatic old-state adaptation and database accuracy

Declarative schema/backup target **4** adds the `(provider, authType, name)` connection lookup index through
the existing additive synchronization path. A named API-key insertion no longer
performs an unnecessary whole-pool count. Upgrade fixtures use old schemas and
retained credentials/history, and inspect the actual indexed query plan; this is
evidence of query selection, not a universal latency or throughput claim.
The independent versioned migration ledger now reaches **3**; the declarative
backup target remains **4**. These are different fields, applied automatically.

Startup still runs integrity checks before mutation. A schema change attempts a
pre-change backup automatically; generic backup failures retain the existing
best-effort behavior, while unsafe backup permissions fail closed. A successful
native backup is independently opened and checked in the upgrade tests. Operators
must keep a verified full-state backup: the schema backup alone does not contain
installation secrets, auth keys or certificates.

Fresh legacy JSON imports validate the complete source set before schema stamps
and the one-time import marker. Invalid/unreadable/non-regular sources remain in
place and stop import instead of being treated as absent while another file
publishes the marker. Once initialized SQLite is authoritative, obsolete retained
JSON is not re-imported on every restart. Failed adapter initialization can retry
after its prerequisite is repaired; close/reopen cannot hand out a closing handle.

Pending-request counts retain the existing 60-second latest-activity watchdog
per account/model-provider tuple. Sibling completion cannot remove the remaining
tuple expiry, expiry cannot zero another account's contribution, and unmatched
completion is ignored. This is not exact per-attempt tracing or a new global cap.
Versioned migration 3 adds nullable `usageHistory.sourceTimestamp` and repairs
valid explicit-zone historical index timestamps to UTC. It uses ID-keyset pages
of at most 500 rows, limiting selected timestamp values to 128 characters in the
JavaScript page. A changed literal is retained with `COALESCE`, preserving prior
provenance. Invalid clock/calendar, missing and zone-less values remain stored;
date-window queries exclude these unknowns rather than guessing an instant.
Bare timestamp range bounds still use `idx_uh_ts` on the three tested adapters.

Existing daily aggregates, SQL monetary history and frozen quote metadata are
not rebuilt or repriced. Old queued events normalize only during projection and
retain their accepted quote literals/amounts. Fresh legacy JSON imports store an
absent/null timestamp as unknown rather than inventing now; missing/null cost is
SQL `NULL`, while an explicit zero remains zero. New accepted record/outbox times
with verified explicit zones become canonical UTC; valid zone-less timestamps
remain literal unknowns, with no invented daily bucket or known quote. Accepted
quote provenance retains its original literal. An unchanged valid civil literal
keeps `sourceTimestamp` null; malformed new calendar/clock values are rejected
before outbox admission. Endpoint enrichment cannot borrow another event's
known daily bucket for an unknown instant. Civil unknowns remain unfiltered
history/lifetime facts; only summaries needing an assignable day exclude them.

Node endpoint updates and deletion keep their owned account/runtime/declaration
changes transactional. Existing orphan declarations under reserved node IDs are
hidden from discovery while raw KV/export data is retained; restoring the node
can restore visibility. Unrelated nodes, operator aliases, combos, pricing,
credentials and usage history are not inferred to be disposable from a route
string. Old image aliases also remain usable through routing metadata, without a
destructive rewrite of saved configurations.

## Native Codex Images and compatibility aliases

The previous adapter stripped `-image` and sent a text model such as `gpt-5.5`
to Responses with an image tool. Official `openai/codex` source at
[`9537934ed6d5a6658fc77032b3290650765466a1`](https://github.com/openai/codex/tree/9537934ed6d5a6658fc77032b3290650765466a1)
instead uses the standalone [Images client](https://github.com/openai/codex/blob/9537934ed6d5a6658fc77032b3290650765466a1/codex-rs/codex-api/src/endpoint/images.rs)
and image model `gpt-image-2`. Exact source URLs and hashes are retained in the
issue receipt; current main source is not proof of a released-client rollout.

- Generation uses JSON `POST /backend-api/codex/images/generations`.
- Reference-image editing uses JSON `POST /backend-api/codex/images/edits`
  with typed `images` references, retaining the existing guarded remote-input
  policy. It is a different wire shape from the old Responses input/tool body.
- `cx/gpt-image-2` is the native route. Existing `gpt-5.5-image`, `gpt-5.4-image`
  and `gpt-5.3-image` gateway aliases explicitly map to that image model; they do
  not claim native text-model entitlement. Public model resolution/accounting
  uses the canonical upstream ID; saved aliases/combos need no bulk rewrite.
- Native `{created,data:[{b64_json,generation_id?}]}` results retain image and
  generation identifiers. JSON, binary output and a client SSE `done` wrapper
  have separate behavior tests. Legacy Responses SSE decoding uses the shared
  bounded/linear parser, accepts data-only/CR framing and completed artifacts,
  stops at a terminal event without waiting for EOF, and preserves sanitized
  provider error detail. Its original image-artifact-only EOF fixture remains
  supported; cleanup acknowledgment cannot block measured-usage acceptance.
- Exact measured usage is accepted once. Missing token counters stay unknown;
  no zero-token row or image-to-token estimate is fabricated.
- Account/model rejection remains terminal without an automatic alternative
  model, refresh or paid replay. Canonical quota diagnostics retain shared public
  normalization, including an upstream `insufficient_quota` 403 becoming 429.

Old recipes may still send `image_detail`; it is accepted only as a deprecated
compatibility hint, is not a native Images field, and does not change native
image processing. The dashboard removes that control and no longer serializes
hidden model fields. Reference-image bytes remain intact. Invalid supplied references such as `false`,
`0` or an explicitly empty singular `image` fail before image
submission rather than silently changing an edit into a generation. Null/omitted
singular references remain optional. GIF output is accepted; non-null
`frame_count` and `frame_duration_ms` controls are unsupported and rejected before
image submission rather than silently discarded. The public handler can perform
its existing proactive credential check before adapter validation; pre-submission
refusal does not promise zero authentication activity.

For public OpenAI GPT image routes, applicable controls such as `background`,
`output_format`, `output_compression` and `moderation` are
retained on the outbound request instead of discarded. This parameter forwarding
does not add progressive OpenAI SSE: `stream: true` and `partial_images` are
rejected before dispatch on that JSON route. Image 2/2.5
dashboard rows expose their applicable controls. Invalid prompts/counts and
multi-image binary requests are rejected before dispatch; binary output carries
one image, including when the caller also accepts SSE. Native results must have
canonical base64 and a recognized raster signature before success; buffered
usage is accepted after final output/cardinality validation. Empty/malformed
successful envelopes fail with 502, retaining measured usage as an error without
submitting another generation.

The shared successful-image JSON reader applies a 64-MiB budget and 120-second body-read deadline
after headers, cleared timers/abort listeners and bounded chunk joining. This is
not an operation-wide network deadline or a measured throughput guarantee.
Malformed JSON diagnostics remain neutral instead of quoting provider content.

The existing account bearer proof and account ID remain authoritative. Choosing
this transport does not grant a Free/paid account a feature or quota it does not
have. No identity substitution, restriction bypass, real account inference or
paid image generation is established by the local fixture results.

## Provider execution and control plane

Shared account fetching refuses credential-bearing redirects and late responses
after caller/connection deadlines, retaining the selected policy identity.
Rejected-body cleanup does not wait forever for a cancellation acknowledgment.
Default JSON-schema fallback detaches the system-content array it extends, so a
retry cannot mutate borrowed history or duplicate its schema instruction.

Azure modern output caps and URL components, MiMo bootstrap cancellation, safe
Default/GitHub refresh diagnostics and Windsurf gRPC-web EOF framing have
dedicated regressions. Vertex's existing redirect refusal and Cursor's
non-following HTTP/2 transport remain distinct implementations; hidden provider
entries are not activated by this review. The executor inventory covers 27
classes/modules (25 specialized plus Base/Default), with aliases sharing their
actual implementation rather than being counted as independent transports.

Refresh single-flight identities use complete credential proofs instead of
email/name/token-suffix coincidences. Quota/catalog/credential cache scopes
include the effective account routing policy; stale reads cannot replace newer
results. Public Grok catalog listing is read-only, while explicit dashboard
refresh retains rotated-proof persistence and caller cancellation. Vertex key
rotation and credential-bearing OAuth redirects have separate control-plane
regressions. Exact final owner evidence is recorded in the receipt.

Trusted local redirect and `[ProxyFetch]` routing failures remain terminal with
neutral `routing_configuration_error` 502 and `x-should-retry: false`, through
proactive refresh, project lookup and reactive retry paths. They do not trigger
another account/combo, direct fallback or account-health mutation. One frozen
selected routing policy and the original caller signal reach the actual relay
wire even after credential metadata rotates. Ordinary provider failures retain
their established fallback behavior.

Application account selection keeps live per-provider tail locks until the
matching final release and removes completed tails; it never evicts an active
queue to admit another provider. Quota snapshots use a bounded 500-entry set of
complete hashed database/import/account/proof/routing/TTL scopes, with one inner
entry per scope. Diagnostic metrics expose counts rather than credential data.

## Speech timestamp and web-fetch wire contracts

STT multipart preserves repeated `timestamp_granularities[]` values and the
unbracketed alias in original order. Actual multipart-wire fixtures verify
unchanged caller FormData/audio, format and response offsets. This repairs
field loss without rewriting supplied audio or guessing timestamp segments.

Firecrawl uses `POST /v2/scrape`, following official source commit
[`8e7e5887cfd69e1db2d3f16be22a642a02370aec`](https://github.com/firecrawl/firecrawl/tree/8e7e5887cfd69e1db2d3f16be22a642a02370aec).
A successful result requires `success: true`, an object `data` envelope and a
string for the selected Markdown/HTML format. False/malformed success envelopes
fail, native HTML is not silently replaced by Markdown, and unsupported text
requests are rejected before account selection. Pinned source paths/hashes are
in the issue receipt; a reporter-only shutdown date is not an official contract.

## Logging and translator integrity

Captured console values are formatted without executing getters or `toJSON`,
with bounded depth/entry/UTF-8 byte budgets and redacted credentials. Subscriber
exceptions cannot break application console calls; clearing history also clears
pending replay. The console SSE path removes listeners/timers for aborts and
stops an overrun subscriber instead of queueing an unbounded private transcript.

Opt-in request diagnostic files use the resolved `DATA_DIR/logs`, retaining
metadata rather than raw SSE/binary prefixes. Newly appended stream metadata is
limited to 64 KiB per file; writes are grouped per file and reject unsafe linked
targets. Historical files are not silently truncated or deleted. Total historical
session retention remains operator-managed. Diagnostics are best-effort and
separate from the durable usage outbox.

The existing console count cap is 200 lines, combined with a 512-KiB UTF-8
retention budget and 8-KiB formatted-line limit. Detail paging accepts complete
integers, safe offsets and valid ordered dates; invalid input returns a caller
error before SQL. Existing MITM cleanup is restricted to recognized managed
metadata files rather than operator files/directories/links. Shared redaction
does not promise to sanitize arbitrary third-party direct terminal captures.

Translator regressions cover Claude empty tool-input snapshots, partial/numeric
usage, invalid counter provenance, Ollama terminal content/thinking/tools and
empty tool arrays, cache aliases/trailers, legacy Schema lowering, and the
`max_completion_tokens` family. Request-local history/signature ownership is
retained. Removing unused transcript copies reduces retained memory without
claiming a measured provider/network latency improvement.

## Validation boundary

| Focused selection | Observed result and scope |
| --- | --- |
| Database | 349 passed / zero failed/skipped across 32 files, including 50 new cases. The historical-time subset had 7 ordinary failures before repair; old-state upgrades, preserved data/quotes, all-adapter query plans, rollback/retry and read-only backup checks are included. |
| Logging | 93 passed / zero failed/skipped across 13 files, including 53 new cases. In one same-file batching fixture, 1,000 records remain exact while opens fall from 1,000 to 20; this is not a wall-clock benchmark. |
| Translator | 78 new cases. The earlier broad selection passed 953 with 73 gated skips across 69 files; after the final reverse-cache patch, 162 adjacent cases passed across 7 files. These overlapping phases are not summed. |
| Executors | 64 new cases passed; replaying those cases against the base source gives 57 failures and 7 positive controls. The final broader integrated result is recorded separately. |
| Provider services/OAuth | 1,293 passed / zero failures/skips across 92 files, including 161 new cases. Synthetic proofs/local HTTP/real RSA fixtures do not establish live account acceptance. |
| Application account selection | 122 passed across 8 files, including 24 new cases that failed on the base implementation; targeted strict lint passed. |
| Chat routing | 275 passed across 18 adjacent files, including 18 new cases (16 failures / 2 controls before repair), with strict targeted lint. |
| Legacy Codex image SSE | 8 new cases: 7 failed / 1 positive control before repair, then 8 passed. The 89-case adjacent selection also passed. Its small injected parser budget validates the actual limit path without claiming a 64-MiB payload benchmark. |
| Image integration and JSON bounds | The earlier focused selection passed 177 across 7 files. After final result-integrity fixes, 158 passed across 7 files, including 16 new integrity cases that had 14 failures / 2 controls before repair. The JSON reader's 26 cases passed, including body deadline, byte/chunk budgets and cleanup. Selections overlap and are not summed. |
| STT and Firecrawl | STT: 6 failures / 1 control before repair, then 7 new cases passed within a 42-case adjacent selection. Firecrawl: 21 failures / 6 controls before repair, then 83 adjacent cases passed. Combined selection: 125 passed across 8 files; counts overlap and include adjacent coverage. |
| Final native image inputs | 64 passed / zero failures/skips across 4 files. The native file has 23 cases, including 7 final input cases; before that repair it had 5 failures / 18 positive controls. |
| Final integrated suite | 12,346 passed / zero failed / 99 skipped, 12,445 total cases across 950 files (932 passed / 18 skipped), 234.71 seconds; report gate passed. This includes the final native image-input repair. |
| Build and development smoke | Production `npm run build` passed. Default Turbopack/Node-parent startup, health, auth/login/dashboard/settings, temporary key lifecycle and 1,082-model discovery passed without inference. |
| Browser and standalone | 51 browser cases passed without retries, including 3 native Codex image UI cases. Standalone smoke with the native dependency present passed health/auth/dashboard/settings/discovery and synthetic key cleanup. A second production build/runtime passed with `better-sqlite3` physically absent from root/standalone and `node:sqlite` selected; the module was then restored. |
| Read-only final gates | Compatibility, i18n gate, 83-provider and 117-alias baselines, unchanged OAuth URLs, generated identity, brand 1.0.8 and all four installed-dependency inventories passed. The i18n gate does not establish complete translation coverage. |
| CLI package/runtime | Fresh local 1.0.8 candidate install, help/version/install checks and managed native runtime passed. Forced SQL.js verified matching JS/WASM, persistence and restart. The 23,328,917-byte candidate is unpublished; exact SHA-256 is in the receipt. |
| Documentation | Final 18 tests passed / zero failures/skips across 5 suites; static build passed with 109 actual HTML files. |

Focused red/green results, exact evidence filenames and final integrated
checks are tracked in the deep validation receipt. The final full suite passed
on the frozen source, including the last native image-input changes. Production
and documentation builds, development/browser checks, native and absent-native
standalone runtimes, fresh CLI installation and forced SQL.js persistence/restart
also passed. Strict composed lint passed, with strict targeted lint covering the
last DB and native-image edits after the full lint run. Earlier source/artifact
results retain their original scope.

No live provider inference, paid generation, Bun runtime or native Windows/macOS
desktop certification is claimed. A source commit/push, registry publication and
deployment are distinct delivery operations and require their own readback.
