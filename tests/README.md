# Verify ZenRouter changes

Run the gateway, translator, persistence, discovery, pricing and dashboard contract suites from the repository root. Keep provider inference opt-in and use isolated state for runtime smoke checks.

## Install and run

Use Node.js 22.19 or newer. Install both packages because tests import application dependencies:

```bash
npm ci
npm --prefix tests ci
npm test
```

The root `npm test` command selects `tests/vitest.config.js`. You can also run a focused file:

```bash
npm test -- tests/unit/vision-capability-routing.test.js
```

`npm --prefix tests test` also works; both entrypoints use the repository-root
Vitest configuration. Use the installed runner rather than an unpinned download.

## Protect local state and credentials

The Vitest config loads the root `.env` when present. Run automated verification in a checkout without production credentials. An isolated process environment does not prevent that file from loading.

For local runtime checks, use a fresh absolute `DATA_DIR`, a separate `HOME`, synthetic secrets and a spare loopback port. Disable these background/live paths:

- Set `RUN_REAL`, `RUN_E2E`, `RUN_LIVE_TESTS` and `AG_CACHE_TEST` to `0`
- Set `MODEL_CATALOG_SYNC=off` and `DISABLE_BACKGROUND_TOKEN_REFRESH=1`
- Set `ZENROUTER_DISABLE_MITM=1` and `NEXT_TELEMETRY_DISABLED=1`

Live-provider tests self-skip without their opt-in conditions or credentials. A skipped live test does not verify serving availability, image understanding, account entitlement or an upstream invoice. The private cloud embeddings suite remains `unit/embeddings.cloud.test.js.skip` until that checkout exists.

## Regression coverage

These suites exercise consumer-visible boundaries rather than source text or a translator merely returning an object:

| Concern | Main regression suites |
| --- | --- |
| Multi-turn vision, tool images and compaction | `unit/vision-tool-output-protocols.test.js`, `unit/vision-gemini-history.test.js`, `unit/vision-compression-history.test.js`, `unit/vision-capability-routing.test.js` |
| Large screenshot wire serialization and hybrid parallel results | `unit/vision-large-tool-wire.test.js`, `translator/translator-media-history.test.js`, `translator/translator-media-gemini-struct.test.js` |
| Retained tool images on Ollama and CommandCode | `translator/translator-media-secondary-targets.test.js` |
| Encoded media in estimated usage | `unit/vision-usage-estimates.test.js` |
| Cross-format request controls and native Google media | `unit/translator-request-contracts.test.js`, `unit/gemini-native-media-contracts.test.js`, `unit/gemini-native-chat-contract.test.js` |
| SSE, parallel tools, refusals, image occurrences and opaque signatures | `unit/translator-stream-contracts.test.js`, `unit/claude-tool-id-ownership.test.js` |
| Cursor native image/history/MCP protocol and egress | `unit/cursor-vision-contracts.test.js`, `unit/cursor-agent-proto.test.js`, `unit/cursor-agent-exec-request.test.js` |
| Public model limits and provider identity | `unit/catalog-discovery-consistency.test.js`, `unit/model-catalog-exact-facts.test.js`, `unit/catalog-literal-identity.test.js`, `unit/registry-metadata-sync-2026-10.test.js` |
| Separate custom and live input/context/output values | `unit/custom-model-numeric-limits.test.js`, `unit/model-live-limit-normalization.test.js` |
| Scoped tariffs, saved overrides and context tiers | `unit/pricing-modelsdev-billing.test.js`, `unit/metadata-pricing-repository.test.js` |
| Five-minute and one-hour cache writes | `unit/cache-write-ttl-normalization.test.js`, `unit/cached-token-usage.test.js`, `unit/claude-stream-cache-usage.test.js` |
| Unknown costs, free zeroes and historical values | `unit/usage-null-cost-sqlite.test.js`, `unit/usage-compact-notation.test.js` |
| Pricing API and hourly editor contracts | `unit/pricing-api-validation.test.js`, `unit/pricing-modal-reviewed-billing.test.js` |
| Pinned image transport, DNS deadlines and cancellation | `unit/undici-native-fetch-compat.test.js`, `unit/image-fetch-hardening.test.js`, `unit/ssrf-pinned-fetch.test.js`, `unit/image-prefetch-lifecycle.test.js` |
| No-auth proxy pool exhaustion, denials and egress | `unit/noauth-proxy-fallback.test.js` (real SQLite, relay/CONNECT and direct-egress trap fixtures) |
| Full database imports and stale in-flight caches | `unit/db-import-cache.test.js`, `unit/db-import-cache-public.test.js`, `unit/db-import-cache-quota.test.js` |
| Native cancellation and public error boundaries | `unit/cursor-cancellation.test.js`, `unit/public-protocol-errors.test.js` |

