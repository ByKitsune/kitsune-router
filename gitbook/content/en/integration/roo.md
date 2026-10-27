# Roo Integration

Use the OpenAI-compatible connection mode supported by your installed Roo version. Kitsune Router provides routing/translation, not an upstream subscription or a guarantee that every model supports every Roo feature.

## Connection settings

```text
Base URL: http://localhost:20128/v1
API key: an issued Kitsune Router gateway key
Model: an exact enabled model ID or your configured combo
```

Start the gateway, connect a permitted provider and create/copy the gateway key first. Discover actual routes through authenticated `/v1/models`. A sample name such as `my-route` works only after you create it as a combo.

Review dashboard preset changes and keep other editor/provider settings. Custom provider identifiers use **`kitsunerouter`**, while **`kitsune-router`** is the executable. Do not paste upstream OAuth secrets into client examples or issues.

## Limits and diagnostics

Check `/api/health` for gateway/storage health; it does not prove live inference. Test required tools/media explicitly, respect reset/retry guidance and surface unsupported controls rather than deleting request intent. Use an operator-managed authenticated HTTPS endpoint for remote access. There is no default Kitsune cloud endpoint or compulsory ByKitsune account.

[Other tools](/en/integration/other-tools/) · [Troubleshooting](/en/troubleshooting/) · [Migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
