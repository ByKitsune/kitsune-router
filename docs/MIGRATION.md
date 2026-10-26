# Moving to Kitsune Router

Kitsune Router is the ByKitsune-maintained continuation of ZenRouter. The CLI
package is `@bykitsune/router`, and its command is `kitsune-router`.

Publication status matters: use these package commands only after the first
Kitsune Router release is published. A source checkout can be tested now.

## Automatic local-data migration

1. Stop ZenRouter, its tray, and its MITM/tunnel helpers. Do not run both gateways
   against the same state.
2. Back up the **entire** old data directory, not just `db/data.sqlite`. Include
   `secrets.json`, `machine-id`, `auth/`, and `mitm/`; they contain the keys needed
   to read existing credentials and certificates. Keep the backup private.
3. Install/start Kitsune Router. If there is no new data directory, it discovers
   `~/.zenrouter` (or older `~/.9router`) and migrates into `~/.kitsune-router`.
   Windows uses the corresponding directories under `%APPDATA%`.
4. The migration checks database integrity, takes a SQLite-consistent snapshot,
   copies persistent files with owner-only permissions and verifies copied content.
   A destination lock and incomplete marker prevent the application from opening
   partial state; the marker is removed only after publication is verified.
   The source stays available for rollback. `.migration.json` records the source and verification inventory;
   it contains no plaintext credential values and is private.
5. Check your accounts, keys, combos, settings, usage and optional MITM features.
   Apply the newly named provider configuration to your external tools when
   you are ready; the old tool-provider names are not silently rewritten.

If a source is busy, damaged, a symbolic link, ambiguous, or already being
migrated, startup fails rather than creating an apparently empty installation.
Close the old process or resolve the reported issue, then retry. Do not remove
ownership/lock files without confirming the old process has stopped.

### Operator controls

| Setting | Behavior |
| --- | --- |
| `DATA_DIR=/absolute/path` | Keep using that exact state directory, without relocating it. Back it up first. |
| `KITSUNE_ROUTER_MIGRATE_FROM=/absolute/legacy/path` | Select the source when multiple legacy installations exist or it was stored elsewhere. |
| `KITSUNE_ROUTER_MIGRATION=skip` | Start a separate fresh installation; leave old files alone. |

An existing new data directory is never merged or overwritten. Runtime binaries,
dependency caches, temporary files, stale PID/socket files and updater logs are
regenerated rather than migrated. The old source installation is not uninstalled.
There is one narrow installer exception: a target containing **only** recognized
regenerable installer directories (such as `node/` and `app/`) may receive the
verified persistent state under the same locks and incomplete-marker guard.
Those installer directories are kept, not replaced. Mixed/unknown contents,
existing secrets or databases, and an arbitrary empty target still refuse
automatic merge. Portable executable helpers in `bin/` retain private execute
permissions; they are not treated as disposable dependencies.
An explicitly selected migration source must not be silently ignored: a
conflicting existing target (including secrets-only state) refuses startup.
An already completed migration may reopen only when its recorded source matches
the selected source; `DATA_DIR` and the explicit `MIGRATION=skip` option remain
authoritative. Keep the private migration record with the migrated installation.

For SQLite migration use the supported Node runtime with `node:sqlite` enabled,
or a supported Bun runtime with its native SQLite module.
There is no unsafe raw-file fallback if that snapshot API is unavailable.
Keep the old gateway stopped throughout migration: an older process does not
understand the new migration lock. Ownership and content are checked repeatedly,
but the source lock cannot stop an unmodified old binary from being restarted.
Windows requires a clean shutdown with no leftover WAL; macOS fails closed if
open-file ownership cannot be established. Linux tests and synthetic platform
fixtures are not claims of native Windows/macOS/Bun execution.

## Containers and source deployments

An explicit mounted `DATA_DIR` remains in place. Keep the same persistent volume
and mount target when switching images; do not replace it with an empty new
volume just to rename the container. Never copy a live SQLite database using
ordinary file copying. Stop the old service and back up all keys and files first.

The `KITSUNE_ROUTER_*` environment prefix replaces the project-specific old
prefix. Unprefixed operator secrets (`JWT_SECRET`, `API_KEY_SECRET`,
`MACHINE_ID_SALT`) and `DATA_DIR` retain their meanings and values. Consult
`.env.example` for the new names. Do not paste secret values into an issue.
Startup migration recognizes legacy-prefixed operator options without rewriting
your environment files; explicitly configured current names take precedence.
Boot-generated trusted-peer proof tokens are never migrated from legacy names.
Only a `.env` at the data-directory root is recovered automatically. For an old
source install, transfer effective settings from its checkout's `app/.env`,
shell environment or service definition explicitly and privately. The source
application directory is not copied as persistent state. Keep its original
signing/API/identity secrets rather than following fresh-install generation steps.

## Integrations and trust

- `/v1/*` and `/v1beta/*` keep their standard protocol names and port 20128.
- New tool-provider configuration uses `kitsunerouter`; extension headers use
  `x-kitsune-router-*`. Re-apply tool presets rather than deleting an entire
  client configuration file.
- Existing encryption derivation constants deliberately remain unchanged; they
  are compatibility inputs, not current branding.
- An existing SAML installation's implicit legacy entity ID is persisted during
  upgrade, including stored empty/null values that previously selected the
  legacy fallback. Nonempty custom issuers stay unchanged. Fresh installations use the new
  `urn:kitsunerouter:sp` default. Custom IdP configuration is never overwritten.
- Existing interception roots retain their original certificate subject and
  private key. Renaming a certificate is not a cosmetic operation: replacing
  one would require another trust-store installation. Do not delete a working
  root simply because its historical name differs.
- Autostart migration changes only recognized default records and retains a
  backup. Customized records and historical source-checkout paths may require
  manual review. Disable or update them before the next login, otherwise an old
  gateway could restart against its retained source directory.
- ByKitsune sponsors the project but no ByKitsune account or hosted API purchase
  is required. Provider choice and existing connection ordering are preserved.

## Rollback

Stop Kitsune Router before restarting the original application with its original
data directory. New activity written after migration is not automatically merged
back. Keep both directories and your verified backup until the new installation
has been checked; do not run concurrent writers or delete either copy blindly.
