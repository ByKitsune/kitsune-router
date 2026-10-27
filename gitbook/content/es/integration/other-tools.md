# Otros clientes y SDK

Base OpenAI-compatible `http://localhost:20128/v1`, clave emitida y modelo/combo realmente habilitado. Proveedor **`kitsunerouter`**, no el comando **`kitsune-router`**.

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

Define las variables privadamente con clave/ruta existentes, no un refresh token. No crean claves.

OpenCode antiguo usa `provider.kitsunerouter` y `kitsunerouter/my-route`; V2 usa `providers`/`package`/`settings`. No mezcles esquemas. La [referencia](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) incluye JavaScript, Codex TOML y origen de Claude Code.

Remoto: tu HTTPS, sin endpoint alojado por defecto. Health `/api/health`, catálogo `/v1/models`; pruebas no prueban permisos/facturas. Respeta cuota/cancelación. [Diagnóstico](/es/troubleshooting/) · [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
