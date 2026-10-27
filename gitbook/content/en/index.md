# Welcome to Kitsune Router

**Your models. Your routes.** A provider-neutral, local-first AI gateway maintained and sponsored by [ByKitsune](https://bykitsune.com). Choose your own upstream accounts, models and fallback order. No ByKitsune account, hosted API purchase or preferred provider is required. Requests still go to the upstreams you configure; local-first does not mean offline inference.

## Release status

**1.0.1 is the selected next candidate, pending final tag/SHA verification and publication.** The GitHub organization/repository are confirmed. npm authenticates as `bykitsune` and Actions credentials were updated, but package-publishing permission, registry access and artifact readback remain unverified. Identities:

| Surface | Identity |
| --- | --- |
| Repository | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm | `@bykitsune/router` |
| Command | `kitsune-router` |
| Client provider key | `kitsunerouter` |
| Canonical image | `ghcr.io/bykitsune/kitsune-router` |

The immutable v1.0.0 tag remains at `390a65677c06a30084386d2a2adf8b0c48709281`. Its workflow failed on the non-root ownership scan; npm/GHCR 1.0.0 were not published. v1.0.1 follows with a deterministic process-isolated regression harness and mobile key-row wrapping; production ownership policy remains fail-closed. The recorded 9,029-pass old candidate is not v1.0.1 proof. See the [current draft](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.1.md) and [changelog](/en/changelog/). Historical 0.x provenance remains unchanged.

[Documentation preview](https://rebrand-candidate.kitsune-router-docs.pages.dev/en/) is available on the verified official Cloudflare account/project; it is not a final release or custom-domain/DNS change.

## What the gateway does

- Compatible Chat, Responses, Messages, Gemini and Ollama surfaces with route-specific translation limits.
- Configurable model combos and account fallback, with cancellation, quota/reset and error handling.
- Local SQLite configuration and usage, plus private secrets/auth/certificate state.
- Optional token-saving controls. Savings depend on workload, not a promised percentage.
- Usage and known/unknown cost visibility. Estimates are not invoices, and unknown is not free.

No unlimited quota, free-forever upstream service, zero downtime or universal model entitlement is guaranteed. Provider terms, regions and prices remain applicable. Legacy cloud sync is removed; remote access is an operator-managed deployment, not a bundled hosted endpoint.

## Start here

- [Quick start](/en/getting-started/quick-start/) · [Installation](/en/getting-started/installation/)
- [Integrations](/en/integration/other-tools/) · [Combos](/en/features/combos/) · [Usage](/en/features/quota-tracking/)
- [Migration guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Operations](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)

MIT licensed; upstream notices and ZenRouter/9Router contributor credit remain in the repository's [LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE) and [README](https://github.com/ByKitsune/kitsune-router#maintainers-acknowledgments-and-license).
