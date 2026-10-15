# ZenRouter 0.9.9 technical changelog

Release date: **2026-10-15** · Previous **published** release: **0.9.7**.

> **Note on 0.9.8.** The 0.9.8 batch (20 changes, documented in
> [CHANGELOG_v0.9.8.md](CHANGELOG_v0.9.8.md)) was prepared in the repository but
> **never published** — there is no `v0.9.8` tag, no GitHub release, and npm's
> `latest` remained 0.9.7. Its commits are ancestors of this release, so **0.9.9
> delivers both batches**: 41 commits since `v0.9.7`. Anyone upgrading from 0.9.7
> receives the dependency-advisory removal and Tier-1 upstream ports described in
> the 0.9.8 document, in addition to everything below.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.9) · [Complete changelog](../CHANGELOG.md) · [Release notes](../releases/RELEASE_NOTES_v0.9.9.md)

This release is the response to an external audit (11 prompt documents) plus a full
catalog verification against models.dev. The rule applied throughout: **reproduce the
finding against the running gateway before changing anything**, and ship a regression
test with every fix. Where a claim could not be reproduced, it was reported instead of
"fixed". Historical [0.9.8 documentation](CHANGELOG_v0.9.8.md) is unchanged.

## Method and evidence standard

- Every defect below was first reproduced. Examples: `translateRequest()` was called
  directly to prove which fields are dropped; the context ceiling was measured by
  sending real prompts of increasing size until the upstream rejected one; the
  rejected Codex routes were probed with `max_tokens: 1000` (never a small cap, which
  produces false negatives on reasoning models).
- Catalog work compared Zen against **models.dev** (the official model database,
  5.6 MB / 230 providers / 2,729 reference entries), cross-checked with **Griphub's**
  live `/v1/models` and **9router's** patterns.
- Probes consumed real production tokens but kept caps small (50–1000).

## Inbound rate limiting (new)

The `apiKeys` table had **no quota column at all** (`id`, `key`, `name`, `machineId`,
`isActive`, `createdAt`) and `validateApiKey()` returned a plain boolean. Nothing
bounded what a *client* consumed: the only limits in the codebase were the dashboard
login limiter and the **upstream** account cooldowns. A single leaked key could drain
every paid provider quota, and no `x-ratelimit-*` header existed for a well-behaved
client to respect.

- `src/lib/rateLimit/v1Limiter.js`: fixed-window limit per API key plus a separate
  per-second burst guard. Bucket identity is a short hash — the raw key must never sit
  in a process-lifetime Map. The counter table is bounded, so the limiter cannot become
  the leak it exists to prevent.
- Defaults **600 RPM / 120 per second**, env-tunable (`V1_RATE_LIMIT_RPM`,
  `V1_RATE_LIMIT_BURST`). Chosen from measured traffic, not guessed: production peaks
  at ~246 requests/minute, so the defaults leave ~30x headroom.
- Keyed by API key rather than IP, because many legitimate clients share one NAT;
  an unauthenticated request falls back to the peer address so a missing key is not an
  unmetered path.
- `429` carries `Retry-After` plus `x-ratelimit-limit/remaining/reset`; the same
  advisory headers ride on successful responses. The limiter runs **after**
  authentication (so the bucket is attributable) and **before** dispatch (so a refused
  request never reaches an upstream).

## No internal routing detail reaches a client

Production returned:

```json
{"error":{"message":"No active credentials for provider: openai","code":"model_not_found"}}
```

which names the upstream provider the gateway maps a model to. The owner's rule is that
a caller always sees the real model name and never learns which provider, account,
channel or routing prefix served — or refused — the request. The same phrasing existed
in the image, video, search, tts, stt, embeddings, fetch and Gemini-native handlers.

- `src/shared/utils/clientErrors.js` is the single place that decides what a client may
  read: `publicMessage()` maps an internal condition to a fixed neutral string, and
  `leaksInternalDetail()`/`safeClientMessage()` guard text that originates upstream
  (an untrusted error body can echo the account or provider id).
- The specific reason is still written to the operator log first, so debuggability is
  unchanged. **Machine-readable diagnostics Zen itself produces** (`type`/`code`/`param`,
  e.g. `output_budget_exhausted` with an actionable "increase max_tokens" message) are
  still forwarded: they help the caller and reveal nothing about routing.
- Deliberately unchanged: `"Unknown provider: <input>"` in fetch/search echoes the
  caller's own argument, and `/api/translator/*` + `/api/providers/*` are operator-only
  dashboard routes.

