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

**1.0.1 is the next candidate, pending final tag/SHA verification and publication.** Keep v1.0.0 at `390a65677c06a30084386d2a2adf8b0c48709281`; the ownership-scan workflow failure did not publish npm/GHCR 1.0.0 artifacts. The follow-up uses a deterministic process-isolated regression harness and denial coverage, not a relaxed production ownership hook. Unreadable same-UID state still fails closed; scoped native evidence is not general non-root certification. npm authentication as `bykitsune` and updated Actions credentials are not proof of publishing permission. Verify registry visibility, exact source, original tarball integrity and image digests before upgrading. See [installation](INSTALLATION.md), [Docker](../DOCKER.md), [release draft](../releases/RELEASE_NOTES_v1.0.1.md) and [test workflow](../tests/README.md).

On restricted Linux, stop and back up the old installation and keep it in place with explicit `DATA_DIR` (no relocation), or obtain privileged ownership review. Do not ignore permission errors or remove locks to force migration.

This docs pass ran no expensive build/test or live-provider check. Archived audit counts describe their original snapshots, not today's source. Rollback means stopping the new writer and returning to original state; post-migration writes are not automatically merged back.
