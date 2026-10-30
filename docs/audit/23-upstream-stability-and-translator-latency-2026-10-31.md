# Stability and translator latency follow-up — 2026-10-31

Review date uses Asia/Jakarta. Fork base: `81765193a491a262e6aabaaa2aa27198a68e35bf`.
This follow-up adapts verified defects to the current fork; it does not replace
immutable releases, claim live-provider acceptance, or publish/deploy artifacts.

## GitHub and upstream review scope

Fetched `decolua/9router` master is still
`1fe586bb1cf35e1ed0cb2150a8ef7d1db040b21d`, dated 2026-10-28. It is the same
tip recorded by audits 21/22. Reviewed the newest **55 commit records** and
selected actual diffs against current code; absence from Git ancestry does not
mean behavior is missing from this independently adapted fork.

The issue review uses **actual issues, excluding pull requests**: the first 25
results sorted by creation and first 25 sorted by update yielded **37 unique
issues**. Their issue pages and initially loaded comments were captured through
the normal GitHub website. Issue #5128 exposes 26 of 31 comments at capture;
this is not a claim to have read every paginated comment or every repository
issue. The newest captured issue is #5345, created 2026-10-30T15:36:47Z.
The public issue search on `ByKitsune/kitsune-router` returned zero results at
capture. No external issue comments or state were changed.

[Metadata and all dispositions](data/9router-stability-inventory-20261031.json)
contain the 37 issues and 55 commit records, exact URLs/SHAs/dates, and reasons
for adapting, retaining, or excluding a change. Raw issue bodies remain outside
the repository. API-host access was denied by environment policy; the normal
allowed GitHub website was used without extracting credentials or bypassing
the session proxy/TLS verification.

## Confirmed corrections

### Empty streamed tool placeholders — issue #5345

