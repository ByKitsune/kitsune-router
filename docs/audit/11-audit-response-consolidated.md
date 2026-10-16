# Audit response — consolidated report (prompts 01–10)

**Date:** 2026-10-16 · **Repo:** `/root/ZenRouter` @ `master` · **Published:** 0.9.8 (backfill) and 0.9.9

This document answers the "LAPORAN YANG DIMINTA" section of every prompt. Per-prompt detail
lives in the linked documents; this file is the index and the honest status of each item.

**Rule applied throughout:** reproduce the finding against the running gateway *before*
changing anything, and ship a regression test with every fix. Where a claim could not be
reproduced, it is reported as unverified rather than "fixed".

---

## Target: 0.9.7 or 0.9.8?

Every prompt asked which target was chosen. The answer changed during the work, and the
final position is:

- **Production is still 0.9.7.** No deploy was performed — prompt 08 requires the owner's
  explicit confirmation, and it was not given. **All fixes below are therefore not yet live.**
- **The work targeted the checkout** (`/root/ZenRouter`), which was 0.9.8 and is now 0.9.9.
- **0.9.8 was published as a backfill on 2026-10-16** (it had been prepared but never
  released). It carries the dependency-advisory removal and Tier-1 upstream ports only — it
  contains **none** of the audit fixes.
- **0.9.9 is the release with the audit fixes**, published 2026-10-15, `latest` in npm,
  Docker Hub, GHCR and GitHub Releases.
- **Five further code changes (four fix areas plus TTFT instrumentation) landed after 0.9.9 was
published.** npm is immutable, so they are **not**
  in the released 0.9.9; they are recorded under `[Unreleased]` in `CHANGELOG.md` and await a
  patch release.

---

## Status per prompt

| # | Area | Status | Evidence |
|---|---|---|---|
| 01 | `token_revoked` + `Retry-After` | ✅ Fixed | `27977d6e`, `99a52064` |
| 02 | Context window + wrong HTTP status | ✅ Fixed | `f4dad71e`, `c816dfd1` |
| 03 | Rate limit + security headers + health | ✅ Fixed | `133abada` |
| 04 | PII in logs + observability | ✅ Fixed, incl. TTFT | `78190efe`, `e6d6d41f`, [10](10-alerting-recommendations.md) |
| 05 | No internal leakage | ✅ Fixed | `479e0259` |
| 06 | Full read-only audit | ✅ All 11 code findings verified fixed | this document |
| 07 | `/v1/responses` gap | ✅ Decided (not adopted) | [08-p07](08-p07-responses-and-tool-calling.md) |
| 08 | Evaluate & deploy 0.9.8 | ⚠️ Evaluated, **not deployed** | owner decision pending |
| 09 | Model coverage | ✅ Complete | [09-p09](09-p09-model-coverage.md) |
| 10 | Translation + mid-stream | ✅ Fixed | `22df64ae`, `95f03782`, `9efea4ba` |

---

## 01 — `token_revoked` and the discarded `Retry-After`

**Evidence for the finding:** production logged **31 `token_revoked` events across 8 hours**,
retrying one account 16 times and another 15 times.

**Root cause:** `token_revoked` matched no rule in `errorConfig.js`, so it fell through to the
generic 401 rule (2-minute cooldown, terminal). A permanently dead account was retried every
two minutes forever.

**Fixed** — `open-sse/config/errorConfig.js`, `open-sse/services/accountFallback.js`,
`src/sse/services/auth.js`:

- New 1-hour `REVOKED_TOKEN_COOLDOWN_MS` plus text rules for `token_revoked`,
  `invalidated oauth token`, `revoked token`, `credentials revoked`,
  `refresh token has been revoked`, `refresh_token_reused` — ordered **before** the generic
  401 status rule so the specific match wins.
- `needsOperatorReauth()` drives a new `needs_reauth` status, so the dashboard stops showing a
  dead account as a temporary cooldown.
