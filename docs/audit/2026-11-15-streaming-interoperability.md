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

## Final-source verification

The final code revision is `3d2b4206524ab390e60b65b21466fefce991c46d`.
[CI run 43711271934](https://github.com/ByKitsune/kitsune-router/actions/runs/43711271934)
completed successfully for that exact revision:

- Full unit report: **11,389 passed**, zero failed, **99 skipped** across
  891 discovered files. Those skips remain explicit; this is not a
  zero-exclusion certification.
- Production dashboard browser checks: **45 passed**.
- Separate synthetic Usage browser regression file: **19 passed**.
- Strict full-root lint: zero warnings and errors. Dependency-security and
  documentation jobs passed. Optional package publication was not requested
  and its job was skipped.
- Local final streaming regression report: **152 passed** across 11 files,
  zero failures or skips. Cross-Router captured-stream replays passed.

The downloaded CI report is bound to the exact source revision by the
`source.json` SHA-256 receipt under
`/root/bykitsune-build/streaming-20261115/router-ci-artifact/`.

Earlier builds using a symlinked dependency tree were rejected after Next's
trace warnings and a postbuild self-copy failure. They are not release
artifacts. Production packaging uses the independent disk-backed candidate
and `.next-stream-final`, with production Node 24.19.0.

## Production deployment

At **19:06:23 WIB on 15 November 2026**, Router code `3d2b4206` was
activated from `/opt/kitsune-router/1.0.8-source-3d2b4206524a/app`;
the new process is PID `360543`. Both this Router and ByKitsuneV2 code
`1d33819` are live.

The production build completed without warnings. All 2,367 packaged source
files were checked against the final commit, the 3,325-file release tree
was hashed, and runtime dependencies resolve locally without relying on
the previous application release.

A private-loopback rehearsal ran the real production entrypoint on Node
24.19.0, retained the production `NODE_PATH`, rejected old-release dependency
resolution, verified protected database projections, and booted old code
against the state left by the candidate. Both processes shut down cleanly.

Activation blocked new connections to ports 20128/20129, waited for zero
requests, upstream work, background queue depth and non-control connections,
then changed only `WorkingDirectory` and the `ExecStart` application path.
Environment directives, settings, aliases, combos, prices and API keys
were unchanged. Temporary admission rules were removed. The compatibility
socket and unrelated scheduled ByKitsune backup were left running.

The verified complete Router snapshot remains at
`/var/backups/kitsune-router/pre-upstream-streaming-20261115/data.sqlite`
(SHA-256 `3b2292966a29504cad84f7f08d7c941c58c9e715ca2d9f3194d8d174fa9fc0c4`).
Release receipts and rollback selection are retained under
`/root/bykitsune-build/streaming-20261115/`. No live database was restored
and no historical billing records were rewritten.

After both deployments, six fresh direct upstream probes and three isolated
gateway probes using the deployed ByKitsune modules returned HTTP 200 with
successful terminals. The gateway probes retained upstream usage on Router
Responses, Griphub Messages and BB Chat. The nontrivial Router request
produced a readable reasoning summary; Griphub returned an empty thinking
delta plus a nonempty opaque signature, both retained. No readable Griphub
thinking text was observed. Direct Router and Griphub tool calls were present.
A request can legitimately return no reasoning text.
Local/public application readiness, Router health and sampled pinned CDN
assets also passed. Post-deployment Router logs contained no startup,
dependency-resolution or unhandled-rejection errors.