The [latest report](https://github.com/decolua/9router/issues/5345) reproduces
against the current real SSE pipeline: index-only or null Chat tool deltas can
reach strict clients, or create a phantom pending native tool before a real
opener. `open-sse/utils/stream.js` now removes only semantically empty canonical
tool entries before translator-state creation and Chat output framing.

Valid partial IDs/names/arguments, explicitly empty arguments on a real opener,
opaque tool metadata, sibling text, usage and native terminal events survive.
The change adds no whole-stream buffering or global tool state. Nine new
consumer cases supplement existing Chat/Messages/Gemini/Responses stream tests.
Initial red reproduction was seven failures and one passing case; the completed
new suite has nine passing cases. This does not establish live OpenCode account
availability or justify replaying a partially consumed paid request.

### Native Haiku adaptive thinking — upstream `0ad0a722`

Adapted [upstream's native passthrough correction](https://github.com/decolua/9router/commit/0ad0a722b87ce6adcd0d2dbbcb696bdd2f129cd5)
using this fork's exact provider/model capabilities. `chatCore` supplies the
destination provider to `normalizeClaudePassthrough`; reviewed native Anthropic
Haiku 5.5 keeps adaptive thinking, display, effort and explicit output caps.
Legacy/unverified Haiku routes retain their previous bounded normalization.

The original fixture had two failing cases; the adapted path and adjacent
thinking suites pass. This is distinct from
[#5332](https://github.com/decolua/9router/issues/5332): adding a public Anthropic
model does not grant a Claude OAuth subscription access to it. No unsupported
OAuth model was advertised or future/reseller capability guessed.

### Observability saved/effective state — issue #5285

The [reported mismatch](https://github.com/decolua/9router/issues/5285) has two
local causes: Profile displayed the saved preference instead of the effective
environment-controlled state, and its generic settings PATCH silently dropped
the protected field while the UI optimistically reported success.

One shared resolver preserves the existing precedence:
`OBSERVABILITY_ENABLED`, then `ENABLE_REQUEST_LOGS`, then saved settings. APIs
return a nonsecret source enum. Profile shows the effective switch, names an
environment override, retains the saved preference and reports failed writes.

A narrow JSON/Boolean-only `/api/settings/observability` PATCH now saves that
preference with an actual dashboard JWT or installation CLI proof, including
when ordinary dashboard viewing does not require login. Generic mass-assignment
protection and environment precedence remain intact. Tests include auth,
validation, actual Profile rendering and a private SQLite roundtrip.

### Launcher drain and isolated browser builds

Launcher cleanup previously sent SIGKILL and exited successfully before the
server's asynchronous durable-usage/database drain. A real spawned-child fixture
reproduced the missing drain marker. `cli/hooks/serverShutdown.js` now waits for
the owned server with bounded escalation; the launcher cancels queued restarts
and waits before replacing a background instance. The bind host is retained.

Windows uses the launcher's private IPC channel because Node's Windows SIGTERM
does not run catchable shutdown hooks. Disconnect and the existing signals reach
the same managed shutdown path. No HTTP shutdown authorization was weakened.
Native Windows/macOS behavior remains unverified; POSIX subprocess tests and
IPC simulations do not certify those platforms.

The browser fixture previously rejected an existing `.next-cli-build` output.
It now honors `NEXT_DIST_DIR` and nested standalone tracing while refusing
outside/symlink-escaping output and embedded `.env` files. Its private synthetic
HOME/DATA_DIR/environment setup is retained.

### Localization and current documentation

Registered and translated the five missing ByKitsune literals plus its dynamic
website accessibility label. A real-dictionary regression preserves names/URLs
while switching Indonesian back to English. Current marketing and 21 public
localized documentation entrypoints now explain the source-only official
provider integration; historical artifact evidence is unchanged.

The observability UI's new source/status/error labels also have English
registration and Indonesian translations. `check:i18n` is part of final gates.

## Measured translator CPU work

Two quadratic operations dominated long parallel-tool histories:

- `fixMissingToolResponses` repeatedly split and scanned pending tool IDs.
  Raw-ID FIFO index queues now match each occurrence once, preserving signed
  and repeated IDs and first-match order.
- Claude `fixToolUseOrdering` repeatedly filtered/copied the accumulated
  same-role content. Each run is now partitioned once, preserving result and
  non-result ordering, typed media and borrowed input ownership.

Deterministic regression tests bound actual ID/block work rather than use flaky
wall-clock limits. The old 2,048-call fixture performed about 4.19 million ID
decodes/block reads; the corrected work remains linear. The old-source tests
had two failures and five passes; the corrected suite has seven passes.

The reusable `scripts/benchmark-translator.mjs` compares reviewed original
tool-history modules through process-local load hooks, without checkout/reset.
It forbids network requests and stubs usage persistence. Four runs used Node
24.19.0, 400 parallel tools with typed images, 60 warmed translation samples and
30 request-preparation/first-semantic-event samples per fixture. Input and
serialized wire-output hashes match across all four runs and all 12 fixtures.

| Long-history route | Translation p50 before (ms) | After (ms) | Preparation to first semantic event before (ms) | After (ms) |
| --- | ---: | ---: | ---: | ---: |
| Chat → Claude | 22.70–26.70 | 1.56–1.68 | 23.40–29.69 | 2.23–2.35 |
| Claude → Chat | 21.39–21.57 | 1.06–1.47 | 21.79–21.98 | 1.73–1.80 |
| Chat → Gemini | 27.04–27.30 | 8.41–8.73 | 28.34–33.61 | 10.65–11.48 |
| Chat → Responses | 20.66–21.48 | 0.90–0.96 | 22.30–24.72 | 1.86–2.09 |
| Gemini → Chat | 1.28–1.30 | 1.31–1.37 | 1.87–2.01 | 1.88–2.10 |
| Responses → Claude | 2.49–3.08 | 1.14–2.10 | 3.06–3.51 | 2.68–3.06 |

[Matched-run data, p95 and exact commands](data/translator-latency-20261031.json)
retain per-run variation. Normal chat p50 remains below 0.06 ms; those tiny
differences and Gemini→Chat do not show a general speedup. These are **local CPU
measurements**, excluding provider/network TTFT, account selection and durable
accounting. They cannot establish a production response-time multiplier.

## Items deliberately not copied

- [#5307](https://github.com/decolua/9router/issues/5307) and
  [#4248](https://github.com/decolua/9router/issues/4248): source defaults can
  spend `60s × 4 + 3s × 3 = 249s` across connect failures/retries per URL.
  This is separate from the existing 150 ms combo peek and translator CPU.
  No default deadline/retry-policy change was silently applied: whole-attempt
  budgets, first-token failover and combo affinity need explicit cross-account,
  cancellation and already-incurred-usage semantics. Caller abort remains terminal.
- [#5334](https://github.com/decolua/9router/issues/5334): the reported 120-second
  cutoff targets an upstream-only wreq/TLS helper absent from this fork. Current
  BaseExecutor clears its header timer after headers; no matching fixed 120s
  streaming cutoff was reproduced.
- OpenCode fingerprint/native-package commits are coupled transport additions,
  not standalone translator fixes. They may rewrite caller tool safety/schema
  contracts and require supported proxy/packaging/account acceptance evidence.
  No TLS verification bypass or direct-egress fallback was introduced.
- New providers, model-ID tier syntax, rerank, account brokers and routing/affinity
  features remain separate designs. Existing stronger tool-ID/native terminal,
  numeric-schema, context-error and progressive Codex fixtures were retained.

## Validation record

The first full run exposed portable-fixture assumptions: synthetic collision
files inherited the host's `umask 0077`, and three fake/loopback transport suites
inherited host proxy dispatchers. Fixtures now set the permissions/proxy state
they intend to test and restore it afterward. Production backup/proxy policy and
all security assertions remain intact. Backup/path suites pass with both 0077
and 0022; transport fixtures pass alongside strict-proxy tests.

The ByKitsune golden-URL snapshot was missing after the prior provider addition;
its single reviewed addition records the same official chat URL for streamed
and nonstreamed requests. Existing snapshots were not rewritten.

Final checks on the completed source:

- Full CI-mode Vitest: **9,996 passed, 100 skipped, zero failures across 799
  files**. The strict JSON report validator passed. Live/paid-provider tests
  stayed disabled; snapshots were not updated during this final run.
- Composed Oxlint/ESLint with `--max-warnings=0`, UI i18n registration,
  provider/alias/OAuth baselines, generated provider identity, brand identity,
  installed dependency checks and `git diff --check` passed.
- Documentation tests: **18 passed**. CJS HTTP/2 compatibility: **one passed**.
- Application production build and standalone asset copying completed using
  `.next-cli-build` and private synthetic runtime state. GitBook's production
  static export completed. Its first sandboxed Turbopack attempt could not bind
  an internal port; a clean retry with local process access passed.
- Production Playwright with system Chromium: **16 passed**, including mobile
  Indonesian ByKitsune setup and observability save/reload behavior.
- Separate production HTTP/Chromium smoke verified real JWT authentication,
  unauthenticated write rejection, narrow persistence, generic protected-field
  refusal, persistence after restart, an effective environment override and
  successful managed shutdown of both owned server instances.
- CLI package dry-run manifest includes the new shutdown helper; no package
  archive, release or deployment was published. Independent final diff review
  found no actionable introduced defect.

These results cover local Linux production fixtures and synthetic protocol
traffic. They do not certify native Windows/macOS, paid inference, provider
network latency or the deferred connect-retry policy described above.
