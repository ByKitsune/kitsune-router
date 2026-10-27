# October consistency and selective upstream reconciliation

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Source review date: **2026-10-21**. Starting Zen source:
`e5d816b4224e64ae4ecdf2fd16b5dc1b2b454754`, based on published 0.9.13 plus
unreleased source changes. The candidate remains unreleased until an explicit
publication; local source, GitHub master, npm/Docker artifacts and production
are separate states.

## Scope and upstream provenance

The public 9Router HEAD rechecked on October 21 was still
`87a74e1bda3677193c6f71a7e2100c90311f0689` (0.5.104), unchanged from the previous
Antigravity audit. The new survey enumerated **84 October commits** and **788
unique recently updated issues/PRs**. Selected diffs and source were expanded;
this is not a review of every discussion or proof that every feature is live.

| Gap | Immutable upstream source | Zen adaptation boundary |
| --- | --- | --- |
| Anthropic API-key Claude Code beta | [#4752](https://github.com/decolua/9router/pull/4752), `8e93b98f87e3922b60b903895315b2c3ccdaee00` | Correct native API-key defaults; preserve OAuth identity and supported beta controls. |
| Readable reasoning aliases | [#4870](https://github.com/decolua/9router/pull/4870), `6a9775e6097fc81c7a9a1986a2c055ee6d0573b5`; [#4881](https://github.com/decolua/9router/pull/4881), `8b0ab9a5a3eb68e8797d8b9d404704ceb54c9e13` | Reconcile real Chat carriers without deleting native Responses configuration or silently resolving conflicting data. |
| Kimi deferred tool definitions | [#4612](https://github.com/decolua/9router/pull/4612), `d41355f573372e9814451e51685252c80b023def` | Preserve actual declarations, names, typed history and explicit caps. Native Claude is not generalized to Kimi's dialect. |
| Vertex API-key project/location | [`9c1419100c2c3db083e850f9572968d942fac7f9`](https://github.com/decolua/9router/commit/9c1419100c2c3db083e850f9572968d942fac7f9) | Honor configured project/location without allowing path/query/host injection. |
| CLI custom-prefix grouping | [#4869](https://github.com/decolua/9router/pull/4869), `23c50f5a3e61a75b2f9d9c90c48e2e1b9088ca54` | Use owned dictionary entries for accepted names such as `constructor`; do not ban working operator prefixes. |
| CLI truncated response | [#4871](https://github.com/decolua/9router/pull/4871), `68f48f4b557287103fe17672a95023ce0a4521f4` | Settle once on incoming response failure; retain existing auth and timeout. |
| Compressed Codex request body | [#5019](https://github.com/decolua/9router/pull/5019), `860081386ed8eb92f37241aca05f1d810ec5c10c` | Authentication and bounded wire/decoded size, deadline and cancellation precede expensive decoding. No unbounded 100MB port. |
| Empty nonterminal Chat finish reason | [#4926](https://github.com/decolua/9router/pull/4926) | Normalize only `""` to `null` on Chat emission; retain existing terminal, usage and DONE deduplication. |

PR references above were open/unmerged at capture. Existing Claude terminal-cache
accounting and tool-name restoration were not duplicated. Insecure TLS,
configured-proxy direct replay, lossy schema walkers and unsafe tool-ID synthesis
remain rejected. Unverified provider identity/model entitlement changes are not
valid substitutes for credential-redacted native evidence.

## Pricing diagnosis and policy

Read-only production aggregation established distinct causes; it did not copy
provider credentials or mutate stored costs:

1. Standard Codex Astra/Sol requests already resolve to numeric reference
   estimates. Three sampled historical records returned actual `service_tier:
   "auto"`; this is selection policy, not a delivered tariff identity. One
   unpriced record correctly makes a complete group total unknown.
2. The operator's TokenHarbor is a custom-compatible node. MiMo's literal free
   ID missed pricing, while the DeepSeek free ID inherited a paid family glob.
3. The two-decimal display made positive sub-cent charges look identical to
   genuine free zeroes.

### Exact free routes

[MiMo free](https://tokenharbor.ai/models/mimo-v2.6-flash:free) and
[DeepSeek free](https://tokenharbor.ai/models/deepseek-v4.1-flash:free) both state
“Free-tier only; uses the free allowance and is never billed.” Quotes apply to
the exact `https://tokenharbor.ai` origin and exact IDs, not names, prefixes,
lookalike hosts, unrelated namespaces or every model ending `:free`.

Whole-route zero is based on the never-billed contract, not an invented cache
capability. Limits/availability of the promotional allowance remain upstream
concerns. Exact saved operator rates, including explicit `null` or zero, win.

### Delivered speed and cache lifetimes

Native public OpenAI rates come from the dated
[pricing table](https://developers.openai.com/api/docs/pricing.md),
[Fast](https://developers.openai.com/api/docs/guides/fast-mode.md) and
[Ultrafast](https://developers.openai.com/api/docs/guides/ultrafast-mode.md)
guides. Short context includes exactly 272,000 input tokens; higher long-context
rates apply to the whole request above that threshold.

`service_tiers` in local pricing stores complete independent Fast/Ultrafast/Flex
quotes; it is not a reasoning setting. Actual `default` after a premium request
uses Standard. Actual `priority` aliases Fast. Actual `auto`, missing premium
delivery and unquoted contract tiers remain unknown. A partial premium tariff
does not inherit a Standard cache rate.

Native OpenAI `cache_write_tokens` and its `ttl_30m_tokens`/`ttl_12h_tokens`
subsets remain separate from Anthropic creation/5m/1h counters. Inclusive input
is not folded twice. Unknown lifetimes and malformed/inconsistent splits must
not be presented as a verified cheaper write. See the
[prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching.md).

Codex [subscription speed multipliers](https://developers.openai.com/codex/agent-configuration/speed.md)
and [credits](https://learn.chatgpt.com/docs/pricing.md) do not establish public
API dollar invoices. The public API's premium quotes are not automatically
applied to subscription or arbitrary reseller routes. Saved operator tariffs
are local estimates, not authoritative charges or entitlement grants.

### Historical cost coverage

Existing recorded totals are not rewritten when tariffs change. New
`costCoverage` accompanies nullable totals on live/daily groups and records
`{knownCost, unknownRequests}` for total/input/cache/output components. The UI
may show a **known subtotal**, clearly labeled with unpriced requests; it must
not replace the unknown complete total with that subtotal. Old null daily
snapshots without underlying coverage remain indeterminate rather than being
reconstructed from current prices. Positive sub-cent values display `<$0.01`;
actual zero stays `$0.00`.

## Security, transport and persistence

- Process-capable Headroom routes use the existing local-only/CLI boundary.
- Trusted MITM enabled state persists without making it mass-assignable through
  the generic settings API. Disabled-model maps round-trip configuration export
  and import; older exports omitting the map remain compatible.
- Private SQLite paths and replacement/backup files must not truncate existing
  state or follow attacker-created symlinks. POSIX permissions are not Windows
  ACL enforcement and are not encryption at rest.
- New saved MITM passwords use a random installation key and `v2:` authenticated
  ciphertext. Legacy reads remain compatible and do not rewrite settings. Back
  up `${DATA_DIR}/auth/mitm-password.key` with the matching database; config-only
  export does not carry that key. Missing/corrupt v2 keys cannot be replaced by
  a machine-ID or fixed-salt fallback.
- Account proxy/relay policy, ordinary-Error cancellation and response-body
  lifetime are carried through the repaired request/refresh paths. Inference
  limiter parity shares the existing hashed logical-request budget; retries do
  not consume a second inbound request.
- Fusion owns per-panel cancellation. Grace/hard deadlines cover complete panel
  bodies, not just headers. A discarded attempt does not stay attached to the
  judge; no claim is made that local cancellation proves upstream billing stopped.
- Standalone runtime probes additionally reproduced a Codex compact URL selected
  from the previous request's mutable executor flag and an Ollama adapter that
  discarded non-streaming JSON, reset error statuses and duplicated terminals.
  Compact URL identity is now request-local across retries; the Ollama boundary
  handles supported JSON/SSE explicitly and preserves errors/headers rather than
  returning an empty successful completion. Unsupported media/tools fail
  explicitly instead of inventing destination payloads.
- Failure metrics count emitted terminal routed-attempt failures using bounded
  process-lifetime status buckets. Fallback can emit several events per client
  request, early unlogged failures are not inferred, and process restart resets
  the counters. Existing rolling 24h usage/TTFT exports are gauges despite legacy
  names ending `_total`; do not apply counter `rate()` to them.

## Publication and verification boundaries

Shared executable source gates validate full Vitest JSON, compatibility,
identity/provider/alias/OAuth baselines, lint and application build. Each
publisher still validates exact stable tag/ref/SHA and all four package/lock
versions. Build/test state uses disposable HOME/DATA_DIR before dependency
lifecycle scripts. Source evidence is bound to SHA and report hash.

Npm retains the original tarball and fails closed if a published version cannot
be matched to a trusted original. Docker reconciles immutable version digests,
builds exact source and checks attached provenance/SBOM before digest-based
latest promotion. Historical/partial conflicting publications require explicit
operator recovery; they are not rebuilt or overwritten to manufacture evidence.
Subprocess timeouts are distinct from a registry 404.

The four package versions remain **0.9.13** with this work under **Unreleased**.
No release, registry publication, main-branch push or production restart follows
automatically from local verification. A feature-branch push alone does not
trigger the current CI branch filter; inspect the exact intended run/SHA/jobs.

## Remaining evidence requirements

- Native account/project entitlement, Argon/Claude model-ID acceptance, delivered
  speed and actual invoices require the relevant upstream account evidence.
- The deployed cause of HTTP 524 is not established by these local fixes. A
  transport ping after upstream headers is not a whole-request deadline or a
  demonstrated cure.
- Provider credentials and authorized full exports remain sensitive. Filesystem
  hardening and response redaction are not database/disk encryption. Protect the
  host and backups; do not copy real credentials into tests or research artifacts.
- This review is not an exhaustive proof of security, all historical model facts,
  every provider's live availability, native tray integration or every OS/runtime.

## Verification record

RED/GREEN tests and dated source captures are retained outside the repository
under `/tmp/opencode/zenrouter-reconciliation-*`. The frozen implementation's
Node 22 and Node 24 full runs each recorded **7,526 ordinary passing cases, 100 opt-in skips and
zero failed cases/suites across 657 result files**. The three former translator
expected failures are no longer counted as verified-working expected failures:
their replacements assert actual supported behavior or an explicit unsupported
contract. Focused counts overlap and are never summed as independent coverage.

The isolated standalone build, GitBook build and unpublished CLI pack returned
exit zero. The packed tarball contains no generated runtime DB, installation
key, `.env`, secret file or build HOME. Actual extracted-package HTTP probes
passed **57 checks**. The standalone HTTP/browser run passed **64 checks**,
including JSON/SSE/compact/Ollama, catalog/preflight/negative-media boundaries,
known-subtotal rendering, premium-tariff zero Save/readback and mobile layout,
without browser page errors. Bun 1.4.3 passed the same **57 nonbrowser runtime
checks** with its native SQLite driver. These modality validation checks are not
claims of positive live image/audio/video provider acceptance.

The first full Node 22 run exposed one test that incorrectly required upstream
pipe cancellation to occur synchronously before `reader.cancel()` settled.
An actual-runtime probe confirmed cancellation on the next task; the regression
now requires prompt cancellation within a bounded wait while retaining its exact
once-only assertion. The subsequent complete Node 22 run passed after that
correction; the earlier red run is retained rather than erased or reported as
green. The final proxy-clear regressions also preserve supported IPv4/IPv6
host:port values and reject a display-only invalid marker before storage writes.

Four fresh lockfile audits reported zero advisories. Composed lint,
compatibility, identity/provider/alias/OAuth baselines, the unchanged 0.9.13
version guard and workflow syntax checks passed. The provider snapshot changes
only the reviewed native Anthropic API-key beta header, not the OAuth identity.

Production smoke was deliberately separate: all 21 unauthenticated `/v1` route
probes returned 401, and three small Standard Codex requests returned HTTP 200
with nonempty expected answers through Chat, Responses and Messages. No service
restart or account configuration change accompanied those probes. They validate
the previously deployed source, not deployment of this source batch.

Publication and new-commit remote CI verification remain separate from local
outcomes. No CI success for an unpublished local commit is implied by prior
master runs or by local release-helper fixtures.
