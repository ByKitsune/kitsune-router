# Registro de cambios

## Sin publicar — dashboard, navegación móvil y agent skills

El código actual renueva el dashboard, la fuente DM Sans incluida localmente,
las transiciones de Usage, las imágenes oficiales de ByKitsune, la navegación
móvil rápida y el selector de idioma con búsqueda. Se revisan las nueve skills
según el descubrimiento, la autenticación, las solicitudes y las respuestas reales
del gateway. Esto no mueve el tag inmutable 1.0.2 ni confirma una nueva publicación
npm/container, documentación alojada o despliegue de producción. Véanse el
[changelog fuente](https://github.com/ByKitsune/kitsune-router/blob/master/CHANGELOG.md#unreleased)
y la [guía de UI](https://github.com/ByKitsune/kitsune-router/blob/master/docs/UI-DESIGN.md).

## Kitsune Router 1.0.2 — contenedor privado publicado; pull anónimo pendiente; npm bloqueado

Tag inmutable **`65c8b97d783becab3f1e1210d2ab9ce67992e13b`**; PR #2 merge `23375bf1`. SSH exacto: **9.041 aprobados, 100 omitidos, cero fallos de assertions/suites**; lint estricto, 18 tests docs/export estático, build app y pack pasaron. CI `40468830176` verde con árbol igual al tag. Smoke del tarball local, seis reinicios de contenedor y navegador pasaron en su alcance. Mock solo de `Date` del hijo, orden de producción intacto; log warning de npm publish, no pack.

npm `40469972263` pasó gate/docs/pack, pero publish recibió **E403** por requerir 2FA o granular token con bypass 2fa. Readback público HTTP 404. Artefacto CI original `12718343077`, SHA-256 `a52d736ade6b8cbcf17ba114c9b55018956a7f1b35c4280edcae2912de8a3114`, distinto del tarball local; ambos pasaron de forma independiente help/version/runtime/upgrade, originales y claves retenidos, secretos 0600 y salida 0. Reemplazo de token en GitHub UI no confirmado; causa npm 1.0.1 aún desconocida.

El fallo GHCR `40469972099` paró antes de build/push; primera recuperación `40483141695` falló antes del registro por contexto `GITHUB_SHA`. PR #4 merge `802c61bf` usa verificación API explícita. Recovery **`40485038668`** publicó runtime inmutable `65c8b97d` con ese tooling, gate 9.041/100 skip/cero fallos, labels/SLSA v1/SPDX y promoción `latest`. Lectura autenticada independiente confirmó índice `1.0.2`/`latest` **`sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b`**. Imagen publicada `af6416b6`: 16 capas/rootfs verificadas y seis start/restart reales SSH sanos a 1.0.2, claves estables/0600. Paquete aún **private**, Public seleccionado sin confirmar, grants anónimos HTTP 401. npm sigue bloqueado; sin GitHub Release/producción ni preview actualizado. Fallos anteriores e identidades de tooling/runtime/artefactos permanecen separados. [Evidencia 1.0.2](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md) · [Detalles](https://github.com/ByKitsune/kitsune-router/blob/master/docs/CHANGELOG_v1.0.2.md).

## Kitsune Router 1.0.1 — intento inmutable; publicación no establecida

Tag `v1.0.1` en **`745834026a5a9f55dffce40c0ad01bf3106e8237`**; PR #1 fusionado a master `ce752a9f`. SSH: **9.039 aprobados, 100 omitidos, cero fallos**; CI `40463259397` pasó. GHCR `40465152324`: **9.038 aprobados, uno falló** en `db-scoped-cache:216`, antes de login/push; no imagen canónica 1.0.1 publicada.

npm `40465152995` pasó gate exacto/docs build/pack, pero publish falló con causa aún desconocida por salida truncada. Artefacto original `12716498091`, tarball SHA-256 `f00e2f581631065a9afa4719999487bf2f5eba31c096393d2a9141fb13bd55e8`; lectura pública HTTP 404 el 2026-10-27. No GitHub Release 1.0.1. [Registro](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.1.md). Las **58 pruebas de migración incluyen ocho denegaciones**; producción sigue fail-closed, Linux UID 65534 no certifica non-root general y Windows/macOS nativos no están verificados. ByKitsune PR #6 fusionado en `73a14982`, sin despliegue de producción. No reutilizar cifras como pruebas de 1.0.2.

## Kitsune Router 1.0.0 — intento conservado; npm/GHCR no publicados

Tag inmutable `v1.0.0` en `390a65677c06a30084386d2a2adf8b0c48709281`. Falló el workflow de ownership non-root antes de publicar. Los **9.029 tests aprobados** son evidencia de esa candidata, no de 1.0.1. Se conserva el alcance del intento a continuación.

**Your models. Your routes.** Mantenimiento/patrocinio de [ByKitsune](https://bykitsune.com), sin cuenta ni orden obligatorio. Destinos: `ByKitsune/kitsune-router`, npm `@bykitsune/router`, comando `kitsune-router`, proveedor `kitsunerouter`, imagen `ghcr.io/bykitsune/kitsune-router`.

Detén escritores y respalda todo. Migración verificada `~/.zenrouter`/`~/.9router` → `~/.kitsune-router`, originales conservados, sin sobrescribir destinos; `DATA_DIR` explícito manda. Conserva secretos/auth/sales/certificados. Variables `KITSUNE_ROUTER_*`, cabeceras `x-kitsune-router-*`; `/v1/*` y 20128 permanecen.

El intento fallido no publicó npm/GHCR. Conserva tag, alcance y evidencia; el seguimiento actual 1.0.2 sigue pendiente. [Intento](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.0.md) · [Detalles históricos](https://github.com/ByKitsune/kitsune-router/blob/master/docs/CHANGELOG_v1.0.0.md) · [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).

> **Archivo:** lo siguiente conserva nombres, artefactos, URLs y pruebas ZenRouter originales. No son publicaciones Kitsune 0.x ni verifican la fuente actual. Usa [instalación actual](/es/getting-started/installation/), no comandos históricos. El trabajo Unreleased siguiente se registró antes de esta propuesta.

## Sin publicar — conciliación de octubre

- Corrige la recursión entre el wrapper fetch de Next.js y el transporte del gateway; recupera chat, renovación OAuth, uso y catálogo sin cambiar las políticas de cuentas o proxy.
- Verifica las dependencias directas instaladas frente al lockfile antes de compilar o probar. Reinstala con `npm ci` para no empaquetar versiones antiguas de Next.js/Undici. Los artefactos 0.9.13 publicados no cambian.

[Recuperación del transporte y compilaciones reproducibles](https://github.com/ZenRouter/ZenRouter/blob/master/docs/audit/20-fetch-transport-recovery-2026-10.md)

- Actualiza identidades estables verificadas y catálogos; audita precios por proveedor y unidades nativas de medios. Las tarifas por horario y sustituciones publicadas usan la fecha registrada antes de aplicar valores del operador.
- Expone el precio efectivo o desconocido de cada modelo con búsqueda que conserva cambios; planes, superficies cliente y créditos de suscripción no equivalen a facturas API.
- Corrige las rutas gratuitas exactas de TokenHarbor y las tarifas por velocidad realmente entregada; distingue las duraciones de escritura de caché, los costes desconocidos y los valores explícitos del operador.
- Muestra subtotales conocidos y solicitudes sin precio sin presentarlos como un total completo ni recalcular el historial.
- Concilia autorización, almacenamiento privado, cancelación/proxy, límites de inferencia, métricas y correcciones verificadas del protocolo y CLI de octubre.
- Unifica la verificación y las protecciones de publicación. No modifica retroactivamente los artefactos inmutables 0.9.13 ni demuestra disponibilidad o facturación real.

[Alcance, fuentes y límites](https://github.com/ZenRouter/ZenRouter/blob/master/docs/audit/17-october-reconciliation-2026-10.md)

## 0.9.13: 2026-10-19

- Corrige errores falsos del presupuesto de thinking al probar modelos Claude de Antigravity y guarda los valores predeterminados sin alterar límites de salida explícitos del cliente.
- Añade controles independientes Auto, Standard, Fast y Ultrafast para OpenAI/Codex, con `service_tier` nativo y la ruta Responses correcta.
- Conserva archivos y adjuntos de herramientas; omite solo cuentas no elegibles para esa petición, sin penalizaciones de salud ni reducción del nivel elegido.
- Evita que respuestas asíncronas antiguas sobrescriban una selección o validen otra prueba. Separa niveles solicitados/reales y costes premium desconocidos.
- Verificación: 6.248 pruebas ordinarias correctas en Node 22/24, más 3 fallos esperados y 100 omisiones opcionales. Las pruebas sintéticas no acreditan permisos reales, velocidad ni facturación; los niveles rápidos pueden costar más.

[Notas de versión](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/releases/RELEASE_NOTES_v0.9.13.md) · [Detalles técnicos](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/docs/CHANGELOG_v0.9.13.md)

## 0.9.12: 2026-10-19

- Conserva las capturas tipadas y las opciones de thinking en peticiones nativas y traducidas, incluidas Ollama y CommandCode.
- Preserva OpenCode JSONC; invalida cachés de autenticación, modelos y cuotas después de importar la base de datos.
- Elimina la cadena node-forge, refuerza los límites proxy/DNS y detiene los reintentos al cancelar.
- Incluye CLI/cuotas de Antigravity Argon y correcciones documentadas de precios y ciclos de vida, sin inventar límites de contexto o salida.
- Verificación: 6.052 pruebas correctas en Node 22/24, 100 opcionales omitidas y cero fallos; cuatro auditorías de lockfiles sin avisos. No acredita acceso real a proveedores ni garantiza seguridad.

[Notas de versión](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/releases/RELEASE_NOTES_v0.9.12.md) · [Detalles técnicos](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/docs/CHANGELOG_v0.9.12.md)

## 0.9.11: 2026-10-17

Esta versión corrige la visión multiturno, los controles de razonamiento, los fallos nativos y las estimaciones de coste del ZenRouter personalizado.

- Conserva las imágenes tipadas en resultados de herramientas, historial compactado, compresión y conversiones entre proveedores, sin convertir base64 en texto.
- Preserva thinking, identificadores de herramientas, firmas y errores SSE/JSON. Los controles nativos incompatibles fallan explícitamente; una petición inválida no bloquea cuentas sanas.
- Contrasta productos e identificadores completos con models.dev del 17 de octubre. Separa contexto, entrada y salida; distingue costes desconocidos de tarifas gratuitas.
- Guarda solo las tarifas editadas. Gemini 2.5 Pro y Flash-Lite siguen visibles para proyectos previamente elegibles: la conclusión anterior de retirada global era incorrecta.

**Aviso de seguridad:** [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) sigue sin resolverse en la aplicación y la CLI; GitHub no indica una versión corregida. Las pruebas de protocolo no verifican permisos de cuentas reales ni facturas.

[Notas de versión](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/releases/RELEASE_NOTES_v0.9.11.md) · [Detalles técnicos](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/docs/CHANGELOG_v0.9.11.md)

## 0.9.10 — 2026-10-16

Versión de parche para los cambios realizados al reverificar los hallazgos de la auditoría contra el código, después de publicar 0.9.9. Las versiones de npm son inmutables, así que no estaban en ninguna versión publicada. Sin cambios de API incompatibles; dos columnas de base de datos se añaden automáticamente en el primer arranque.

### Correcciones

**Los modelos retirados ya no se anuncian.** `gemini-2.5-pro` y `gemini-2.5-flash-lite` responden 404 *"is no longer available to new users"* — reproducido 5/5 y 2/2, y corroborado por 30 días de registros de producción. Ambos aparecían y parecían utilizables. Ahora se ocultan mientras los ids permanecen en el registro, de modo que un combo guardado resuelve en un fallo claro en lugar de un 404.

**Quince modelos `deprecated` seguían ofreciéndose.** La marca existía y estaba documentada, pero solo la consumía la interfaz del panel: no había ningún filtro en la ruta de la API. Reproducido con una conexión deepseek activa: se listaban dos alias de compatibilidad retirados. Ahora se filtran, con una distinción importante: un `deprecated: true` a **nivel de proveedor** es un aviso de riesgo de ToS para claude/codex/antigravity/… y no debe ocultar los modelos de ese proveedor.

**Las ventanas de contexto de Gemini se ocultaban, no se desconocían.** Once registros declaraban la ventana como no verificada, lo que la anulaba; como `/v1/models` solo emite `context_length` cuando es finito, **17 de 334 modelos** llegaban a los clientes sin ventana alguna. Las entradas oficiales de models.dev publican 1.048.576 para estos ids y las rutas se sirven, así que eliminar el número era la peor opción. Ahora **12** modelos carecen de ventana, cada uno realmente no servible o realmente no verificado.

**Dos errores de traducción con pérdida silenciosa de datos.** `openai-to-cursor` sobrescribía el `max_tokens` del cliente con 32000 fijo — un cliente que pedía 200 recibía 32000; ahora la constante es un suelo, no una anulación. `openai-to-commandcode` convertía argumentos de herramienta malformados en `{}` sin señal, así que el modelo recibía una llamada sin parámetros y nada indicaba la pérdida.

### Añadido

**El TTFT por fin es medible.** El manejador de streaming calculaba el tiempo hasta el primer token y lo imprimía, pero nunca lo guardaba — por eso la auditoría tuvo que analizar 304 líneas de registro para reportar una mediana de 5.471 ms. Ahora se persiste en columnas anulables (escrito como NULL, nunca 0, para que las peticiones no medidas no arrastren la mediana) y se expone como `zenrouter_ttft_ms{quantile=...}` en `/api/metrics`.

### Nota

Tres hallazgos de esta versión provienen de reverificar una conclusión anterior en lugar de confiar en ella: la auditoría reportó **3** modelos con `context_length` nulo y el recuento real era **17**; `gemini-3.5-flash-lite` aparecía junto a modelos realmente retirados pero devuelve **HTTP 200** (un 429 anterior era cuota); y 250.000 resultó ser el tope del *puente Antigravity* para `claude-sonnet-4-6`, no la ventana de la API de Anthropic, que es 1.000.000.

## 0.9.9 — 2026-10-15

> **¿Actualizas desde 0.9.7? Esta versión también incluye 0.9.8.** El lote 0.9.8 se preparó el 2026-10-13 pero no se publicó entonces; se **publicó después, el 2026-10-16**, como release propia, dejando `latest` en 0.9.9 en todos los registros. 0.9.9 son 45 commits entre `v0.9.7` y `v0.9.9`, así que contiene todo lo que trae 0.9.8 —la eliminación del aviso crítico de dependencias y los ports Tier-1— además de todo lo siguiente. **Prefiere 0.9.9:** 0.9.8 no incluye ninguna de las correcciones de auditoría.

Responde a una auditoría externa (11 documentos) y a una verificación completa del catálogo contra [models.dev](https://models.dev). Cada hallazgo se reprodujo contra la pasarela en ejecución antes de cambiarlo, y cada corrección incluye una prueba de regresión. Requiere **Node.js >=22.19.0**. El paquete sigue siendo `@joyccn/zenrouter`, con binario `zenrouter`. Sin cambios de API incompatibles.

### Seguridad

**Un cliente ya no puede agotar todos los proveedores.** La tabla `apiKeys` no tenía ninguna columna de cuota y `validateApiKey()` devolvía un booleano, así que nada limitaba lo que consumía un *cliente*: los únicos límites eran el del inicio de sesión del panel y los enfriamientos de las cuentas *upstream*. `/v1` ahora aplica un límite por clave (600 RPM, ráfaga de 120/s, `V1_RATE_LIMIT_RPM`/`V1_RATE_LIMIT_BURST`), con claves de cubo con hash, tabla de contadores acotada y `Retry-After` más `x-ratelimit-*` en 429. Los valores por defecto salen del tráfico medido (pico ~246 req/min → ~30x de margen).

**El detalle interno de enrutamiento dejó de filtrarse.** Producción devolvía `"No active credentials for provider: openai"`, nombrando el proveedor upstream. La misma fórmula existía en los manejadores de imagen, vídeo, búsqueda, tts, stt, embeddings, fetch y Gemini nativo. El cliente recibe ahora un mensaje neutro; los diagnósticos legibles por máquina que genera el propio Zen (`output_budget_exhausted` y similares) siguen reenviándose.

**Los correos de las cuentas salieron de los registros.** Journald contenía 589 líneas con 27 direcciones únicas, porque `connectionName` se resuelve como `displayName || name || email || id`. Las identidades son ahora un hash corto con sal: localizable y distinguible, no reversible.

**Los tokens revocados son permanentes, no transitorios.** `token_revoked` no coincidía con ninguna regla y caía en el enfriamiento genérico de 401, así que una cuenta muerta se reintentaba cada 2 minutos: 31 eventos en 8h en producción, una cuenta reintentada 16 veces. Ahora hay un enfriamiento de 1h y un estado `needs_reauth`. El intento de refresco se conserva a propósito: a diferencia de una denegación por política de organización, un token revocado puede seguir siendo recuperable.

**Cabeceras de seguridad base y una lista CORS explícita.** La pasarela se publica a través de un túnel de Cloudflare (`zen.hlcyn.xyz` → `127.0.0.1:20128`), así que no es cosmético.

### Correcciones

**La actualización automática vuelve a funcionar.** El código consultaba npm con el nombre simple `zenrouter`, que no está registrado (404), así que `/api/version` siempre informaba `latestVersion: null` y el comando de instalación del actualizador habría fallado. El nombre con ámbito `@joyccn/zenrouter` es ahora una única constante compartida por la ruta de versión, el actualizador y la página de inicio.

### Enrutamiento y errores

**El desbordamiento de contexto dejó de reportarse como 502.** Un prompt demasiado largo llegaba como `context_length_exceeded` dentro de un flujo SSE con estado 200 y se convertía en 503 → 502. ByKitsune reintenta 502, así que un prompt que nunca podría tener éxito se reintentaba mientras cada cuenta sana quedaba bloqueada 30s por turno. Ahora es un 400 con `invalid_request_error`, sin rotar cuentas.

**Las ventanas de contexto estaban subestimadas hasta en 778k tokens.** `/v1/models` publicaba el techo de la CLI de Codex (872.000; 272.000 para GPT-5.6) como `context_length`. Medido en vivo: se aceptaron 402.486 tokens para un modelo anunciado con 272.000, y 902.486 para uno anunciado con 872.000, con el techo real en 922.000. GPT-6/GPT-5.6 informan ahora de la especificación de la API (1.050.000 / 922.000 / 128.000); los techos de la CLI quedan en `limits.cliDefaultContext`/`cliMaxContext`.

**Un fallo a mitad de flujo ahora marca la cuenta.** Antes, una cuenta que fallaba después de la cabecera 200 seguía en rotación, así que cada petición devolvía 200 con contenido truncado y sin failover: una caída invisible para la monitorización basada en estados. Una desconexión del cliente no puede alcanzar esa ruta.

**El `Retry-After` del proveedor era código muerto.** `checkFallbackError` aceptaba un `Response` para leer la cabecera, pero ningún llamador lo pasaba, así que un proveedor que respondía `Retry-After: 3600` se reintentaba a los segundos.

**Las excepciones inesperadas se registran.** Un `catch {}` desnudo devolvía un 500 genérico con un `serverRequestId` que no aparecía en ningún registro. Ahora se registran nombre, mensaje y traza con ese id. El contenido de los prompts y las respuestas, nunca.

### Traducción

`top_p`, `stop`/`stop_sequences`, `seed` y `metadata.user_id` se perdían en varios saltos, así que un cliente que fijaba `stop: ["</end>"]` recibía salida sin truncar siempre que la pasarela enrutaba a Claude. Un resultado de herramienta fallido se señalaba mediante un campo `is_error` no estándar que los mensajes de herramienta de OpenAI no tienen, así que el modelo receptor podía concluir que la herramienta había funcionado; ahora es un marcador `[tool_error]` dentro del contenido.

### Catálogo

Cinco ventanas corregidas contra las entradas oficiales de los proveedores en models.dev: `gpt-4.1*` (1.000.000 → 1.047.576), `command-a-translate-08-2025` (128.000 → 8.000, una sobrepromesa de 16x), `ministral-3b/8b/14b` (128.000 → 131.072/262.144), `codestral-latest` (128.000 → 256.000). Una comparación ingenua reportaba 206 diferencias; al excluir convenciones de unidades (256000 vs 262144) y topes propios de pasarelas, quedaron 5 reales. Cuatro rutas de Codex que la cuenta de ChatGPT rechaza (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`) ahora llevan `routeAvailable: false` con un motivo legible por máquina.

### Nuevos endpoints

`GET /api/health` es ahora una sonda real: una lectura de base de datos, **503** cuando el almacenamiento no responde, más tiempo activo, versión y recuentos de cuentas bloqueadas y que necesitan reautenticación. `GET /api/metrics` sirve texto Prometheus (modelos en uso, fallos por estado, peticiones en vuelo), protegido por token y estrictamente agregado.

### Verificación y límites

Suite aislada: **1.436 archivos, 4.525 casos — 4.424 superados, 0 fallidos**; `npx eslint .` limpio. Las líneas base del registro son idénticas byte a byte. Verificado en ejecución con un `DATA_DIR` aislado: JSON de salud, cabeceras de seguridad, lista CORS, 429 con `Retry-After` y metrics devolviendo 401 sin autenticar. El trabajo de catálogo es metadato: no establece derecho de uso ni disponibilidad en vivo, y 448 filas no tienen referencia en models.dev. No está libre de vulnerabilidades: el aviso de `node-forge` sigue sin corrección upstream y su ruta afectada sigue siendo inalcanzable, algo que una prueba afirma.

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
