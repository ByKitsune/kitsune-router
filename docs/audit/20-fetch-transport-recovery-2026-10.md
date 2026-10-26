# Fetch transport recovery and reproducible source builds

Date: **2026-10-26**. This is a source-maintenance follow-up, not a new npm,
Docker or GitHub release. Published `0.9.13` artifacts and tags are immutable.

## Incident and root cause

After the streaming/pooling source update, upstream chat calls returned local
HTTP 502 errors containing `Maximum call stack size exceeded`. OAuth refresh,
usage and catalog requests also failed. Retrying a different account could not
repair a process-wide transport failure. A readiness response still returned
HTTP 200, so that response alone was insufficient deployment evidence.

Next.js installs an enclosing fetch wrapper after instrumentation has installed
ZenRouter's process-wide patch. The transport selected that outer global fetch
as if it were an independent implementation, creating this cycle:

```text
Next.js fetch → ZenRouter patch → proxyAwareFetch → Next.js fetch → …
```

The terminal transport now stays below Next's marked wrapper, using the
downstream implementation captured before our patch was installed. Pool
selection uses the same resolved implementation. Independent test/instrumentation
replacements remain supported. The change preserves selected proxy/relay policy,
caller-owned dispatchers, connection reuse and request cancellation. It does not
reset accounts, alter provider quotas, trim conversation history or tune edge DNS.

## Installed dependencies must match source

The affected deployment was also built from stale installed dependencies:
Next.js **16.3.8** and Undici **8.11.2**, while committed lockfiles required
**16.4.2** and **8.12.3** respectively. The initial emergency fix deliberately
retained those runtime dependencies; the subsequent source-build validation
reinstalled the committed dependency tree rather than lowering the lockfiles.

`scripts/check-installed-dependencies.mjs` compares application versions,
declared dependency specifications and each installed direct dependency version
with that project's lockfile. It reads metadata without executing dependency
code, rejects missing required packages, permits missing optional native packages,
and does not resolve a missing package from a parent project.

Application/CLI/documentation source builds and application/test-package test
commands run the guard through npm lifecycle hooks. It does not audit arbitrary
transitive file contents, replace npm integrity checks, or guarantee security.

From a source checkout with Node.js >=22.19.0:

```bash
npm ci
npm --prefix tests ci
npm --prefix cli ci --ignore-scripts
npm --prefix gitbook ci
node scripts/check-installed-dependencies.mjs . tests cli gitbook
node scripts/check-release-version.mjs
npm test
npm run test:compat
npm run build
npm --prefix gitbook test
npm --prefix gitbook run build
```

Skipping CLI install scripts here avoids changing an operator's runtime home
during source validation. Normal published CLI installation still uses its
postinstall hook. Source package versions remain aligned at `0.9.13`; this does
not claim that an existing published package already contains the source patch.

## Validation and deployment boundaries

- Seven real-Next-wrapper regressions failed against the broken implementation
  and passed after the transport fix. Coverage includes background calls,
  request-scoped POSTs, module re-evaluation, relays, pinned dispatchers and aborts.
- An old standalone artifact reproduced the error with a single message and a
  loopback fixture. A large conversation was not necessary to trigger it.
- The patched standalone build passed isolated JSON and SSE checks, including
  an Antigravity-shaped request with 477 messages and 12 client tools. Synthetic
  account credentials and a strict loopback relay were used, not production state.
- A small real-provider request through the deployed public edge returned
  HTTP 200 and completed its SSE stream; Google OAuth refreshes also succeeded.
  This is dated availability evidence, not proof of every account/model or billing.
- Keep canary `HOME`/`DATA_DIR` separate from production, bind its port to loopback,
  disable background schedulers for synthetic checks, and terminate it afterwards.
  An abandoned canary that shared production state was removed during recovery.
- Back up consistent SQLite state and installation secrets before a cutover.
  Bind the deployment to the reviewed source/build identity and retain rollback
  artifacts. Rolling a binary back must not discard newer database writes.

Raw logs, databases, keys, certificates, backups, build output and verification
artifacts stay outside Git. Commit source, tests, lockfiles and sanitized
documentation. In particular, `verification/` is ignored even when the release
checks generate SHA-bound reports there. GitHub synchronization means verifying
the pushed source commit; it is not a permanent unattended auto-push service.