## Security headers and CORS

The gateway binds `127.0.0.1` but **is published through a Cloudflare tunnel**
(`zen.hlcyn.xyz` → `127.0.0.1:20128`, confirmed in `/etc/cloudflared/config.yml`), so
responses do reach the public internet and the hardening is not cosmetic.

- Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` and `Strict-Transport-Security` to every rule.
- Replaced `Access-Control-Allow-Headers: *` with the explicit list derived from the
  headers the handlers actually read (`authorization`, `content-type`, `accept`,
  `x-api-key`, `x-connection-id`, `idempotency-key`, the Anthropic/OpenAI beta and
  version headers, and the Stainless client headers). This API authenticates with a
  bearer token, not cookies, so the wildcard was not directly exploitable — but it let
  any browser page send arbitrary custom headers and hid what the API understands.

## PII: account emails left the logs

Production journald carried **589 lines containing 27 unique account email addresses**,
because `credentials.connectionName` is built as `displayName || name || email || id`
and was interpolated raw into every account log line.

- `src/shared/utils/accountRedaction.js`: identities become a salted short hash
  (`acc_a3f9c1e2`), salted with `MACHINE_ID_SALT` so hashes differ per host. The output
  stays short and stable, so an operator can still tell two accounts apart and grep one
  account's history.
- Redacted at every identity log site: chat, search, tts, stt, embeddings, fetch, auth
  (account lock and pinned-account lines) and `chatCore`'s `ACC:` line.
- Operator-authored names ("Work account") are kept verbatim — not PII, and more useful
  than a hash. `connectionName` itself is untouched because it is used functionally
  (the v1beta route derives a lock key from it), so redaction happens at the log
  boundary.

## Revoked OAuth tokens were retried forever

A provider-revoked token matched no error rule and fell through to the generic 401 rule
(2 minute cooldown, terminal), so a permanently dead account was retried every two
minutes indefinitely. Production evidence: `token_revoked` appeared **31 times across 8
hours**, retrying one account **16 times** and another 15 times.

- New 1h revocation cooldown (`REVOKED_TOKEN_COOLDOWN_MS`) plus text rules for
  `token_revoked`, `invalidated oauth token`, `revoked token`, `credentials revoked`,
  `refresh token has been revoked` and `refresh_token_reused`, ordered **before** the
  generic 401 status rule. One hour is bounded on purpose: long enough to cut the wasted
  retry rate ~30x, short enough that a human re-auth returns the account to rotation
  within the hour.
- `needsOperatorReauth()` drives a new `needs_reauth` connection status, so the
  dashboard stops rendering a dead account as a temporary cooldown.
- Deliberately **separate** from `PERMANENT_AUTH_DENIAL_TEXTS`. An org-policy denial
  provably cannot be healed by refreshing, so that path skips refresh entirely. A
  revoked token is different: a still-valid refresh token may mint a working access
  token, so these keep the normal refresh attempt and only change the cooldown once that
  retry also fails. Skipping refresh would lock a recoverable account for an hour —
  worse than the bug being fixed.

## Context overflow answered with the wrong status

An over-long prompt produced `context_length_exceeded` **inside a 200-OK SSE stream**.
The generic `response.failed` branch converted it to 503, which surfaced to the client
as HTTP 502 even though the body said `invalid_request_error`.

Consequences, observed in the production journal:

- ByKitsune's `RETRYABLE_STATUS` includes 502, so a prompt that could never succeed was
  retried across channels while the user waited.
- Every healthy account was locked for 30s in turn (`locked modelLock_gpt-6-luna for
  30s [502]`), then the circuit breaker fast-failed the whole model after 3 accounts.

Client-scoped SSE failures are now detected **before** the generic pattern (matching the
generic one first is exactly what mislabelled the error) and surface as 400 with
`invalid_request_error`, without rotating accounts. A 400 still fails fast rather than
falling through, preserving the deliberate `#20a43f5a2` contract: a prompt that is too
long fails identically on every account, so retrying only multiplies the latency of an
unavoidable error.

## Context windows were under-reported by up to 778k tokens

`/v1/models` published the **Codex CLI configuration ceiling** — `cliMaxContext`
(872,000) for GPT-6 and the 272,000 CLI default for GPT-5.6 — as `context_length`,
instead of the backend's real capability.

Measured live against the running gateway:

