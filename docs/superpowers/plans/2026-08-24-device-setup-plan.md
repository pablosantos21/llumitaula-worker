# Device Setup Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vincular un iPad a un colegio mediante un código temporal y dejar disponible el contexto seguro necesario para la selección de trabajador.

**Architecture:** PostgreSQL expondrá un único RPC de reclamación. El RPC validará y consumirá el código dentro de una transacción, mantendrá los intentos de dispositivo en una tabla no expuesta y creará o reactivará una fila de `devices`. La pantalla Astro será un island React que solo persistirá el identificador del dispositivo y la respuesta pública del RPC.

**Tech Stack:** Supabase/PostgreSQL 17, pgcrypto, RLS, Astro, React, TypeScript, `@supabase/supabase-js`, Node test runner, pgTAP.

---

## Mapa de archivos

- Create: `supabase/migrations/20260824130000_device_setup.sql` para códigos temporales, control de intentos, RPC, constraints, grants y políticas.
- Modify: `supabase/seed.sql` para un código temporal de desarrollo y dispositivos de prueba.
- Modify: `supabase/tests/fase_2_auth_security.sql` para las pruebas SQL de setup y permisos.
- Create: `tests/device-setup.test.mjs` para pruebas de contrato del componente y almacenamiento.
- Create: `src/lib/deviceSetup.ts` para el identificador y el contexto persistido del dispositivo.
- Create: `src/components/DeviceSetupForm.tsx` para el formulario interactivo y la llamada al RPC.
- Create: `src/pages/setup.astro` para publicar el formulario como island React.
- Modify: `src/types/database.ts` regenerándolo desde la base local para incluir tablas y RPC.
- Modify: `package.json` para añadir `test:device-setup`.
- Modify: `README.md` para documentar el código de desarrollo y el flujo de vinculación.

### Task 1: Definir pruebas rojas del RPC y del cliente

**Files:**

