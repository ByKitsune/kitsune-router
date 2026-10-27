# ZenRouter 0.9.12 technical changelog

> **Kitsune Router archive:** this dated ZenRouter record keeps its original names, artifacts and evidence; it is not current installation or verification guidance. See [current docs](INSTALLATION.md) and [migration](MIGRATION.md).

Release date: **2026-10-19** · Previous release: **0.9.11**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.12) · [Complete changelog](../CHANGELOG.md) · [Release notes](../releases/RELEASE_NOTES_v0.9.12.md)

This release includes the entire post-0.9.11 change set, not only its final
vision follow-up. It does not modify already-published artifacts or deploy an
existing service automatically.

## Security and transport

- Remove node-forge and the vulnerable legacy lint dependency chain. Generate
  certificates asynchronously with WebCrypto/X.509 while preserving existing
  unexpired roots and PKCS#1/PKCS#8 keys.
- Trust only valid rightmost XFF from loopback reverse proxies; ignore lone
  X-Real-IP and preserve proxy classification when attribution fails.
- Pin DNS and bound reads for GitLab/provider/model probes and remote images.
  Deny metadata/private-address bypasses without breaking trusted local routes.
- Keep native Claude SSE frames and tool-call identity intact. Distinguish
  explicit combo overflow/unsupported parameters from account faults; reject
  genuinely empty nonfinal completions without replaying billable valid output.
- Bound virtual no-auth fallback by request-local proxy pools. Quota, billing,
  authentication and cancellation failures do not rotate egress. Caller aborts
  interrupt both network attempts and retry backoff.

## Native provider and catalog behavior

- Add native Antigravity Argon CLI identities, model tiers, function-response
  ordering and independent quota windows without replacing custom codecs.
- Serialize refresh by connection, preserve caller proxy policy, route Copilot
  embeddings with service credentials, and account for native/cache-hit usage.
- Resolve conservative combo limits and separate context/input/output facts.
  Argon remains 1,048,576 context; Opus 5.5 remains 1,000,000 context. Larger
  continuation output is not advertised where the gateway cannot implement it.
- Audit 120 providers, 1,165 registry rows, 565 metadata records and 1,575
  lifecycle rows. Retain unmatched/unknown fields explicitly. The reconstructed
  October 17 snapshot and source hashes are recorded in
  [the catalog manifest](audit/data/catalog-review-20261017.json).
- Correct reviewed Claude dotted-version tariffs, Perplexity's inclusive 200K
  Grok tier, dated Argon promotions, OpenAI shutdown notices and model descriptions.

## Media, reasoning and state preservation

- Retain typed parallel/nested tool media until each target serializes it.
  Cover Chat, Responses, Claude, Gemini, Ollama and CommandCode, including
  repeated normalization, image-only results and ordinary JSON beside media.
- Preserve native passthrough thinking intent, zero-budget off, output caps and
  display controls. Clamp only to the endpoint's declared effort set; inherited
  object names such as `constructor` are not valid suffixes.
- Preserve OpenCode JSONC comments, unrelated fields and symlinks. Malformed,
  unreadable, externally changed or ambiguous files fail without replacement.
- Advance database-import cache generations only after commit. Invalidate
  credentials, pricing, observability, model and quota snapshots; prevent stale
  asynchronous loaders from restoring the old state. Rollback preserves caches.
  MITM alias sync failure is explicitly reported as a post-commit failure.

## Verification and release scope

The implementation at `6ef3fce3` passed 6,052 cases per Node 22/24 run across
586 files, with 100 optional cases skipped and zero failed cases/suites.
Three intentional expected-failure cases remain limitations. The strict report
gate now rejects empty runs, collection errors and inconsistent totals. CI also
runs independent CJS compatibility and provider identity/baseline checks.

Four lockfile audits, lint, documentation/app builds and CLI packaging passed.
Extracted standalone and CLI artifacts served isolated authenticated synthetic
vision requests and persisted usage. These are gateway tests, not real-model
inference or a replay of the unavailable original overflow payload. Full details
and new regression suites are documented in
[the follow-up audit](audit/14-vision-catalog-follow-up-2026-10.md).

The release bump aligns all four manifests and lockfiles, both publication
workflow defaults, release notes, installation guides and five localized
changelogs. Publication requires the exact tag/commit and successful CI; npm,
GitHub Release and Docker are verified independently. Production deployment and
multi-process cache coordination remain operator responsibilities.
