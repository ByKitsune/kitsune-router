# Security and gateway follow-up — 2026-10-18

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Base commit: `250751b7e6707bad08d68c33ca87a92065c2af14`.
This follows the earlier audit snapshots; it does not rewrite their historical
measurements or claim every remaining audit item is fixed.

## Implemented boundaries

- **Dependency/PKI:** remove `node-forge` from application and CLI trees, rather
  than suppress its advisories. WebCrypto and `@peculiar/x509` issue certificates;
  unexpired trusted roots and existing PKCS#1/PKCS#8 keys remain usable. Startup,
  certificate loading and SNI await the asynchronous API. Private key files use
  owner-only permissions. No production trust store is modified.
- **Lint:** keep the existing Next.js, React, import and accessibility policies
  through composed Oxlint/ESLint execution. Both engines receive paths and
  warning limits. Internal dashboard links use `next/link`; rules are not turned
  off to make the repository pass.
- **Tool streaming:** retain original call identity and exact argument deltas,
  buffer incomplete Chat tool openers, isolate alias restoration per request,
  and keep native Messages/Responses event envelopes and terminal semantics.
  A modified native data line stays in its original SSE event frame.
- **Model metadata:** resolve only declared reasoning tiers for the unadorned
  Antigravity Gemini 3.8 alias. Explicit tier selections retain precedence.
  The free GLM dialect override is scoped to the hosted OpenCode endpoint.
  Combo limits use conservative minima across selectable known members and do
  not invent limits for unknown/cyclic members or inactive providers.
- **Provider/catalog requests:** use the existing DNS-pinned `fetchPublic` and
  `fetchTrustedLocal` transports, never validation followed by global `fetch`.
  Local access requires the server's authenticated peer headers; forged Host or
  forwarding headers do not grant it. Metadata is forbidden for both policies,
  including resolved and redirected targets. One ten-second deadline covers
  the probe and any fallback. Embedding JSON is capped at 1 MiB and catalogs at
  8 MiB; unused responses are cancelled. Upstream errors cannot echo credentials.
- **Image requests:** validate literal and resolved IPv4/IPv6 addresses before
  HTTP. Reject malformed/wrong-family/scoped records and any mixed DNS answer
  containing a forbidden address. Cover private, reserved, multicast, benchmark,
  documentation, IPv4-compatible and local-use NAT64 ranges. Public mapped IPv4
  and public well-known NAT64 destinations remain supported. DNS pinning,
  cancellation, size limits and image signatures remain enforced.

## Verification and limits

Behavioral tests exercise real HTTP sockets behind calibrated DNS-pin fixtures,
synthetic certificates and isolated data directories. They do not contact cloud
metadata, private production services, paid providers or live user accounts.
Focused streaming/network checks cover 255 tests with no failing cases or suites.

The complete isolated run passes 5,800 cases with zero failing cases or suites;
100 existing live/opt-in cases remain skipped. The provider, alias and OAuth URL
baselines and no-regression gate pass. Both application and documentation builds,
the two documentation tests, and composed zero-warning lint pass.

The CLI build and local pack also pass. The resulting unreleased tarball contains
the bundled MITM entrypoint and custom server, without `node-forge`, `braces`,
generated build-home state, a root CA private key, or an environment file. The
standalone MITM artifact additionally passes real root/leaf generation, signature,
SAN, TLS-context and private-key permission checks in an isolated HOME. The
package version remains 0.9.11 for local verification; this is not a new release.

Older stream assertions were updated to enforce one opener ID, not repeated IDs
on argument continuations; argument bytes and owner indices remain asserted.
The unknown-combo-limit fixture now makes both providers selectable so it tests
unknown limits rather than the separate exclusion of unconfigured providers.

The application, CLI, test and documentation lockfile audits report zero npm
advisories on 2026-10-18. That is a dependency snapshot, not a claim of zero
application vulnerabilities. GitHub alert closure depends on publishing the
updated default branch and a subsequent scan; no alert was dismissed.

The read-only GitHub check still reports Dependabot alerts #68 (CLI lockfile)
and #69 (application lockfile), both for `node-forge` / GHSA-86w9-cpqp-85rv on
the published branch. Secret scanning returns zero open alerts. Code scanning
returns HTTP 404, `no analysis found`; it must not be reported as a clean scan.

No production database, service, host trust store, deployment, release or remote
GitHub branch is changed by verification. Existing published artifacts retain
their own dependency versions. Native Cloud Code entitlement/model acceptance
and real upstream billing remain outside these offline checks.
