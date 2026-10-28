# Connect tools to Kitsune Router

The executable is **`kitsune-router`**; the custom provider identifier in new tool configuration is **`kitsunerouter`**. These are different contracts. Standard API paths and port **20128** remain unchanged. Connect permitted upstreams and copy an issued **gateway** key before configuring clients.

Use dashboard presets where supported, then review the proposed changes. Preserve unrelated providers, agents, comments and MCP settings. Back up client files; do not replace a complete configuration with a small example. Old provider keys are not silently rewritten or required as compatibility aliases. See [migration](MIGRATION.md).

## Discover a model

```bash
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

Use an exact enabled model or configured combo from this response. `my-route` below is an **example combo you must create**, not a built-in model. The client environment variable `KITSUNE_ROUTER_API_KEY` holds a real issued gateway key; setting it does not create one. Protect keys and never commit them.

## OpenAI-compatible SDKs and editors

Set base URL `http://localhost:20128/v1`, your gateway key, and the chosen route. Choose the client's OpenAI-compatible mode; a native provider login may bypass the custom endpoint.

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20128/v1",
    api_key=os.environ["KITSUNE_ROUTER_API_KEY"],
)
response = client.chat.completions.create(
    model=os.environ["KITSUNE_ROUTER_MODEL"],
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)
```

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:20128/v1",
  apiKey: process.env.KITSUNE_ROUTER_API_KEY,
});
const stream = await client.chat.completions.create({
  model: process.env.KITSUNE_ROUTER_MODEL,
  messages: [{ role: "user", content: "Hello" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

For Cursor, Cline, Roo and Continue, use their installed version's custom OpenAI-compatible settings and exact model ID. UI labels/schema versions can differ; do not assume a model listing guarantees tool, vision, document or Responses support. Some hosted editor features cannot reach your localhost.

## Codex CLI

Merge into `~/.codex/config.toml`, not an invented `config.json`. This manual environment-key example selects the Responses wire:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Provide the gateway key in the process environment. The dashboard preset can instead write an Authorization header in the provider table; treat the generated file as a secret. Neither path requires replacing unrelated Codex settings or using an upstream login token as the gateway key.

## Claude Code

Claude Code appends `/v1/messages` itself, so its base URL is the **origin**, without a second `/v1`:

```bash
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="$KITSUNE_ROUTER_API_KEY"
claude --model my-route
```

Use a route you have configured and verified for Messages. Shell variables affect that process; do not globally overwrite a working provider setup without review. The dashboard writes Claude settings under `env` in `~/.claude/settings.json`, not top-level `baseUrl`/`defaultModel` properties. Claude Desktop is a separate product; an arbitrary `~/.claude/config.json` is not a supported universal desktop routing recipe.

## OpenCode

For OpenCode V2, add the provider to your existing `opencode.jsonc`, preserving
other settings. Supply the gateway key through the environment of the OpenCode
server, and replace `my-route` with a route configured in Kitsune Router:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "kitsunerouter": {
      "name": "Kitsune Router",
      "env": ["KITSUNE_ROUTER_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://localhost:20128/v1" },
      "models": { "my-route": { "name": "My route" } }
    }
  },
  "model": "kitsunerouter/my-route"
}
```

This follows the official [V2 custom-provider configuration](https://opencode.ai/v2/docs/providers/#custom).
For Responses and processing-speed variants, see the [V2 example](PROCESSING-SPEED.md#opencode-v2).

The current dashboard preset still writes the legacy V1 `provider.kitsunerouter`
schema. For an installation deliberately using V1, the equivalent manual form is:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "kitsunerouter": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:20128/v1",
        "apiKey": "{env:KITSUNE_ROUTER_API_KEY}"
      },
      "models": { "my-route": { "name": "My route" } }
    }
  },
  "model": "kitsunerouter/my-route"
}
```

In either schema the provider key is `kitsunerouter`. The dashboard preset is
not a V2 configuration generator. Malformed/unreadable or coexisting `.json`/
`.jsonc` files require operator resolution, not an empty replacement.

## Remote endpoints and errors

Use an **operator-managed** HTTPS origin such as `https://router.example.com/v1` for OpenAI-compatible clients; this is a placeholder, not a hosted Kitsune service. Claude Code uses that origin without `/v1`. No ByKitsune account or provider ordering is required.

Respect 429/503 retry metadata and cancellation. Do not retry malformed/unsupported requests indefinitely or treat partial output as successful replay permission. Cost estimates and synthetic protocol checks are not proof of account entitlement, delivered speed or billing. Use [troubleshooting and operations](OPERATIONS.md) for safe diagnostics.
