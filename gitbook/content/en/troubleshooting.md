# Troubleshooting

Start with the installed version/source SHA, absolute `DATA_DIR`, sanitized error and exact route. Do not delete state, replace client config or expose secrets to resolve a branding mismatch.

## Startup and migration

- **Package not found:** Check the exact `@bykitsune/router@1.0.7` result in the [publication receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md). Use [source installation](/en/getting-started/installation/) until that npm version is published and readback succeeds. Earlier version-specific publication failures do not establish the current credential result; never share tokens in chat or logs.
- **GHCR pull denied/not found:** Confirm the 1.0.7 version, digest and access mode in the [publication receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md). Anonymous access requires its own successful readback; an authorization denial alone does not prove the image is missing. Use only authorized registry access or [source installation](/en/getting-started/installation/).
- **Old Node:** use Node.js >=22.19.0. Migration needs supported native Node/Bun SQLite snapshot APIs; no unsafe raw-copy fallback is provided.
- **Port in use:** dashboard/API share 20128. Identify the owner and stop it gracefully; avoid broad `pkill` or `kill -9` recipes.
- **Empty state:** inspect absolute `DATA_DIR` and container `/app/data` mount before adding accounts. Explicit paths disable automatic relocation.
- **Migration refused:** stop legacy gateway/helpers, inspect source safety/integrity/ownership and destination. Don't remove locks or overwrite either directory blindly. [Migration guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
- **Restricted Linux ownership scan:** production still fails closed for unreadable same-UID ownership. Test-only isolation/clock changes do not generally allow non-root relocation. After stopping/backing up, use explicit `DATA_DIR` without relocating or request privileged review. Do not ignore permission failures; bounded UID 65534 evidence is not general support, and native Windows/macOS migration remains unverified.

## Historical 1.0.2 distribution diagnostics

The following are dated 1.0.2 observations, not current 1.0.7 publication or credential results.

- **Package not found:** 1.0.2 source is verified, but npm publish was denied E403 requiring 2FA or a granular token with bypass 2fa enabled; public readback remained HTTP 404. The user will replace the Actions secret through GitHub's UI, but completion is not confirmed. Do not share tokens in chat/logs. Use [source installation](/en/getting-started/installation/) until publication/readback succeed. The 1.0.1 npm cause remains unknown.
- **GHCR pull denied/not found:** 1.0.2 is now published and authenticated readback/smoke passed, but package visibility remains **private** at last read; anonymous grants return HTTP 401. The owner selected making it Public but has not confirmed completion. Use authorized private read access or wait for confirmed Public visibility and unauthenticated readback; do not interpret a masked denial as a missing publication. Earlier preflight/context failures are [historical](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md#publication-recovery-without-moving-the-tag). No token belongs in chat or logs.

## Client and upstream errors

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

Use an issued gateway key, not an upstream refresh token. OpenAI-compatible clients use `/v1`; Claude Code uses the origin and appends `/v1/messages`; Codex uses TOML with provider `kitsunerouter` and Responses wire. The executable is `kitsune-router`. Preserve unrelated tool settings.

Check exact enabled model IDs for 404/410; one account's denial is not global retirement. Respect 429/503 retry/reset data and cancellation. Unsupported parameters/documents need a supporting route or explicit request change, not silent deletion. Health/catalog success does not prove upstream entitlement.

## Costs and reporting

Unknown cost is not free; estimates are not invoices. Debug payloads can contain private prompts/accounts—enable deliberately and redact before sharing. Never attach full data directories, `.env`, keys or certificates to an [issue](https://github.com/ByKitsune/kitsune-router/issues). Include minimal sanitized reproduction steps and current version/SHA. [Operations](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md) · [Integrations](/en/integration/other-tools/).
