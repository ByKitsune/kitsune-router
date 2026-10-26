# Cursor Integration

Use Cursor's custom OpenAI-compatible endpoint controls where supported by your installed version. This routes selected requests to Kitsune Router; it does not turn a provider connection into a Cursor subscription or enable every hosted editor feature.

## Configure

1. Start the gateway and connect an upstream you may use.
2. Create/copy a gateway key and choose an enabled model or your own combo from `/v1/models`.
3. In Cursor's supported custom API settings, set:

```text
Base URL: http://localhost:20128/v1
API key: an issued gateway key
Model: an exact enabled model ID or configured combo
```

Review the dashboard preset if available; do not replace unrelated settings. If the tool asks for a custom provider identifier, use `kitsunerouter`, not the executable `kitsune-router`. UI labels vary by version.

## Network and capability limits

A feature executed on the editor's hosted servers cannot reach your computer's localhost. If you intentionally deploy remotely, use your authenticated HTTPS endpoint, not a claimed bundled Kitsune cloud URL. Do not expose an unauthenticated dashboard to work around access.

Tool, vision, structured-output and document support depend on the selected route and client wire. Check actual errors/capabilities rather than assuming the largest context or every model feature. See [other tools](/en/integration/other-tools/), [troubleshooting](/en/troubleshooting/) and [migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
