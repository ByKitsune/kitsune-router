# Vision, catalog and audit follow-up

Base: `145240272931c14435e400aa7772ef743570d2ab`.

This follow-up preserves Zen's provider-specific transport, native media and
streaming contracts. A provider input-limit error does not by itself prove a
lack of vision support. Context, maximum input and maximum output are separate
facts; neither a model-family name nor a catalog entry proves account access.

## Verified changes

### Client attribution behind a loopback proxy

The custom server used a bare `X-Real-IP` as a fallback, contradicting its
documented rightmost-XFF policy. Real HTTP regression requests demonstrated that
changing this field changed the login lockout bucket. Invalid rightmost XFF
values were also accepted as client identities.

The server now accepts a valid rightmost XFF IP only from a loopback TCP peer.
Otherwise it attributes the request to the socket. It removes the raw fields
and retains `x-zen-via-proxy`, so the fallback does not make proxy requests local.
The loopback reverse proxy must append the actual remote peer to the XFF chain.

Tests: `tests/unit/custom-server-peer-headers.test.js`,
`tests/unit/dashboardGuard-ip-spoof.test.js`, and
`tests/unit/local-request-peer-trust-3294.test.js`: 34 passing cases. The new
regressions first failed against the base behavior. Execution evidence is kept
outside source control under `/tmp/opencode/zen-wave-20261019/peer/`.

### Verification coverage

The old no-regression script accepted empty discovery, failed collection and an
unsuccessful runner if no failed assertion appeared. Seven executable-report
regressions cover complete and inconsistent summaries, skipped cases and
collection/runner failures; all pass after the gate correction. The new
`test:compat` command runs the existing HTTP/2-upgrade CJS test (one passing case).
CI uses both runners, checks generated provider identity and baselines, disables
live/background work, isolates runtime state and uploads the Vitest JSON tagged
with the exact SHA. Local execution of these checks does not claim a future
GitHub run has already completed.

### OpenCode configuration preservation

The dashboard's POST path previously swallowed errors while reading existing
configuration and then replaced the file. Valid comments/trailing commas could
therefore erase unrelated settings. All read/write operations now share the
JSONC helper in `src/shared/utils/opencodeConfig.js`, using the existing confbox
parser and syntax-preserving edits. Model metadata and custom agent fields are
retained. The current legacy configuration shape remains supported; this fix is
not a forced OpenCode V2 schema migration.

An absolute `XDG_CONFIG_HOME` is respected; otherwise the default is
`~/.config/opencode`. Either filename is supported. If both are present, the
route returns a conflict rather than guessing which to overwrite. Malformed,
unreadable and dangling-link files fail without replacement. Writes use a
per-directory queue and atomic staging, retain existing symlinks, and reject
detected external changes. The final check/rename is not a cross-process lock;
operators should still avoid simultaneous external writers.

Regression coverage: `tests/unit/opencode-settings-preservation.test.js`, 42
cases using real disposable files, including concurrent writes, external edits,
comments, escaped strings, permission failures and failed staging. No actual
user configuration is used. Official reference: https://opencode.ai/v2/docs/config.

### Thinking request consistency

Reproductions showed `(0)` could enable reasoning, unsupported effort labels
could reach provider payloads, Claude disabled thinking could be re-enabled,
and native passthrough could drop suffix/provider-default intent. The shared
normalizer now keeps zero disabled, maps only to the resolved endpoint's
declared effort set, and applies explicit overrides on native passthrough.
Claude effort remains independent where the native transport supports that
distinction. Explicit output caps and display/summary choices are preserved.

New tests are `thinking-consistency-mapping.test.js` and
`thinking-native-passthrough-transport.test.js`; the agent's 16-file focused run
passed 344 cases, followed by a separate parent verification. This does not
claim live-provider acceptance. Source snapshots and red/green evidence are
under `/tmp/opencode/zen-wave-20261019/thinking/`; references include the official
OpenAI GPT-6.1 Sol model page, Claude effort documentation, Google thinking guide
and pinned Codex `rust-v0.160.0` model manifest. Public API and subscription/IDE
routes retain different supported effort sets.

### Dated model and pricing review

Full manifest: [catalog-review-20261017.json](data/catalog-review-20261017.json).
The models.dev historical commit is
`22dc88b304dd15ab1c1692794ead3696bc97994d` (October 17, 23:21:55 UTC).
Historical JSON was reconstructed offline from its source tree; 33 broken
upstream symlinks were omitted and recorded, never filled by guesses. Separate
current API captures retain their actual October 18 timestamps and SHA-256.

Coverage includes 120 providers, 1,165 registry rows, 565 reviewed metadata
records and 1,575 lifecycle rows including voices. Exact chat comparisons found
no actionable capability mismatch; 683 unmatched rows and 42 unknown fields
remain explicit. This is not a claim of verified inference or billing on all
providers.

Two pricing defects were reproduced and fixed: Claude's reviewed dotted-version
spellings lost their correct tier/cache quote, and Perplexity Agent's Grok
4.5–4.7 inclusive 200K tier was not charged at the boundary. Regression tests
verify actual calculated costs. Dated Argon promotional rates, 15 OpenAI
scheduled shutdown notices, TTS earliest-shutdown semantics and GPT-4 Turbo's
description were reconciled with primary sources. No model was newly hidden or
deleted merely because models.dev omitted it.

Argon and Opus 5.5 retain their supported 1M-class contexts. Maximum output stays
endpoint-specific; a larger context is not permission for 1M generated tokens.
No prompt trimming or guessed input capacity was introduced to mask overflow.

The parent verification reran 137 tests across 11 files plus provider/alias/OAuth
baselines and generated identity checks. Raw source snapshots, hashes and
red/green logs are under `/tmp/opencode/zen-wave-20261019/catalog/`.

## Documentation reconciliation

Current guidance now distinguishes the published release from newer source,
SQLite state from legacy JSON imports, and native protocol preservation from
universal losslessness. The removed cloud-sync implementation is no longer
described as an active scheduler. Translator guidance identifies the limited
image-strip matrix and remaining expected-failure cases instead of claiming
every catalog model has end-to-end coverage. The API-key form describes local
database storage without claiming encryption at rest.

## Publication

These are source changes and local verification, not a new published 0.9.11
artifact. The task's commits stay local pending final verification and a later
push instruction.
