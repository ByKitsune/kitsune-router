# P04-C — Alerting recommendations (corrected 2026-10-16)

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Recommendations only. No notification service, timer, or production configuration was installed.
The original examples had an inverted health predicate and unsafe assumptions about metrics;
use the corrected requirements below, not the older release-tag examples.

## Signals and limitations

| Signal | Source | Meaning and limitation |
|---|---|---|
| Accounts needing reauthentication | `/api/health` JSON, `accounts.needsReauth` | An aggregate state, not a Prometheus series |
| Database readiness | `/api/health` JSON, `checks.database` | Probe transport failures separately from a false check |
| TTFT percentiles | `zenrouter_ttft_ms{quantile="0.5"}` / `"0.9"` | Measured usage rows only; requires the unreleased `24h` cutoff correction |
| TTFT sample count | `zenrouter_ttft_samples_total` | Rolling-window count, **not** a monotonic counter despite its name |
| Requests, tokens and cost | `zenrouter_*_total` exports | Currently rolling 24h snapshots; **do not use `rate()` or `increase()`** |
| Failure breakdown | `zenrouter_failures_total{status}` | Not yet a reliable incident signal: the exporter expects status objects but the log API returns formatted strings; the legacy append-log hook is a no-op |
| In-flight requests | `zenrouter_requests_in_flight` | A current count, not proof that all accounts for a model are unavailable |

Metrics require a dashboard session or `x-zen-cli-token`. Health is a JSON probe, not a
Prometheus exporter. Scrape over loopback and do not store tokens in command logs.
Missing measurements or missing series mean **unknown**, not zero errors or instant TTFT.

## 1. Reauthentication required

Notify when the count is positive; notify separately for probe/schema failure. `notify` below
represents the operator's existing notification integration and is not a ZenRouter command.

```bash
if ! payload="$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:20128/api/health)"; then
  notify "Zen health probe failed"
elif ! jq -e '.accounts.needsReauth | type == "number"' <<<"$payload" >/dev/null; then
  notify "Zen health response has an unexpected schema"
elif jq -e '.accounts.needsReauth > 0' <<<"$payload" >/dev/null; then
  notify "Zen: an account needs reauthentication"
fi
```

Group and deduplicate notifications until the condition clears. Repeating the same revoked
account every minute recreates the incident's 31-event noise rather than helping an operator.

## 2. Every account for a model exhausted

The current aggregate health and usage endpoints cannot establish this condition. A model-aware
availability signal or an operator-side read of account lock state is needed first. Do not infer
it from zero recorded requests, absence of a time series, or a single upstream 5xx. Do not run
billable synthetic inference every minute merely to populate an alert.

## 3. Authentication and rate-limit pressure

A future implementation needs independently recorded terminal request outcomes and the source
of a 429 (inbound limiter versus upstream quota). Current rolling usage/log snapshots do not
support reliable 10-minute failure rates, and one 429 does not prove the cause. Do not deploy
the earlier `increase(zenrouter_failures_total[...])` or `rate(...)` examples.

The journald state-transition messages can provide a temporary deduplicated operator signal;
verify message coverage and redaction first rather than assuming every failure is recorded.

## 4. TTFT regression

After the cutoff correction is deployed, an example percentile threshold is:

```promql
(zenrouter_ttft_ms{quantile="0.9"} > 15000)
and on(job, instance)
(zenrouter_ttft_samples_total > 20)
```

The explicit target-label match matters: the left operand has a `quantile` label and the right
one does not. Without `on(...)`, default vector matching makes the rule silently empty.
Preserve any additional deployment target labels in the match if present. These are 24h
percentiles, not a 10-minute regression detector. Also, the stored timing currently reflects
the handler's first-byte measurement, which can include metadata/heartbeats; do not claim
semantic first-generated-token accuracy until that upstream measurement is corrected.

## Single-host implementation choices

1. A systemd timer plus a small JSON-checking script is sufficient for the health-state alert.
   Use the existing notification channel, a timeout, grouping, and state persistence.
2. An existing Prometheus/Alloy and Alertmanager deployment can scrape metrics with authentication.
   Add failure-counter instrumentation before enabling failure-rate rules.
3. A journald watcher is a temporary option for specific redacted state transitions, not an
   authoritative request/failure-rate database.

Nothing here authorizes a service restart or mutates production. The unpublished fixes and
remaining instrumentation limitations are intentional requirements, not already-completed alerts.
