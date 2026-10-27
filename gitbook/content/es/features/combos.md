# Combos y fallback

Un combo es una ruta con nombre que contiene los modelos elegidos. No crea cuentas, permisos ni cuota adicional.

## Crear una ruta

1. Conecta upstreams permitidos y consulta modelos habilitados.
2. Crea un nombre distinto, como `my-route`, en Combos del dashboard.
3. Añade IDs exactos y elige estrategia/orden admitidos por tu versión. Revisa capacidades y permisos de todos los miembros.
4. Guarda y usa el combo como modelo del cliente.

```json
{
  "model": "my-route",
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": true
}
```

Es una solicitud, no un esquema de importación. Crea primero el combo; evita ciclos y comprueba límites conservadores de rutas anidadas. El mayor contexto o soporte de herramientas no se comparte automáticamente.

Ningún patrocinador/categoría tiene posición obligatoria. Precio/límites desconocidos siguen desconocidos. El fallback es acotado y puede facturar intentos adicionales. [Enrutamiento](/es/features/smart-routing/) · [Uso](/es/features/quota-tracking/). La [migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) conserva combos; no vacíes la base para cambiar la marca.
