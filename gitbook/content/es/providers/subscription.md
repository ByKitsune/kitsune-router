# Proveedores de suscripción y OAuth

Kitsune Router conecta productos OAuth/suscripción compatibles junto con API-key y servicios locales. Es una categoría de conexión/facturación, no un primer nivel obligatorio.

## Conectar

1. En Providers de `http://localhost:20128/dashboard`, selecciona el producto real compatible: Codex, Claude Code, Gemini CLI o Copilot, por ejemplo.
2. Sigue OAuth/device flow y verifica estado/modelos de esa cuenta.
3. Reautoriza si el upstream revoca credenciales; no borres todo el gateway.
4. Usa una clave del gateway en clientes, no el refresh token. Ordena tus combos como prefieras.

API pública, plan de programación y permisos IDE no son intercambiables. No se garantizan precios/cuotas mensuales ni acceso universal. Verifica términos, regiones y automatización permitida. Enrutar no crea permisos ni evita límites.

Cuotas desconocidas permanecen desconocidas; velocidad premium puede consumir más. Tarifas API USD no son facturas de suscripción. [Uso](/es/features/quota-tracking/). No requiere ByKitsune ni da prioridad al patrocinador. [API-key](/es/providers/cheap/) · [Gratis/local](/es/providers/free/).

Conserva secretos OAuth en la [migración](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). No se garantiza cifrado en reposo para toda credencial.