- **Deliberately separate** from `PERMANENT_AUTH_DENIAL_TEXTS`: an org-policy denial provably
  cannot be healed by refreshing, so that path skips refresh entirely. A revoked token is
  different — a still-valid refresh token may mint a working access token — so these keep the
  normal refresh attempt and only change the cooldown once that also fails. Skipping refresh
  would lock a recoverable account for an hour, which is worse than the bug.

**`Retry-After` was dead code.** `checkFallbackError(status, text, backoff, response)` accepted
a `Response` to read the provider's header, but **no caller passed it**, so the whole
precise-reset branch never ran and every cooldown fell back to exponential guessing. A provider
answering `Retry-After: 3600` was retried after seconds.

**Fixed** — `open-sse/utils/error.js`, `open-sse/services/combo.js`: extraction now covers
`RESET_BEARING_STATUSES = {402,403,429,500,502,503,504,529}` (deliberately restricted — loose
wording like "retry in 5 minutes" must not cool a healthy account on a 400/404/422), malformed
values no longer emit a literal `Retry-After: NaN`, and the combo path passes and validates
the response.

**Not done:** no live test against a provider actually sending `Retry-After` — verified by unit
test only.

---

## 02 — Context window and the 502

### The status code

**Evidence:** an over-long prompt arrived as `context_length_exceeded` **inside a 200-OK SSE
stream**. The generic `response.failed` branch converted it to 503, surfacing as **HTTP 502**
while the body said `invalid_request_error`. The string `context_length_exceeded` appeared
**zero times** in Zen.

**Why it mattered:** ByKitsune's `RETRYABLE_STATUS` includes 502, so a prompt that could never
succeed was retried while every healthy account was locked 30s in turn, then the circuit
breaker fast-failed the whole model.

**Fixed** — `open-sse/executors/codex.js`: client-scoped SSE patterns are matched **before** the
generic `response.failed` pattern (matching the generic one first is exactly what mislabelled
it) and surface as **400** with `invalid_request_error`, rotating no accounts.

**Preserved contract:** a 400 still fails fast rather than falling through, keeping the
deliberate `#20a43f5a2` rule — a prompt that is too long fails identically on every account, so
retrying only multiplies the latency of an unavoidable error. A test asserts this.

### The window

**Answer to the prompt's "option 1, 2, or 3": option 1 — the API figure is correct.**

Empirical evidence, measured live:

| Advertised | Actually accepted |
|---|---|
| 272,000 | **402,486** input tokens (HTTP 200) |
| 872,000 | **902,486** input tokens (HTTP 200) |
| — | 909,486 accepted |
| — | 957,000 **rejected** with `context_length_exceeded` |

So the true ceiling is `apiMaxInput` (922,000) and the window is 1,050,000. Four independent
sources agree: models.dev's official OpenAI entries, Griphub's live `/v1/models`, 9router's
`*gpt-6*`/`*gpt-5.6*` patterns, and independent research explaining 872K as a *client-side
safety buffer*.

**Before → after:**

| model | was | now |
|---|---|---|
| `cx/gpt-6-*` | 872,000 (CLI max) | **1,050,000** |
| `cx/gpt-5.6-*` | 272,000 (CLI default) | **1,050,000** |
| `[1m]` variants | 872,000 (**smaller** than base) | equal to base |

The CLI ceilings stay recorded under `limits.cliDefaultContext`/`cliMaxContext` with their
existing "not a backend hard cap" semantics — a genuinely different concept, not deleted.

