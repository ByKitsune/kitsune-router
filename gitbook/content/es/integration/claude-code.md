# Integración con Claude Code

Inicia Kitsune Router, conecta un upstream permitido y crea/copia una clave del gateway. Elige una ruta Messages; `my-route` es un combo que debes crear. No requiere cuenta ByKitsune.

## Entorno cliente

Claude Code añade `/v1/messages`: usa el origen **sin `/v1`**.

```bash
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="$KITSUNE_ROUTER_API_KEY"
claude --model my-route
```

La variable contiene una clave del gateway emitida, no un refresh token upstream, y no crea claves. Prueba en una sesión y conserva tu configuración existente.

El preset modifica `env` en `~/.claude/settings.json`, no campos superiores inventados `baseUrl`/`defaultModel`. Revisa/respalda antes. Claude Desktop es otro producto; esto no es una receta universal para él.

Health `/api/health` y catálogo autenticado `/v1/models` no prueban herramientas, documentos o permisos. Remoto: tu origen HTTPS sin `/v1`, no un servicio Kitsune incluido. [Referencia](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
