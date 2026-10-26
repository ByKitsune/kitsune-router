# ZenRouter 0.9.11 technical changelog

> **Kitsune Router archive:** this dated ZenRouter record keeps its original names, artifacts and evidence; it is not current installation or verification guidance. See [current docs](INSTALLATION.md) and [migration](MIGRATION.md).

Release date: **2026-10-17** · Previous release: **0.9.10**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.11) · [Complete changelog](../CHANGELOG.md) · [Release notes](../releases/RELEASE_NOTES_v0.9.11.md)

Version 0.9.11 repairs multimodal and reasoning fidelity across the customized gateway, then reconciles provider-scoped model and pricing metadata. It also publishes the latency, backup and lifecycle corrections accumulated after 0.9.10. Historical release artifacts remain unchanged.

## Preserve images through history and compression

`open-sse/translator/concerns/multimodal.js` normalizes recognized Chat, Responses, Claude, MCP and Gemini media. The converters separate text from encoded media, retain parallel tool-result ownership and avoid interpreting arbitrary literal JSON/base64 prose as an image.

`open-sse/utils/requestBody.js` copies mutable request containers while retaining immutable strings. Combo attempts, replay and executor mutations no longer share the same writable history. Unsupported tool/assistant media representations are normalized into representable typed user media without collapsing legitimate repeated occurrences.

RTK and Headroom operate on text projections. Restoring compressed text requires stable roles, tool identity and structure. Invalid compression leaves the original body intact, and error results retain their traces. Token estimates exclude recognized encoded media without excluding literal schemas, business JSON or user text.

The isolated gateway matrix used PNGs sized 2172×724 and 2173×724, totaling 9,454,025 binary bytes. The native wire retained both image hashes. The text proxy received no encoded images while reducing the synthetic projected text from 270,112 to 256 bytes. This verifies gateway integration, not the quality of a production compression service.

## Preserve request reasoning and response continuity

The thinking layer resolves request aliases, native configurations and model suffixes before provider defaults. Native display/summary controls, explicit budgets and model-specific output ceilings survive conversion. Mandatory-thinking and route-specific constraints remain distinct from vendor-family defaults.

Streaming and JSON responses preserve readable reasoning, tool arguments, refusals, terminal state, opaque image signatures and measured usage. The gateway composes request-local tool-name maps and resolves final Messages ID collisions without assigning one execution’s result to another call.

Native Gemini chat now dispatches through the shared pipeline. It retains namespaced model IDs and maps `x-goog-api-key` or `?key=` into the existing authenticated client-key path without replacing an explicit Bearer key.

## Keep failures structural and cancellation bounded

`translator/concerns/responseError.js` provides common native failure extraction and client-format conversion. A Responses failure after partial output cannot become an assistant `[Error]` delta with a normal stop. Flat native error events retain their event type and sequence, while public boundaries exclude routing/debug detail and retain actionable diagnostics.

Native invalid-request failures remain HTTP 400. Streaming accounting records them without applying account-health penalties. JSON aggregation preserves the same diagnostics and does not trigger transient-server retries for a client-correctable request.

The shared HTTP body parser extracts message/type/code/param/request ID before executor-specific reset handling. Default executors no longer return an opaque JSON body as the message. Provider overrides retain precedence, numeric error codes survive, and the parsed common fields are reused through superclass calls.

Remote-image fetching uses imported Undici with a pinned DNS Agent rather than a globally patched fetch path. One deadline covers DNS and HTTP. IPv6 unspecified/mapped-private and mixed-private DNS answers are rejected before image HTTP requests. Client cancellation stops later downloads and inference.

Cursor uses the reviewed AgentService protobuf fields for selected images, structured history and MCP calls. Connect terminal errors and unexpected EOF remain failures. Already-aborted requests send no Run, pre-header cancellation/close settles pending promises, image-preparation abort remains `AbortError`, and caller listeners are released. Required proxy/relay policy cannot silently become a direct connection.

## Reconcile model products and limits

