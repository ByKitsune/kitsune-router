# Other Tools and SDKs

Use an OpenAI-compatible client with base `http://localhost:20128/v1`, an issued gateway key and an exact enabled model or configured combo. New custom provider keys are **`kitsunerouter`**, not the executable **`kitsune-router`**.

## Python

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

## JavaScript

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

Set both client variables privately. They select an already issued gateway key and enabled route, not server-side key creation. Do not put upstream refresh tokens into client settings.

## OpenCode and other clients

The legacy OpenCode preset uses `provider.kitsunerouter` and model `kitsunerouter/my-route`; V2 uses the installed schema's `providers`/`package`/`settings`. Do not mix schemas. Full examples, including Codex TOML and Claude Code's origin-only base URL, are in the [integration reference](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md).

Use your own HTTPS origin for remote access; no hosted Kitsune endpoint is assumed. Health is `/api/health`, discovery `/v1/models`. Respect cancellation, quota and error semantics. Translation has route-specific limitations; estimates and tests do not prove account entitlement or billing. [Troubleshooting](/en/troubleshooting/) · [Migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
