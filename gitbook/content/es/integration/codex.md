# Integración con Codex CLI

Comando `kitsune-router`; clave de proveedor **`kitsunerouter`**. Conecta un upstream elegible y crea/copia una clave del gateway. No concede suscripción Codex/OpenAI ni todas sus funciones.

## Configuración

Combina con `~/.codex/config.toml`, no `config.json`:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Crea `my-route` primero o usa un ID habilitado exacto. La variable privada contiene una clave emitida, no la crea. El preset del dashboard puede escribir Authorization estática: trata el archivo como secreto, conserva lo demás y no reemplaces el directorio completo.

Verifica `/api/health` y `/v1/models` autenticado, luego `codex --model my-route`. Remoto significa tu HTTPS `/v1`, no localhost como nube. Catálogo no prueba permisos, velocidad o facturación; controles/documentos no soportados pueden rechazarse. [Referencia](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [Velocidad](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md) · [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