**Not changed, with reasons:** `cx/gpt-5.4`, `cx/gpt-5.4-mini`, `cx/gpt-5.3-codex-spark` keep
their window **unset** because the route rejects them outright ("not supported when using Codex
with a ChatGPT account", reproduced live). Advertising a window would promise a capability the
route cannot serve.

**Also fixed here (found while verifying):** eleven Gemini records withheld their window
entirely, so **17 of 334 models** reached clients with **no `context_length` at all** — a
missing number, not a wrong one. See [09-p09](09-p09-model-coverage.md) §B.

---

## 03 — Rate limiting, headers, health

**Evidence:** the `apiKeys` table had **no quota column** (`id, key, name, machineId, isActive,
createdAt`) and `validateApiKey()` returned a plain boolean. Nothing bounded what a *client*
consumed; the only limits were the dashboard login limiter and the **upstream** account
cooldowns. 12 rapid requests passed with no 429, and no `x-ratelimit-*` header existed.

**Fixed** — `src/lib/rateLimit/v1Limiter.js`: per-API-key fixed window plus a burst guard,
hashed bucket keys (the raw key must never sit in a process-lifetime Map), bounded table,
`Retry-After` + `x-ratelimit-*` on 429 and the same advisory headers on success. Runs after
authentication (so the bucket is attributable) and before dispatch.

**Numbers chosen, and why:** **600 RPM / 120 per second**, env-tunable. Derived from measured
traffic, not guessed — production peaks at **~246 requests/minute**, leaving ~30x headroom, so
the defaults cannot throttle normal operation.

**Risk:** counters are in-memory and reset on restart; this is a guard rail, not billing.

**Security headers:** added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, HSTS to every rule, and replaced `Access-Control-Allow-Headers: *` with
the explicit list the handlers actually read. **Not cosmetic** — the gateway is published
through a Cloudflare tunnel (`zen.hlcyn.xyz` → `127.0.0.1:20128`, confirmed in
`/etc/cloudflared/config.yml`).

**Health:** `/api/health` returned a constant `{"ok":true}` and the tunnel watchdog read it, so
it reported healthy even with storage unreachable. Now it performs a real database read,
returns **503** on failure, and reports uptime, version, locked accounts and how many need
re-authentication. Counts only — no email, token or key is ever serialised.

**Verified at runtime** on an isolated `DATA_DIR`: 429 with `Retry-After` (RPM=4/BURST=2
fixture), all five security headers, the explicit CORS allowlist, deep health JSON.

**Not done:** no per-key quota/budget columns (the prompt listed them as an option). Rate
limiting addresses the stated risk; per-key budgets are a product decision.

---

## 04 — PII and observability

**Evidence:** journald carried **589 lines with 27 unique account emails**, because
`connectionName` resolves to `displayName || name || email || id` and was interpolated raw.

**Fixed** — `src/shared/utils/accountRedaction.js`: identities become a salted short hash
(`acc_a3f9c1eb`, salted with `MACHINE_ID_SALT` so hashes differ per host). `connectionName`
itself is untouched because it is used functionally; redaction happens at the log boundary.

**Verification (verbatim, required by the prompt):** with two connections *named* email
addresses, after triggering requests:

```
$ grep -cE "@[a-z]+\.(com|net|org)" /tmp/zen-pii.log
0

$ grep -oE "acc_[a-f0-9]{8}" /tmp/zen-pii.log | sort -u
acc_2848f0bc
acc_c56f4a4c
```

**Zero emails, and the two accounts remain distinguishable** — so the log is still useful for
debugging, which was the prompt's second requirement.

**Metrics now answerable (prompt's third requirement):**

```
$ curl .../api/metrics | grep ttft
zenrouter_ttft_ms{quantile="0.5"} 210
zenrouter_ttft_ms{quantile="0.9"} 340
zenrouter_ttft_ms{quantile="0"} 120
zenrouter_ttft_ms{quantile="1"} 340
zenrouter_ttft_ms{quantile="mean"} 223
zenrouter_ttft_samples_total 3
```

**TTFT was previously unqueryable.** The value was computed and printed but never stored, so
the audit's own 5,471 ms median / 18,067 ms p90 required parsing 304 log lines. Now persisted
(`usageHistory.ttftMs`, nullable — **NULL, never 0**, so unmeasured rows do not drag the median
down) and exposed as above, gated on having samples so a scrape never records a fake 0.

**`catch {}` swallowed crashes:** a bare catch returned a generic 500 while handing the client a
`serverRequestId` that appeared **nowhere in the logs**. Now logged with that id via
`errorLine()` (always printed regardless of `LOG_LEVEL`). Prompt and response content never are.

**Alerting:** recommendations in [10-alerting-recommendations.md](10-alerting-recommendations.md)
— five alerts, three implementation options, and anti-noise rules drawn from this incident.
Not implemented, as the prompt specified.

---

## 05 — Internal detail leaking to clients

**Evidence:** production returned
`{"message":"No active credentials for provider: openai"}`, naming the upstream provider.

**Full leak inventory and disposition:**

| Location | Leaked | Now |
|---|---|---|
| `chat.js` all-accounts-rate-limited | `[provider/model]` + raw upstream error | neutral |
| `chat.js` no-credentials | `No active credentials for provider: X` | neutral |
| image / video / search / tts / stt / embeddings / fetch handlers | `provider: ${...}` | neutral |
| `v1beta/models/[...path]` | provider id | neutral |
| `videoGeneration` unsupported modality | internal reason | neutral |
| fetch/search `Unknown provider: <input>` | **kept** — echoes the caller's own argument | unchanged |
| `/api/translator/*`, `/api/providers/*` | **kept** — operator-only dashboard routes | unchanged |

**Before → after (verbatim):**

```json
// before
{"error":{"message":"No active credentials for provider: openai","code":"model_not_found"}}
// after
{"error":{"message":"The requested model is not available right now.","code":"model_not_found"}}
```

**Machine-readable diagnostics are still forwarded** (`type`/`code`/`param`, e.g.
`output_budget_exhausted` with "increase max_tokens"). These are Zen-authored, actionable, and
reveal nothing about routing. Two existing tests asserted that distinction and caught a first
attempt that over-corrected by removing them.

**Prefix never leaks:** verified live — `/v1/responses` returns `"model": "gpt-6-luna"`, not
`cx/gpt-6-luna`.

**Not done:** the prompt's table asked for every error message in the codebase. The handlers
listed above were all fixed; a few provider-specific executor errors still embed upstream text
that the client sees. Not exhaustively enumerated.

---

## 06 — Full audit: all 11 code findings verified in the code

Re-checked against the current tree, not the earlier narration:

| # | Finding | Verified |
|---|---|---|
| 1 | No inbound quota/rate limit | ✅ `v1Limiter.js` exists, wired, 429 path present |
| 2 | `Retry-After` discarded | ✅ 4th arg passed at `combo.js:635` |
| 3 | Translation param loss | ✅ `stop`/`top_p`/`seed`/`metadata` mapped |
| 4 | No mid-stream failover | ✅ `onStreamFailed` in handler + chat |
| 5 | `catch {}` without log | ✅ `errorLine` present |
| 6 | `Retry-After: NaN` | ✅ guarded by `Number.isFinite` |
| 7 | 4 Maps without eviction | ✅ all four use `setBounded` |
| 8 | Passthrough capability skip | ✅ `prefetchRemoteImages` on both paths |
| 9 | `is_error` tool lost | ✅ `[tool_error]` marker |
| 10 | 4 dead functions | ✅ all four removed (0 definitions) |
| 11 | Health always healthy | ✅ real DB check, 503 on failure |

**Not "fixed" deliberately:** the two hypotheses the audit already disproved (`tee()` leak,
`peekStreamForContent` 45s) were left alone, as instructed.

**Untouched, as instructed:** the five areas listed as "already good" — SSE watchdog, SSRF
defence, IP/peer-token hardening, layered secret redaction, fail-open token savers.

---

## 07 — `/v1/responses`

Full report: [08-p07-responses-and-tool-calling.md](08-p07-responses-and-tool-calling.md).

**Answer: not needed yet.** Zen's `/v1/responses` works correctly and returns the model without
the prefix. Measured TTFT on `cx/gpt-6-luna`, 4 streaming samples per path: `/responses`
**0.691 s** median vs `/chat/completions` **1.089 s** — the GPT path pays an
`openai→openai-responses` translation today. But a third protocol in ByKitsune must
independently carry guardrails, `gatewayAdmission` and billing reserve/settle, and the Responses
usage shape differs. A ~0.4 s saving does not justify that surface.

**Tool calling — the metadata is stricter than reality.** Tested over `/chat/completions` and
the claim did **not** hold:

| model | path | `reasoning_effort` | result |
|---|---|---|---|
| `cx/gpt-6-luna` | chat completions | (none) | ✅ tool call emitted |
| `cx/gpt-6-luna` | chat completions | `none` | ✅ |
| `cx/gpt-6-luna` | chat completions | `low` | ✅ |
| `cx/gpt-6-luna` | chat completions | `high` | ✅ |
| `cx/gpt-6-luna` | chained (tool result returned) | — | ✅ `finish_reason: stop` |

The metadata strings were **not** changed: they quote upstream documentation and per-effort
coverage exists for one model, so editing them would swap one unverified claim for another.

**Not verified:** per-effort coverage for models other than `gpt-6-luna`; TTFT samples are 4 per
path taken minutes apart, so the delta is indicative, not precise.

---

## 08 — Deploy evaluation

**Status: evaluated, NOT deployed.** Production is still 0.9.7, running since 2026-10-12.

The prompt's premise ("0.9.8 contains security fixes, production is exposed") was **verified**:
`proxy-addr` is absent from 0.9.7's 26-package `node_modules`, and `npm audit --omit=dev` on
0.9.7 reports the `node-forge` advisory only.

**Important correction to the prompt's premise:** 0.9.8 does **not** contain the audit fixes.
Verified file-by-file — 0.9.8 has none of: the corrected context window, the overflow 400, the
revoked-token cooldown, the inbound limiter, PII redaction or neutral client errors. Those all
landed in 0.9.9. Deploying 0.9.8 would therefore not have addressed prompts 01–05 at all.

Deploy plan prepared (not executed): separate `/opt/zenrouter/0.9.9` directory, same
`DATA_DIR=/var/lib/zenrouter` (`**must not change**`), systemd unit backup following the
existing `.bak-0.7.0` pattern, rollback to 0.9.7 available. Downtime: a few seconds, during
which GPT is unavailable in ByKitsune (GPT exists only on Zen).

**Awaiting the owner's explicit confirmation**, as the prompt requires.

---

## 09 — Model coverage

Full report: [09-p09-model-coverage.md](09-p09-model-coverage.md). Summary:

- **All 12 `cx/` routes tested live** with `max_tokens: 1000` (never a small cap). **8 work, 4
  are rejected** by the ChatGPT-account route. The four now carry `routeAvailable: false` with a
  machine-readable reason; ids retained so a stored combo resolves into a clear failure.
- **`context_length` null:** the prompt reported 3; the real count was **17 of 334**. Root cause
  was eleven Gemini records declaring `unverifiedCapabilityFields: ["contextWindow"]`, which
  nulls the field, combined with `/v1/models` only emitting `context_length` when finite. After
  the fix: **12**, and every remaining one is genuinely unservable or genuinely unverified.
- **Candidates worth adding to ByKitsune:** 5 strong (`cx/gpt-6.1-sol`, `cx/gpt-5.6-luna`,
  `cx/gpt-5.6-terra`, `cx/gpt-5.6-sol`, `ag/claude-sonnet-4-6`, `gemini/gemini-2.5-flash`), each
  tested live, with what **not** to add and why. **No ByKitsune change made**, as instructed.
- **Deprecation audit (added request):** 15 model-level `deprecated: true` entries across 4
  providers were **not enforced on the API path at all** — the flag was UI-only. Reproduced: a
  connected `deepseek` advertised two retired aliases. Now filtered, while a **provider-level**
  `deprecated: true` (RISK_NOTICE for claude/codex/antigravity/…) is correctly NOT treated as
  retirement — filtering those would hide all 19 `cx/` models.
- **Two retired Gemini ids found and flagged:** `gemini-2.5-pro` (404, 5/5) and
  `gemini-2.5-flash-lite` (404, 2/2 plus 30 days of logs). Deliberately **not** flagged:
  `gemini-3.5-flash-lite` and `gemini-2.5-flash` (both HTTP 200), and `gemini-3.1-pro-preview`
  (429 = quota; it is the replacement Google's own message recommends).

---

## 10 — Translation and streaming

Full finding list re-verified in code.

**Translation parameter loss** — reproduced by calling `translateRequest()` directly:

| conversion | fields lost |
|---|---|
| `openai → claude` | `top_p`, `stop`, `seed`, `user` |
| `claude → openai` | `top_p`, `stop_sequences`, `metadata` |
| `openai → gemini` | `stop`, `seed`, `user` |

**Fixed** — `openai-to-claude.js`, `claude-to-openai.js`, `openai-to-gemini.js`: `stop` ⇄
`stop_sequences` (string or array), `top_p`, `user` ⇄ `metadata.user_id`, Gemini
`stopSequences` (capped at the documented max of 5) and `seed`.

**Decided NOT to fix, with reasons:**

- `presence_penalty` / `frequency_penalty` on the Claude hop — Anthropic has no equivalent, and
  fabricating one would change sampling unverifiably. Left dropped.
- The two `extractResetsAtMs` copies were **not** merged. Measured: only the `accountFallback`
  copy parses compound durations ("reset after 1m 51s", "Resets in 4m22s"). Both are live;
  merging would have silently regressed reset detection.

**`is_error` lost** — a non-standard field on OpenAI tool messages, which have no such field, so
the receiving model could conclude the tool **succeeded**. Now an in-content `[tool_error]`
marker.

**Mid-stream failover** — `markAccountUnavailable` was only called pre-stream, so an account
failing after the 200 header stayed in rotation: every request returned 200 with truncated
content and no failover, invisible to status-based monitoring. Now marked. A client disconnect
cannot reach that branch (the abort path claims persistence first). **No byte can be un-sent
once a stream starts**, so the fix is to stop reusing the broken account, not to fail over
mid-stream — stated plainly rather than overclaimed.

**New findings beyond the list:**

- The all-accounts-rate-limited path leaked `[provider/model]` + raw upstream text (prompt 05
  area).
- `gemini-2.5-pro` / `gemini-2.5-flash-lite` advertised but retired upstream.
- 15 `deprecated` models advertised despite the flag.
- Gemini windows withheld entirely, removing `context_length`.
- `/api/version` queried npm under the **unclaimed** bare name `zenrouter` (404), so
  `latestVersion` was always `null` and the updater's install command would have failed.
  Reproduced on production 0.9.7; fixed with a single shared constant.
- Six process-local caches with no eviction (`rejectedBetaByConnection`, `usageCache`,
  `oauthCooldown`, `providerMutexes`) — keyed by rotating values (OAuth tokens, connections).

---

## What is NOT done

1. **Production deploy.** Still 0.9.7. Requires the owner's explicit confirmation (prompt 08).
2. **Five code changes are not in any published version.** They landed after 0.9.9 was published and
   npm is immutable. Recorded under `[Unreleased]`; they need a patch release.
3. **Alerting is a recommendation, not implemented** — as prompt 04 specified.
4. **Per-key quota/budget columns** were not added; rate limiting addresses the stated risk.
5. **`node-forge` GHSA-86w9-cpqp-85rv** has no upstream patch. Its affected signature-verification
   path is unreachable from this codebase (asserted by a test, not assumed).
6. **Not every error message is enumerated** for leak analysis; the handlers from prompt 05 are
   all fixed, but executor-level upstream text is not exhaustively audited.
7. **`morph/*` and `gcli/grok-build` caps remain unverified** (404 no-credential, 402
   spending-limit) and are left unset rather than guessed.
8. **`ag/claude-opus-5-5` returned 404** in this environment; unclear whether unentitled or
   misnamed.

---

## Verification

- Full isolated suite: **1,450 files, 4,580 cases — 4,479 passed, 0 failed**; `npx eslint .`
  clean with zero warnings.
- Registry baselines byte-for-byte equal: 82 providers, 117 alias tokens, OAuth URLs.
- Production build succeeds; runtime-verified on isolated `DATA_DIR`s for health, security
  headers, CORS allowlist, 429 with `Retry-After`, metrics 401, the `/api/version` registry
  lookup, Gemini window publication, deprecated-model filtering, Gemini retirement, and TTFT
  persistence.
- Live probes used the production account with small caps (1,000 tokens) plus the context-ceiling
  measurement. No other billable inference was run.
