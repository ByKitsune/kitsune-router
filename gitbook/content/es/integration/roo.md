# Integración con Roo

Usa el modo OpenAI-compatible admitido por tu versión. Kitsune Router enruta/traduce; no concede suscripciones ni soporte universal de funciones.

```text
Base URL: http://localhost:20128/v1
API key: clave del gateway emitida
Model: ID habilitado exacto o combo creado
```

Conecta el upstream permitido y crea la clave primero. `my-route` solo existe tras crearlo como combo. Consulta `/v1/models` autenticado.

Preserva otras configuraciones y revisa presets. Clave de proveedor **`kitsunerouter`**, comando **`kitsune-router`**. No publiques secretos OAuth.

`/api/health` no prueba inferencia; verifica herramientas/medios y respeta reintentos/cancelación. Remoto requiere tu HTTPS autenticado, no una nube Kitsune predeterminada. [Otros clientes](/es/integration/other-tools/) · [Diagnóstico](/es/troubleshooting/) · [Migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
