# Bienvenido a Kitsune Router

**Your models. Your routes.** Gateway de IA local-first y neutral entre proveedores, mantenido y patrocinado por [ByKitsune](https://bykitsune.com). Elige tus modelos, cuentas y orden de fallback, sin cuenta ByKitsune ni compra obligatoria. Las solicitudes siguen llegando a los upstreams configurados; no es inferencia offline.

## Estado de publicación

**1.0.1 es la siguiente candidata elegida; verificación del tag/SHA final y publicación pendientes.** Repositorio confirmado; npm autentica como `bykitsune` y credenciales Actions actualizadas, sin probar permiso de publicación ni artefactos.

| Superficie | Destino |
| --- | --- |
| Repositorio | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm | `@bykitsune/router` |
| Comando | `kitsune-router` |
| Clave de proveedor | `kitsunerouter` |
| Imagen canónica | `ghcr.io/bykitsune/kitsune-router` |

`v1.0.0` sigue inmutable en `390a65677c06a30084386d2a2adf8b0c48709281`: falló el workflow de propiedad non-root y no se publicó npm/GHCR 1.0.0. Los 9.029 tests de esa candidata no verifican 1.0.1. El seguimiento aísla procesos sintéticos en tests y ajusta filas móviles; producción sigue fail-closed. [Cambios](/es/changelog/) · [Borrador 1.0.1](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.1.md). La historia 0.x no cambia.

## Capacidades y límites

Traducción de protocolos con límites por ruta, combos y cuentas configurables, uso local en SQLite y compresión opcional. No garantiza cuotas ilimitadas, ahorro fijo ni disponibilidad continua. Estimaciones no son facturas; desconocido no es gratis. Se eliminó la sincronización antigua; el acceso remoto requiere tu propio servicio con autenticación y HTTPS.

[Inicio rápido](/es/getting-started/quick-start/) · [Instalación](/es/getting-started/installation/) · [Integraciones](/es/integration/other-tools/) · [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Se mantienen licencia MIT, avisos y créditos ZenRouter/9Router: [LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE).
