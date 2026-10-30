# Kitsune Router product context

**Document version:** v2
**Last updated:** 2026-10-31

## Product overview
Kitsune Router is a self-hosted, provider-neutral AI gateway and dashboard maintained by ByKitsune. It connects compatible applications to operator-selected upstreams, translates supported request formats, manages account and model fallback, and records local usage.

The gateway is open-source MIT software. Upstream accounts, availability, terms, and charges remain separate. ByKitsune is the primary official provider highlighted in the provider library, with its hosted API at https://api.bykitsune.com/v1 and account/key management at https://bykitsune.com/. Using that provider is optional; operators still choose their accounts, routes, and fallback order.

## Audience and use cases
- Developers connecting coding tools and agents to several AI providers.
- Operators managing local credentials, routing, fallback, and usage in one place.
- Existing ZenRouter users moving to the rebranded application without losing local state.

## Positioning and voice
- Product name: **Kitsune Router**; organization: **ByKitsune**.
- Tagline: **Your models. Your routes.**
- Technical description: **A provider-neutral AI gateway.**
- Plain, specific, developer-friendly language. Describe supported behavior and its limits.
- Do not promise unlimited/free provider access, zero downtime, universal compatibility, guaranteed savings, or provider endorsement.
- Highlight ByKitsune as the primary official provider in the library. Visual prominence does not connect accounts or change routing, pricing, account order, or defaults.

## Identity targets
- GitHub target: `ByKitsune/kitsune-router` (handle registration/organization rename must be verified separately).
- npm target: `@bykitsune/router`; executable: `kitsune-router`.
- Container target: `ghcr.io/bykitsune/kitsune-router`.
- Private app/docs/test/runtime package slugs: `kitsune-router-*`.
- Default data directory: `~/.kitsune-router` / `%APPDATA%/kitsune-router`.
- Environment prefix: `KITSUNE_ROUTER_`; HTTP header prefix: `x-kitsune-router-`.
- Internal tool-provider key: `kitsunerouter` (a valid bare identifier in JSON/TOML consumers).

These names are implementation targets, not a claim that registrations or publication are complete.

## Evidence and constraints
- The source contains the routing engine, dashboard, independent CLI, documentation site, and regression suites.
- Existing upstream attributions, copyright notices, historical release names, signed provider identities, and evidence paths are historical facts; do not erase or falsify them.
- Database migration must preserve runtime secrets, machine identity, auth keys, certificates, configuration and usage. Never test against production state.
- Name lookups establish only a point-in-time absence of public listings, not legal clearance or reservation.

## Changelog
- v2 (2026-10-31) — Aligned current positioning with the user-approved official ByKitsune provider highlight while preserving operator-controlled routing.
- v1 (2026-10-27) — Recorded the user-approved product/organization names and neutral positioning; technical names remain subject to registration checks.
