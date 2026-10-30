# Recorded pricing accuracy and dashboard motion — 2026-10-31

Review date uses Asia/Jakarta. Source base:
`03551d6c165749294f46fbb083cba01c151870a7`.

## Report and evidence boundary

The reported Consumption breakdown contains wholly unpriced requests, partial
known subtotals, genuine zero components and older dated usage. The pasted rows
do not identify their providers/models, and this session does not have the
operator's deployed database. Six parallel reviews investigated pricing,
database aggregation, native token counters, pricing presentation, navigation
and graph rendering against the current source.

Unknown cost is not automatically a parser failure. Subscription credits,
non-token billing, missing exact product tariffs, unconfirmed service tiers and
historical requests outside a verified catalog observation can remain unknown.
The changes below correct reproduced defects without replacing unknowns with
zero or borrowing another provider's prices.

## Pricing and durable usage corrections

- **Consumed dynamic models were absent from pricing configuration.** The
  effective editor and diagnostic views now include distinct consumed exact
  provider/model identities, including ByKitsune, plus retained daily model
  identities after raw-history pruning. Unknown rows remain editable empty
  quotes. An operator override can price a new request without changing a
  previously accepted unknown quote. Daily identities are read in 64-day
  keyset-paged batches; the raw query selects distinct identities only. This
  admin-view query still scales with retained history and does not run on the
  per-request billing path.
- **Literal annotated model detection consulted the wrong catalog instant.**
  It now uses the same request timestamp as rate resolution. Tests cover a
  separately quoted literal appearing or disappearing in a later observation,
  exact provider ownership and custom endpoint identity.
- **Accepted native numeric-string counters became unmarked zeroes.** The
  shared usage bridge now preserves the finite safe-integer strings already
  accepted by its validator. Explicit primary zeroes take precedence over stale
  aliases. `estimated: true` survives normalization, cumulative merging, JSON,
  durable usage acceptance and redacted request-detail flushing. Invalid
  counters retain their existing invalidity handling.
- **Daily account summaries overwrote their model identity.** New durable
  buckets retain the connection/model/provider tuple. Response identities use
  connection IDs rather than editable display names, and local no-key requests
  retain separate model/provider buckets across live and daily periods. SQLite
  regressions compare all supported periods, reopening and duplicate events.
- **Old collapsed account summaries claimed an unsupported model allocation.**
  Their read projection now marks `modelAllocationUnknown` and displays
  “Model allocation unavailable”, separately from precise new buckets. Stored
  totals, coverage and original metadata are unchanged. A lost per-model split
  cannot be recovered from a collapsed daily record when raw attempts are gone.

No schema migration or operator-database edit is required. Accepted history is
not repriced, and existing outbox deduplication/recovery remains in force.

## Cost and request-detail presentation

The previous UI invented missing legacy input/output components by dividing the
recorded total in proportion to token counts. It also defaulted a missing total
to zero. Components now preserve recorded values, including explicit zero and
null, and keep absent components unknown. Missing prompt/output cost cannot be
proved zero by visible token counters because historical aggregates can omit
cache-write/reasoning units. A measured zero cache-read counter can still
establish that its isolated cached-cost component has no usage.

Amounts, “known subtotal” and unpriced counts use separate readable lines and
real text spacing. A compact conditional coverage explanation links to pricing
configuration and explains why saved history can remain unpriced. Same-name
accounts have independent expandable groups with stable IDs and friendly
labels; grouping uses a Map so literal names such as `__proto__` remain valid.

Request Details preserves explicit zero/null alias priority, distinguishes
missing or malformed counters and latency from measured zero, and shows
estimated/invalid-usage markers. It no longer manufactures input counts from a
larger cache counter. Valid numeric-string counters in legacy imports use the
same safe-integer acceptance rules as native accounting. Redacted output is
labeled “Content redacted” instead of
claiming the provider returned empty content. Privacy projection remains intact.
New labels are registered in English and translated into Indonesian.

## Navigation and routing map

React 19.3 native view transitions animate committed dashboard content with a
short crossfade/slide while preserving the shell, header and live React tree.
There is no delayed router action or duplicate outgoing component tree. Browsers
without the API receive an arrival-animation fallback; reduced-motion disables
movement. Browser checks cover navigation interruption/back, same-route form and
focus continuity, and ordinary usage refreshes.

The routing map's invisible edges had a concrete cause: the global responsive
SVG maximum width collapsed React Flow's edge SVG viewport to zero width. A
graph-scoped correction restores painting. Connected paths now have smooth
ambient flow; actual requests have stronger/faster flow, node glow and a gentle
shake, while errors stay visibly distinct. Hub orbits and slow node movement
loop without per-frame React updates. Animation pauses offscreen/in hidden tabs
and responds to reduced-motion changes. A phone-specific fan layout keeps an
18-provider fixture readable and inside the map; zoom/pan controls remain usable.
The existing defensive 60-second activity expiry is unchanged; the visualization
does not certify provider availability or incurred billing.

## ByKitsune tariff contract check

The companion `joyccn/ByKitsuneV2` source at
`5471e5ccecedb165c55e0da59e2f905ad2e8ba19` confirms that `/v1/models` exposes
capabilities, billing units and optional image credits, but no token prices.
Router is not dropping token prices from that endpoint. Separate `/api/models`
and `/api/config/public` use runtime settings/database values for retail
credits, IDR conversion and USD display equivalents. Account discounts,
package credits and rounding prevent treating those public equivalents as
invoices. No current live response was verified here; supplier costs, seeds and
default multipliers were not promoted into retail tariffs.

Evidence locations in that pinned companion source:
`server/services/model.service.ts:153`, `server/routes/stats.routes.ts:20`,
`server/services/pricing.service.ts:64`, `server/routes/config.routes.ts:8`.
Consumed-model configuration is available now; an automatic exact-origin
public-pricing adapter needs a separately verified observation/unit contract.

## Integrated verification

Final checks on the completed implementation:

- **10,033 Vitest assertions passed, 100 skipped, zero failures across 802
  files**; the strict JSON report validator passed. Required synthetic Chromium
  usage-stream cases ran rather than being skipped. Live-provider flags stayed
  disabled, and this final run did not update snapshots.
- **26 production Playwright cases passed** using system Chromium and the
  standalone production build, including actual route animation keyframes,
  unchanged live/filter updates, precise cost display, separate same-name
  accounts, request table/drawer provenance and mobile graph geometry/flow.
- Application production build and standalone asset copying passed using
  `.next-cli-build` and private synthetic state. Documentation tests: **18
  passed**. Independent CJS HTTP/2 compatibility: **one passed**.
- Composed Oxlint/ESLint passed with `--max-warnings=0`; the final browser
  selector correction also passed scoped composed lint. UI registration covers
  1,892 extracted source literals with zero missing Indonesian translations.
  Provider, alias and OAuth baselines, generated/brand identity and whitespace
  checks passed. Dependencies and lockfiles were unchanged.
- Independent read-only reviews found no actionable introduced blocker.

The first integrated run exposed a missing duration-label registration and a
synthetic Vite browser fixture lacking the new component's `next/link` alias.
Both were corrected without skipping cases; the fixture retains real anchor
semantics. The first production run also caught an ambiguous test locator for
the chart/table's separate Tokens buttons; it was scoped to the breakdown.
The final complete runs above passed after those corrections.

All database/browser fixtures used isolated local state and synthetic traffic.
These results establish neither a deployment nor live-provider availability,
complete historical tariff coverage or invoice accuracy. The operator's
existing database was not accessed or rewritten.
