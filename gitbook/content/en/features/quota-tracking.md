# Quota and Usage Tracking

Kitsune Router records request usage locally and displays available upstream quota/reset information where supported. A usage estimate, a provider allowance and a billed invoice are different things.

## Read the data correctly

- Measured input/output and cached tokens use route-specific upstream counters where available. Missing values are not fabricated zeroes.
- Quotas can be account-, model-, service- or time-window-specific. Missing/failed probes do not establish a fresh allowance or invalid account.
- Cost estimates use reviewed route/tier prices and saved operator overrides. **Unknown is not free.** A known subtotal plus an unpriced count is not a complete total.
- Delivered processing tier can differ from requested tier. Subscription credits and multipliers are not public API-dollar invoices. See [processing speed](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md).
- Retries can incur usage; client cancellation does not prove the upstream stopped billing. Do not infer a hard monetary budget from a token cap.

## Dashboard refresh and retry

In the 2026-10-29 source follow-up, a committed usage update schedules a debounced refresh of both statistics and the chart for the selected period. The dashboard also refreshes when its stream opens or reconnects. Active and recent requests, pending state and provider errors continue to update through the live stream independently of the period totals.

When a newer client connects to an older server, its first all-time stream snapshot and subsequent changes to committed totals or breakdowns trigger a selected-period refresh; pending-only messages do not. The all-time snapshot itself never replaces the selected-period totals. An already open tab still running the previous client must be reloaded after an upgrade to receive these changes.

Passage of time alone does not trigger a refresh when a period rolls forward. Switch periods or reload the page to recalculate it. A legacy stream also cannot reveal a change that leaves every compared aggregate and breakdown unchanged.

If a statistics or chart refresh fails, the dashboard keeps the last successful data and labels it with the period it actually covers, which may differ from the current selection. Use the displayed retry control; if prompted about an expired session, sign in again. The original cause of the user's browser issue is not confirmed by these source changes or synthetic tests.

## Pricing coverage in the source follow-up

Removing unscoped vendor-family fallbacks prevents prices from being borrowed across different provider products, but reduces future estimate coverage. Some routes that previously showed numeric prices, including Kiro, CodeBuddy and gateway subscription routes, may now show unknown costs. Existing recorded costs are not repriced.

Exact models.dev references use the provider/product and literal model ID. Only compatible public pay-as-you-go text-token rows can supply catalog estimates; subscription, modality, conditional and quote-only references are not automatically token rates. The scheduler attempts a validated full refresh every six hours. Each observation applies from its actual observation time until strictly before 24 hours later, selected by the recorded request timestamp. Failed fetches and HTTP 304 do not renew the observation; `MODEL_CATALOG_SYNC=off` disables outbound refresh but leaves stored observations readable. Saved overrides and recorded history remain separate, missing components stay unknown, and references are not invoices. See the [current all-registry audit](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/22-pricing-capability-localization-2026-10.md).

OpenCode's provider-reported `usage.cost` and Go allowance fields are not yet retained by the usage ledger. Consult the provider's dashboard for those amounts; an allowance reference is not a cash charge, and even a provider-reported amount can differ from the final charge.

## Storage and backup

Configuration and active usage share SQLite at `${DATA_DIR}/db/data.sqlite`. Legacy `usage.json`/`db.json` are migration inputs, not current active storage. Keep an absolute `DATA_DIR` and back up the entire stopped installation, including secrets, auth keys and optional certificates. See [operations](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

## Monitoring limits

Inspect the installed authenticated `/api/metrics` output before writing alerts. Rolling-window totals are snapshots, not monotonic counters: do not blindly apply Prometheus `rate()`/`increase()`. Health is `/api/health`; neither health nor fixtures prove live entitlement. Historical metric names and audit pass counts are dated evidence, not current release verification.

Compression can reduce some workloads but has no fixed savings percentage. Use the upstream billing dashboard for actual charges and respect provider terms/reset deadlines.
