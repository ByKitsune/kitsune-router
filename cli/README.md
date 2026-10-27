# Kitsune Router CLI

**Your models. Your routes.** A provider-neutral AI gateway maintained and
sponsored by [ByKitsune](https://bykitsune.com/).

The public package is `@bykitsune/router`; its executable is `kitsune-router`.
**1.0.2 source is verified**, at immutable `65c8b97d783becab3f1e1210d2ab9ce67992e13b`:
9,041 passed, 100 skipped, zero failed assertions/suites; strict lint and builds
passed. **Publication is blocked:** npm publish was denied with E403 requiring
two-factor authentication or a granular token with bypass 2fa enabled; public
readback remained HTTP 404. The user will replace the Actions secret through
GitHub's UI but has not confirmed completion. GHCR stopped before build/push;
no canonical image or GitHub Release is established. Both older attempt tags
remain immutable; the 1.0.1 npm failure cause remains unknown. See the
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
