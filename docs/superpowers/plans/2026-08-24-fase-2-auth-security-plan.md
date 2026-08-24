# Fase 2 Auth Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir autenticación email/password, perfiles con roles y RLS multi-tenant al esquema existente sin renombrar ni eliminar sus tablas.

**Architecture:** `public.users` seguirá siendo el perfil enlazado a `auth.users`. Las tablas nuevas se relacionarán con `schools`, `classes`, `children` y `users`; funciones SQL `SECURITY DEFINER` centralizarán la identidad actual y las políticas RLS consultarán pertenencia real, no solo claims JWT. La migración será incremental y el entorno local tendrá fixtures deterministas para dos colegios.

**Tech Stack:** Supabase CLI, PostgreSQL 17, Supabase Auth, RLS, pgTAP, Astro, TypeScript, `@supabase/supabase-js`.

---

## Mapa de archivos

- Create: `supabase/migrations/20260824090000_fase_2_auth_security.sql` para columnas, enums, tablas, constraints, funciones, grants y políticas.
- Create: `supabase/tests/fase_2_auth_security.sql` para pruebas pgTAP de aislamiento, roles, ventana de edición y activación de RLS.
- Modify: `supabase/seed.sql` para colegios, usuarios Auth locales, perfiles, asignaciones y datos de comidas en dos tenants.
- Modify: `supabase/config.toml` para dejar explícita la configuración local de email/password y el hook de token.
- Modify: `src/pages/login.astro` para usar `signInWithPassword` y mostrar errores sin filtrar secretos.
- Create: `src/components/AuthLoginForm.tsx` para el formulario React hidratado en el cliente.
- Modify: `src/types/database.ts` regenerándolo desde la base local, nunca editándolo manualmente.
- Modify: `README.md` para credenciales locales, tests SQL y flujo de sesión.

### Task 1: Add failing RLS test fixtures

**Files:**

- Create: `supabase/tests/fase_2_auth_security.sql`

- [ ] **Step 1: Escribir la suite pgTAP con expectativas de la fase**

Crear una suite que use `begin;`, `select plan(87);` y helpers locales para
establecer `request.jwt.claims`. Debe crear o usar IDs deterministas de los dos
colegios del seed y ejecutar estas comprobaciones: un worker de A solo ve sus
clases y niños asignados; no ve escuelas, clases, niños, dispositivos, tipos ni
registros de B; no puede insertar ni actualizar datos de B; puede insertar un
registro de A; no puede actualizar un registro ajeno ni uno propio de más de 24
horas; un supervisor de A ve todo A y actualiza registros A; admin de A gestiona
A pero no B; las tablas nuevas tienen RLS activado; y un perfil sin Auth no
puede superar la FK.

Usar `set_config('request.jwt.claims', json_build_object('sub', user_id,
'role', 'authenticated')::text, true)` en cada caso. No usar `service_role` para
probar permisos de usuario.

- [ ] **Step 2: Ejecutar la suite antes de implementar y confirmar que falla**

Run: `npx supabase test db`

Expected: FAIL porque aún no existen las columnas, tablas nuevas ni políticas de
la fase 2. El fallo debe ser de esquema/política, no un error de sintaxis del
archivo de tests.

- [ ] **Step 3: Commit de la suite roja**

```sh
git add supabase/tests/fase_2_auth_security.sql
git commit -m "test: define phase 2 tenant isolation"
```

### Task 2: Extend identity and create new tables

**Files:**

- Create: `supabase/migrations/20260824090000_fase_2_auth_security.sql`

- [ ] **Step 1: Añadir columnas y enum sin borrar datos existentes**

La migración debe ejecutar `alter type public.user_role add value if not exists
'worker'` y `'supervisor'`; añadir `school_id`, `full_name` y `active` a
`public.users`; rellenar `school_id` de las filas existentes con el colegio
determinista de desarrollo; y fallar con un mensaje claro si hay perfiles sin
colegio que no puedan migrarse. Después hará `set not null` y añadirá la FK a
`auth.users`. Sobre una base ya poblada, la migración debe abortar antes de la FK
si encuentra perfiles cuyo UUID no existe en `auth.users`; sobre una base limpia,
la FK se crea antes del seed, que insertará Auth antes de cada perfil.

No añadir defaults que permitan perfiles operativos sin colegio.

- [ ] **Step 2: Crear las cuatro tablas nuevas con constraints**

Implementar exactamente las columnas aprobadas en la especificación:
`devices`, `worker_classrooms`, `meal_types` y `meal_records`. Añadir índices
para `school_id`, `class_id`, `child_id`, `meal_type_id`, `recorded_by` y
`recorded_at`; unicidad global de `devices.identifier`; unicidad de
`(meal_types.school_id, meal_types.name)`; y la PK compuesta de
`worker_classrooms`.