The reasoning suites cover API aliases, suffix/request/provider precedence, native executor controls, streaming/non-streaming reasoning and measured usage. Run the complete suite to include their fallback, accounting and semantic-TTFT consumers.
`unit/thinking-consistency-mapping.test.js` and
`unit/thinking-native-passthrough-transport.test.js` cover zero-budget suffixes,
endpoint-specific effort sets, disabled native thinking and the final executor
payload on routes that bypass ordinary format translation.

When changing protocol fixtures, preserve the actual wire contract. For example, a valid Cursor Connect stream requires an `EndStreamResponse`; an intentional MCP handoff closes the waiting run instead. Do not preserve expected failures after the corresponding behavior has been implemented.

## Full verification gates

Capture Vitest JSON and require a successful, nonempty run with consistent
counts, zero failed assertions and zero failed suites. A collection failure can
report zero failed test cases; `verify-no-regression.mjs` now rejects that case:

```bash
npm test -- --reporter=json --outputFile=/tmp/opencode/zen-vitest.json
node tests/__baseline__/verify-no-regression.mjs /tmp/opencode/zen-vitest.json
```

Run the independent documentation and HTTP/2 compatibility checks:

```bash
npm --prefix gitbook test
npm run test:compat
```

Verify the provider, alias and OAuth baselines without replacing snapshots to hide a mismatch:

```bash
node tests/__baseline__/verify-providers.mjs
node tests/__baseline__/verify-alias.mjs
node tests/__baseline__/verify-oauth-urls.mjs
node scripts/generate-provider-identity.mjs --check
npm run lint -- --max-warnings=0
npm run build
```

Use `NEXT_DIST_DIR` under `.next/` for an isolated build so an existing standalone deployment stays untouched. Keep standalone `DATA_DIR` absolute.

Normal CI also runs the CJS compatibility test, identity/baseline checks and the
strict report gate, with isolated HOME/DATA_DIR and live/background work disabled.
Its Vitest JSON is uploaded under an artifact named for the exact commit SHA.
CLI packaging and browser/live-provider behavior require their separate checks.

Existing `it.fails` cases are expected failures, not evidence the underlying
behavior works. Skipped cases and surveys that tolerate provider failures do not
prove live compatibility. The default Vitest glob is `tests/**/*.test.js`;
`test:compat` runs the independent `*.test.cjs` suite. Check file discovery when
adding a new extension or runner.

## Audit model metadata against a complete snapshot

Supply the full provider-keyed [models.dev API](https://models.dev/api.json) JSON, not a clipped reader preview:

```bash
node scripts/verify-catalog-against-modelsdev.mjs \
  /absolute/path/models-dev.json --json /tmp/catalog-report.json
node scripts/audit-model-lifecycle.mjs \
  /absolute/path/models-dev.json --baseline your_baseline_commit
```

The comparison preserves provider products, native namespaces and declared upstream aliases. It compares context, input, output and capability facts independently. Primary-source overrides, route ceilings, missing references and unknown fields remain explicit; they are not fabricated agreement. A lifecycle candidate is not proof of shutdown.

The dated review manifest is `docs/audit/data/catalog-review-20261017.json`.
Historical JSON was reconstructed from the pinned upstream commit, not captured
from the API on October 17; unresolved source symlinks are listed as limitations.
`unit/catalog-review-20261017-pricing.test.js` covers cost-consumer behavior for
reviewed Claude spellings, cache TTLs and inclusive Perplexity Agent price tiers.

## Runtime and browser proof

Tests do not replace runtime verification. Exercise the changed path through a separately started gateway and inspect its logs and stored usage. Synthetic HTTP/HTTP2 providers can verify framing, field preservation and billing without spending provider tokens.

For Basic Chat changes, verify JSON and SSE image-only replies, typed assistant replay, separate identical image occurrences, snapshots, persisted-history reload and visible stream failures. Confirm that unsupported URL schemes never become links and that hydration logs stay clean.

The large-image wire regression generates a deterministic valid 2172×724 PNG
and sends it through the real HTTP executor path with a synthetic upstream. It
checks image occurrences, text/binary separation, estimated usage and the
explicit output cap. This verifies gateway serialization, not a real model's
ability to interpret the image or the cause of an unavailable production request.

For pricing changes, verify the hourly fee and tier Save/read-back flow, including explicit unknown rates and disabled inherited tiers. `GET /api/pricing?view=overrides` returns only explicit saved fields. Editing one fee must not materialize inherited rates or change unrelated high-context reasoning charges. Unknown totals must display `Not specified`, while genuine zero tariffs remain zero. Mixed known/unknown groups and chart buckets must not display a complete zero-dollar or partial known total.
