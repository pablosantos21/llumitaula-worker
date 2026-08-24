# Fase 2: Auth, roles y aislamiento multi-tenant

## Objetivo

Añadir autenticación operativa y autorización por colegio a la base existente,
protegiendo los datos de menores mediante RLS. La solución debe conservar las
tablas y nombres de la fase 1 siempre que ya cubran una responsabilidad
equivalente.

## Alcance aprobado

- Mantener `public.users` como tabla de perfil; no crear una tabla `profiles`.
- Añadir `school_id`, `full_name` y `active` a `public.users`.
- Enlazar `public.users.id` con `auth.users.id` mediante FK.
- Conservar `admin`, `monitor` y `padre` en `user_role`, y añadir `worker` y
  `supervisor` sin borrar valores existentes.
- Usar `classes` como equivalente existente de `classrooms`.
- Añadir `devices`, `worker_classrooms`, `meal_types` y `meal_records`.
- Mantener las tablas actuales de menús, alérgenos, padres e incidencias, pero
  corregir sus políticas para que respeten el colegio del usuario.
- Aplicar todo en una migración incremental posterior a la baseline. No editar
  la migración baseline ni ejecutar cambios sobre el proyecto remoto.

## Modelo de datos

### Perfil y Auth

`public.users` conserva sus columnas actuales y añade:

- `school_id uuid references public.schools(id)`, que la migración rellenará para
  las filas existentes y convertirá en `not null` antes de activar el flujo
  operativo.
- `full_name text`.
- `active boolean not null default true`.

`users.id` tendrá una FK a `auth.users(id)` con borrado en cascada. La migración
o el seed crearán primero las cuentas Auth locales necesarias y después las filas
de perfil, de modo que una base limpia nunca dependa de usuarios huérfanos. No se
guardarán credenciales reales ni claves privilegiadas en el repositorio.

El hook `custom_access_token_hook` emitirá `user_role`, `school_id` y `active`.
Las políticas no confiarán solo en los claims del token, que pueden quedar
obsoletos hasta renovarlo: las comprobaciones críticas consultarán el perfil
mediante funciones `SECURITY DEFINER` con `search_path` fijo.

### Entidades nuevas

`devices`:

- `id uuid primary key default gen_random_uuid()`
- `school_id uuid not null references schools(id)`
- `name text not null`
- `identifier text not null unique`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `last_seen_at timestamptz`

`worker_classrooms`:

- `worker_id uuid not null references users(id)`
- `class_id uuid not null references classes(id)`
- `created_at timestamptz not null default now()`
- primary key `(worker_id, class_id)`

`meal_types`:

- `id uuid primary key default gen_random_uuid()`
- `school_id uuid not null references schools(id)`
- `name text not null`
- `active boolean not null default true`
- `sort_order integer not null default 0`
- `created_at timestamptz not null default now()`
- unique `(school_id, name)`

`meal_records`:

- `id uuid primary key default gen_random_uuid()`
- `child_id uuid not null references children(id)`
- `meal_type_id uuid not null references meal_types(id)`
- `recorded_by uuid not null references users(id)`
- `recorded_at timestamptz not null default now()`
- `status meal_status not null`
- `notes text`

Las restricciones y políticas impedirán que las referencias de un registro
crucen colegios. El colegio de un niño se deriva de `children.class_id` y el de
un trabajador o tipo de comida de sus perfiles o filas propias.

## Autorización RLS

Se activará RLS en todas las tablas sensibles existentes y nuevas. Se usarán
helpers para obtener el usuario, colegio, rol y estado activo actuales, evitando
recursión entre políticas de `users`.

- Usuarios no autenticados no tendrán acceso a datos públicos de negocio.
- Un usuario autenticado solo podrá leer su perfil; un admin podrá gestionar
  perfiles de su colegio sin cambiar el colegio ni elevar privilegios mediante
  una actualización autorizada.
- `admin` podrá leer, crear, actualizar y borrar datos de su colegio.
- `supervisor` podrá consultar todos los datos de su colegio y modificar
  registros de comida.
- `worker` podrá leer su perfil, su colegio, sus clases asignadas, los niños de
  esas clases y los registros permitidos; podrá crear registros de esos niños y
  modificar solo registros propios de las últimas 24 horas.
- `schools`, `classes`, `children`, `monitors`, relaciones, menús, alérgenos e
  incidencias se filtrarán por el colegio derivado de sus relaciones.
- `devices` y `meal_types` se filtran directamente por `school_id`.
- `worker_classrooms` solo podrá ser administrada por un admin y leída por el
  usuario asignado o un admin del mismo colegio.
- `meal_records` se filtra simultáneamente por colegio, niño, tipo de comida y
  usuario válido.

No se eliminarán roles antiguos ni filas históricas. Mientras existan `monitor`
o `padre`, conservarán únicamente el acceso que pueda expresarse de forma segura
con las relaciones actuales; no recibirán automáticamente permisos de `worker`
o `supervisor`.

## Flujo de autenticación

La configuración local mantendrá email/password habilitado y confirmaciones
desactivadas para desarrollo. El cliente Astro seguirá usando la clave pública.
El login usará `signInWithPassword`, y las operaciones de negocio dependerán de
la sesión y de RLS, nunca de una clave `service_role` en el navegador.

El seed será determinista y tendrá al menos dos colegios, perfiles para los
roles nuevos, asignaciones y datos de comida en ambos tenants. Sus contraseñas
serán explícitamente de desarrollo local y estarán documentadas como tales.

## Verificación

Los tests SQL locales simularán JWTs autenticados y comprobarán:

- Un usuario de A no puede leer, insertar, actualizar ni borrar datos de B.
- Un worker no puede leer clases o niños no asignados.
- Un worker no puede modificar registros ajenos o de más de 24 horas.
- Un supervisor puede consultar el colegio y modificar registros, pero no otro
  colegio.
- Un admin puede gestionar únicamente su colegio.
- Las relaciones nuevas y las FK Auth no permiten referencias inválidas.
- RLS está activo en todas las tablas sensibles.

La validación del repositorio será `supabase db reset`, tests SQL, `npm run
check`, `npm run lint`, `npm run build` y `npm run format:check`.

## Fuera de alcance

- Renombrar o eliminar tablas existentes.
- Migrar datos reales del proyecto remoto.
- Desplegar migraciones o funciones al proyecto remoto.
- Añadir OAuth, MFA, invitaciones o recuperación de contraseña avanzada.
- Implementar nuevas pantallas de gestión más allá del soporte mínimo de login.
