# Source installer and reasoning follow-up — 2026-11-07

Base: `1d436ba5` on `master`. These changes are source changes, separate from
published npm/container artifacts and production deployment.

## Findings and repairs

The source installer linked `cli/cli.js` after building the root application,
but that CLI only searched its packaged `cli/app` directory. A successful root
build lives under `.next/standalone`, optionally with a project-name directory.
The installer verified only `--version`, which exits before loading the server,
so it could report success although the gateway could not start. It also treated
a failed build as a usable development installation.

The launcher now resolves a complete packaged bundle or a recognizable source
checkout's complete standalone output. It requires a generated `server.js` and
build ID and prefers `custom-server.js` when present. In a recognizable source
checkout the root standalone build takes precedence over a retained `cli/app`
package build, so a source update cannot be shadowed by that older bundle.
`--check-install` performs
this check before migration, dependency recovery, secret setup or server start.
The source installer invokes it after version verification. Build failure is
fatal, `--no-build` requires a preexisting complete bundle, and a failed locked
`npm ci` no longer falls back to an unlocked install. Bun installs the build's
development dependencies. Missing `--dir`/`--branch` values fail with an explicit
diagnostic before installation work.

Reasoning capture previously preserved Claude's disabled thinking only when it
was paired with `output_config.effort`. Other explicit disabled controls paired
with effort could be translated into enabled thinking. Capture now retains
explicit disabled switches across dialects. Native Claude's independent output
effort and explicit model-suffix overrides keep their existing behavior.

## Verification scope

Regression coverage uses generated temporary source/bundle fixtures, a real CLI
`--check-install` child, mock-only package/runtime installer operations, loopback
executor tests and provider request serialization. It covers nested standalone
output, packaged precedence, incomplete builds, unrelated neighboring projects,
state-free verification, failed builds, skipped builds, missing arguments and
disabled reasoning paired with effort.

The shared source-verification gate also runs `node cli/cli.js --check-install`
immediately after the real production build. CI, npm release and container
publication therefore refuse source evidence when the produced launcher bundle
lacks its production entry or build ID; fixture-only success cannot satisfy
this gate. This structural smoke does not replace a runtime startup test.

No production state, real customer request or paid upstream inference is used.
A real provider's acceptance and deployment health still require operator
verification after deploying the tested source. See the final CI run for complete
repository gate results rather than treating historical audit counts as current.
