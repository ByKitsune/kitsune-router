# Claude Code Integration

Start Kitsune Router, connect a permitted upstream, create/copy a gateway API key and choose a Messages-capable model or combo. No ByKitsune account is required. `my-route` below is a combo you must create, not a bundled model.

## Configure the client

Claude Code appends `/v1/messages`, so use the origin **without a trailing `/v1`**:

```bash
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="$KITSUNE_ROUTER_API_KEY"
claude --model my-route
```

`KITSUNE_ROUTER_API_KEY` holds an issued gateway key in your private client environment. It is not a server setting that creates one and must not contain an upstream OAuth refresh token. Preserve any existing shell/client settings; scope variables to the session when testing.

## Dashboard preset and limits

Review the Claude Code preset's edits in `~/.claude/settings.json`. The preset writes environment values under `env`, not invented top-level `baseUrl`/`defaultModel` fields. Back up and preserve unrelated settings. Claude Desktop is a separate application; this is not a universal desktop configuration recipe.

Use `http://localhost:20128/api/health` to inspect gateway health and authenticated `/v1/models` for routes. A model listing does not establish tools/media/document support or account entitlement. For remote access, use your operator-managed HTTPS origin, without `/v1`; there is no default hosted Kitsune service.

See [integration reference](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) and [migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Review current client documentation if your installed version differs.
