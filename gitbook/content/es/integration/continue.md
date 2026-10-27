# Integración con Continue

Los formatos Continue cambian entre versiones. Usa sus ajustes OpenAI-compatible actuales; no sobrescribas todo con un JSON/YAML antiguo.

```text
API base: http://localhost:20128/v1
API key: clave del gateway emitida
Model: ID habilitado exacto o combo creado
```

Conecta un upstream permitido, crea la clave y consulta `/v1/models`. Configura cada rol por separado: una ruta de chat no proporciona automáticamente embeddings/autocompletado.

Identificador **`kitsunerouter`**; ejecutable **`kitsune-router`**. Revisa presets y conserva proveedores/contexto/editor; no comprometas claves en Git.

Health `/api/health` no prueba permisos ni medios. Prueba el protocolo requerido y evita multiplicar reintentos pagados entre cliente/gateway. Remoto: tu HTTPS `/v1`, sin cuenta ByKitsune requerida. [Referencia](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [Diagnóstico](/es/troubleshooting/).
