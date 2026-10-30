# Proveedores API-key y costes

La categoría histórica «económico» es una agrupación documental, no prioridad ni garantía de precio. Elige por capacidades, carga y contrato actual.

1. Obtén una clave mediante el flujo oficial y verifica términos/región.
2. Añade proveedor/nodo compatible con endpoint y namespace correctos.
3. Revisa catálogo/límites reales. API pública, reseller y coding plan no comparten necesariamente IDs o precios.
4. Crea una clave del gateway para clientes y añade la ruta al combo en tu orden.

No publiques secretos en issues/configuración. Usa `DATA_DIR` privado absoluto y backups completos. Almacenamiento local no garantiza cifrado de todas las claves.

## Proveedor oficial ByKitsune

ByKitsune aparece destacado como proveedor oficial principal. En **Providers**, selecciona **Connect ByKitsune**, añade una clave del [panel de claves de ByKitsune](https://bykitsune.com/dashboard?tab=keys) y selecciona **Fetch Models**. La base de la API es `https://api.bykitsune.com/v1`, con autenticación Bearer; usa las rutas `bykitsune/<model-id>` del catálogo obtenido. Tú sigues eligiendo las cuentas y el orden de las rutas.

Esta integración corresponde al código fuente actual.

## Costes

Fecha, endpoint, contexto, caché, medios y velocidad entregada cambian la tarifa. Una tabla antigua «$0.20/1M» no prueba la factura actual. Usa facturación oficial y metadatos/overrides revisados; desconocido no es cero.

Compresión y fallback pueden variar el coste; no se garantiza ahorro fijo ni presupuesto máximo. ByKitsune mantiene/patrocina, no es una compra obligatoria. [Uso](/es/features/quota-tracking/) · [Combos](/es/features/combos/) · [Instalación](/es/getting-started/installation/).
