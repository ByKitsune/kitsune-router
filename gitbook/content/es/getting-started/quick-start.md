# Inicio rápido

**1.0.8 publicado en npm, GitHub Release y el GHCR canónico.** El [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) reúne las lecturas de verificación y los límites de cada canal. El acceso anónimo a GHCR se comprueba por separado: el grant anónimo observado devolvió HTTP 401, lo que por sí solo no determina la visibilidad del paquete.

**Antecedente de 1.0.7:** npm, GHCR y GitHub Release se publicaron desde `b7f77d07`; su instalador podía eliminar dependencias entre las operaciones secuenciales `--no-save` de SQLite y bandeja. El código 1.0.8 corrige la retención de esos pins. El [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) conserva el problema observado y el estado de cada distribución.

**Your models. Your routes.** No requiere cuenta ByKitsune ni orden fijo. El objetivo actual es **1.0.8**, con **Node.js >=22.19.0** para el launcher. Usa el comando siguiente solo tras confirmar npm 1.0.8 en el [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md). Mientras tanto, usa [fuentes](/es/getting-started/installation/); la disponibilidad del [contenedor](/es/deployment/cloud/) se verifica por separado.

**Registro histórico de 1.0.2; no determina el estado de 1.0.6:** **Contenedor 1.0.2 publicado en privado, pull anónimo pendiente, npm bloqueado.** Runtime sigue `65c8b97d`. Usa [fuentes](/es/getting-started/installation/) o [acceso privado autorizado al contenedor](/es/deployment/cloud/). Las instrucciones de 1.0.2 condicionaban el launcher a publicación/readback de **npm**, con Node.js >=22.19.0; la publicación del contenedor no publicaba el launcher npm.

```bash
npx @bykitsune/router@1.0.8
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