- Modify: `supabase/tests/fase_2_auth_security.sql`
- Create: `tests/device-setup.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Añadir el comando de test del cliente**

Añadir a `scripts`:

```json
"test:device-setup": "node --test tests/device-setup.test.mjs"
```

- [ ] **Step 2: Escribir las aserciones SQL antes de la migración**

Añadir al archivo pgTAP una sección transaccional que compruebe que existe
`claim_device_setup(text, uuid)`, que solo tiene `EXECUTE` para `anon` y
`authenticated`, y que cubre estas operaciones usando el código local del
seed: reclamación válida, código expirado, código agotado, segundo uso,
identificador inválido, reactivación del mismo dispositivo y rollback cuando la
operación no puede completarse. Comprobar también que `anon` no puede hacer
`select` ni `insert` directo sobre `device_setup_codes` o
`device_setup_attempts`, que el resultado de un código válido solo contiene el
colegio asociado, y que dos colegios no se mezclan.

- [ ] **Step 3: Escribir las pruebas de contrato del cliente**

Crear `tests/device-setup.test.mjs` con `node:test` y `assert` que lea los
archivos fuente y exija:

```js
assert.match(form, /claim_device_setup/);
assert.match(form, /device_identifier/);
assert.match(form, /localStorage/);
assert.doesNotMatch(form, /password|service_role|PUBLIC_SUPABASE_SERVICE/);
assert.match(page, /DeviceSetupForm[\s\S]*client:load/);
```

Añadir comprobaciones para que el código no se guarde en `localStorage`, que
los errores se conviertan en un mensaje genérico y que la navegación posterior
al éxito apunte a `/app/workers`.

- [ ] **Step 4: Ejecutar las pruebas rojas**

Ejecutar `npm run test:device-setup` y `npx supabase test db`.
Esperar fallos por archivos, tabla y RPC inexistentes, no por errores de
sintaxis del test.

- [ ] **Step 5: Commit de las pruebas rojas**

```sh
git add package.json tests/device-setup.test.mjs supabase/tests/fase_2_auth_security.sql
git commit -m "test: define secure device setup"
```

### Task 2: Implementar el esquema y el RPC seguro

**Files:**

- Create: `supabase/migrations/20260824130000_device_setup.sql`

- [ ] **Step 1: Crear tablas y restricciones**

Crear `device_setup_codes` con estas columnas: `id uuid primary key`,
`school_id uuid not null references schools(id) on delete cascade`,
`code_hash text not null unique`, `expires_at timestamptz not null`,
`max_uses integer not null default 1 check (max_uses > 0)`,
`uses integer not null default 0 check (uses >= 0)`, `active boolean not null
default true`, `created_at timestamptz not null default now()`, y
`last_claimed_at timestamptz`. Crear `device_setup_attempts` con
`device_identifier uuid primary key`, `window_started_at timestamptz not null`,
`attempt_count integer not null default 0`, y `last_attempt_at timestamptz`.
Activar RLS, crear índices para expiración y colegio, revocar acceso directo a
los roles API y conceder acceso únicamente al propietario de la función.

- [ ] **Step 2: Crear el RPC transaccional**

Implementar `public.claim_device_setup(p_code text, p_device_identifier uuid)`
como `SECURITY DEFINER`, `LANGUAGE plpgsql`, con
`set search_path = pg_catalog, public, pg_temp`. Normalizar el código con
`upper(btrim(p_code))`, calcular
`encode(digest(normalized_code, 'sha256'), 'hex')`, buscar esa huella y bloquear
la fila encontrada con `for update`. Rechazar código ausente, inactivo,
expirado o agotado con un error genérico, y aplicar un máximo de 5 intentos por
identificador en una ventana de 15 minutos. Validar el UUID, crear o actualizar
`devices` usando únicamente el `school_id` del código, incrementar `uses`,
marcar `last_claimed_at` y devolver JSON con `device_id`, `device_identifier`,
`school_id`, `school_name` y la lista pública de trabajadores activos del
colegio. No devolver hashes ni el código.

- [ ] **Step 3: Publicar solo la función**

Ejecutar `revoke all on function public.claim_device_setup(text, uuid) from
public, anon, authenticated;` y después conceder `execute` a `anon` y
`authenticated`. Mantener `device_setup_codes` y `device_setup_attempts` sin
grants de tabla. El RPC no aceptará `school_id`, `device_id` ni una lista de
trabajadores desde el cliente.

- [ ] **Step 4: Aplicar la migración y ejecutar pruebas**

Ejecutar `npx supabase db reset` y `npx supabase test db`. Esperar que la
migración aplique correctamente y que solo queden fallos de fixtures o
aserciones todavía no satisfechas.

- [ ] **Step 5: Commit del esquema**

```sh
git add supabase/migrations/20260824130000_device_setup.sql
git commit -m "feat: add secure device setup rpc"
```

### Task 3: Añadir fixtures locales y tipos generados

**Files:**

- Modify: `supabase/seed.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Añadir un código local determinista**

Insertar una fila de desarrollo para Colegio Demo con un UUID fijo, hash
calculado mediante `encode(digest('123456', 'sha256'), 'hex')`, expiración fija
en `2099-01-01 00:00:00+00` y `max_uses = 1`. Las validaciones
previas del seed deben abortar si el UUID o la clave natural ya existen con
valores distintos. Documentar que `123456` es exclusivo del desarrollo local y
no es una credencial.

- [ ] **Step 2: Añadir la comprobación de repetición del seed**

Ejecutar `npx supabase db reset` dos veces y comprobar que el código, los
dispositivos y los contadores quedan deterministas. No usar un `ON CONFLICT`
que oculte una colisión con otro colegio o con otro hash.

- [ ] **Step 3: Regenerar los tipos**

Con Supabase local iniciado, ejecutar:

```sh
npx supabase gen types typescript --local > src/types/database.ts
```

