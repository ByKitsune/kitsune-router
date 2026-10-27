# Codex CLI Integration

The gateway executable is `kitsune-router`; the new client provider key is **`kitsunerouter`**. Connect an eligible upstream and create/copy a gateway key first. This does not grant a Codex/OpenAI subscription or make every native feature available.

## Configuration

Merge into `~/.codex/config.toml`, not `config.json`:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Create `my-route` as a combo first, or substitute an exact enabled model ID. Supply `KITSUNE_ROUTER_API_KEY` privately as an issued **gateway** key. Environment variables in this example do not create a key or replace upstream account authorization.

The dashboard preset can instead write a static Authorization header in the provider table. Treat that generated file as a secret and preserve all unrelated settings. There is no need to replace the entire config/auth directory or keep the old provider key as an alias.

## Check the route

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
codex --model my-route
```

For remote access replace the base with an operator-managed HTTPS `/v1` endpoint; localhost is not a cloud service. Health and model discovery do not verify account entitlement, live throughput or billing. Unsupported controls/documents may fail locally rather than be silently discarded. See [processing speed](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md), [integration reference](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) and [migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
