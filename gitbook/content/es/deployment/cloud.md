# Despliegue VPS y contenedores

Remoto es un gateway **administrado por ti**, no un endpoint incluido. Localhost es la máquina que hace la solicitud. No exige cuenta ByKitsune ni orden de proveedores.

## Fuentes

Usa Node.js >=22.19.0, dependencias bloqueadas y build de raíz según [instalación](/es/getting-started/installation/). Configura servicio con `DATA_DIR` privado absoluto, secretos estables y contraseña fuerte; no publiques claves en unidades o imágenes.

## Contenedores

**1.0.2 pendiente de SHA/tag final, controles y publicación.** Ningún intento anterior publicó imagen GHCR canónica: 1.0.1 falló antes de login/push; 1.0.0 falló la prueba de migración. Verifica acceso, digest y lectura del registro; tag/login no equivale a publicación. Solo linux/amd64.

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.2
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
