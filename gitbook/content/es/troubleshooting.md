# Solución de problemas

Recoge versión/SHA actual, `DATA_DIR` absoluto, ruta y error saneado. No borres estado, sustituyas toda configuración o publiques secretos por un cambio de marca.

## Inicio y migración

- Paquete ausente: 1.0.0 pendiente; verifica `@bykitsune/router`, no un paquete bare o Kitsune 0.x inventado. [Fuentes](/es/getting-started/installation/).
- Node antiguo: >=22.19.0; migración requiere snapshot SQLite nativo Node/Bun compatible, no copia cruda insegura.
- Puerto ocupado: dashboard/API comparten 20128. Identifica y detén al dueño limpiamente, no `pkill`/`kill -9` amplios.
- Estado vacío: revisa ruta/montaje `/app/data`; `DATA_DIR` explícito evita reubicación.
- Migración rechazada: detén origen/helpers y revisa integridad, seguridad, propiedad y destino. No borres locks a ciegas. [Guía](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).

## Cliente

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

Clave del gateway, no refresh token. OpenAI usa `/v1`; Claude Code el origen; Codex TOML con `kitsunerouter`/Responses. Comando `kitsune-router`; conserva otros ajustes.

404/410: modelo exacto; 429/503: respeta reset/reintentos/cancelación. Parámetros/documentos incompatibles requieren cambio explícito, no pérdida silenciosa. Desconocido no es gratis y estimación no es factura. No adjuntes directorios, `.env`, claves o certificados. [Issues](https://github.com/ByKitsune/kitsune-router/issues) con reproducción mínima saneada. [Operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).
