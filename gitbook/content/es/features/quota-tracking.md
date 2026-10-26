# Cuota y uso

Kitsune Router registra uso local y muestra cuota/reset cuando el upstream lo admite. Una estimación, una asignación y una factura son conceptos distintos.

## Interpretación

- Se conservan contadores reales de entrada/salida/caché por ruta; los faltantes no son cero inventado.
- La cuota puede depender de cuenta, modelo, servicio y ventana. Un probe fallido no demuestra nueva cuota ni cuenta inválida.
- **Desconocido no es gratis.** Subtotal conocido y solicitudes sin precio no forman un total completo.
- La velocidad entregada puede diferir de la solicitada. Créditos de suscripción no son facturas API en USD. [Velocidad](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md).
- Reintentar puede consumir uso; cancelar no prueba que el upstream deje de facturar. Un límite de tokens no es un presupuesto monetario.

## Persistencia y monitorización

Configuración y uso comparten `${DATA_DIR}/db/data.sqlite`; `usage.json`/`db.json` son entradas antiguas de migración. Usa rutas absolutas y respalda todo el directorio detenido, incluidos secretos/auth/certificados. [Operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

Inspecciona `/api/metrics` autenticado antes de crear alertas. No apliques `rate()`/`increase()` a snapshots de ventana móvil. `/api/health` no verifica permisos upstream; cifras históricas no verifican esta versión. La compresión no garantiza ahorro fijo; consulta la facturación real del proveedor.
