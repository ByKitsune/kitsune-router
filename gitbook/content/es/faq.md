# Preguntas frecuentes

## ¿Qué es?

Gateway neutral y local-first mantenido/patrocinado por [ByKitsune](https://bykitsune.com), continuación de ZenRouter/9Router. **Your models. Your routes.** Usa tus upstreams, no envía automáticamente al patrocinador.

## ¿Ya está 1.0.1?

Es la siguiente candidata, **pendiente de tag/SHA final y publicación**. v1.0.0 sigue en `390a65677c06a30084386d2a2adf8b0c48709281` sin npm/GHCR tras el fallo de ownership. GitHub confirmado y npm autentica como `bykitsune`, pero permiso/publicación/readback son otras verificaciones. [Instalación](/es/getting-started/installation/) · [Cambios](/es/changelog/). Historia 0.x intacta.

## ¿Cuenta u orden obligatorio?

No requiere ByKitsune. Elige cuentas y combos; permisos, planes, regiones y términos upstream siguen aplicándose.

## ¿Gratis o ilimitado?

MIT licencia el software, no elimina costes de proveedores/hardware ni cuotas. Compresión sin ahorro fijo; estimaciones no son facturas, desconocido no es cero.

## ¿Qué cambia?

Paquete `@bykitsune/router`, comando `kitsune-router`, proveedor `kitsunerouter`, variables `KITSUNE_ROUTER_*`, cabeceras `x-kitsune-router-*`. `/v1/*`, `/v1beta/*` y 20128 no cambian; no se exige alias antiguo. [Integración](/es/integration/other-tools/).

## ¿Datos y nube?

Detén escritores y respalda todo. La migración verifica snapshot/archivos, conserva originales, no sobrescribe y respeta `DATA_DIR`. Conserva secretos, identidad, auth, sales y certificados. Sin sincronización antigua ni servicio alojado por defecto. No toda credencial tiene garantía de cifrado en reposo. [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

Las pruebas históricas no verifican la fuente actual; se requiere evidencia del SHA final. Sintéticos no prueban permisos ni facturación real.
