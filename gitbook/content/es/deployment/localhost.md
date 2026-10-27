# Despliegue local

Dashboard y API comparten **20128**, no 3000. Node.js >=22.19.0; 1.0.1 espera verificación final/publicación y v1.0.0 no publicó npm/GHCR. [Instalación](/es/getting-started/installation/). Tras publicar, ejecuta `kitsune-router`.

- Dashboard: `http://localhost:20128/dashboard`
- API: `http://localhost:20128/v1`
- Health: `http://localhost:20128/api/health`
- Estado: `~/.kitsune-router` o `%APPDATA%\kitsune-router`

```bash
DATA_DIR=/absolute/private/path kitsune-router
```

`DATA_DIR` explícito manda y no se mueve. Detén con launcher o `Ctrl+C`, sin procesos escritores concurrentes ni comandos kill amplios. Respalda todo el estado detenido: SQLite, secretos, identidad, auth y certificados. No restaures encima de datos activos ni relajes permisos.

La migración verifica/copia `~/.zenrouter`/`~/.9router` detenidos, conserva originales y no sobrescribe destinos. [Guía](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Conserva sales y raíces confiables. Define contraseña fuerte; usa rutas absolutas en fuentes y consulta [operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md) y `.env.example`, no recetas antiguas Node 20/`db.json`.
