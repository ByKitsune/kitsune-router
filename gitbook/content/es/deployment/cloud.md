# Despliegue VPS y contenedores

**1.0.8 está en preparación y aún no está publicado.** Antes de crear su tag o publicar, deben completarse CI sobre el SHA exacto y la prueba de instalación normal del candidato.

**Aviso sobre 1.0.7:** GitHub Release, npm y Docker se publicaron desde `b7f77d07`, pero su instalador usa operaciones secuenciales `--no-save` de SQLite y bandeja que pueden eliminar las dependencias de la otra operación. Consulta los resultados y límites observados en el [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md).

Remoto es un gateway **administrado por ti**, no un endpoint incluido. Localhost es la máquina que hace la solicitud. No exige cuenta ByKitsune ni orden de proveedores.

## Fuentes

Usa Node.js >=22.19.0, dependencias bloqueadas y build de raíz según [instalación](/es/getting-started/installation/). Configura servicio con `DATA_DIR` privado absoluto, secretos estables y contraseña fuerte; no publiques claves en unidades o imágenes.

## Contenedores

**Objetivo actual: `ghcr.io/bykitsune/kitsune-router:1.0.8`, solo linux/amd64.** Usa el ejemplo únicamente después de confirmar la publicación, el digest y los permisos de acceso de 1.0.8 en el [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md). No presupongas acceso anónimo ni reutilices el digest histórico de 1.0.2. La [guía Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md) recoge las instrucciones y verificaciones vigentes.

**Registro histórico de 1.0.2; no determina el estado de 1.0.6:** **GHCR 1.0.2 publicado, pero privado.** Recovery `40485038668` usó tooling `802c61bf` y runtime inmutable `65c8b97d`; lectura autenticada digest/proveniencia/SPDX y smoke de la imagen publicada pasaron. `1.0.2`/`latest` comparten índice `sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b`. El ejemplo de 1.0.2 requería acceso privado autorizado o confirmación de Public y lectura anónima. Public seleccionado no confirmado, grants anónimos HTTP 401. Solo **linux/amd64**. [Digest y evidencia](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md).

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.8
    platform: linux/amd64
    ports:
      - "127.0.0.1:20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      DATA_DIR: /app/data
      INITIAL_PASSWORD: ${INITIAL_PASSWORD:?Set a strong dashboard password}
```

Conserva el volumen/montaje en el `DATA_DIR` efectivo: `/app/data` por defecto o tu ruta personalizada compatible. Uno vacío no es migración. Mirror Docker Hub opcional. [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md).

## Confianza

HTTPS autenticado, firewall, tamaños/timeouts acotados y SSE sin buffering. El proxy confiable debe añadir el peer real a `X-Forwarded-For`, no reenviar entrada del cliente. No expongas control Headroom/MITM. `https://router.example.com/v1` es un placeholder propio. Respalda todo detenido y conserva ruta/secretos/certificados. [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md). No certifica despliegue/escaneo.
