# Frequently Asked Questions

## What is Kitsune Router?

A provider-neutral, local-first AI gateway and dashboard, maintained/sponsored by [ByKitsune](https://bykitsune.com). **Your models. Your routes.** It continues ZenRouter/9Router; requests go to your configured upstreams, not automatically to ByKitsune.

## Is 1.0.2 published?

**Source is verified, publication is blocked.** Immutable `v1.0.2` / `65c8b97d` passed 9,041 tests with 100 skips and zero failed assertions/suites, strict lint and builds. npm publish was denied E403 requiring 2FA or a granular token with bypass 2fa enabled; public npm readback remained HTTP 404. The user will replace the token through GitHub's UI, but has not confirmed completion. GHCR source gates/login passed, then preflight stopped before build/push; no canonical image or GitHub Release 1.0.2 is established. Separate recovery keeps this tag/version unchanged. Earlier 1.0.1/1.0.0 failures retain their own evidence; **1.0.1's npm cause remains unknown**. See [installation](/en/getting-started/installation/) and [changelog](/en/changelog/); 0.x history is unchanged.

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
