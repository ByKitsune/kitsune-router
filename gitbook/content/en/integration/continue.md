# Continue Integration

Continue configuration formats differ across versions. Use your installed version's documented OpenAI-compatible model settings rather than copying a stale JSON/YAML schema over existing configuration.

## Required values

```text
API base: http://localhost:20128/v1
API key: an issued Kitsune Router gateway key
Model: exact enabled model ID or a combo you created
```

Start Kitsune Router, connect a permitted upstream, create/copy a gateway key and inspect `/v1/models` first. Configure each Continue model role you intend to route. A chat route does not automatically provide embeddings or autocomplete: choose supported endpoint/model kinds separately.

The custom provider identifier, when needed, is **`kitsunerouter`**. The executable is **`kitsune-router`**. Review any dashboard-generated preset and preserve other providers, context sources and editor settings. Store keys privately, never in committed examples.

## Check failures

Use `/api/health` for gateway/storage health and a small real client request for the required protocol. A catalog listing is not proof of tool/media support or account access. Honor retry deadlines and cancellation; avoid multiplying paid retries across client and gateway.

For remote access use your own authenticated HTTPS `/v1` service. No ByKitsune account or hosted provider order is required. See [integration reference](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) and [troubleshooting](/en/troubleshooting/).
