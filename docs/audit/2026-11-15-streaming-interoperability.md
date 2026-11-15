# Streaming interoperability — 15 November 2026

## Scope

Audited source `58664f9` and the matching deployed standalone release against
ByKitsuneV2's native Chat, Messages and Responses consumers. Live samples used
operator-authorized, synthetic requests to configured Router, Griphub and BB
channels; no customer prompts or credentials are included here.

## Repairs

- **Native Claude heartbeat:** `event: ping` now carries `{"type":"ping"}`,
  not `{}`. Strict Messages clients no longer reject the heartbeat while
  waiting for a long-running generation.
- **Chat sentinel compatibility:** generated Chat output followed by `[DONE]`
  can complete without an explicit `finish_reason`. Completion evidence is
  checked per requested choice. Metadata-only streams, usage alone, empty
  sentinels, explicit upstream failures and EOF without a terminal still fail.
  The destination receives one correctly typed terminal sequence.
- **Partial nullable fields:** optional null role/tool fields and nullable
  deltas are normalized without coercing non-null invalid values or altering
  complete message snapshots.
- **Responses final snapshots:** text/refusal snapshots from done and terminal
  events contribute only their unseen suffix. Per-item/content-part ownership
  prevents duplicate final text and keeps equal text in distinct items.
  Streaming and persisted response summaries share the same collector.
  Mixed message/tool terminal snapshots retain native output order.
- **Codex preheader retry:** visible reasoning deltas, reasoning snapshots and
  opaque reasoning evidence stop pre-output retry. A later failure cannot
  silently discard generated reasoning and replay paid work.
- **Sentinel tool integrity:** synthesized completion requires assembled tool
  IDs and names. Orphan arguments and unsupported legacy function fragments
  cannot be silently reported as an ordinary successful answer.

## Deliberately not generalized

Griphub repeats a complete Chat tool ID on successive argument deltas. A
generic gateway cannot infer whether identical bytes are a complete-ID repeat
or a legitimate next ID fragment. Generic Router passthrough therefore keeps
both unchanged. ByKitsuneV2 applies the known full-ID contract only to the
exact configured Griphub origin or operator-declared origins.

Readable reasoning and encrypted reasoning are distinct. A reasoning-enabled
request may return an empty summary; the absence of `reasoning_content` in
that case is not proof the request lost its reasoning settings. Request
translation and Codex default missing summaries to `auto`, while preserving
explicit suppression.

## Verification

Each repair has an observed failing regression and a passing result. The
focused final handoff ran 318 tests across 18 files and strict lint over the
13 task files without warnings or errors. Full-repository gates and deployment
receipts must be recorded separately; this focused result alone is not
production certification.

Relevant regression files:

- `tests/unit/stream-ping-keepalive.test.js`
- `tests/unit/sse-stream-backpressure.test.js`
- `tests/unit/sse-stream-lifecycle.test.js`
- `tests/unit/stream-chat-sentinel-contract.test.js`
- `tests/unit/stream-chat-shape-contract.test.js`
- `tests/unit/stream-chat-tool-id-repeats.test.js`
- `tests/unit/responses-text-snapshot-stream.test.js`
- `tests/unit/codex-sse-peek.test.js`

Existing uncommitted `gitbook/**` removals were not part of this repair.
