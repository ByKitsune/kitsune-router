# Kitsune Router 1.0.5 — 2026-10-31 source closing

Source packages are synchronized to **1.0.5**. This closes the October source
work on provider compatibility, model discovery, pricing/usage accuracy and
smoother dashboard navigation, plus a final security/resource/error audit.

- Bind OIDC login to the signed ID-token nonce explicitly.
- Keep router proof and caller credential headers out of compressor forwarding.
- Bound provider catalog cache/lifecycle state and preserve cancellation.
- Surface terminal CommandCode stream errors accurately and preserve Cloudflare
  vision inputs through normalization.
- Retain the official ByKitsune integration, verified client/catalog updates,
  historical pricing observations and improved recorded-request detail.

See [technical source notes](../docs/CHANGELOG_v1.0.5.md), the
[closing audit](../docs/audit/26-security-stability-and-1.0.5-closing-2026-10-31.md)
and [full changelog](../CHANGELOG.md#105--2026-10-31).

## Verification and dependency refresh

All 67 owned direct dependency entries match the reviewed npm stable snapshot;
28 versions were updated, compatible transitives refreshed and runtime pins
reviewed. SAML/PKI, lint and Ora breaking changes are handled explicitly. The
unused legacy certificate fixture dependency was removed after reproducing its
mixed-generation DI collision.

The old CI #158 dependency audit failure is resolved with patched minimatch
11.0.3 and a scoped dev-only compatibility adapter. All four full low-threshold
audits report zero known findings, preserving the existing lint and security
checks. Read the [dependency/CI evidence](../docs/audit/27-dependency-upgrade-and-ci-repair-2026-10-31.md).

Final local verification passed 10,434 tests (100 explicitly skipped), all 27
production browser cases, the 19-case synthetic Usage browser gate, strict lint,
the documentation build and the rebuilt CLI package/runtime smoke. Exact evidence
and remaining external acceptance limits are recorded in the closing audits.
Synthetic fixtures do not certify real provider account access or invoice accuracy.

## Distribution status

No npm publication, GHCR push, GitHub Release, registry `latest` promotion or
production deployment is established by this source bump. Workflow defaults are
prepared for `v1.0.5`; their publication jobs are not dispatched here. No old tag
or artifact is relabeled. The [1.0.2 artifact record](RELEASE_NOTES_v1.0.2.md)
remains historical, including its separately recorded publication/access gates.

Keep the existing complete private state and effective secrets during upgrades;
use the [migration instructions](../docs/MIGRATION.md). Unknown prices and blocked
provider feeds retain the evidence limits recorded in the source audits.
