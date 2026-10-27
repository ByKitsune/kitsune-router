# Kitsune Router

**Your models. Your routes.**

Gateway de IA local-first y neutral entre proveedores, mantenido y patrocinado por [ByKitsune](https://bykitsune.com). Tú eliges modelos, cuentas y orden de fallback. No requiere cuenta de ByKitsune ni comprar una API alojada. Las solicitudes siguen llegando a los proveedores configurados: local-first no significa inferencia sin conexión.

[English](../README.md) · [Repositorio](https://github.com/ByKitsune/kitsune-router) · [Cambios](../CHANGELOG.md) · [Migración](../docs/MIGRATION.md)

## Estado e instalación

**Contenedor 1.0.2 publicado en privado; acceso anónimo pendiente; npm bloqueado.** Fuente inmutable `65c8b97d`: 9.041 aprobados, 100 omitidos, cero fallos. Recovery `40485038668` publicó GHCR `1.0.2`/`latest`; lectura autenticada digest/proveniencia/SPDX y smoke independiente de la imagen publicada pasaron. El paquete sigue **private**: el propietario seleccionó Public, sin confirmar, y grants anónimos HTTP 401. npm sigue E403 con lectura pública HTTP 404; reemplazo de token por el usuario no confirmado. Comandos npm solo tras publicación npm verificada; usa fuentes o acceso privado autorizado al contenedor. Sin GitHub Release ni despliegue de producción. [Evidencia 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md) · [Docker](../DOCKER.md).

Los tags no se mueven: `v1.0.1` en `74583402` pasó SSH/CI, pero el control GHCR falló antes de login/push, sin imagen canónica. npm publish falló por causa aún desconocida; lectura pública HTTP 404 el 2026-10-27 y sin GitHub Release. `v1.0.0` en `390a6567` no publicó npm/GHCR tras fallar la prueba de migración. [Intento 1.0.1](../releases/RELEASE_NOTES_v1.0.1.md) · [Candidata 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md). El reloj de prueba y los diagnósticos npm no cambian el orden ni la política fail-closed de producción. Los recuentos antiguos no verifican 1.0.2; historia 0.x intacta.

Requiere **Node.js >=22.19.0**. Solo después de publicar:

```bash
npm install -g @bykitsune/router@1.0.2
kitsune-router
# Alternativa: npx @bykitsune/router@1.0.2
```

Desde el repositorio canónico confirmado o tu copia existente, en la raíz sin subdirectorio `app/`:

Solo para una instalación **nueva**: genera una vez el secreto en `.env` privado (shell POSIX/OpenSSL). `next dev` no ejecuta el generador del launcher; sin `JWT_SECRET` aleatorio de al menos 32 caracteres falla el login. En migraciones conserva los secretos efectivos `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` y `DATA_DIR` absoluto. Revisa el archivo y sustituye valores de ejemplo únicamente en instalaciones nuevas; no lo publiques ni lo incluyas en Git.

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
umask 077
cp -n .env.example .env
if ! grep -q '^JWT_SECRET=.' .env; then
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
npm ci
npm run check:deps
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

Configura un `INITIAL_PASSWORD` fuerte antes de exponer el servicio. Abre `http://localhost:20128/dashboard`, conecta un proveedor permitido y crea/copia una clave del gateway. Base del cliente: `http://localhost:20128/v1`. Consulta los modelos de tu instalación; `/api/health` no verifica acceso al proveedor.

## Integración

El comando es **`kitsune-router`**; el identificador de proveedor es **`kitsunerouter`**. Codex usa `~/.codex/config.toml`:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Crea primero el combo de ejemplo `my-route`. La variable contiene una clave emitida, no crea una. Para Claude Code, usa `ANTHROPIC_BASE_URL=http://localhost:20128`: el cliente añade `/v1/messages`. Revisa los presets y conserva el resto de la configuración. [Ejemplos completos](../docs/INTEGRATIONS.md).

## Migración y límites

Detén el gateway anterior y sus auxiliares, y respalda **todo** el directorio privado. El inicio puede migrar `~/.zenrouter` o `~/.9router` a `~/.kitsune-router` (equivalentes en `%APPDATA%` en Windows), verificando una instantánea SQLite coherente y los archivos copiados. Conserva los originales y no sobrescribe destinos existentes. Un `DATA_DIR` explícito tiene prioridad y no se reubica.

Conserva `db/data.sqlite`, `secrets.json`, `machine-id`, `auth/` y `mitm/`; no cambies sales criptográficas ni raíces de certificados confiables solo por el nombre. No presupongas que todas las credenciales están cifradas en reposo. Los nuevos ajustes usan `KITSUNE_ROUTER_*`, las cabeceras `x-kitsune-router-*` y el proveedor `kitsunerouter`. `/v1/*` y el puerto 20128 no cambian; no se exige un alias del comando/proveedor anterior.

Docker conserva el volumen/montaje en el `DATA_DIR` efectivo: `/app/data` por defecto o ruta absoluta personalizada compatible; solo linux/amd64. En Linux restringido, detén/respalda y conserva la ruta con `DATA_DIR` explícito sin reubicar, o pide revisión privilegiada; no ignores permisos. Verifica la imagen; espejo Docker Hub opcional. [Instalación](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [Operación](../docs/OPERATIONS.md).

La compresión depende de la carga; no hay ahorro fijo, cuotas ilimitadas ni disponibilidad garantizada. Las estimaciones no son facturas y un precio desconocido no es cero. Respeta permisos, regiones y condiciones del proveedor. No hay servicio Kitsune alojado por defecto; la sincronización antigua se eliminó. Las pruebas de fuente/artefactos locales no demuestran publicación. [Evidencia 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md).

## Créditos y licencia

Gracias a autores y colaboradores de ZenRouter/9Router, incluido Joy, y a [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman) y [Ponytail](https://github.com/DietrichGebert/ponytail). Se conservan avisos de copyright y procedencia histórica. Licencia MIT: [LICENSE](../LICENSE).
