# Solución de problemas

Recoge versión/SHA actual, `DATA_DIR` absoluto, ruta y error saneado. No borres estado, sustituyas toda configuración o publiques secretos por un cambio de marca.

## Inicio y migración

- Paquete ausente: 1.0.1 pendiente; el tag v1.0.0 no publicó npm/GHCR. Login npm no prueba permiso de publicación. Verifica `@bykitsune/router` y usa [fuentes](/es/getting-started/installation/) mientras tanto.
- Node antiguo: >=22.19.0; migración requiere snapshot SQLite nativo Node/Bun compatible, no copia cruda insegura.
- Puerto ocupado: dashboard/API comparten 20128. Identifica y detén al dueño limpiamente, no `pkill`/`kill -9` amplios.
- Estado vacío: revisa ruta/montaje `/app/data`; `DATA_DIR` explícito evita reubicación.
- Migración rechazada: detén origen/helpers y revisa integridad, seguridad, propiedad y destino. No borres locks a ciegas. [Guía](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
- Linux restringido: producción sigue fail-closed ante propiedad same-UID ilegible; aislar tests no autoriza migración non-root general. Tras detener/respaldar, usa `DATA_DIR` sin reubicar o revisión privilegiada. No ignores permisos; el smoke limitado UID 65534 no certifica soporte general ni el tag final.

## Cliente

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

Clave del gateway, no refresh token. OpenAI usa `/v1`; Claude Code el origen; Codex TOML con `kitsunerouter`/Responses. Comando `kitsune-router`; conserva otros ajustes.

404/410: modelo exacto; 429/503: respeta reset/reintentos/cancelación. Parámetros/documentos incompatibles requieren cambio explícito, no pérdida silenciosa. Desconocido no es gratis y estimación no es factura. No adjuntes directorios, `.env`, claves o certificados. [Issues](https://github.com/ByKitsune/kitsune-router/issues) con reproducción mínima saneada. [Operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).
