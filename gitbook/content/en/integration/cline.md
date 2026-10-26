# Cline Integration

Kitsune Router can serve Cline through an OpenAI-compatible endpoint. Use the configuration schema/UI for your installed Cline version; don't substitute a native upstream login that bypasses the gateway.

## Setup

1. Start Kitsune Router and connect a permitted provider.
2. Create/copy a gateway API key and choose an exact enabled model or configured combo.
3. Select **OpenAI Compatible** in Cline and enter:

```text
Base URL: http://localhost:20128/v1
API key: your issued gateway key
Model ID: your enabled model or combo
```

Use the dashboard's Cline preset only after reviewing its changes. Keep unrelated editor settings and credentials private. The new custom provider key is `kitsunerouter`; the command remains `kitsune-router`.

## Verify behavior

Test a small request, then the specific tool/vision workflow you need. Catalog entries do not guarantee a connected account's entitlement or every parameter on a translation route. Unsupported controls can fail explicitly. Optional token compression is workload-dependent and has no fixed savings percentage.

Respect 429/503 retry deadlines; adding accounts is not permission to bypass provider limits. For remote use, configure your own authenticated HTTPS origin. No ByKitsune account or default hosted endpoint is required. [Integration reference](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [Troubleshooting](/en/troubleshooting/).
