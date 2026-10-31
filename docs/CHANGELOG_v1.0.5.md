# Kitsune Router 1.0.5 — October source closing

Date: **2026-10-31 (Asia/Jakarta)**. This revision synchronizes the root, CLI,
tests and documentation manifests and lock metadata to **1.0.5**, directly from
1.0.2. There are no invented 1.0.3/1.0.4 release records. Publisher client
versions are separate from the application version.

## Security and failure handling

- OIDC ID tokens must carry the nonce for the login that initiated the exchange.
  The explicit comparison runs after signature, issuer and audience validation;
  missing or mismatched nonces cannot create a dashboard session. This fixes
  login binding, not an acceptance of unsigned tokens.
- Headroom compression no longer forwards internal router proof, CLI or password
  headers. Remote compressor requests also exclude gateway API-key aliases,
  cookies and caller authorization. Existing loopback authentication and public
  request correlation retain their documented policy.
- Kiro, Copilot, Cursor and Qoder catalog lookups receive bounded cache/resource
  lifetimes, correct cancellation/invalidation and DB-import fences. Cache
  identity includes the credential and endpoint/account scope. Cursor respects
  canonical proxy configuration, and dashboard cancellation reaches the resolver.
- Kiro/Qoder keep native input and output limits separate; missing values no
  longer invent 200k/131k context, zero output or a Kiro 1x credit multiplier.
  Qoder native configurations/signing remain intact.
- CommandCode errors arriving after partial output remain terminal structured
  errors, rather than assistant prose followed by successful completion. Partial
  measured usage remains available; later success frames cannot overwrite failure.
- Cloudflare content normalization preserves admitted vision parts instead of
  silently discarding images. Text-only normalization and capability filtering
  retain their existing behavior.

## Consolidated source work

- Official ByKitsune provider/discovery at `https://api.bykitsune.com/v1`, with
  actual discovered models offered by the enabled-account picker.
- Eleven verified client version changes and provider-specific auth/identities;
  121 provider entries and 1,322 static model rows, with account-specific live
  discovery. Blocked official feeds remain explicitly unverified.
- More accurate recorded usage, durable attempt identity, frozen price quotes,
  retained historical observations and clear unknown-price coverage. A local
  estimate is not a provider invoice.
- Smoother dashboard page navigation and connected routing-map animation,
  reduced-motion support, and responsive pricing/request details.

Detailed source evidence is in the [closing audit](audit/26-security-stability-and-1.0.5-closing-2026-10-31.md),
[client/catalog review](audit/25-client-compatibility-and-catalog-sync-2026-10-31.md),
[usage/motion review](audit/24-recorded-pricing-accuracy-and-dashboard-motion-2026-10-31.md)
and [upstream/translator review](audit/23-upstream-stability-and-translator-latency-2026-10-31.md).

## Verification and remaining gates

Final local verification is recorded in the closing audit and its machine-readable
evidence. Real OAuth login, customer state, paid inference, production deployment
and registry publication are separate from these synthetic local checks.

The earlier root audit failure in CI #158 is resolved by patched minimatch
11.0.3 with an explicit dev-only adapter for the three existing legacy lint
plugins. Modern consumers keep their native exports; all matching uses the
patched engine. Audit thresholds, policies and assertions remain active. All
four full `npm audit --audit-level=low` commands report zero known findings on
the final graph.

All 67 owned direct entries (56 unique packages) match the selected npm stable
snapshot, with 28 version updates plus refreshed compatible transitives/runtime
pins. Significant changes include Next/React alignment, SAML 5.2 bearer/request
binding, x509 3 single-generation fixtures, Globals 17, Ora 10 and SQL.js export
semantics. Two fixture consumers now reuse the existing certificate helper,
allowing removal of unused `selfsigned` instead of forcing incompatible ASN.1
versions. See the [dependency/CI review](audit/27-dependency-upgrade-and-ci-repair-2026-10-31.md)
for all target versions, changelog coverage, actual Node22/24 checks and limits.

The ESM-only x509 runtime uses a cached async import compatible with the
production bundler. Standalone postbuild now completes runtime/static/public
assets beside either flat or nested generated servers, retaining its private-state
scan. All 27 production browser cases passed after this packaging correction.

## Publication and state boundary

This source bump does not move earlier tags or claim a new npm/GHCR artifact,
GitHub Release, `latest` registry tag or production deployment. The existing
[1.0.2 publication evidence](CHANGELOG_v1.0.2.md) remains historical and immutable;
its private-container/npm-blocker observations were not revalidated here.

Upgrades must retain the effective absolute `DATA_DIR`, complete database/state,
JWT/API/identity secrets, authentication and certificates. Follow the
[migration guide](MIGRATION.md); never rotate or recreate existing state just to
change the displayed version.
