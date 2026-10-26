# Kitsune Router product context

**Document version:** v1
**Last updated:** 2026-10-27

## Product overview
Kitsune Router is a self-hosted, provider-neutral AI gateway and dashboard maintained by ByKitsune. It connects compatible applications to operator-selected upstreams, translates supported request formats, manages account and model fallback, and records local usage.

The gateway is open-source MIT software. Upstream accounts, availability, terms, and charges remain separate. ByKitsune's hosted API at https://bykitsune.com/ is a related product and sponsor, not a required account or preferred upstream.

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
- Treat all providers equally. Sponsorship never changes routing, pricing, account order, or defaults.

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
- v1 (2026-10-27) — Recorded the user-approved product/organization names and neutral positioning; technical names remain subject to registration checks.
