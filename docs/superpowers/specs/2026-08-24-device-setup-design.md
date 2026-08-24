# Entrega 1: configuración segura del dispositivo

## Objetivo

Permitir que un iPad se vincule a un colegio mediante un código temporal, sin
guardar credenciales sensibles ni permitir que el cliente elija arbitrariamente
el tenant. Tras vincularse, el dispositivo debe disponer del contexto mínimo
necesario para continuar con la selección de trabajador.

## Alcance aprobado

- Nueva pantalla `/setup` para introducir un código temporal.
- Identificador aleatorio y persistente del dispositivo generado en el navegador.
- Validación y consumo atómico del código mediante un RPC de Supabase.
- Creación o reactivación del dispositivo asociado al colegio del código.
- Descarga del nombre del colegio, configuración pública y trabajadores activos.
- Persistencia local únicamente de `device_id`, `device_identifier` y contexto
  operativo no sensible.
- Redirección al selector de trabajador después de una vinculación correcta.

Quedan fuera de esta entrega la selección final del trabajador, el PIN del
trabajador, el dashboard, el registro de comidas, el historial y cualquier
panel de administración para crear códigos.

## Arquitectura y flujo

La base de datos tendrá una tabla de códigos temporales asociada a un colegio.
El código se almacenará como hash y cada fila incluirá expiración, límite de
usos, usos realizados, estado y marcas de auditoría. El código original nunca
se devolverá ni se almacenará.

El flujo del cliente será:

1. `/setup` genera o recupera un identificador aleatorio del dispositivo.
2. El usuario introduce el código temporal.
3. El cliente llama a `claim_device_setup(code, device_identifier)`.
4. El RPC bloquea la fila del código y comprueba validez, expiración, usos,
   estado del dispositivo y consistencia del colegio.
5. El RPC crea o actualiza el dispositivo, incrementa el uso del código,
   actualiza `last_seen_at` y devuelve el contexto operativo mínimo.
6. El cliente guarda los datos no sensibles y continúa al selector de trabajador.

La operación será transaccional: si falla la creación o actualización del
dispositivo, el consumo del código se revierte. El `school_id` no será un
parámetro de confianza del cliente; se derivará exclusivamente del código
validado.

## Seguridad

El RPC será una función `SECURITY DEFINER` con `search_path` fijo y permisos
explícitos limitados a `anon` y `authenticated`. Se revocará el acceso directo
a la tabla de códigos. Las comprobaciones críticas se ejecutarán en el servidor
y no dependerán de RLS aplicada por el cliente.

El RPC no devolverá tokens, contraseñas, hashes, claves ni datos de otros
colegios. El identificador del dispositivo será un UUID aleatorio y no se
considerará un secreto. El cliente no guardará códigos temporales, sesiones de
Auth ni claves privilegiadas en `localStorage`.

Se aplicará una limitación básica de intentos por identificador de dispositivo.
Los eventos de consumo conservarán `claimed_at`, `last_seen_at` y el contador de
usos para auditoría.

## Errores y experiencia de usuario

El RPC usará errores genéricos para código inválido, expirado, agotado o
dispositivo no autorizado, sin revelar qué comprobación concreta falló. La
pantalla mostrará un mensaje accionable, mantendrá el formulario disponible y
permitirá reintentar. No se mostrará el objeto completo de error de Supabase.

Un fallo no debe cambiar el estado local ni dejar un dispositivo parcialmente
vinculado. Solo una respuesta exitosa permitirá guardar el contexto y navegar.

## Verificación

Las pruebas SQL comprobarán:

- Código válido, expirado, agotado y reutilizado.
- Consumo concurrente del mismo código.
- Creación y reactivación del mismo identificador de dispositivo.
- Rechazo de identificadores inválidos o manipulados.
- Ausencia de acceso directo anónimo a la tabla de códigos.
- Aislamiento entre colegios y ausencia de datos cross-tenant.
- Rollback completo cuando falla cualquier paso de la operación.

Las pruebas de cliente comprobarán:

- Llamada al RPC con los parámetros correctos.
- Persistencia exclusiva de datos no sensibles.
- Redirección al selector de trabajador tras éxito.
- Mensaje genérico tras un error y posibilidad de reintento.

La validación del repositorio será `supabase db reset`, la suite SQL local,
`npm run check`, `npm run lint`, `npm run build` y `npm run format:check`.
