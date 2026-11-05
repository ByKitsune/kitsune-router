# Despliegue local

**1.0.8 publicado en npm, GitHub Release y el GHCR canónico.** El [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) reúne las lecturas de verificación y los límites de cada canal. El acceso anónimo a GHCR se comprueba por separado: el grant anónimo observado devolvió HTTP 401, lo que por sí solo no determina la visibilidad del paquete.

**Antecedente de 1.0.7:** npm, GHCR y GitHub Release se publicaron desde `b7f77d07`; su instalador podía eliminar dependencias entre las operaciones secuenciales `--no-save` de SQLite y bandeja. El código 1.0.8 corrige la retención de esos pins. El [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) conserva el problema observado y el estado de cada distribución.

Dashboard y API comparten **20128**, no 3000. El objetivo actual es **1.0.8**. Usa el launcher solo después de confirmar npm 1.0.8 en el [registro de publicación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md), o sigue la [instalación desde fuentes](/es/getting-started/installation/) con Node.js >=22.19.0. El acceso al [contenedor](/es/deployment/cloud/) depende de su publicación y visibilidad verificadas por separado.

**Registro histórico de 1.0.2; no determina el estado de 1.0.6:** Dashboard y API comparten **20128**, no 3000. Runtime 1.0.2 sigue `65c8b97d`; contenedor publicado **en privado**, acceso anónimo pendiente y npm bloqueado. Usa [fuentes](/es/getting-started/installation/) con Node.js >=22.19.0 o [contenedor privado autorizado](/es/deployment/cloud/). El launcher de 1.0.2 se condicionaba a publicación/readback npm.

- Dashboard: `http://localhost:20128/dashboard`
- API: `http://localhost:20128/v1`
- Health: `http://localhost:20128/api/health`
- Estado: `~/.kitsune-router` o `%APPDATA%\kitsune-router`

```bash
DATA_DIR=/absolute/private/path kitsune-router
```

`DATA_DIR` explícito manda y no se mueve. Detén con launcher o `Ctrl+C`, sin procesos escritores concurrentes ni comandos kill amplios. Respalda todo el estado detenido: SQLite, secretos, identidad, auth y certificados. No restaures encima de datos activos ni relajes permisos.

La migración verifica/copia `~/.zenrouter`/`~/.9router` detenidos, conserva originales y no sobrescribe destinos. [Guía](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Conserva sales y raíces confiables. Define contraseña fuerte; usa rutas absolutas en fuentes y consulta [operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md) y `.env.example`, no recetas antiguas Node 20/`db.json`.
