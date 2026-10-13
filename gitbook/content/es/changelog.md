# Registro de cambios

## 0.9.8 — 2026-10-13

Elimina el aviso crítico de dependencias y añade el lote Tier-1 del análisis de sincronización con 9router. Veinte cambios, cada uno con su propio commit y pruebas. Requiere **Node.js >=22.19.0**. El paquete sigue siendo `@joyccn/zenrouter`, con binario `zenrouter`. Sin cambios de API incompatibles.

### Seguridad

**Crítico eliminado:** `proxy-addr` (GHSA-jqcg-44mw-7w3h, suplantación de IP mediante una subred de confianza IPv4-mapped IPv6) llegaba solo a través de `express`, declarado en `dependencies` pero sin importarse en ningún lugar. Se eliminó la dependencia en lugar de fijarla; el lockfile pierde 40 paquetes transitivos. También se retiraron `marked` y `selfsigned` (solo para pruebas, ahora devDependency).

**No es una versión sin vulnerabilidades, y no se afirma que lo sea.** `node-forge` GHSA-86w9-cpqp-85rv (alta) no tiene parche upstream (1.4.0 es la más reciente). Su único consumidor en producción analiza, genera, firma y serializa certificados, pero nunca llama a un verificador de firmas, por lo que la ruta de verificación RSA PKCS#1 v1.5 afectada es inalcanzable aquí — ahora verificado por una prueba.

### Uso y facturación

Las llamadas de streaming compatibles con OpenAI solicitan `include_usage`, así que los aciertos de caché se facturan a la tarifa de caché en vez de una estimación por caracteres. Las peticiones de imagen de Codex registran sus tokens reales. Los ids con sufijo de esfuerzo se facturan a la tarifa del modelo base en lugar de `$0`.

### Enrutamiento y fallback

Un 400 que significa "sin créditos" avanza al siguiente miembro del combo en lugar de fallar la petición. Los endpoints de chat admiten el pinning de cuenta `x-connection-id` con fallback automático. El selector de modelos ya no ofrece proveedores cuyas conexiones están todas deshabilitadas.

### Traducción y protocolo

Las declaraciones de herramientas `strict` sobreviven a la traducción. `response_format` de Chat se asigna a `text.format` de Responses, y el campo `text` exclusivo de Responses se elimina al volver. La salida de CommandCode se limita a su esquema real de 200k.

### Catálogo

Antigravity Claude Sonnet 5.5 / Opus 5.5, CodeBuddy CN `kimi-k2.8-preview` y `deepseek-v4.1-flash`, LongCat 2.5, el mapa MITM alineado con la generación 3.8, y ParalonCloud como nuevo proveedor. Las entradas de catálogo son declaraciones: no establecen derechos de cuenta ni disponibilidad real.

### Verificación

Suite aislada: **1.386 archivos, 4.335 casos — 4.234 aprobados, 100 omitidos, 1 todo, 0 fallos** en Node 24.19.0; lint sin advertencias. Las baselines del registro coinciden byte a byte. La compilación de producción y una prueba standalone con `DATA_DIR` aislado pasan; no se usaron cuentas de producción ni inferencia facturable.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.8) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.8.md) · [Release notes](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.8.md) · [Previous release 0.9.7 (historical)](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md)

---

## 0.9.7 — 2026-10-06

Esta versión reúne todo el lote de mantenimiento ya integrado; el cambio de versión no añade una función de producto independiente. Requiere **Node.js >=22.19.0**. El paquete sigue siendo `@joyccn/zenrouter` y el comando, `zenrouter`.

### Catálogo e identidades de clientes

Se añaden **120 entradas de proveedor/modelo** (100 chat, 8 imagen, 6 embeddings, 6 TTS) y **342 registros de metadatos con fuentes**; **827 entradas históricas siguen sin verificarse individualmente**. Se distinguen límites, precios y valores desconocidos de API, IDE/OAuth y planes de programación. Se corrigen alias de proveedor/precio, transporte por modelo, descubrimiento sin autenticación, ID compartidos entre tipos, capacidades en vivo/declaradas, límites de entrada/contexto/salida y tarifas de contexto largo/personalizadas. Las unidades no basadas en tokens no se convierten en tarifas por token; un precio desconocido no es gratuito. Se actualizan identidades investigadas y cabeceras Gemini/Copilot por endpoint, sin conceder derechos beta.