| Advertised | Actually accepted |
|---|---|
| 272,000 | 402,486 input tokens (HTTP 200) |
| 872,000 | 902,486 input tokens (HTTP 200) |
| 909,486 | accepted |
| 957,000 | rejected with `context_length_exceeded` |

So the true ceiling is `apiMaxInput` (922,000) and the window is 1,050,000. Four
independent sources agree: models.dev's official OpenAI entries, Griphub's live
`/v1/models`, 9router's `*gpt-6*` / `*gpt-5.6*` patterns, and independent web research
which also explains 872K as a *client-side safety buffer*, not a backend cap.

- All GPT-6 / GPT-5.6 routes now publish the API specification
  (1,050,000 / 922,000 / 128,000).
- The CLI ceilings stay recorded under `limits.cliDefaultContext` / `cliMaxContext` with
  their existing "not a backend hard cap" semantics — they are a client compaction
  bound, a genuinely different concept.
- `[1m]` variants now equal their base id. They previously reported 872,000 while the
  base reported 1,050,000, i.e. the "1M-context beta on" marker advertised a **smaller**
  window than the default.
- `cx/gpt-5.4`, `cx/gpt-5.4-mini` and `cx/gpt-5.3-codex-spark` keep their window
  **unset**: the live ChatGPT-account route rejects them outright, so publishing a
  window would advertise a capability the route cannot serve.

## Five catalog windows corrected (models.dev verification)

A naive comparison against models.dev reported **206 mismatches**. Only **5** were real.
Two classes of false positive had to be excluded first, and both were verified rather
than assumed:

- **Unit conventions.** 256000 vs 262144 (256K decimal vs binary), 1000000 vs 1048576
  (1M), 128000 vs 131072. Vendors and catalogs mix these freely; 43 of the Griphub
  differences were this alone.
