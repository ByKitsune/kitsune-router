# P04-C — Alerting recommendations

**Date:** 2026-10-16 · **Scope:** recommendations only, as the audit asked ("sebutkan rekomendasi, bukan harus diimplementasikan sekarang").

The audit's evidence: `token_revoked` fired **31 times in 8 hours** and nobody noticed. One account was retried 16 times. The gateway had metrics but no way to tell a human that something was wrong.

---

## What is now observable

These exist after 0.9.9 plus the post-publication fixes, so an alert can be built on them without new instrumentation:

| Signal | Source | Example |
|---|---|---|
| Failures by HTTP status | `zenrouter_failures_total{status}` (`/api/metrics`) | `zenrouter_failures_total{status="401"} 31` |
| TTFT distribution | `zenrouter_ttft_ms{quantile}` | `zenrouter_ttft_ms{quantile="0.9"} 18067` |
| TTFT sample count | `zenrouter_ttft_samples_total` | guards against alerting on a thin window |
| Locked / needs-reauth accounts | `/api/health` (JSON, not Prometheus) → `accounts.locked`, `accounts.needsReauth` | `{"locked":3,"needsReauth":1}` |
| In-flight requests | `zenrouter_requests_in_flight` | detects a stuck queue |
| Requests and cost | `zenrouter_requests_total`, `zenrouter_cost_usd_total` | budget drift |

Scrape both over loopback. `/api/metrics` is token-gated (`x-zen-cli-token`); `/api/health` is public because the tunnel watchdog reads it. **They are different formats** — metrics is Prometheus text, health is JSON — so a health-based rule needs a JSON check, not PromQL. Every series named below exists in `src/app/api/metrics/route.js`; the health fields exist in `src/app/api/health/route.js`.

---

## Recommended alerts, in priority order

### 1. Accounts need a human to re-authenticate (highest value)

There is **no Prometheus series** for this state, so it cannot be expressed in
PromQL. Poll the JSON endpoint and compare the field:

```bash
# Fires when any account has been permanently revoked rather than cooled down.
curl -sf http://127.0.0.1:20128/api/health \
  | jq -e '.accounts.needsReauth > 0' >/dev/null || notify "Zen: an account needs re-authentication"
```

**Why first:** this is precisely the failure that went unnoticed for 8 hours. A revoked token never heals on its own — the account stays dead until a person re-links it, and every retry is wasted latency for a real user. The fix in 0.9.9 made this state *visible* (`needs_reauth`); the alert makes it *actionable*.

**Suggested severity:** page, but only once — do not repeat every cooldown cycle.

### 2. Every account for a model is exhausted

```promql
# Any model whose failures cluster while no request succeeds.
increase(zenrouter_failures_total{status=~"5.."}[10m]) > 20
and
increase(zenrouter_requests_total[10m]) == 0
```

**Why:** when all accounts for a model are down, users see errors and the operator sees a flat line of 5xx. Catching it before a user reports it is the difference between a blip and an outage.

### 3. Authentication failures rising

```promql
increase(zenrouter_failures_total{status="401"}[15m]) > 5
increase(zenrouter_failures_total{status="403"}[15m]) > 5
```

**Why:** 401/403 is the fingerprint of both a revoked token (alert 1) and a credential misconfiguration. A sudden rise is the earliest signal that a provider changed something.

### 4. Rate-limit pressure

```promql
# Sustained 429s mean either a provider quota is exhausted or an inbound client
# is hitting the new /v1 limiter.
rate(zenrouter_failures_total{status="429"}[10m]) > 0.5
```

**Why:** distinguishes "the provider is throttling us" from "we are throttling a client". Both need a different action: buy quota, or raise `V1_RATE_LIMIT_RPM`.

### 5. TTFT regression

```promql
# p90 above 15s with enough samples to be meaningful.
zenrouter_ttft_ms{quantile="0.9"} > 15000
and
zenrouter_ttft_samples_total > 20
```

**Why:** the audit measured a p90 of 18,067 ms. Latency degrades gradually, so nobody notices until users complain. The sample-count guard matters: alerting on three requests is noise.

---

## Implementation options on a single shared host

Zen and ByKitsune share one machine, so a heavyweight observability stack is the wrong shape. In increasing order of effort:

**Option A — systemd + a script (no new service).** A timer runs every minute, scrapes `/api/health` and `/api/metrics` over loopback, and calls the operator's existing notification channel (a Telegram bot, or `ntfy`) when a threshold trips. Fits the current deployment — there is already a `zenrouter.service` unit and a logs directory. No container, no database.

**Option B — point Prometheus at it.** Both endpoints already speak the right format, so an existing Prometheus (or Grafana Alloy) can scrape `127.0.0.1:20128` with no agent on the box. Best if a monitoring host already exists. Alertmanager then handles routing, silencing and grouping — which matters for alert 1, where the same condition is true every minute until a human acts.

**Option C — journald-native (least new code).** A small script greps `journalctl -u zenrouter` for the state transitions the logger already emits (`NEEDS RE-AUTH`, `Circuit breaker:`, `locked modelLock_`) and notifies on first occurrence. Cheapest to write, and it reuses log lines that are already verified to contain no PII. Weakest at rate-based conditions like "TTFT got worse".

**Recommendation: A now, B when a monitoring host exists.** Option A adds no long-running service and directly covers alerts 1–3, which are the ones with production evidence behind them. Option B is the right destination, because alert grouping is what stops a 31-event incident from becoming 31 notifications.

---

## Anti-noise rules (learned from this incident, not theory)

1. **Alert on state, not on events.** `token_revoked` fired 31 times for one root cause. Alert on "an account needs re-auth" (a state that persists), not on each retry (an event that repeats).
2. **Always ship a sample-count guard** with any percentile alert. `zenrouter_ttft_samples_total` exists for exactly this.
3. **Group by condition, not by account.** One notification listing the affected accounts beats one per account.
4. **Distinguish cooldown from revocation.** A cooldown is self-healing and should not page; a revocation needs a person.
5. **Never alert on a single 5xx.** 0.9.9 added a one-retry grace for sporadic upstream 5xx precisely because a lone flake is not an incident.

---

## Not implemented

No alerting is implemented — this is the recommendation the audit requested. Nothing here requires a code change to Zen: every signal is already exposed by `/api/health` and `/api/metrics`, and both were verified at runtime in an isolated `DATA_DIR`.