### Razonamiento y uso

Se conservan límites de salida explícitos/anulables y pensamiento nativo hasta la serialización final, sin aumentar silenciosamente un límite de pago. Se mantienen campos de razonamiento Responses y el soporte efectivo de intercalado Claude, incluso tras rechazos beta. Se registra uso real de intentos agotados, se suman pensamientos Gemini una sola vez y se conservan terminales incompletos, salida parcial y rechazos. Se evita persistir dos veces al cancelar tras el terminal o repetir combos considerados vacíos por error. No se añade un reintento automático con mayor presupuesto. Codex OAuth, OpenCode Muse y Cursor siguen sin aplicar el límite de la API pública; un límite de tokens no es un presupuesto monetario total.

### Búsqueda con fuentes

Los nombres de proveedor y `provider/search` seleccionan valores de servicio predeterminados, no nombres de modelo upstream. Se valida la pertenencia de selecciones explícitas/miembros de combo antes del envío. Antigravity usa su sandbox dedicado, ID reales de proyecto/request/session, mapeo de modelo/pensamiento, Google Search y proxy estricto por cuenta. Se excluye `thought: true` de respuestas y contexto de citas. El 404 específico de modelo Gemini realiza un intento de cuenta; el 404 exacto pero ambiguo de recurso Antigravity realiza como máximo **tres**, sin bloquear cuentas sanas. El éxito limpia solo el ámbito de búsqueda correspondiente; otros fallbacks de autenticación/cuota no cambian.

### Dependencias, instalador e interfaz

Se actualizan React **19.3.0**, ESLint **10.12.0**, Vitest **5.0.3**/Vite **8.3.2** y Undici **8.11.2**. Se mantienen dispatchers Node 22, CONNECT, fijación DNS, cancelación y política de proxy estricto sin conexión directa al fallar; se eliminan dependencias sin uso. El instalador verifica el mínimo exacto del runtime y la CLI recién enlazada. Se empaquetan Monaco **0.57.0** y workers del mismo origen; se reparan markdown/cambio de idioma y advertencias React conservando borradores y seguridad de hidratación. Los ámbitos ESM limitados no alteran lanzadores CommonJS; permanece la alternativa SQLite opcional.

### Protección de publicación

Los workflows manuales npm/Docker exigen una etiqueta estable real y su commit exacto; la procedencia npm también coincide con ref/SHA del dispatch. Se conserva el tarball original y se recupera verificando SHA512 del registro. La serialización global y la comparación numérica impiden que reintentos antiguos sustituyan un `latest` más nuevo; sin el artifact original, se detienen de forma segura.

### Verificación, seguridad y límites de actualización

La verificación previa incluye pruebas aisladas, lint sin advertencias, builds de app/CLI, exportación de documentos, comprobaciones de navegador y aceptación real loopback/standalone con SQLite para búsqueda/uso. Verificación local final: **494 archivos de prueba, 4.091 aprobadas, 100 omitidas, 1 todo y cero fallos** con Node 22.23.2; lint sin errores/advertencias, empaquetado CLI y prueba Docker aprobados. No se usaron cuentas de producción, inferencia upstream real, nuevos reintentos de gasto ni despliegue automático. Investigar el catálogo **no demuestra permisos de cuenta ni disponibilidad real**.

La verificación TLS permanece activa; las excepciones de certificados autofirmados son por solicitud, no globales. **Persisten avisos de node-forge y braces**: no se afirma una versión libre de vulnerabilidades. Tras publicarse, instala `@joyccn/zenrouter@0.9.7` o usa `joyccn/zenrouter:0.9.7`. El flujo de contenedores solo publica para **linux/amd64**; conserva **/app/data** y haz una copia antes de actualizar. La documentación no certifica publicación ni disponibilidad de etiquetas.

---

[Versión en GitHub](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.7) · [Registro completo](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [Detalles técnicos](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.7.md) · [Notas de versión](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md) · [Versión anterior 0.9.6 (histórica)](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.6.md)
