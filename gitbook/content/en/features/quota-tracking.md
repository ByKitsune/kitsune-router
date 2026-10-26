# Quota and Usage Tracking

Kitsune Router records request usage locally and displays available upstream quota/reset information where supported. A usage estimate, a provider allowance and a billed invoice are different things.

## Read the data correctly

- Measured input/output and cached tokens use route-specific upstream counters where available. Missing values are not fabricated zeroes.
- Quotas can be account-, model-, service- or time-window-specific. Missing/failed probes do not establish a fresh allowance or invalid account.
- Cost estimates use reviewed route/tier prices and saved operator overrides. **Unknown is not free.** A known subtotal plus an unpriced count is not a complete total.
- Delivered processing tier can differ from requested tier. Subscription credits and multipliers are not public API-dollar invoices. See [processing speed](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md).
- Retries can incur usage; client cancellation does not prove the upstream stopped billing. Do not infer a hard monetary budget from a token cap.

## Storage and backup

Configuration and active usage share SQLite at `${DATA_DIR}/db/data.sqlite`. Legacy `usage.json`/`db.json` are migration inputs, not current active storage. Keep an absolute `DATA_DIR` and back up the entire stopped installation, including secrets, auth keys and optional certificates. See [operations](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

## Monitoring limits

Inspect the installed authenticated `/api/metrics` output before writing alerts. Rolling-window totals are snapshots, not monotonic counters: do not blindly apply Prometheus `rate()`/`increase()`. Health is `/api/health`; neither health nor fixtures prove live entitlement. Historical metric names and audit pass counts are dated evidence, not current release verification.

Compression can reduce some workloads but has no fixed savings percentage. Use the upstream billing dashboard for actual charges and respect provider terms/reset deadlines.
