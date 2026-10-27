# Instalación

**Fuente 1.0.2 verificada; contenedor publicado en privado; npm bloqueado.** Runtime sigue `65c8b97d`. Recovery `40485038668` publicó GHCR y pasó lectura autenticada digest/proveniencia/SPDX y smoke de la imagen publicada. Paquete aún **private**: Public seleccionado sin confirmar, grants anónimos HTTP 401. Usa fuentes o [acceso privado autorizado](/es/deployment/cloud/). npm `@bykitsune/router` sigue E403/readback público HTTP 404, cambio de token no confirmado. Los comandos de abajo solo tras publicación/readback npm, con **Node.js >=22.19.0**. [Evidencia](/es/changelog/).

## Launcher después de publicar

```bash
npx @bykitsune/router@1.0.2
# O:
npm install -g @bykitsune/router@1.0.2
kitsune-router
```

Consulta con `npm ls -g @bykitsune/router`; elimina con `npm uninstall -g @bykitsune/router` sin borrar datos. Evita ejecutar scripts npm con sudo para corregir permisos.

El launcher puede escuchar en todas las interfaces por defecto. Añade `--host 127.0.0.1` para uso solo local; consulta `kitsune-router --help`. Local-first no garantiza aislamiento de red.

## Código fuente

En la raíz del repositorio confirmado o tu checkout existente, sin subcarpeta `app/`.

Solo en instalación **nueva**, genera una vez el secreto en `.env` privado (POSIX shell/OpenSSL). `next dev` no usa el generador del launcher: login falla sin `JWT_SECRET` aleatorio de al menos 32 caracteres. Para actualizar conserva secretos JWT/API/identidad y `DATA_DIR` efectivo según [migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Revisa otros valores de ejemplo solo para instalación nueva; nunca publiques/commitees `.env`.

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

Producción: `npm run build` y después `npm run start`. Usa `DATA_DIR` absoluto y un `INITIAL_PASSWORD` fuerte antes de exponer el servicio.

Estado por defecto: `~/.kitsune-router` o `%APPDATA%\kitsune-router` en Windows. La base activa es `db/data.sqlite`, no `db.json`; conserva secretos, identidad, auth y certificados. Detén y respalda todo el estado antiguo; `DATA_DIR` explícito no se reubica. [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md) · [Inicio rápido](/es/getting-started/quick-start/). No se certifica un test/build actual.
