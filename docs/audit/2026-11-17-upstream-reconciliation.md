# Upstream source and actual-issue reconciliation — 2026-11-17

This is Unreleased Kitsune source work. Application/CLI/test/docs versions remain
**1.0.8**. It does not rewrite published artifacts, historical receipts, tags,
provider identities or credentials. The earlier
[dependency/runtime audit](2026-11-17-dependency-runtime-audit.md) records a
separate validation phase; its passing results are not proof for changes made
afterward.

## Refs and comparison boundary

| Item | Observed value |
| --- | --- |
| Kitsune base HEAD | `2ba52e092acf606fef08df6f4dc96f4933af4dad` |
| Upstream repository | `https://github.com/decolua/9router` |
| Fetched upstream master | `1855aa44473e88feac9d3f131b9c0c5fc9706b68` |
| Common ancestor | `699edac3273e13d4744bc46f6082618f08560702` |
| Divergence before this work | 644 Kitsune-only commits / 476 upstream-only commits |
| Local tracking branch | `refs/heads/upstream` tracks `refs/remotes/upstream/master` |

The `upstream` remote and tracking branch were configured without resetting or
replacing the existing checkout/work. The source comparison used fetched refs;
there was no blanket `git pull`, mass cherry-pick, PR merge or history rewrite.
Use full ref names when the branch/remote's shared name makes a short ref
ambiguous. An upstream-only commit is not automatically a missing semantic fix:
Kitsune already contains independently implemented behavior and stronger
cancellation, authentication, proxy and metadata boundaries in several areas.

The provider/client review triaged 45 relevant commits since October 17; the
frontend review examined 15 since October 30. These overlapping scope counts
are not a claim that all 476 upstream-only commits or every live provider were
individually certified. The [source graph/adaptation receipt](data/upstream-reconciliation-20261117.json)
retains the comparison boundary and selected commits. The
[provider triage receipt](data/upstream-provider-triage-20261117.json) records
specific adapted, already-present, inapplicable and deferred dispositions.

## Actual GitHub issues

The [issue receipt](data/upstream-issues-20261117.json) captures **25 actual OPEN
issues** sorted by recent update and **eight detailed reviews**. Public GitHub
HTML returned HTTP 200 with issue item type and OPEN state verified. GitHub API
and `gh api` access returned proxy/authorization 403; the Atom route returned
406 and was not used as issue evidence. No token was extracted, requested or
substituted. This was an issue review, not a pull-request search, and the first
25 results are not an exhaustive inventory of every repository issue.

