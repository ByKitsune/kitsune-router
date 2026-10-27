# Enrutamiento inteligente

Kitsune Router utiliza modelos y cuentas **configurados por ti**. No impone suscripción → económico → gratis, no prioriza ByKitsune ni exige su cuenta.

## Selección y fallback

Una solicitud directa selecciona esa ruta. Un combo expande miembros/estrategia configurados y después selecciona cuentas del proveedor correspondiente. Un modelo directo no obtiene una cadena global no configurada.

```text
Solicitud my-route
  → miembro A configurado → cuenta elegible
  → reintento/fallback permitido
  → miembro B, o error terminal veraz
```

Crea `my-route` primero. Ordena modelos habilitados por capacidad, privacidad, latencia o coste, no por una categoría impuesta. [Combos](/es/features/combos/).

Cuota desconocida no es ilimitada. Cancelación y errores de solicitud no deben agotar cuentas; no se debe elevar silenciosamente un límite pagado ni eliminar documentos/parámetros. Salida parcial y uso incurrido no son un reintento gratuito. Respeta cuotas, regiones y términos: todos los miembros pueden fallar.

[Uso](/es/features/quota-tracking/) · [Arquitectura](https://github.com/ByKitsune/kitsune-router/blob/master/docs/ARCHITECTURE.md). Sin garantía de cero interrupciones, ahorro fijo o límite monetario absoluto.
