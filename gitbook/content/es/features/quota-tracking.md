# Cuota y uso

Kitsune Router registra uso local y muestra cuota/reset cuando el upstream lo admite. Una estimación, una asignación y una factura son conceptos distintos.

## Interpretación

- Se conservan contadores reales de entrada/salida/caché por ruta; los faltantes no son cero inventado.
- La cuota puede depender de cuenta, modelo, servicio y ventana. Un probe fallido no demuestra nueva cuota ni cuenta inválida.
- **Desconocido no es gratis.** Subtotal conocido y solicitudes sin precio no forman un total completo.
- La velocidad entregada puede diferir de la solicitada. Créditos de suscripción no son facturas API en USD. [Velocidad](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md).
- Reintentar puede consumir uso; cancelar no prueba que el upstream deje de facturar. Un límite de tokens no es un presupuesto monetario.

## Actualización del panel

En los cambios de código del 29 de octubre de 2026, una actualización de uso confirmada programa la recarga de las estadísticas y del gráfico del período seleccionado; la conexión y la reconexión también la programan. Con un servidor antiguo, los cambios en totales o desgloses sirven como señal de recarga, pero esos datos históricos no sustituyen el período seleccionado. Recarga las pestañas abiertas antes de la actualización para usar el cliente nuevo.

Si falla una recarga, se conservan los últimos datos y se indica el período al que pertenecen; usa el control de reintento y vuelve a iniciar sesión si se solicita. El paso del tiempo no provoca por sí solo una recarga: cambia de período o recarga la página. Un stream antiguo tampoco revela cambios que no modifiquen ninguno de los totales ni desgloses comparados. La causa original del problema del panel en producción no está confirmada.

## Cobertura de precios

La eliminación de tarifas genéricas evita aplicar precios de otro producto, pero algunas rutas que antes tenían un importe ahora pueden aparecer como desconocidas. Solo 16 pares exactos de proveedor y modelo, de texto, pueden usar referencias de models.dev como estimación de entrada/salida durante las 24 horas posteriores a la observación. La ventana actual termina el **2026-10-29 18:11:32.422 UTC**; no hay actualización automática. Después puede aplicarse una tarifa revisada por ruta o una sobreescritura verificada por el operador. Los costos ya registrados no se recalculan y las referencias no son facturas.

El registro de uso todavía no conserva `usage.cost` ni los campos de asignación Go informados por OpenCode. Consulta el panel del proveedor para esos importes; una asignación no equivale a un cargo en efectivo.

## Persistencia y monitorización

Configuración y uso comparten `${DATA_DIR}/db/data.sqlite`; `usage.json`/`db.json` son entradas antiguas de migración. Usa rutas absolutas y respalda todo el directorio detenido, incluidos secretos/auth/certificados. [Operación](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

Inspecciona `/api/metrics` autenticado antes de crear alertas. No apliques `rate()`/`increase()` a snapshots de ventana móvil. `/api/health` no verifica permisos upstream; cifras históricas no verifican esta versión. La compresión no garantiza ahorro fijo; consulta la facturación real del proveedor.