| Issue | Review result |
| --- | --- |
| [#5718: dropped `tool_choice`](https://github.com/decolua/9router/issues/5718) | Kitsune already had the relevant translation fix and regression boundary; no duplicate port claimed. |
| [#5721: 250 ms connection-attempt budget](https://github.com/decolua/9router/issues/5721) | The reported upstream setting is absent from Kitsune's different transport; no blind timeout rewrite. |
| [#5525: STT multipart](https://github.com/decolua/9router/issues/5525) | Reproduced on the current multipart boundary and selectively adapted with byte/field tests. |
| [#5605: Kimi K3.1 Pro context](https://github.com/decolua/9router/issues/5605) | Verified native catalog/limit schema from official Kimi Code source; exact account-returned metadata is required, not a blanket 1M static assignment. |
| [#5710: reported model substitution](https://github.com/decolua/9router/issues/5710) | Unconfirmed report; retain explicit requested/dispatch model invariants rather than invent a model-rewrite patch. |
| [#5714: intermittent Gemini 503](https://github.com/decolua/9router/issues/5714) | Unconfirmed service/account report; no new arbitrary fallback or account-health classification. |
| [#5695: Antigravity failures](https://github.com/decolua/9router/issues/5695) | Provider/account restriction report; no identity stripping, prompt rewriting or enforcement evasion. |
| [#5696: Claude restriction report](https://github.com/decolua/9router/issues/5696) | Keep explicit supported authentication/error behavior; no anti-detection or account-restriction bypass. |

An issue's observed OPEN state does not imply every report reproduces locally,
nor does a synthetic local regression close the upstream issue or establish live
account acceptance. No external issue comments or closures were sent.

## Selected adaptations

| Upstream source | Local adaptation and boundary |
| --- | --- |
| [`ec165e1c`](https://github.com/decolua/9router/commit/ec165e1cb41e59dfa7b59aedfa339e2755b68bea) | STT forms use a matching Undici FormData/Request pair for serialization, then send the resulting stream through the existing fetch/proxy transport. File bytes, multipart fields and fresh per-attempt streams are retained; this does not replace the transport with a direct network bypass. |
| [`3a936d13`](https://github.com/decolua/9router/commit/3a936d13a38692988bf35f5e0392722f7d77876b) | The Web Search model picker includes keyless SearXNG through its declared free-tier policy. A synthetic browser case covers selection without manufacturing an API key. |
| [`0cf07ccf`](https://github.com/decolua/9router/commit/0cf07ccf0f15f231b92b74e2c4040ef40acbb568) | New and saved Fal connections share a read-only `GET https://api.fal.ai/v1/models?limit=1` probe with Key authentication. Only 2xx confirms the probe; 401/403 reject credentials, while 429/5xx remain inconclusive. The eight-second/caller deadline, rejected redirects and owned-body cleanup remain bounded; no paid generation is sent. |
| [`ce1e0c3c`](https://github.com/decolua/9router/commit/ce1e0c3ce97316c2789be516f09e81798fd4c134) | Claude opt-in auto-ping catches an observed due unaccepted reset even if the periodic timer misses its lead window. Failed requests/cooldowns retain the due cycle; only accepted cycles are recorded. Existing quota, opt-in, cancellation, shutdown and Codex sliding-reset behavior remain intact. |
| [`597ee684`](https://github.com/decolua/9router/commit/597ee684ddd481c6dabeb4fd67374a917817234c) | Qoder now retains provider-returned `enable:false` rows and exact names/raw configs in discovery. This is an explicit catalog visibility policy change. A displayed model still requires upstream account entitlement; a prior hidden-row test was deliberately migrated. |
| [`8650b046`](https://github.com/decolua/9router/commit/8650b04611e98f6415853c8930953219e8ef1711) | The launcher waits for native tray readiness rather than declaring success after spawn. The three-second handshake catches timeout/early-exit/error, disposes a failed owned child, keeps the gateway available and refuses Hide without a ready tray. Existing Windows IPC and bounded owned-child cleanup remain in scope. |
| [`08ef047f`](https://github.com/decolua/9router/commit/08ef047f8c2ede799294ca4d3ccac4548f63452b) | The Compose Headroom host port binds `127.0.0.1:8787:8787`; internal Docker access stays `http://headroom:8787`. The commit's Undici downgrade was not copied: Kitsune retains its independently reviewed newer dependency graph. |

### Kimi native model metadata

The [primary-source receipt](data/kimi-primary-source-20261117.json) binds the
review to official `MoonshotAI/kimi-code` commit
`fec742878d73678082b304c887e4fb1564088c54`. Its
[managed model source](https://github.com/MoonshotAI/kimi-code/blob/fec742878d73678082b304c887e4fb1564088c54/packages/oauth/src/managed-kimi-code.ts)
defines authenticated `GET https://api.kimi.com/coding/v1/models`, exact returned
model IDs, and positive integer `model.limit.context`. The archived Python Kimi
CLI points to that replacement; CLI products and old catalog formats are not
silently treated as the same source.

The review found that generic discovery ignored `limit.context` and gated live
Kimi discovery on `apiKey`, excluding OAuth-only connections. The selected repair
uses the existing checked transport and normal credential priority for that
Kimi-scoped catalog, preserves bare IDs and validates returned limits. It does
not infer pricing, capabilities, retirement or a universal context window.
Official source establishes K3's own 1,048,576-context example; it does not
independently establish the limits of `k3.1-pro` or `k3.1-pro-highspeed`. Those
require exact account-returned catalog metadata. Public model-doc HTTP requests
were blocked by proxy 403; source-schema verification and static model-limit
verification remain distinct facts. This change's final validation is recorded
below.

## Already present, inapplicable or deferred

- Native usage aliases, real zero/unknown counters, label associations and the
  `tool_choice` fix were already present in Kitsune. Their existence was checked
  in source rather than inferred from Git ancestry alone.
- The upstream custom-STT-toggle bug does not reproduce in Kitsune's LLM-only
  custom-model modal. The upstream zstd workaround targets older Node versions
  outside the declared Node >=22.19 source requirement; another runtime needs
  its own reproduction before adopting that workaround.
- Automatic Claude CLI identity updates and CodeBuddy WAF-oriented prompt/agent
  rewriting were not ported. Current signed-history and caller prompt integrity
  must not become an account-enforcement bypass.
- ClinePass usage limits, Command Code dynamic catalog, MiniMax desktop lease
  auth, Pi integration and proxy-pool selection/status features are separate
  feature work. Missing/unknown quota is not zero, and absent local provider modes
  are not activated merely to mirror an upstream commit.
- A Kiro per-service served-region allowlist remains a candidate for supported
  source/endpoint review. Syntax/origin checks stay in place; no invented region
  routing or integrity-gate bypass was added.
- Official client release observations and unavailable metadata feeds retain
  their [independent inventory](data/provider-inventory-20261117.json). No latest
  version, account entitlement or signature authenticity is claimed from a
  changed User-Agent string.

## Cross-modality account transport follow-up

A later local security review found that proxy policy/cancellation ownership was
not consistent across every modality even though video and embeddings already
had explicit account-policy handling. This work is a local follow-up, not an
assertion that another upstream commit was merged or that the earlier dependency
phase covered the gap.

The new request-local `accountTransport` snapshots the selected account policy
and carries operation signals through credentialed STT/TTS/image requests and
polling. It is passed explicitly through handlers/executors; there
is no process-global account-context or fetch replacement that could mix
concurrent accounts. Cancellation and local routing failures must remain terminal
instead of creating additional provider attempts or account-health writes.

Guarded dedicated search, web fetch and remote HTTP image input keep their
pinned-DNS, private-address and redirect checks. A configured account proxy/relay
that cannot preserve those protections is **unsupported on those guarded paths**
and is rejected before authenticated dispatch. It does not silently become a
direct request or a generic proxied fetch. Antigravity remote image input follows
that limitation; inline/data-URI input remains a separate local path. Other image
asset reads use the existing secure image retrieval helper's bounded size/type,
DNS and address checks.

Dedicated search and WebFetch reject an explicit account proxy policy before
token refresh with a request-local routing error, without account/combo fallback
or health writes. ChatSearch supports the explicit account transport and caller
cancellation. WebFetch uses central `fetchPublic` with no redirects rather than
a second weak guard around global fetch. Configured trusted-local SearXNG and
Ollama search remain supported; the registered Ollama WebFetch surface is the
cloud service and does not acquire a local-address bypass.

Credentialed image POSTs, polls, refresh and the Antigravity executor share the
selected account transport and refuse redirects. Polling URLs use verified exact
HTTPS origin allowlists: BFL `api.bfl.ai`, `api.eu.bfl.ai`, `api.us.bfl.ai`, and
Fal `queue.fal.run`. Userinfo, suffix-lookalike and unapproved-origin URLs cannot
redirect credentials. These origins are verified from the
[BFL endpoint reference](https://github.com/black-forest-labs/skills/blob/master/skills/bfl-api/references/endpoints.md)
and [Fal client](https://github.com/fal-ai/fal-js/blob/main/libs/client/src/queue.ts),
not inferred from a returned arbitrary URL. Remote image inputs and binary asset
downloads separately retain the pinned secure image helper. Under an explicit
account proxy, unsupported remote asset reads fail closed; callers may retain
JSON output URLs rather than request a binary download. A failed requested
binary download does not silently become a JSON response. Actual input MIME is
preserved rather than labeling every fetched image as PNG.

Image fallback is eligible only after a complete primary 401/403/429 pre-work
rejection and the existing health decision. An accepted job, incurred usage,
ambiguous network/5xx/body error or polling failure does not replay a POST across
URLs, accounts or combos. This preserves the distinction between safely rejected
work and a job that may already be billable.

TTS propagates selected account policy and caller cancellation through generic
and special synthesis and stored-connection voice catalogs. The 60-second header
deadline ends at response headers; it does not truncate a longer audio stream.
Native binary output validates its existing prefix (up to 100 bytes generally,
1,024 bytes for ElevenLabs), then streams exact bytes with backpressure. Caller
or consumer cancellation releases the upstream source without awaiting a stuck
cancel acknowledgment. A later upstream body failure is a failed body after
accepted headers, not a complete generation or permission to retry another
account. JSON/base64-provider decoding remains buffered. Direct adapter calls
that omit output mode retain the prior `{base64, format}` response contract;
the core explicitly selects streaming binary output. The raw-key voices endpoint
keeps its explicit key contract instead of implicitly selecting a stored account.

Real relay/direct-egress-trap/cancellation regressions and the full integrated
suite now pass for this follow-up. Target-runtime builds, packaged startup and
browser verification remain separate results below; no universal proxy support
or live-provider acceptance is inferred from local tests.

## Tool-call identity completion

Indexed Chat tool fragments without an ID are now buffered until either an
original late provider ID arrives or an explicit successful `stop`/`tool_calls`
terminal proves a complete name and parseable JSON arguments. Only that completed
ID-less Chat case receives a gateway-owned `call_<uuid>` client identifier.
Existing, late, signed and provider-owned IDs are never replaced; index-less
fragments do not acquire another tool's identity. Tool arguments and opaque
thought/signature fields retain their bytes and request-local ownership.

Malformed, length/error-finished or truncated tool output cannot manufacture a
successful native tool history. The same decision applies to streamed and
SSE-to-JSON paths, with history replay and actual local HTTP request coverage.
Buffering retains the existing `SSE_LIMITS.eventChars = 64 * 1024 * 1024` and
`outputItems = 65536` bounds; it does not introduce unbounded waiting for a tool
identity. This is gateway client-response bookkeeping, not a forged upstream
signature, account identity or cryptographic validation claim.

## Validation and remaining boundaries

The final reconciled full regression suite passed **11,772 tests**, with **99
skipped**, zero failed assertions/suites, across **911 files** (893 passed,
18 skipped) in **200.73 seconds**. The repository's nonempty regression report
gate passed. The [final regression receipt](data/reconciliation-validation-20261117.json)
records the original report SHA-256 and distinguishes these source results from
the earlier dependency/runtime phase. Additional builds/runtime checks are not
implied by that test result. The final source includes the shared transport's
legacy pool-alias normalization and video direct/proxy redirect refusal. The
earlier 11,755-pass report before those changes is retained separately rather
than relabeled as proof of the final source.

Focused and separate evidence:

| Check | Observed result |
| --- | --- |
| Provider/Fal/scheduler/Qoder regressions | Before: 22 failed / 16 passed across 38 cases. After: 126 passed across 6 files; targeted strict lint passed. |
| SearXNG and model-picker regressions | Before: one failed / 16 passed across 17 cases. After: 23 passed across 2 unit files; the added browser case passed in the final 48-case production suite. |
| Tray lifecycle regressions | 16 passed, including 12 new cases and an actual local HTTP gateway fixture. Native Windows/macOS desktop icons were not exercised. |
| Headroom binding | Compose YAML parsed with loopback-only host port and unchanged internal service URL. |
| Kimi catalog and adjacent regressions | Before: 15 failed / 3 passed across 18 cases. After: 87 passed across 5 files, including 20 new Kimi cases; report gate and targeted strict lint passed. |
| STT multipart wire regression | Before: 5 failed / 2 passed. After: 7 passed in the current multipart fixture; no live STT provider request. |
| Shared account transport helper | 26 passed, including 3 legacy pool-alias cases; targeted lint and report gate passed. |
| STT policy/cancellation/multipart coverage | 19 passed in the final focused set. |
| TTS synthesis/voice/prefix/streaming and direct-default compatibility | 152 passed across 8 files; 59 new TTS cases; targeted lint/report gate passed. |
| Image routing/poll/asset/replay boundaries | 259 passed across 7 relevant files; the expanded security set includes 60 new cases. These focused sets overlap and are not summed. |
| Search/WebFetch transport and guards | 124 passed across 13 files, including 22 new relay/direct-egress/private-address/cancellation cases; targeted strict lint passed. |
| Tool identity/history/stream integration | 272 passed across 13 files, including 17 new cases and actual local HTTP/history coverage. |
| Shared inference-budget fixture integration | 63 passed after preserving actual preflight exports and explicit pre-work rejection markers. |
| Final reconciled regression suite | 11,772 passed / 99 skipped / zero failures; 911 selected files; report gate passed. |
| Video direct/proxy redirect hardening | 158 passed across 6 focused files, including 14 new real-HTTP redirect/cancellation cases. The original 8 redirect reproductions failed before repair; the repair is included in the final full run. |
| Documentation checks | 18 tests passed again after the final env-file launcher update; the final static build generated all 109 pages. |
| Exact documented development launcher | Default Turbopack functional smoke passed: database, unauthenticated 401, login/session, dashboard, authenticated 1,082-model list and temporary-key deletion. |
| Final application production build | Passed for the frozen final runtime source. |
| Final production browser suite | 48 passed in 1.2 minutes. |
| Final strict composed lint and dependency declarations | Passed; all four project declaration/lockfile checks consistent. |
| Final native standalone runtime | Functional database/authentication/dashboard/model-discovery smoke passed again after all runtime fixes. |
| Physically absent optional native-addon build/runtime | Separate production build and full standalone functional smoke passed with the package outside the checkout, cleared `NODE_PATH` and no bundled addon; server confirmed `Driver: node:sqlite`. The original package was restored. |
| Local unpublished CLI package | Pack passed: 23,262,347 bytes / 3,242 files; archive SHA-256 retained in the final receipt. Fresh tarball installation and installed help/version/check-install passed. |
| Packaged SQL.js fallback | Bundled 1.16.0 JS/WASM bytes matched; forced fallback, persistence and restart passed. |
| Installed packaged server | Functional smoke passed with managed better-sqlite3 13.2.0 via `NODE_PATH`; systray2 2.1.4 retained, sql.js 1.16.0 bundled, no native addon bundled into the app. |

The SearXNG browser fixture now scopes its saved-row assertion to
`.provider-combo-editor`, excluding a retained picker during its exit animation.
Saved-model, no-inference and page-error assertions remain intact. Selection and
persistence already succeeded; this is a fixture locator correction, not an
application regression. The final complete 48-case browser run passed.

One interim full-suite run was terminated before the final account-transport
proxy-pool alias repair and is not completed validation evidence. The request-local
helper now retains both `proxyPoolId` and legacy `connectionProxyPoolId`, including
the explicit `__none__` policy; the frozen final state passed the full suite above.
The source-development env-file parent/spawn launcher was also checked with
literal path metacharacters, preserved environment and empty child `execArgv`.
The exact launcher then passed the real default Next/Turbopack functional smoke;
this establishes the current source workflow rather than relying only on a stub
child-process test. No provider inference was sent by that smoke check.

The local `bykitsune-router-1.0.8.tgz` is an **unpublished source candidate**,
not the original public npm archive with that version. The package receipt keeps
its distinct SHA-256 and size. Fresh installation initially failed because an
over-isolated environment omitted the cloud's supplied proxy/CA bindings;
restoring only those existing transport/trust bindings allowed installation.
No project dependency, registry or TLS-verification policy was weakened.

There was no live provider inference, paid generation, credential harvesting,
account restriction bypass or native Windows/macOS desktop certification. These
runtime checks used Node 24.22.1/npm 11.9.0 in the cloud environment, not a fresh
matrix certification of every declared Node/Bun/desktop target. Cloud
`install_script` and `start_skill` were saved at draft revision 4 for all four
projects and default Turbopack startup; environment snapshot publication remains
a separate UI action. Git commit/push is the delivery step to verify by remote
readback after committing, rather than unresolved implementation work. This
source audit does not itself assert that write, a new release or deployment.