Verificar que aparecen `device_setup_codes`, `device_setup_attempts`, las
columnas de `devices` usadas por el RPC y la entrada
`claim_device_setup` con argumentos `p_code` y `p_device_identifier`.

- [ ] **Step 4: Ejecutar check de tipos**

Ejecutar `npm run check` y corregir únicamente incompatibilidades derivadas de
los tipos generados.

- [ ] **Step 5: Commit de fixtures y tipos**

```sh
git add supabase/seed.sql src/types/database.ts
git commit -m "test: add local device setup fixture"
```

### Task 4: Implementar almacenamiento seguro y pantalla `/setup`

**Files:**

- Create: `src/lib/deviceSetup.ts`
- Create: `src/components/DeviceSetupForm.tsx`
- Create: `src/pages/setup.astro`

- [ ] **Step 1: Implementar el almacenamiento permitido**

En `deviceSetup.ts`, definir una clave de identificador y otra de contexto.
`getDeviceIdentifier()` debe recuperar un UUID válido de `localStorage` o crear
uno con `crypto.randomUUID()`. `saveDeviceContext()` solo debe aceptar y
guardar `device_id`, `device_identifier`, `school_id`, `school_name` y
trabajadores públicos. No guardar el código, tokens, contraseñas ni objetos de
error. Si `localStorage` no está disponible, devolver un error visible en vez
de usar una cookie insegura o un valor fijo.

- [ ] **Step 2: Crear el formulario React**

Implementar `DeviceSetupForm` con estados `idle`, `submitting`, `success` y
`error`. Enviar `{ p_code: code.trim(), p_device_identifier: identifier }` a
`.rpc("claim_device_setup", ...)`, deshabilitar el botón durante la petición,
limpiar el campo tras un fallo, mostrar `No se ha podido vincular este
dispositivo. Comprueba el código e inténtalo de nuevo.` y no imprimir el error
de Supabase. Tras éxito, persistir el contexto y ejecutar
`window.location.assign("/app/workers")`.

- [ ] **Step 3: Crear la página Astro**

Crear `/setup` con `MainLayout`, título, explicación breve del código temporal,
label accesible, input de seis caracteres y `DeviceSetupForm client:load`.
No prerenderizar datos de colegio, trabajadores ni códigos en HTML.

- [ ] **Step 4: Ejecutar pruebas del cliente**

Ejecutar `npm run test:device-setup`, `npm run check` y `npm run lint`.

- [ ] **Step 5: Commit de la pantalla**

```sh
git add src/lib/deviceSetup.ts src/components/DeviceSetupForm.tsx src/pages/setup.astro
git commit -m "feat: add device setup screen"
```

### Task 5: Documentar, verificar e integrar la entrega

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Documentar el flujo local**

Añadir `/setup`, el código local `123456`, la advertencia de que solo sirve para
desarrollo, las claves de `localStorage` no sensibles y la regla de que toda
validación se realiza en Supabase. Reafirmar que no se usa `service_role` en el
navegador.

- [ ] **Step 2: Ejecutar la verificación completa**

Ejecutar, en este orden:

```sh
npx supabase db reset
npx supabase test db
npm run test:device-setup
npm run test:auth-guard
npm run test:public-data
npm run check
npm run lint
npm run build
npm run format:check
git diff --check
```

Todos deben terminar con código 0. Revisar que el build no contiene el código
`123456`, hashes, datos de workers ni respuestas de setup.

- [ ] **Step 3: Revisar estado y diff**

Ejecutar `git status --short`, `git diff HEAD~5 --stat` y revisar que solo se
han modificado los archivos de esta entrega y los commits intermedios previstos.

- [ ] **Step 4: Commit de documentación**

```sh
git add README.md
git commit -m "docs: document device setup workflow"
```

- [ ] **Step 5: Dejar la rama lista para la siguiente entrega**

Confirmar que el worktree está limpio y registrar el SHA final. La siguiente
entrega podrá consumir `deviceSetup.ts` y redirigir desde `/app/workers` sin
duplicar la lógica de vinculación.
