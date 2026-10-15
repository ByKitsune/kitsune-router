# ZenRouter 0.9.9 release notes

**2026-10-15** · Previous **published** release: **0.9.7** · Requires **Node.js >=22.19.0**.

> **If you are upgrading from 0.9.7, this release also contains 0.9.8.** The 0.9.8 batch
> was committed but never published (no tag, no GitHub release, npm `latest` stayed
> 0.9.7). 0.9.9 is 41 commits on top of `v0.9.7`, so you get both batches at once: the
> critical dependency-advisory removal and the Tier-1 upstream ports from 0.9.8, plus
> everything described here.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.9) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.9/CHANGELOG.md) · [Technical changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.9/docs/CHANGELOG_v0.9.9.md)

0.9.9 answers an external audit (11 prompt documents) and a full catalog verification
against models.dev. Every finding was reproduced against the running gateway before
being changed, and each fix ships with a regression test. No breaking API change.
[0.9.8 release notes](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.8.md)
were written for an unpublished batch and remain historical; read them as "what 0.9.9 also
contains", not as a prior published version.

## Highlights

- **A client can no longer drain every provider.** The `apiKeys` table had **no quota
  column at all** and `validateApiKey()` returned a plain boolean — the only limits in the
  codebase were the dashboard login limiter and the *upstream* account cooldowns. One
  leaked key could burn every paid account. `/v1` now has per-key rate limiting (600 RPM,
  120/s burst, env-tunable) with `Retry-After` and `x-ratelimit-*` headers. Defaults came
  from measured production traffic (peak ~246 req/min → ~30x headroom), so normal use is
  untouched.
- **Context overflow stops lying about itself.** An over-long prompt arrived as
  `context_length_exceeded` **inside a 200-OK SSE stream** and was converted to 503 → 502.
  ByKitsune retries 502, so a prompt that could never succeed was retried while every
  healthy account was locked for 30s in turn, then the circuit breaker fast-failed the
  whole model. It is now a 400 with `invalid_request_error`, and no account is rotated.
- **Context windows were under-reported by up to 778k tokens.** `/v1/models` published the
  Codex **CLI** ceiling (872,000; the 272,000 CLI default for GPT-5.6) as `context_length`.
  Measured live: 402,486 tokens accepted for a model advertised at 272,000, and 902,486 for
  one advertised at 872,000, with the real ceiling at 922,000. All GPT-6 / GPT-5.6 routes
  now report the API specification (1,050,000 / 922,000 / 128,000).
- **A dead account was retried forever.** A revoked OAuth token matched no error rule and
  fell through to the generic 401 cooldown, so it was retried every 2 minutes — production
  logged 31 events across 8h, retrying one account 16 times. Revocation now gets a 1h
  cooldown and a `needs_reauth` status so the dashboard stops showing it as a temporary
  cooldown. The refresh attempt is deliberately kept: unlike an org-policy denial, a
  revoked token may still be recoverable with a valid refresh token.
- **Account emails are out of the logs.** Journald carried 589 lines with 27 unique email
  addresses. Identities are now a salted short hash — still greppable and distinguishable
  for debugging, not reversible.
- **Translation stops silently changing behaviour.** `top_p`, `stop`/`stop_sequences`,
  `seed` and `metadata.user_id` were dropped on several hops, and a failed tool result was
  reported through a non-standard field the model cannot see. A client setting
  `stop: ["</end>"]` received untruncated output whenever the gateway routed to Claude.
  All four now map explicitly; the failed-tool flag is an in-content `[tool_error]` marker.

## Catalog verification against models.dev

The owner's requirement was to verify every model against <https://models.dev> and
cross-check with Griphub and 9router. A naive comparison reported **206 mismatches**; only
**5** were real, and separating them was the actual work:

- **Unit conventions** (256000 vs 262144, 1000000 vs 1048576, 128000 vs 131072) accounted
  for most of them — 43 of the Griphub differences were this alone.
- **Route-scoped caps** accounted for the rest: an IDE/OAuth bridge enforces its own limit
  on purpose. Verified by checking the vendor's own entry — `zai/glm-4.6v` = 128000 matches
  Zen exactly while an aggregator listed 200000. Kiro (272k) and Antigravity (250k for
  Claude) are bridges, not errors.

