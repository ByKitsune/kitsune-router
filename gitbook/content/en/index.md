# Welcome to Kitsune Router

**Your models. Your routes.** A provider-neutral, local-first AI gateway maintained and sponsored by [ByKitsune](https://bykitsune.com). Choose your own upstream accounts, models and fallback order. No ByKitsune account, hosted API purchase or preferred provider is required. Requests still go to the upstreams you configure; local-first does not mean offline inference.

## Release status

**1.0.0 is the proposed first breaking rebrand release, pending final verification and publication.** Namespace registration/ownership, npm authorization, registry visibility and actual artifacts still require confirmation. Targets:

| Surface | Identity |
| --- | --- |
| Repository | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm | `@bykitsune/router` |
| Command | `kitsune-router` |
| Client provider key | `kitsunerouter` |
| Canonical image | `ghcr.io/bykitsune/kitsune-router` |

Historical 0.x records remain ZenRouter artifacts with original provenance, not Kitsune publications. See the [release draft](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.0.md) and [changelog](/en/changelog/). Dated pass counts do not verify the current tree.

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
