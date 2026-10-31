# Security policy

Security fixes are developed on the current `master` branch of
[ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router).
Historical tags and published artifacts retain their original identities;
backports and future response times are not guaranteed.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting option if it is available on the
repository's Security tab. Its availability depends on repository settings.
Otherwise, use the project's published support contact,
[esa@bykitsune.com](mailto:esa@bykitsune.com), to request private coordination
before sending sensitive exploit details. This is the existing project contact,
not a separately established security inbox or response SLA.

Include the affected commit/version, runtime and deployment mode, a minimal
reproduction with synthetic credentials, expected versus observed behavior,
and the relevant trust boundary. Do not put live keys, cookies, tokens,
private state, customer request contents or working exploit details in a public
issue. Ordinary non-sensitive bugs can use the repository's Issues page.

## Deployment and update guidance

Set strong private credentials before exposing the gateway. Keep the complete
private `DATA_DIR` and effective secrets during an upgrade; follow
[the migration guide](docs/MIGRATION.md). Only configured, trusted administrators
should choose provider/proxy/compression endpoints. Provider access and paid
inference remain separate from local test results.

For current source findings, dependency audit limitations and verification,
read the [October closing review](docs/audit/26-security-stability-and-1.0.5-closing-2026-10-31.md)
and [1.0.5 source notes](docs/CHANGELOG_v1.0.5.md). A source bump is separate from
npm/GHCR publication and production deployment.
