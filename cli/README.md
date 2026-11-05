# Kitsune Router CLI

**Your models. Your routes.** A provider-neutral AI gateway maintained and
sponsored by [ByKitsune](https://bykitsune.com/).

The npm package target is `@bykitsune/router`; its executable is `kitsune-router`.

**Version 1.0.8** retains managed SQLite
and tray dependencies in their shared private runtime project and extends bounded
read-only registry propagation checks. The reviewed runtime dependency graph is
unchanged. See the [1.0.8 source notes](https://github.com/ByKitsune/kitsune-router/blob/v1.0.8/releases/RELEASE_NOTES_v1.0.8.md)
and [publication/known-issue receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md).

Confirm channel availability and verification in the publication receipt before
installing or upgrading. Publication requires exact-source CI and a normally
installed final-candidate smoke; the dated local working-tree precheck is separate
from final-artifact evidence.

**Published 1.0.7 and known installer issue.** npm, canonical GHCR and GitHub
Release published immutable `b7f77d07`; original bytes/assets remain unchanged.
Sequential SQLite/tray `--no-save` installs prune siblings. The contained offline
CLI did not reach health in 30 seconds during synchronous self-heal; its final
driver/outcome was not observed, so a hard database failure is not established.
The successful Docker entrypoint smoke is a separate path. See the publication
receipt for cryptographic, runtime, access and cancellation-race evidence.

**Historical 1.0.2 verification**, at immutable `65c8b97d783becab3f1e1210d2ab9ce67992e13b`:
9,041 passed, 100 skipped, zero failed assertions/suites; strict lint and builds
passed. **Its npm publication was blocked:** publish was denied with E403 requiring
two-factor authentication or a granular token with bypass 2fa enabled; public
readback remained HTTP 404. Secret replacement through GitHub's UI had not been
confirmed at that check. Original CI artifact `12718343077`
independently passed help/version/runtime/upgrade smoke, retained state/keys,
mode 0600 and graceful exit 0, but npm acceptance/readback remained blocked.
GHCR recovery published a verified and smoke-tested **private** container;
anonymous access was not confirmed at that check. See Docker
guidance for authorized access/digest pinning. No GitHub Release was created.
Both older attempt tags
remain immutable; the 1.0.1 npm failure cause remains unknown. See the
[1.0.2 notes](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md).
These records do not determine 1.0.7 availability.
Historical 0.x packages retain their original ZenRouter identities.

## Install and start

Requires **Node.js >=22.19.0**. Confirm npm availability and integrity for 1.0.8 in
the publication receipt before using these install or upgrade commands:

```sh
npx @bykitsune/router@1.0.8
# Or install once:
npm install -g @bykitsune/router@1.0.8
kitsune-router
```

With **npm 11.17**, review the package's `postinstall` hook, which prepares private
state and managed runtime packages. To record a one-time approval for this exact
registry release, use the global install command:

```sh
npm install -g --allow-scripts=@bykitsune/router@1.0.8 @bykitsune/router@1.0.8
```

This option is specific to npm's global installation workflow. Other npm clients
can use the standard commands above. See the
[installation guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INSTALLATION.md)
for the current client-specific guidance.

Open `http://localhost:20128/dashboard`, connect the providers you choose, and
generate a gateway key. No ByKitsune account or hosted API purchase is required.
Provider availability, account permissions, terms, and charges still apply.

## Launcher options

```text
Usage: kitsune-router [options]

  -p, --port <port>   Server port (default: 20128)
  -H, --host <host>   Bind address (default: 0.0.0.0)
  -n, --no-browser    Do not open the browser automatically
  -l, --log           Show server logs
  -t, --tray          Run in the system tray where supported
  --skip-update      Skip the update check
  -h, --help         Show help
  -v, --version      Show version

Commands:
  xai video --help   See asynchronous xAI video job options
```

The launcher binds all interfaces by default. Use `--host 127.0.0.1` for local-only
access and configure strong authentication before exposing it remotely.
Use an absolute `DATA_DIR` environment variable for a custom state location;
there is no `--data-dir`, `--no-open`, `start`, `stop`, or `status` subcommand.

Current source waits for its server's managed HTTP/usage/database drain when
quitting, updating or replacing the foreground instance with a background tray.
The grace period follows `KITSUNE_ROUTER_SHUTDOWN_DEADLINE_MS` (15 seconds by
default), then a stuck owned process tree is terminated and failure is reported.
Windows uses a private launcher/server IPC channel because Node cannot catch its
termination signal there. These source changes do not alter older published
artifacts; native Windows behavior still requires platform-specific verification.

## Existing installations

Stop the old gateway and helpers, then back up the whole old data directory.
First startup discovers supported legacy state and copies it into
`~/.kitsune-router` (Windows: `%APPDATA%/kitsune-router`) if no target exists.
Database, runtime secrets, machine identity, auth keys and existing certificates
stay together. Originals remain available for rollback; busy, damaged or
ambiguous state fails closed. An explicit `DATA_DIR` remains authoritative.

Read the [migration guide](https://github.com/ByKitsune/kitsune-router/blob/v1.0.8/docs/MIGRATION.md)
before upgrading. Do not share data directories or secret values in issues.

## Source and license

- [Repository and source setup](https://github.com/ByKitsune/kitsune-router/tree/v1.0.8)
- [Release notes](https://github.com/ByKitsune/kitsune-router/releases)
- [Issues](https://github.com/ByKitsune/kitsune-router/issues)

MIT licensed. Existing upstream copyright and attribution notices remain in
`LICENSE`; ByKitsune sponsorship does not replace historical authorship.
