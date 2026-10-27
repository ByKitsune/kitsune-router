# Frequently Asked Questions

## What is Kitsune Router?

A provider-neutral, local-first AI gateway and dashboard, maintained/sponsored by [ByKitsune](https://bykitsune.com). **Your models. Your routes.** It continues ZenRouter/9Router; requests go to your configured upstreams, not automatically to ByKitsune.

## Is 1.0.1 published?

It is the **selected next candidate, pending final tag/SHA verification and publication**. v1.0.0 remains at `390a65677c06a30084386d2a2adf8b0c48709281`; its workflow failed on the non-root ownership scan and npm/GHCR 1.0.0 were not published. GitHub is confirmed and npm authenticates as `bykitsune`, but permission/publication/readback are separate gates. See [installation](/en/getting-started/installation/) and [changelog](/en/changelog/). Original 0.x history is unchanged.

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
