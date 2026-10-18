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

## Publication

These are source changes and local verification, not a new published 0.9.11
artifact. The task's commits stay local pending final verification and a later
push instruction.
