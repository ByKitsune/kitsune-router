# Operate Kitsune Router

Kitsune Router is a provider-neutral, local-first gateway maintained/sponsored by [ByKitsune](https://bykitsune.com), not a bundled hosted inference subscription. You control accounts, routing and exposure.

## Protect state

- Use an absolute `DATA_DIR`. Default paths are `~/.kitsune-router` or `%APPDATA%\kitsune-router`; containers default to `/app/data`. For a supported custom container path, mount the same existing volume at that exact effective `DATA_DIR`.
- Stop the gateway, tray and MITM/tunnel helpers before backups or migration. Keep SQLite plus secrets, machine identity, auth keys and certificates. A config export is not a complete backup.
- Keep owner-only permissions where supported. Do not use broad `chmod 755`, delete ownership locks blindly, raw-copy a live database, or replace a whole directory on top of active state.
- Keep operator secrets stable. `.env.example` documents current `KITSUNE_ROUTER_*` settings; unprefixed `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` and `DATA_DIR` retain their meanings.
- Migration verifies copied state and keeps the source; existing destinations are never overwritten. Read [MIGRATION.md](MIGRATION.md) before resolving an ambiguous/busy/damaged source or attempting rollback. Existing encryption derivation constants and certificate subjects are intentionally retained.

## Local and remote access

Dashboard and API share port **20128**. Do not assume a second dashboard at 3000. A typical source invocation is:

First follow [source installation](INSTALLATION.md#source-checkout) to provision a private stable `JWT_SECRET` (at least 32 characters) and review the other secrets/state path. `next dev` does not run the CLI's secret generator; missing/short JWT secrets make dashboard login fail. Existing installations must keep their effective values via [migration](MIGRATION.md), not generate replacements at each restart.

```bash
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

Local-first describes state/control, not a firewall guarantee. The launcher can bind to all interfaces by default; use `kitsune-router --host 127.0.0.1` for local-only access and review actual listeners. For source deployments use their supported bind settings and network policy.

Before exposure, set a strong initial password, configure gateway API keys, and use authenticated HTTPS. Place a reverse proxy on the reviewed trust boundary. Append the actual peer to `X-Forwarded-For` rather than forwarding a client-controlled value verbatim; untrusted `x-kitsune-router-*` fields are not authority. Disable proxy buffering for SSE, choose bounded timeouts/body sizes, and do not publish optional Headroom/MITM control services to the Internet. Inspect current source proxy/auth behavior; a historical audit is not a live security certification.

## Health and model discovery

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

Health can fail with 503 when storage is unavailable. Successful health/catalog responses do not make a live provider call or prove entitlement. Inspect the installed `/api/metrics` output and its current authentication policy before writing alerts; historical metric names may differ. Do not apply `rate()`/`increase()` to rolling-window snapshots. Alert on storage failure, positive reauthentication counts, and scoped latency samples, keeping unknown prices separate from complete costs.

## Diagnose safely

| Symptom | Check |
| --- | --- |
| Port in use | Identify the owning process; stop it gracefully or select a distinct port/state. Avoid broad `pkill` and `kill -9` recipes. |
| Empty dashboard after upgrade | Check the absolute `DATA_DIR` and mounted volume before creating accounts; don't delete either state directory. |
| Migration refuses startup | Stop the old source/helpers, inspect permissions/integrity and source selection. Do not bypass verification or remove locks without confirming ownership. |
| 401 | Use an issued gateway key for clients; reconnect an upstream only when its own credentials require it. |
| 404/410 | Check the exact enabled route and scheduled retirement; don't infer global retirement from one account's denial. |
| 429/503 | Respect `Retry-After`, quota/reset scope, provider terms and cancellation. Adding accounts or proxies is not permission to evade limits. |
| Unsupported parameter/document | Choose a supporting route or change the request explicitly; don't silently drop user intent. |
| Unknown cost | Inspect known subtotal/unpriced counts and upstream billing. Unknown is not free; API reference tariffs are not subscription invoices. |

Request/response debug logs can contain private prompts, credentials or account details. Enable deliberately, redact before sharing, and include version, source SHA, sanitized model/error and reproduction steps in [issues](https://github.com/ByKitsune/kitsune-router/issues). Never upload full state or secret files.

## Upgrades and verification

**1.0.2 source is verified; publication is blocked.** Immutable tag `v1.0.2` is `65c8b97d783becab3f1e1210d2ab9ce67992e13b`; exact-source SSH passed 9,041 cases with 100 skips and zero failed assertions/suites, plus strict lint/build/pack gates. The checks in [1.0.2 evidence](CHANGELOG_v1.0.2.md) do not establish npm/GHCR availability. Keep the local tarball distinct from original CI artifact `12718343077`; both independently passed exact-byte install/runtime/upgrade smoke. Do not move this tag or earlier attempt tags. Before upgrading, verify original tarball/provenance and registry readback, or the canonical image digest/SBOM. See [installation](INSTALLATION.md), [Docker](../DOCKER.md) and [test workflow](../tests/README.md).

Production ownership checks still fail closed for unreadable same-UID state. On restricted Linux, stop and back up the old installation and keep it in place with explicit `DATA_DIR` (no relocation), or obtain privileged ownership review. Do not ignore permission errors or remove locks to force migration. Bounded Linux evidence is not general non-root support; native Windows/macOS migration is unverified.

This docs pass ran no expensive build/test or live-provider check. The source checks cited above were recorded separately; archived audit counts retain their original scope. Rollback means stopping the new writer and returning to original state; post-migration writes are not automatically merged back.

### Publication recovery without moving the tag

The user authorized a separate container-recovery tooling PR, with no version bump: release source remains **`65c8b97d783becab3f1e1210d2ab9ce67992e13b`**. Review/test the tooling separately, then use the `container-recovery.yml` workflow to target that immutable source—not the newer tooling checkout as release content. Tooling CI/merge, recovery execution, publication and registry readback are distinct outcomes; none is permission to deploy production or replace an existing immutable registry artifact.

GHCR run `40469972099` passed source gates and login, then the old preflight rejected Buildx `not found` because it recognized only `manifest unknown`. No image build/push ran. Authenticated owner readback returned grant HTTP 200 followed by manifest HTTP 404 / JSON `MANIFEST_UNKNOWN`, with empty package inventory. Recovery needs structured missing-manifest classification, not treating authentication/transport errors as absence. Availability still requires a successful publish plus canonical digest/provenance/SBOM and readback.

npm run `40469972263` passed source/docs/pack gates but publish was denied with **E403**: `Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.` The user prefers to replace the limited granular `NPM_TOKEN` directly in GitHub's Actions-secret UI; completion is **not confirmed**. Do not request the token in chat or put it in source/logs. After confirmation, retain original-artifact and provenance guards and require accepted publication/readback. Do not infer this cause for the truncated 1.0.1 npm logs.

No GitHub Release 1.0.2 was created; the release workflow has no Create Release step. The existing documentation preview has not been refreshed to this source. See the main-owned [rebranding ledger](REBRANDING.md) for subsequent evidence; no canonical image, successful registry readback or production deployment is promised here.