Añadir checks o triggers `SECURITY DEFINER` para impedir que un
`worker_classrooms` conecte un worker y una clase de distintos colegios y que
un `meal_record` conecte un niño, tipo de comida y usuario de distintos
colegios. Las comprobaciones deben ejecutarse también en inserciones directas,
no depender del cliente.

- [ ] **Step 3: Ejecutar la migración y confirmar el fallo restante de tests**

Run: `npx supabase db reset`

Expected: la migración aplica sin error sobre una base limpia; la suite sigue
fallando solo por políticas aún no implementadas.

### Task 3: Implement identity helpers, grants and RLS

**Files:**

- Modify: `supabase/migrations/20260824090000_fase_2_auth_security.sql`

- [ ] **Step 1: Crear helpers seguros de autorización**

Crear funciones `public.current_user_id()`, `public.current_school_id()`,
`public.current_user_role()` y `public.current_user_active()` como
`stable security definer`, con `set search_path = public`, retornando datos de
`public.users` para `auth.uid()`. Revocar ejecución pública y concederla solo a
`authenticated`/`service_role` cuando corresponda.

Actualizar el hook existente para incluir `user_role`, `school_id` y `active`,
sin permitir que la ausencia de perfil otorgue un rol.

- [ ] **Step 2: Reemplazar las políticas permisivas actuales**

Eliminar las políticas baseline por nombre y recrearlas con `to authenticated`.
Cada `using` y `with check` debe derivar el tenant mediante joins a la relación
real. En particular, `schools` nunca usará `using (true)`; `classes` filtrará
por `school_id`; `children` por su clase; y menús, alérgenos e incidencias por
el colegio derivado de sus referencias.

Usar esta matriz como contrato:

| Rol           | Lectura                                                                   | Escritura                                                                    |
| ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| admin         | Todo su colegio                                                           | Todo su colegio; gestiona perfiles sin cambiar tenant ni elevar rol          |
| supervisor    | Todo su colegio                                                           | Actualiza registros de comida de su colegio                                  |
| worker        | Perfil, colegio, clases asignadas, niños asignados y registros permitidos | Crea registros de niños asignados; actualiza solo propios de las últimas 24h |
| monitor/padre | Solo acceso seguro ya expresable por relaciones actuales                  | Sin permisos nuevos de worker/supervisor                                     |

- [ ] **Step 3: Activar RLS y cerrar grants**

Ejecutar `alter table ... enable row level security` en todas las tablas
existentes sensibles y en las cuatro nuevas. Conceder a `authenticated` solo
las operaciones que las políticas realmente necesitan y mantener `service_role`
separado para tareas backend. No conceder acceso anónimo.

- [ ] **Step 4: Ejecutar tests y confirmar que pasan**

Run: `npx supabase db reset && npx supabase test db`

Expected: todos los tests pgTAP PASS y ningún usuario de A obtiene filas ni
puede escribir en B.

- [ ] **Step 5: Commit de migración y políticas**

```sh
git add supabase/migrations/20260824090000_fase_2_auth_security.sql supabase/tests/fase_2_auth_security.sql
git commit -m "feat: add tenant-aware auth and RLS"
```

### Task 4: Make local seed deterministic and authenticated

**Files:**

- Modify: `supabase/seed.sql`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Reemplazar perfiles huérfanos por cuentas Auth locales**

Crear cuentas Auth deterministas para admin, supervisor y worker de dos colegios
usando emails `*.local.test` y contraseñas de desarrollo explícitamente no
productivas. Insertar sus mismos UUID en `public.users` con `school_id`,
`full_name`, `role` y `active`. Mantener las colisiones naturales y UUID del
seed actual seguras: si un Auth UUID ya existe con datos distintos, abortar;
si coincide, permitir repetir el reset.

- [ ] **Step 2: Añadir datos de ambos tenants**

Conservar el Colegio Demo y sus relaciones actuales. Añadir un segundo colegio,
una clase, niños, dispositivos, tipos de comida, asignaciones y registros de
comida para ese colegio. Crear al menos un registro reciente, uno antiguo y uno
de otro usuario para probar la ventana de 24 horas y la propiedad.

- [ ] **Step 3: Documentar el flujo local de Auth**

Dejar email/password y confirmaciones desactivadas en el bloque `[auth]` y
mantener el hook `custom_access_token`. No incluir `service_role`, JWTs ni
secretos reales en el seed, `.env.example` o documentación.

