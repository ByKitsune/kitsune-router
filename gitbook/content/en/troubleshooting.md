# Troubleshooting

Start with the installed version/source SHA, absolute `DATA_DIR`, sanitized error and exact route. Do not delete state, replace client config or expose secrets to resolve a branding mismatch.

## Startup and migration

- **Package not found:** 1.0.0 publication is pending. Verify `@bykitsune/router` availability/authorization; don't substitute a bare npm package or invent a Kitsune 0.x release. Use [source installation](/en/getting-started/installation/) now.
- **Old Node:** use Node.js >=22.19.0. Migration needs supported native Node/Bun SQLite snapshot APIs; no unsafe raw-copy fallback is provided.
- **Port in use:** dashboard/API share 20128. Identify the owner and stop it gracefully; avoid broad `pkill` or `kill -9` recipes.
- **Empty state:** inspect absolute `DATA_DIR` and container `/app/data` mount before adding accounts. Explicit paths disable automatic relocation.
- **Migration refused:** stop legacy gateway/helpers, inspect source safety/integrity/ownership and destination. Don't remove locks or overwrite either directory blindly. [Migration guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).

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
