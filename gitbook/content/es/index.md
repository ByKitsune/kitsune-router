# Bienvenido a Kitsune Router

**Your models. Your routes.** Gateway de IA local-first y neutral entre proveedores, mantenido y patrocinado por [ByKitsune](https://bykitsune.com). Elige tus modelos, cuentas y orden de fallback, sin cuenta ByKitsune ni compra obligatoria. Las solicitudes siguen llegando a los upstreams configurados; no es inferencia offline.

## Estado de publicación

**Fuente 1.0.2 verificada; publicación npm/GHCR bloqueada.** Tag inmutable `65c8b97d`: 9.041 aprobados, 100 omitidos, cero fallos de tests/suites; lint estricto y builds pasaron. npm publish recibió E403 (2FA o token granular con bypass 2fa); lectura pública HTTP 404. GHCR pasó gate/login, pero preflight paró antes de build/push por un manifest ausente mal clasificado. Cambio de token por el usuario en GitHub UI aún no confirmado; recuperación separada sin cambiar versión/tag. Sin imagen canónica ni GitHub Release establecidos. Usa comandos del registro tras verificar publicación o fuentes ahora.

| Superficie | Destino |
| --- | --- |
| Repositorio | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm | `@bykitsune/router` |
| Comando | `kitsune-router` |
| Clave de proveedor | `kitsunerouter` |
| Imagen canónica | `ghcr.io/bykitsune/kitsune-router` |

Tags inmutables: `v1.0.1` en `74583402` pasó SSH/CI, pero GHCR falló antes de login/push, sin imagen canónica; npm publish falló, causa aún desconocida, lectura pública HTTP 404 el 2026-10-27 y sin GitHub Release. `v1.0.0` en `390a6567` no publicó npm/GHCR tras fallar la prueba de migración. 1.0.2 controla fechas de test y mejora diagnósticos npm, sin cambiar orden ni política fail-closed de producción. Los resultados antiguos no verifican esta candidata. [Cambios](/es/changelog/) · [Borrador 1.0.2](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md). Historia 0.x intacta.

## Capacidades y límites

Traducción de protocolos con límites por ruta, combos y cuentas configurables, uso local en SQLite y compresión opcional. No garantiza cuotas ilimitadas, ahorro fijo ni disponibilidad continua. Estimaciones no son facturas; desconocido no es gratis. Se eliminó la sincronización antigua; el acceso remoto requiere tu propio servicio con autenticación y HTTPS.

[Inicio rápido](/es/getting-started/quick-start/) · [Instalación](/es/getting-started/installation/) · [Integraciones](/es/integration/other-tools/) · [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Se mantienen licencia MIT, avisos y créditos ZenRouter/9Router: [LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE).
