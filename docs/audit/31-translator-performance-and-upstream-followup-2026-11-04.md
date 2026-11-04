# Translator performance and upstream follow-up — 2026-11-04

Review date uses Asia/Jakarta. Baseline:
`d598b149f965e026c1de2dace79f17a4232feac7`.
This follow-up reduces measured translation CPU/allocation work while preserving
request ownership, opaque signed history, tool identity, media, reasoning controls,
stream progress and terminal usage. It does not change provider latency, paid
service tiers or account entitlement.

## Measured request preparation

The profiling baseline already includes the October 31 linear tool-history
corrections. New profiles identify remaining work rather than reapplying those
patches:

- Plain-text tool results repeatedly entered `JSON.parse` and constructed
  `SyntaxError`s. A lexical first-character check now bypasses impossible JSON;
  plausible values still use the native parser. Only the four JSON whitespace
  bytes are skipped. Strings, numbers, negative zero, Unicode, caller fallback
  identity and non-string passthrough retain their original semantics.
- Google `allOf.required` merging repeatedly searched a growing array. A local
  `Set` handles membership while the existing array preserves first appearance,
  original values and the separate top-level concatenation behavior. Property
  merging was already incremental; the entire schema cleaner is not claimed
  to be linear or rewritten.
- Google native history repeatedly scanned/spliced pending calls, and restarted
  generated-ID suffix searches. Request-local FIFO indexes plus per-base suffix
  cursors preserve ID precedence, first-match order, cross-index consumption,
  future explicit-ID reservations and opaque signatures. Two deterministic
  regressions reproduce millions of operations at 2,048 calls before the change;
  the new work bounds are linear. A further [2,000 seeded equivalence cases](data/gemini-history-equivalence-20261104.json)
  retain all mappings, including malformed-key compatibility.
- OAuth Claude tool aliasing performed another complete body copy after the
  borrowed-input boundary had already created a private attempt. The alias pass
  now retains that private graph. Tests cover frozen borrowed history, owned
  payload identity, concurrent account attempts, nested schemas/results/media,
  Symbols, alias maps, generated-budget provenance and signed/redacted blocks.

The reusable `scripts/benchmark-translator.mjs --baseline-scope engine` loads a
coherent pre-change `open-sse` snapshot through process-local module hooks. Its
older `history` scope remains available for reproducing the earlier audit.
No checkout/reset or provider calls are involved. Persistence is stubbed and
network requests are forbidden.

Four balanced runs use baseline/current/current/baseline order, 80 warmed
translation samples, 30 request/serialization/first-semantic-event samples and
1,000 parallel calls with typed media. All **16 input fixtures, serialized output
hashes and tool-alias hashes match** across all four runs.

| Long-history route | Before p50 (ms), two runs | After p50 (ms), two runs |
| --- | ---: | ---: |
| chat-to-claude | 3.08–3.08 | 3.24–3.34 |
| claude-to-chat | 1.55–1.57 | 1.54–1.69 |
| chat-to-gemini | 14.16–14.51 | 3.13–3.23 |
| gemini-to-chat | 2.78–2.94 | 2.88–3.07 |
| chat-to-responses | 2.35–2.36 | 2.43–2.56 |
| responses-to-claude | 2.65–2.77 | 2.82–3.06 |
| claude-oauth | 1.92–1.94 | 1.57–1.62 |
| gemini-id-free-to-chat | 72.93–77.32 | 4.21–4.24 |

[Full matched data, p95, source snapshot paths and hashes](data/translator-request-performance-20261104.json)
retain the controls as well as improvements. Gains concentrate on Google
plain-text-heavy history, ID-free Google calls and OAuth aliasing. Other routes
have no demonstrated speedup and some medians move modestly upward; normal-chat
p50 stays below 0.054 ms in this study. These are local CPU measurements,
including a synthetic already-available upstream event where indicated, not a
production/provider/network TTFT multiplier.

## Streaming work

The SSE parser searches for delimiters in bulk while retaining a tiny-fragment
path, per-parser scanner state, lazy generator delivery, CR/LF handling, UTF-8
fragment support and the existing event-size limits. It does not scan/buffer an
entire response before emitting the first semantic event.

The disconnect/keepalive wrapper inspects the short ASCII framing suffix as bytes
rather than decoding the full output chunk just to test its final characters.
Large native opaque payloads remain byte-for-byte intact.

Chat-to-Claude lowering tracks only pending tool openers and active argument
deltas, instead of scanning every previously opened tool for each fragment.
Block order, incomplete-name blocking, opaque IDs, `Read` argument sanitation,
interleaved text/thinking, usage trailers and native terminal events retain their
existing behavior. Tool state remains private to each stream.

`scripts/benchmark-translator-stream.mjs` reproduces four balanced runs with
21 workloads and 128 parallel tools. All **21 fixture, output and accounting
hashes match** across all runs, after narrowly documented protocol timestamp
normalization. Tool-argument/application timestamps, signatures and native
opaque payloads are not normalized away.

