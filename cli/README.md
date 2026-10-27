# Kitsune Router CLI

**Your models. Your routes.** A provider-neutral AI gateway maintained and
sponsored by [ByKitsune](https://bykitsune.com/).

The public package is `@bykitsune/router`; its executable is `kitsune-router`.
The authorized publication candidate is **1.0.2**, pending final SHA/tag, gates
and npm/GHCR publication. Both previous tags remain immutable: 1.0.0 failed a
migration test before publication; 1.0.1 passed SSH/CI but its GHCR gate and npm
publish command failed. The npm cause is not yet known; public readback returned
HTTP 404 on 2026-10-27. Source tags are not registry artifacts. See the
[1.0.2 notes](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md).
Historical 0.x packages retain their original ZenRouter identities.

## Install and start

Requires **Node.js >=22.19.0**. After the package has been published:

```sh
npx @bykitsune/router@1.0.2
# Or install once:
npm install -g @bykitsune/router@1.0.2
kitsune-router
```

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

## Existing installations

Stop the old gateway and helpers, then back up the whole old data directory.
First startup discovers supported legacy state and copies it into
`~/.kitsune-router` (Windows: `%APPDATA%/kitsune-router`) if no target exists.
Database, runtime secrets, machine identity, auth keys and existing certificates
stay together. Originals remain available for rollback; busy, damaged or
ambiguous state fails closed. An explicit `DATA_DIR` remains authoritative.

Read the [migration guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md)
before upgrading. Do not share data directories or secret values in issues.

## Source and license

- [Repository and source setup](https://github.com/ByKitsune/kitsune-router)
- [Release notes](https://github.com/ByKitsune/kitsune-router/releases)
- [Issues](https://github.com/ByKitsune/kitsune-router/issues)

MIT licensed. Existing upstream copyright and attribution notices remain in
`LICENSE`; ByKitsune sponsorship does not replace historical authorship.
