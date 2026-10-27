# Inicio rápido

**Your models. Your routes.** No requiere cuenta ByKitsune ni orden fijo. **Fuente 1.0.2 verificada en tag inmutable `65c8b97d`, publicación npm/GHCR bloqueada.** Consulta [instalación](/es/getting-started/installation/) para fuentes y bloqueos actuales. Los comandos siguientes solo tras publicación/readback verificados, con Node.js >=22.19.0; tag/build local no prueba disponibilidad.

```bash
npx @bykitsune/router@1.0.2
```

## Configura el gateway

1. Define un `INITIAL_PASSWORD` fuerte en tu entorno privado y abre `http://localhost:20128/dashboard`.
2. Conecta un upstream autorizado mediante OAuth/API key; el gateway no concede suscripciones ni cuota ilimitada.
3. Crea/copia una clave del gateway y guárdala como `KITSUNE_ROUTER_API_KEY` en el entorno cliente. La variable no crea una clave.
4. Selecciona un modelo realmente habilitado o crea un combo de ejemplo `my-route`.

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

Health no verifica inferencia ni permisos upstream. Base OpenAI-compatible: `http://localhost:20128/v1`. Clave de proveedor **`kitsunerouter`**; comando **`kitsune-router`**. Consulta [Codex](/es/integration/codex/) y [Claude Code](/es/integration/claude-code/) para sus diferencias.

Antes de actualizar, detén gateway y auxiliares, respalda todo el directorio privado y lee [migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). No cambies el volumen, las sales ni certificados confiables por un cambio de nombre.
