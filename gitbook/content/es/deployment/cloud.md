# Despliegue VPS y contenedores

Remoto es un gateway **administrado por ti**, no un endpoint incluido. Localhost es la máquina que hace la solicitud. No exige cuenta ByKitsune ni orden de proveedores.

## Fuentes

Usa Node.js >=22.19.0, dependencias bloqueadas y build de raíz según [instalación](/es/getting-started/installation/). Configura servicio con `DATA_DIR` privado absoluto, secretos estables y contraseña fuerte; no publiques claves en unidades o imágenes.

## Contenedores

**1.0.0 pendiente de verificar/publicar.** Confirma namespace, acceso GHCR y digest. Solo linux/amd64.

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.0
    platform: linux/amd64
    ports:
      - "127.0.0.1:20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      DATA_DIR: /app/data
      INITIAL_PASSWORD: ${INITIAL_PASSWORD:?Set a strong dashboard password}
```

Conserva el volumen anterior: uno vacío no es migración. Mirror Docker Hub opcional, verificación independiente. [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md).

## Confianza

HTTPS autenticado, firewall, tamaños/timeouts acotados y SSE sin buffering. El proxy confiable debe añadir el peer real a `X-Forwarded-For`, no reenviar entrada del cliente. No expongas control Headroom/MITM. `https://router.example.com/v1` es un placeholder propio. Respalda todo detenido y conserva ruta/secretos/certificados. [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md). No certifica despliegue/escaneo.