- [ ] **Step 4: Repetir reset y seed**

Run: `npx supabase db reset && npx supabase db reset`

Expected: ambas ejecuciones terminan correctamente y producen los mismos UUID,
conteos y relaciones; ningún perfil queda sin `auth.users`.

- [ ] **Step 5: Validar colisiones antes de ignorar conflictos**

Las validaciones deben comparar la fila completa de cada fixture antes de sus
`ON CONFLICT DO NOTHING`. En particular, incidents compara todos sus campos,
incluidos `created_at`, `send_notification`, `family_seen`, `family_response`,
`family_responded_at` y `monitor_validated`; devices compara
`school_id`, `name`, `identifier`, `active`, `created_at` y `last_seen_at`; y
meal_types compara `school_id`, `name`, `active`, `sort_order` y `created_at`.
Una colisión en UUID o clave natural aborta el seed; una fila idéntica permite
repetirlo sin modificar datos ajenos.

- [ ] **Step 6: Validar autoría de meal_records en los tres contextos**

`enforce_meal_record_authorship` retorna inmediatamente en INSERT solo cuando
`session_user = 'postgres'`, el rol efectivo es `postgres` y `auth.uid() IS NULL`,
para permitir el seed. Cualquier otro INSERT sin identidad se rechaza,
`authenticated` debe usar `recorded_by = auth.uid()`, y UPDATE conserva
`OLD.recorded_by`. La suite SQL debe cubrir seed/postgres y `service_role` sin
identidad.

- [ ] **Step 7: Commit de fixtures locales**

```sh
git add supabase/seed.sql supabase/config.toml
git commit -m "test: seed authenticated multi-tenant fixtures"
```

### Task 5: Connect the login page to Supabase Auth

**Files:**

- Modify: `src/pages/login.astro`
- Create: `src/components/AuthLoginForm.tsx` for the interactive client island.

- [ ] **Step 1: Añadir formulario interactivo mínimo**

Importar el componente React desde `login.astro` con `client:load`. El componente
mantendrá estado de loading/error. Al enviar, llamar:

```ts
const { error } = await supabase.auth.signInWithPassword({ email, password });
```

Deshabilitar el botón durante la petición, mostrar un mensaje genérico para
credenciales inválidas y redirigir a `/` solo después de una respuesta exitosa.
No imprimir el password ni el objeto de error completo.

- [ ] **Step 2: Verificar sesión y errores en navegador local**

Run: `npm run dev`

Expected: un usuario local válido entra; un password inválido permanece en
`/login` con un error visible; recargar no expone credenciales y una llamada a
Supabase usa la clave pública configurada.

- [ ] **Step 3: Commit del login**

```sh
git add src/pages/login.astro src/components/AuthLoginForm.tsx
git commit -m "feat: connect login to supabase auth"
```

### Task 6: Regenerate types and document the workflow

**Files:**

- Modify: `src/types/database.ts`
- Modify: `README.md`

- [ ] **Step 1: Regenerar tipos desde la base local**

Run: `npx supabase gen types typescript --local > src/types/database.ts`

Expected: aparecen `devices`, `worker_classrooms`, `meal_types`,
`meal_records`, las columnas nuevas de `users` y los roles `worker` y
`supervisor`.

- [ ] **Step 2: Documentar Auth y tests**

Añadir al README el comando `npx supabase test db`, los emails de desarrollo
local, la advertencia de sus contraseñas no productivas, el comportamiento de
roles y la regla de edición de workers de 24 horas. Reafirmar que no se ejecutan
migraciones remotas en este flujo.

- [ ] **Step 3: Commit de tipos y documentación**

```sh
git add src/types/database.ts README.md
git commit -m "docs: document phase 2 auth workflow"
```

### Task 7: Run the complete verification suite

**Files:**

- No new files; inspect all files changed above.

- [ ] **Step 1: Validate database from scratch**

Run: `npx supabase db reset`

Expected: migraciones y seed completan sin warnings de FK, perfiles huérfanos
ni errores de policies.

- [ ] **Step 2: Validate RLS behavior**

Run: `npx supabase test db`

Expected: todos los tests PASS, incluyendo cross-tenant read/write, roles,
asignaciones y edición reciente.

- [ ] **Step 3: Validate application**

Run: `npm run check && npm run lint && npm run build && npm run format:check`

Expected: los cuatro comandos terminan con código 0.

- [ ] **Step 4: Inspect final diff and status**

Run: `git diff --check && git status --short`

Expected: sin whitespace errors, sin secretos, solo archivos relacionados con
Fase 2 y sin cambios involuntarios en migraciones anteriores.