The source snapshot is the complete [models.dev API](https://models.dev/api.json), captured on 2026-10-17:

- 232 providers and 8,987 model records
- SHA-256 `60f5bc3e74aa0d883eea10839f599cb92e0f0dfbd010e182234318999439be99`
- Exact provider product, literal model namespace and declared upstream alias matching

Catalog schema v4 retains independent input/context/output limits and explicit negative capabilities. It removes inferred bare-leaf joins and cross-product API/OAuth assumptions. Operator declarations retain precedence. Static and live producers ingest the named limit fields independently.

Primary endpoint facts remain authoritative when they differ from the catalog. Examples include GenerateContent output modes, NVIDIA endpoint ceilings, Vertex MaaS quotas and native DeepSeek output counts. Unknown route facts are not replaced with a vendor’s widest figure.

The lifecycle inventory covers 120 active provider definitions and 1,570 model/auxiliary/voice/reference rows. It distinguishes existing source flags, account restrictions, scheduled deprecation, catalog candidates and confirmed cleanup. Confirmed native retirement and unsupported coding-plan entries are removed without treating eligibility restrictions as global shutdowns. Gemini 2.5 Pro and Flash-Lite remain available in discovery for eligible existing projects.

Media-only model tables resolve through registry aliases even without a chat transport. Embedding vector dimensions, speech character/UTF-16 limits and native media billing units do not become generated token limits.

See [client/model reconciliation](CLIENT-MODEL-RECONCILIATION.md) and the [October 17 lifecycle audit](audit/12-model-lifecycle-audit.md) for route-specific provenance and explicit unknowns.

## Keep billing unknowns and operator intent intact

Provider-scoped tariffs, context tiers and operator overrides use the same resolver for display and billing. Reasoning follows output billing where documented, without charging the same output twice. Five-minute and one-hour cache writes remain subsets of the aggregate write count.

Native JSON and streaming usage now share the canonical extraction path. The SQLite smoke fixture stores inclusive input 350, cache read 200, total writes 50, five-minute writes 30 and one-hour writes 20. All eight Claude route/client combinations produce the same local estimate of USD 0.000425.

Unknown used components propagate as `null` through SQLite, aggregates, charts, metrics and the dashboard. Genuine free zeroes remain numeric zero. An unknown aggregate cost is omitted from numeric Prometheus cost samples rather than exported as zero.

`GET /api/pricing?view=overrides` returns explicit saved fields; the default view remains merged pricing. The editor loads both views, preserves the selected saved alias row, and writes only edited model overrides. Clearing a field restores inheritance. A failed view load suppresses editing instead of replacing unknown saved state with defaults.

The real browser regression changed an hourly fee while preserving the explicit tier and an unrelated high-context reasoning estimate of USD 0.0425. It also verified clear-to-inherit and disabled saving after a failed saved-view load.

## Include the post-0.9.10 corrections

Persisted latency windows use parameterized calendar/ISO boundaries, excluding unknown and future samples. Schema backup versioning advances before additive latency-column upgrades. Alerting guidance separates probe failures, reauthentication and rolling-window metrics.

These corrections supersede the incorrect retirement and verification conclusions documented for immutable 0.9.10 artifacts. They do not rewrite that tag or its previously published package/image.

The CLI standalone copier excludes its generated build HOME before traversing traced files. Build-only machine IDs, SQLite databases and telemetry settings are not runtime package data. A real filesystem-copy regression retains executable server artifacts while rejecting that directory.

## Verification and residual security risk

The release source passed 5,240 local Vitest cases across 559 files with zero failed cases or suites. One hundred live/credentialed opt-in cases were skipped. Four text-only workflow assertions were removed while executable tag/ref/SHA guard tests and the build-state packaging regression remain. Documentation tests/build, HTTP/2 compatibility, lint, CLI pack, no-regression checks and provider/alias/OAuth baselines passed. The strict catalog comparison reports no actionable mismatches while retaining primary-source overrides and unknown fields.

Local tarball inspection excluded generated HOME/database state and build credentials. The extracted launcher reported 0.9.11 and provisioned SQL.js WASM in a fresh isolated runtime directory. The packed app passed health/version/database, authenticated empty pricing overrides, exact model-limit discovery, unauthenticated gateway rejection and Basic Chat page checks on loopback port 20329.

The release workflows independently test and build the exact tag. The npm workflow retains and integrity-checks the original tarball before immutable publication, and registry promotion prevents older releases from replacing a newer `latest`.

**Residual advisory:** [GHSA-86w9-cpqp-85rv / CVE-2026-85393](https://github.com/advisories/GHSA-86w9-cpqp-85rv) affects `node-forge <=1.4.0`. It remains in the root and CLI lockfiles, and GitHub lists no patched release. Passing tests and the gateway hardening above do not make the release vulnerability-free.

All runtime verification used synthetic credentials and isolated loopback services. No production data, paid inference, live account entitlement or upstream invoice was verified. Docker publication targets linux/amd64 only and does not restart an existing deployment.