| Streaming workload | Before p50 (ms), two runs | After p50 (ms), two runs |
| --- | ---: | ---: |
| parser/argument/65536 | 3.912–4.069 | 1.262–1.295 |
| parser/huge-event/65536 | 5.823–5.883 | 0.592–0.604 |
| response/parallel-tools/claude | 23.512–24.368 | 5.065–5.261 |
| pipeline/parallel-tools/claude/4096 | 89.061–90.909 | 60.998–64.788 |
| boundary/large-utf8/1048576 | 1.794–2.000 | 0.047–0.070 |

[Complete streaming data, p95, first-semantic timing and source hashes](data/translator-stream-performance-20261104.json)
include byte-fragment and native controls. Those controls are flat/noisy and some
medians increase; the gains above are workload-specific. The complete SSE tool
pipeline improves less than its isolated Claude lowering stage. Timing and
allocation profiles do not certify provider/network latency or retained-memory
bounds.

## Current upstream review

The requested local `upstream` remote points to
`https://github.com/decolua/9router.git`. Fetch confirms master is still
`1fe586bb1cf35e1ed0cb2150a8ef7d1db040b21d` (2026-10-28).

[The fresh inventory](data/9router-translator-followup-20261104.json) indexes
**101 actual issues**, combining the newest 100 creation-sorted issues with
updated issues since the prior capture. PR records are counted separately.
Selected issue bodies, comments, four PR implementations and four older commit
diffs were checked against current Kitsune behavior. This is not an exhaustive
new history crawl or a claim that every report was reproduced.

- [#5443](https://github.com/decolua/9router/issues/5443): reproduced and repaired.
  A nested runtime dependency install inherited global npm mode/prefix during
  CLI postinstall; `cwd` alone did not force a local install. The child now gets
  explicit project/local destination selectors. Parent environment and
  proxy/TLS/registry-auth/userconfig bindings remain unchanged. Paths with spaces
  stay outside new shell-parsed arguments. Real offline controls with npm 11.9
  and 11.17 prove the original wrong-prefix behavior and corrected local target.
  Native SQLite version pins and dependency locks are unchanged.
  [Repair evidence](data/cli-runtime-local-repair-20261104.json).
- [#2239](https://github.com/decolua/9router/issues/2239) /
  [PR #5442](https://github.com/decolua/9router/pull/5442): Jina/Tavily format
  intent is now sent to the provider rather than only copied into the response
  label. Official Jina source accepts `X-Return-Format` as the alias of
  `X-Respond-With`; Tavily Extract supports body `format: markdown|text`.
  Shared provider-scoped validation rejects unsupported formats with HTTP 400,
  `param: format` and `x-should-retry: false` before credentials/refresh/account
  fallback. Proxy, SSRF and transport policy are retained. Verification uses
  real handlers and synthetic transports, not paid provider requests.
  [Official contracts, wire examples and verification](data/web-fetch-format-fidelity-20261104.json).
- [PR #5441](https://github.com/decolua/9router/pull/5441): payload-less SSE frames
  are already excluded by the current parser. Byte-fragmented replays preserve
  tool arguments, UTF-8, terminal events and exact usage; no duplicate patch.
- PR #5444's combo output-cap minimum and #4776's tool strictness proposal were
  compared with current behavior. Kitsune already preserves the stricter minimum
  and explicit true/false/omitted strict intent; blindly importing those patches
  would add no benefit or overwrite caller intent.
- #5445's automatic model-exposure premise differs from this fork's explicit
  custom declarations. A new allowlist policy is a separate feature. The
  retained custom catalog/identity design gap (#5421), private OpenCode quota
  claims and MITM latency reports are not certified fixed by translator CPU
  measurements.

## Verification boundary

[Final local verification evidence](data/translator-verification-20261104.json)
records **10,934 passed tests, 99 explicitly gated skips, zero failed suites**
across 859 files. The strict baseline gate passes; the complete default reporter
log has zero Vitest stderr sections and zero Node warning lines.

Production dashboard browser tests pass **32/32**, documentation tests **18/18**,
and whole-repository lint passes with `--max-warnings=0`. Branding, i18n, generated
provider identity, provider/alias/OAuth baselines and HTTP/2 compatibility pass.
The production application and unpublished CLI build succeed. Both packaged
runtime-helper copies match source, compiled standalone bundles contain the new
translator/format paths, and packed SQL.js JS/WASM fallback, persistence and
restart pass. The translator itself is compiled in Webpack server chunks, not
shipped as separate raw engine-source archive members.

Per-file source hashes, report/log hashes, artifact checksums and benchmark
controls are retained. Actions creates separate exact-commit verification and
candidate evidence after push. Live/provider-account tests remain opt-in;
no upstream credentials or private catalogs are available in this environment.
POSIX npm fixture execution and simulated Windows argv/environment contracts do
not certify native Windows/macOS installation. No release, package publication,
image publication, deployment or provider ban guarantee is part of this work.
