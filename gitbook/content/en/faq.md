# Frequently Asked Questions

**Version 1.0.8 is published on npm, GitHub Release and canonical GHCR.** The
[publication receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) records original-byte integrity, provenance and successful actual public-package
installation/runtime checks. GHCR publication/runtime verification is authenticated;
an anonymous pull grant returned HTTP 401, without establishing the visibility
setting. This patch fixes the managed-dependency retention issue recorded for
1.0.7 (`b7f77d07`). For npm 11.17, follow the [exact CLI lifecycle review guidance](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INSTALLATION.md#npm-1117-script-review).

## What is Kitsune Router?

A provider-neutral, local-first AI gateway and dashboard, maintained/sponsored by [ByKitsune](https://bykitsune.com). **Your models. Your routes.** It continues ZenRouter/9Router; requests go to your configured upstreams, not automatically to ByKitsune.

## How do I check 1.0.8 availability?

The [publication receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) records the actual GitHub Release, npm and GHCR outcomes separately. Use a channel only after its publication and readback are confirmed. Source verification does not prove registry availability, anonymous container access or live provider entitlement.

## What was recorded for 1.0.2 (historical)?

**The container is published, but private; npm is still blocked.** Recovery `40485038668` published unchanged runtime `65c8b97d`, with independent authenticated digest/provenance/SPDX readback and published-image smoke passed. The owner selected Public visibility but has not confirmed it; anonymous grants still return HTTP 401 at last read. Use authorized private access or source installation, not an assumed anonymous pull. npm remains E403-denied with public readback HTTP 404; user-managed token replacement is unconfirmed. No GitHub Release 1.0.2 or production deployment occurred. Previous tags retain their own evidence and **1.0.1's npm cause remains unknown**. [Installation](/en/getting-started/installation/) · [Evidence](/en/changelog/).

## Do I need a ByKitsune account or provider order?

No. Choose your own provider accounts and combo strategy/order. You still need any permissions, subscriptions or keys required by each upstream and must respect its terms and region restrictions.

## Is inference free or unlimited?

No such guarantee is made. The software is MIT licensed; provider charges, hardware costs, quotas and availability are separate. Optional compression has workload-dependent effects, not fixed savings. Estimates are not invoices and unknown prices are not zero.

## What changes in clients?

The package is `@bykitsune/router`, executable `kitsune-router`, and new provider key **`kitsunerouter`**. New project environment settings use `KITSUNE_ROUTER_*` and extension headers `x-kitsune-router-*`. `/v1/*`, `/v1beta/*` and port 20128 remain stable. No old command/provider alias is required. See [integrations](/en/integration/other-tools/).

## Will my data survive?

Stop the old gateway/helpers and back up the entire private directory first. Default migration verifies a consistent SQLite snapshot and copied state, preserves originals and refuses destination overwrite. Explicit `DATA_DIR` stays authoritative. Keep secrets, machine identity, auth keys and certificates; don't regenerate trusted roots or crypto salts for cosmetic names. [Migration guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).

## Is there cloud sync or a hosted endpoint?

Legacy cloud sync is removed. Remote use means your own authenticated HTTPS service or a separately chosen upstream, not a bundled Kitsune cloud account. State is local but not all stored credentials are guaranteed encrypted at rest. [Operations](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

## Do historical test counts verify this version?

No. Audits/release notes keep their dated evidence. Current rebrand verification must be tied to the final source SHA/artifacts; synthetic checks do not prove live entitlement or billing.