The five real defects, all fixed: `gpt-4.1*` used a rounded 1,000,000 instead of the
vendor's exact 1,047,576; `command-a-translate-08-2025` inherited 128,000 from its family
glob when its official window is 8,000 (a **16x over-promise**); the three `ministral-*`
sizes all shared 128,000 (vendor: 131,072 for 3B, 262,144 for 8B/14B); and
`codestral-latest` used 128,000 where the vendor reports 256,000.

Result: **0 actionable mismatches** against official vendor entries, 386 models agreeing,
108 route-scoped differences confirmed intentional, and **448 rows with no models.dev
reference reported as such** rather than silently treated as verified.
`scripts/verify-catalog-against-modelsdev.mjs` reproduces the analysis.

Note: 9router still carries the old `gpt-4.1` value, so these corrections are **more**
accurate than upstream, not a port from it.

## Four Codex routes cannot be served, and now say so

Testing every `cx/` route live with `max_tokens: 1000`:

- **Works:** `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`,
  `gpt-5.6-terra`, `gpt-5.6-luna`, `codex-auto-review`.
- **Rejected:** `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark` — each
  answers *"not supported when using Codex with a ChatGPT account"*.

They were listed in `/v1/models` with no indication they cannot be served, and ByKitsune
reads that catalog. They now carry `routeAvailable: false` with a machine-readable reason,
and the ids are retained so a stored combo resolves into a clear "not available" instead
of a 404.

## New endpoints

- `GET /api/health` is now a real probe: a database read, **503** when storage is
  unreachable, plus uptime, version, and the counts that made operators blind — locked
  accounts and how many need re-authentication. Counts only; no email, token or key.
  Previously it returned a constant `{"ok":true}` that the tunnel watchdog read.
- `GET /api/metrics` serves Prometheus text: models in use, failures per HTTP status,
  in-flight requests. Token-gated because it reveals traffic shape, and strictly aggregate.

## `/v1/responses`: evaluated, not adopted

Full report in the technical changelog and `docs/audit/08-p07-responses-and-tool-calling.md`.
Zen's `/v1/responses` works and measured **~0.4s faster TTFT** than
`/chat/completions` on `cx/gpt-6-luna` (median 0.691s vs 1.089s), because the GPT path
currently pays a translation on every request. **It is still not being added to
ByKitsune**: a third protocol must independently carry guardrails, `gatewayAdmission` and
billing reserve/settle, and GPT traffic has run through `/chat/completions` with no
reported failure. The metadata claim that tool calling requires `/responses` was tested and
**does not hold** — tool calls work at `reasoning_effort` none, low and high, including a
chained call. The metadata was deliberately left alone rather than swapped for another
unverified claim.

## Security posture

This is **not** a vulnerability-free release, and it does not claim to be. The
`node-forge` advisory (GHSA-86w9-cpqp-85rv) still has **no patched release upstream**; its
affected signature-verification path is unreachable from this codebase, asserted by a test
rather than assumed. Dev-graph advisories do not ship in the production install.

Hardening added this release is real but modest in effect: baseline security headers and an
explicit CORS allowlist (the gateway **is** published through a Cloudflare tunnel —
`zen.hlcyn.xyz` → `127.0.0.1:20128`), neutral client-facing errors instead of messages that
named the upstream provider, PII-redacted logs, and the new inbound rate limit.

## Verification and caveats

- Isolated Vitest suite on Node 24.19.0: **1,436 files, 4,525 cases — 4,424 passed, 0 failed**. `npx eslint .` is clean with zero warnings.
- Registry baselines (82 providers, 117 alias tokens, OAuth URLs) byte-for-byte equal.
- Production build succeeds; a standalone smoke run on an isolated `DATA_DIR` verified the
  deep health JSON, all five security headers, the explicit CORS allowlist, `429` with
  `Retry-After` and `x-ratelimit-*`, and `/api/metrics` returning 401 unauthenticated.
- Live probes used the production account with small token caps, plus the context-ceiling
  measurement described above. No other billable inference was run.
- Catalog work is metadata. It **does not** establish account entitlement, upstream
  availability, or live-verified limits for the 448 rows with no models.dev reference.
- Rate-limit counters are in-memory and reset on restart: this is a guard rail, not billing.
- Upstream Tier-2/Tier-3 items from `docs/audit/07-upstream-sync-2026-10.md` remain open.
