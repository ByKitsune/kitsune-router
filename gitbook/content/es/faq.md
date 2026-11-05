# Preguntas frecuentes

**1.0.8 publicado en npm, GitHub Release y el GHCR canónico.** El [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) reúne las lecturas de verificación y los límites de cada canal. El acceso anónimo a GHCR se comprueba por separado: el grant anónimo observado devolvió HTTP 401, lo que por sí solo no determina la visibilidad del paquete.

**Antecedente de 1.0.7:** npm, GHCR y GitHub Release se publicaron desde `b7f77d07`; su instalador podía eliminar dependencias entre las operaciones secuenciales `--no-save` de SQLite y bandeja. El código 1.0.8 corrige la retención de esos pins. El [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) conserva el problema observado y el estado de cada distribución.

## ¿Qué es?

Gateway neutral y local-first mantenido/patrocinado por [ByKitsune](https://bykitsune.com), continuación de ZenRouter/9Router. **Your models. Your routes.** Usa tus upstreams, no envía automáticamente al patrocinador.

## ¿Está disponible 1.0.8?

El objetivo actual es **1.0.8**. El [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) distingue los resultados reales de GitHub Release, npm y GHCR. No des por publicada una distribución ni por público un contenedor hasta confirmar su lectura; si un canal sigue pendiente o denegado, usa las [fuentes](/es/getting-started/installation/) o el acceso autorizado que indique el registro.

**Registro histórico de 1.0.2; no determina el estado de 1.0.6:** **Contenedor publicado pero privado; npm sigue bloqueado.** Recovery `40485038668` publicó runtime inmutable `65c8b97d`, con lectura autenticada digest/proveniencia/SPDX y smoke independiente pasados. Public seleccionado por el propietario no está confirmado; grants anónimos aún HTTP 401. Usa acceso privado autorizado o fuentes, no asumas pull anónimo. npm sigue E403/readback público HTTP 404 y cambio de token no confirmado. Sin GitHub Release 1.0.2 ni producción; causa npm 1.0.1 aún desconocida. [Instalación](/es/getting-started/installation/) · [Evidencia](/es/changelog/).

## ¿Cuenta u orden obligatorio?

No requiere ByKitsune. Elige cuentas y combos; permisos, planes, regiones y términos upstream siguen aplicándose.

## ¿Gratis o ilimitado?

MIT licencia el software, no elimina costes de proveedores/hardware ni cuotas. Compresión sin ahorro fijo; estimaciones no son facturas, desconocido no es cero.

## ¿Qué cambia?

Paquete `@bykitsune/router`, comando `kitsune-router`, proveedor `kitsunerouter`, variables `KITSUNE_ROUTER_*`, cabeceras `x-kitsune-router-*`. `/v1/*`, `/v1beta/*` y 20128 no cambian; no se exige alias antiguo. [Integración](/es/integration/other-tools/).

## ¿Datos y nube?

Detén escritores y respalda todo. La migración verifica snapshot/archivos, conserva originales, no sobrescribe y respeta `DATA_DIR`. Conserva secretos, identidad, auth, sales y certificados. Sin sincronización antigua ni servicio alojado por defecto. No toda credencial tiene garantía de cifrado en reposo. [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

Las pruebas históricas no verifican la fuente actual; se requiere evidencia del SHA final. Sintéticos no prueban permisos ni facturación real.