- **Route-scoped caps.** An IDE/OAuth bridge or coding plan enforces its own limit on
  purpose. Confirmed by checking the vendor's *own* entry: `zai/glm-4.6v` = 128000
  matches Zen exactly, while an aggregator listed 200000. `kr` = kiro (272k), `ag` =
  antigravity (250k for Claude vs the model's 1M API window), `cx`, `gh`, `cbcn`, `if`,
  `cu` are all bridges.

The five real defects:

| Model | Was | Correct | Why it mattered |
|---|---|---|---|
| `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` | 1,000,000 | **1,047,576** | Rounded instead of the vendor's exact figure |
| `command-a-translate-08-2025` | 128,000 | **8,000** | A translate-specialised small model; the family glob over-promised **16x** |
| `ministral-3b-2512` | 128,000 | **131,072** | Each Ministral size has its own window |
| `ministral-8b/14b-2512` | 128,000 | **262,144** | Same |
| `codestral-latest` | 128,000 | **256,000** | Vendor's current published figure |

Result after the fixes: **0 actionable mismatches** against official vendor entries, 386
models agreeing, 108 route-scoped differences confirmed intentional, and **448 rows with
no models.dev reference reported as such** rather than silently treated as verified.

`scripts/verify-catalog-against-modelsdev.mjs` reproduces the whole analysis and
documents the exclusions inline, so the next run does not re-derive them.

## Codex routes the ChatGPT account rejects

Testing every `cx/` route live with `max_tokens: 1000`:

- **Works (HTTP 200):** `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`,
  `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `codex-auto-review`.
- **Rejected:** `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark` — each
  answers 503 wrapping the upstream 400: *"The '\<id\>' model is not supported when
  using Codex with a ChatGPT account."*

They were listed in `/v1/models` with no indication they cannot be served, and ByKitsune
reads that catalog. They now carry `routeAvailable: false` with a stable
machine-readable `routeUnavailableReason`, and the `-review` aliases inherit it. The ids
are **retained** so a stored combo resolves into a clear "not available" instead of a
404.

## Translation silently dropped parameters

Reproduced by calling `translateRequest()` directly:

| Conversion | Fields lost |
|---|---|
| `openai → claude` | `top_p`, `stop`, `seed`, `user`, `presence_penalty`, `frequency_penalty` |
| `claude → openai` | `top_p`, `stop_sequences`, `metadata` |
| `openai → gemini` | `stop`, `seed`, `user` |

This is the "succeeds but behaves differently" class of bug: no error, just different
behaviour, so nothing surfaces in monitoring. A client setting `stop: ["</end>"]` for
deterministic truncation received **untruncated output** whenever the gateway routed to
Claude — including when a combo failed over mid-request. `seed`, requested for
reproducibility, was ignored; `metadata.user_id`, Anthropic's abuse-tracking field, was
dropped.

Now mapped explicitly: `stop` ⇄ `stop_sequences` (string or array), `top_p`,
`user` ⇄ `metadata.user_id`, and Gemini `stopSequences` (capped at the documented
maximum of 5) plus `seed`. `presence_penalty`/`frequency_penalty` stay dropped on
purpose: Anthropic has no equivalent, and fabricating one would change sampling in an
unverifiable way.

### A failed tool result was invisible to the model

`claude-to-openai` pushed a non-standard `is_error` field onto OpenAI tool messages.
OpenAI Chat Completions has no such field, so a strict upstream ignores or rejects it and
the receiving model **cannot tell the tool failed** — it may conclude the opposite and
continue from a false premise. The flag is now an explicit `[tool_error]` marker inside
the content the model reads, with no non-standard field.

## Reliability

**Mid-stream failures never marked the account.** `markAccountUnavailable()` was called
only on the pre-stream error path, so an account that consistently failed *after* the 200
header (Codex `response.failed`, quota exhausted mid-generation) stayed "healthy" and
kept being selected: every request returned 200 with truncated content and no failover
ever happened — an outage status-based monitoring cannot see, because everything looks
like 200. Mid-stream failures now mark the account so the next request picks another one.
No byte can be un-sent once a stream starts, so the fix is to stop reusing the broken
account, not to fail over mid-stream. A client disconnect cannot reach that branch: the
abort path claims persistence first, and production shows `client_aborted` happening
often.

**Provider `Retry-After` was dead code.** `checkFallbackError(status, errorText,
backoffLevel, response)` accepted a `Response` specifically to read the provider's
`Retry-After`, but **no caller passed the argument**, so the whole "provider-reported
precise reset" branch never ran and every cooldown fell back to exponential guessing
(1s → 2s → 4s). A provider answering `Retry-After: 3600` was retried after seconds —
a retry storm against an upstream that had explicitly asked for an hour of quiet.
Extraction now covers every reset-bearing status (402/403/429/5xx/529), and it is
restricted to those statuses on purpose: `extractResetsAtMs()` also matches loose wording
like "retry in 5 minutes", and applying that to a 400/404/422 client error would cool
down a perfectly healthy account. Malformed values no longer produce a literal
`Retry-After: NaN` header.

**Unexpected exceptions were swallowed.** A bare `catch {}` in the chat handler and the
`/v1/responses` route collapsed every failure into a generic 500 while still handing the
client a `serverRequestId` that appeared **nowhere in the logs**, so the correlation it
was meant to enable did not exist. The error name, message and stack are now logged with
that id, via `errorLine()` which is documented as always printed regardless of
`LOG_LEVEL`. Prompt and response content are never logged.

**Four process-local caches grew without limit.** `rejectedBetaByConnection`,
`usageCache`, `oauthCooldown` and `providerMutexes` had no eviction at all (not a single
`.delete()`/`.clear()`), and are keyed by values that rotate over the process lifetime —
OAuth access tokens are refreshed periodically, connections and custom providers come
and go. Each rotation left an entry nothing would ever read again. They now write
through a size-capped helper (`open-sse/utils/boundedCache.js`), and the token caches
additionally sweep expired entries.

**Remote images were not prefetched on the passthrough path.** The helper ran only when
`!passthrough`, so a native passthrough request carrying an HTTP image URL was forwarded
to a target that cannot fetch URLs and the upstream answered with a confusing 400.
`prefetchRemoteImages()` is a no-op when the target does not need inlining, so it now
runs on both paths. `stripUnsupportedModalities` deliberately stays translation-only:
dropping a media block from a body the client sent in the provider's own native format
would silently alter a request the gateway promised to pass through.

**Four dead functions removed.** `applyErrorState`, `resetAccountState`,
`getEarliestRateLimitedUntil` and `parseRetryAfter` had zero callers. They were actively
misleading: a maintainer could edit `applyErrorState` believing it was the live
account-health path, when the real one is `src/sse/services/auth.js`
`markAccountUnavailable`. The two `extractResetsAtMs` implementations were **not**
merged — they were measured to handle different inputs (only the accountFallback copy
parses compound durations such as "reset after 1m 51s") and both are live.

## Self-update could never detect an update

The package is published as the **scoped** name `@joyccn/zenrouter`; the bare
`zenrouter` is unclaimed (`npm view zenrouter` → 404). The code queried the bare name in
three places and each failed silently:

| Site | Effect |
|---|---|
| `src/app/api/version/route.js` | `/api/version` always answered `latestVersion: null` |
| `UPDATER_CONFIG` | `npm i -g zenrouter` would 404 instead of installing |
| landing page + i18n literals | the advertised `npx zenrouter` 404s for the user |

Reproduced on production 0.9.7: `{"currentVersion":"0.9.7","latestVersion":null}`.

`NPM_PACKAGE_NAME` is now exported once from `src/shared/constants/config.js` and the
version route, the updater commands and the landing page all derive from it — the
duplicated literal is exactly how the two drifted apart. The i18n literal **keys** moved
too: `translate()` looks up the rendered DOM text as the key, so a stale key falls through
to English without any error.

Verified at runtime against an isolated `DATA_DIR`:
`{"currentVersion":"0.9.9","latestVersion":"0.9.7","hasUpdate":false}` — the registry lookup
resolves again. Regression coverage: `tests/unit/npm-package-name.test.js` (14 cases),
including a scan that no locale or source file reintroduces the bare name.

## Observability

**Deep health probe.** `/api/health` returned a constant `{"ok":true}`, and the tunnel
watchdog reads it — so it reported healthy even with storage unreachable. It now performs
a real database read, returns **503** when that fails, and reports uptime, version, and
the counts that made operators blind: how many connections are locked right now and how
many need re-authentication. Counts only; no email, token or key is ever serialised.

**Prometheus metrics.** New `/api/metrics` answers questions that previously required
grepping journald by hand: which models are used, how many failures per HTTP status, and
how many requests are in flight. Token-gated, because it reveals traffic shape, and
strictly aggregate — the per-account rows that carry emails are deliberately not read.

## `/v1/responses` and tool calling (decision, no code change)

Full report: [`docs/audit/08-p07-responses-and-tool-calling.md`](audit/08-p07-responses-and-tool-calling.md).

Zen's `/v1/responses` works and returns the model **without** the `cx/` prefix. Measured
TTFT on `cx/gpt-6-luna` (4 streaming samples per path): `/responses` median **0.691 s**
vs `/chat/completions` **1.089 s**, because the GPT path currently pays an
`openai → openai-responses` translation on every request.

**Recommendation: do not add `/v1/responses` to ByKitsune yet.** A third protocol must
independently carry guardrails, `gatewayAdmission` and billing reserve/settle, and the
Responses usage shape differs. GPT traffic has run through `/chat/completions` in
production with no reported failure, so a ~0.4 s saving does not justify the surface.

The metadata claim that tool calling requires `/responses` was **tested and does not
hold**: tool calls were emitted over `/chat/completions` at `reasoning_effort` `none`,
`low` **and** `high`, and a chained call (tool result sent back) completed with
`finish_reason: stop`. The metadata strings were deliberately **not** changed — they
quote upstream documentation and per-effort coverage exists for only one model, so
editing them would swap one unverified claim for another.

## Verification

- Full isolated suite: **1,441 files, 4,539 cases — 4,438 passed, 0 failed**.
- `npx eslint .` — zero errors, zero warnings.
- Registry baselines byte-for-byte equal: 82 providers, 117 alias tokens, OAuth URLs.
- Production build (`next build --webpack`) succeeds.
- Runtime-verified on an isolated `DATA_DIR` (loopback, catalog sync and MITM off):
  deep health JSON, all five security headers, the explicit CORS allowlist, `429` with
  `Retry-After` and `x-ratelimit-*` (RPM=4/BURST=2 fixture), and `/api/metrics`
  returning 401 unauthenticated.
- Live probes used the production account with small caps only; no billable inference
  was run beyond the context-ceiling measurement described above.

## Upgrade notes

- No configuration change is required; no API shape changed.
- Optional new env vars: `V1_RATE_LIMIT_RPM`, `V1_RATE_LIMIT_BURST` (defaults 600 / 120).
  Raise them only if a legitimate client is throttled; the defaults are ~30x measured peak.
- `npm install -g @joyccn/zenrouter@0.9.9`, or `npx @joyccn/zenrouter@0.9.9` after
  publication. Node.js >=22.19.0 remains required.
- Catalog changes are metadata corrections. They do not establish account entitlement or
  live availability, and 448 rows still have no official reference.
