# Llumitaula

Base web de Llumitaula con Astro, React, TypeScript estricto y Supabase.

## Requisitos

- Node.js `>=22.12.0`
- npm
- Docker Desktop o un runtime compatible para ejecutar Supabase localmente
- Supabase CLI

Comprueba las versiones antes de empezar:

```sh
node --version
npm --version
npx supabase --version
```

## Instalacion

Instala las dependencias exactamente desde el lockfile:

```sh
npm ci
```

Crea la configuracion local a partir del ejemplo:

```sh
cp .env.example .env
```

Obtén la URL y la clave pública desde el dashboard del proyecto Supabase, en `Project Settings > API`. Usa la `publishable key` recomendada o la `legacy anon key` si el proyecto todavía la utiliza. Nunca uses la `service_role key`.

Coloca esos valores en `.env` como variables públicas para el cliente del navegador:

```dotenv
PUBLIC_SUPABASE_URL=<project-url>
PUBLIC_SUPABASE_ANON_KEY=<publishable-o-legacy-anon-key>
```

Para desarrollo local, sustituye `PUBLIC_SUPABASE_URL` por `http://127.0.0.1:54321` y usa la clave pública/anon que proporcione la instancia local. Nunca pongas una `service_role` key, una clave secreta ni ningún token con privilegios elevados en `.env`, en el frontend o en variables `PUBLIC_*`. La service-role key omite las políticas RLS y solo puede usarse en un entorno backend protegido cuando una tarea futura lo requiera.

## Supabase local

El desarrollo normal usa la instancia local definida en `supabase/config.toml`, no el proyecto remoto. Con Docker en ejecucion, arranca los servicios desde la raiz del repositorio:

```sh
npx supabase start
```

La API local queda disponible en `http://127.0.0.1:54321` y Studio en `http://127.0.0.1:54323`.

Aplica las migraciones y carga el seed determinista con un reset local:

```sh
npx supabase db reset
```

`npx supabase db reset` es destructivo para la base local: recrea el esquema y vuelve a ejecutar `supabase/seed.sql`. No lo ejecutes contra una base de datos de produccion. El seed crea cuentas Auth de desarrollo, pero no contiene credenciales productivas ni secretos.

### Configuracion del dispositivo

Abre `/setup` en la aplicacion para vincular el dispositivo. En el entorno local, despues de ejecutar `npx supabase db reset`, usa el codigo `123456`. Este codigo es solo para desarrollo local y no es una credencial valida para produccion.

El formulario envia el codigo a la RPC `claim_device_setup` de Supabase. La validacion, caducidad, limite de usos y vinculacion con el colegio ocurren en Supabase; el navegador no consulta ni modifica directamente las tablas de codigos. En un entorno que no sea local debe usarse un codigo de configuracion emitido para ese entorno, nunca el codigo del seed local.

La RPC aplica una defensa global basica de 30 intentos por ventana de 15 minutos,
ademas del limite de 5 intentos por identificador. Esto dificulta la rotacion de
`device_identifier`, pero no constituye una proteccion perfecta contra abuso;
los controles de red o una Edge Function quedan fuera de este flujo.

Tras una vinculacion correcta, el navegador conserva en `localStorage` un contexto operativo no sensible: identificadores del dispositivo y del colegio, nombre del colegio y la lista publica de trabajadores. No guardes contrasenas, tokens, claves API, datos de menores ni otros secretos en ese contexto o en `localStorage`. El contexto no sustituye la validacion de Supabase ni las politicas RLS.

La clave `service_role` esta terminantemente prohibida en el navegador, en el frontend y en variables `PUBLIC_*`. El cliente solo debe usar la URL de Supabase y la clave publishable/anon; `service_role` omite RLS y solo puede existir en un backend protegido.

### Auth y roles locales

El seed de desarrollo crea cuentas email/password en dos colegios. Todas usan la
contraseña `password` y estos emails:

```text
parent.1@local.test, parent.2@local.test, parent.3@local.test, parent.4@local.test
worker.a@local.test, worker.a2@local.test, supervisor.a@local.test, admin.a@local.test
worker.b@local.test, admin.b@local.test
```

Estas credenciales son exclusivamente locales y de desarrollo: no son
contraseñas productivas y no deben reutilizarse fuera del entorno local.

Los perfiles conservan los roles `admin`, `monitor` y `padre`, y añaden
`worker` y `supervisor`. `admin` gestiona los datos de su colegio; `supervisor`
consulta el colegio y modifica registros de comidas; `worker` accede a sus
clases asignadas y puede crear registros de sus niños. Un `worker` solo puede
modificar registros propios creados durante las últimas 24 horas.

Comprueba las políticas RLS con la instancia local:

```sh
npx supabase test db
```

Este flujo usa únicamente Supabase local. No ejecuta migraciones ni cambios
contra el proyecto remoto; tampoco usa `service_role` en el navegador.

Para detener los servicios locales:

```sh
npx supabase stop
```

El proyecto Supabase remoto de referencia es `hjrxyobgukrwrcaslhok`. Se conserva como fuente del esquema existente, pero no se usa para el desarrollo normal ni se debe ejecutar ninguna migracion remota como parte de este flujo.

## Tipos de base de datos

Con Supabase local iniciado y las migraciones aplicadas, regenera los tipos TypeScript:

```sh
npx supabase gen types typescript --local > src/types/database.ts
```

Revisa el diff antes de confirmar cambios. El archivo generado representa las tablas, relaciones y enums del esquema local.

## Scripts npm

```sh
npm run dev
npm run build
npm run check
npm run lint
npm run format:check
```

- `npm run dev`: inicia el servidor de desarrollo Astro.
- `npm run build`: crea la salida de produccion en `dist/`.
- `npm run check`: comprueba Astro y TypeScript.
- `npm run lint`: ejecuta ESLint.
- `npm run format:check`: comprueba el formato con Prettier sin modificar archivos.

Para formatear archivos localmente usa `npm run format`.

## Estructura

```text
src/
├── pages/
│   ├── index.astro
│   ├── login.astro
│   └── search.astro
├── components/       Componentes Astro reutilizables
├── layouts/          Layout principal
├── lib/              Cliente Supabase, entorno y mocks
├── stores/           Estado compartido futuro
└── types/            Tipos TypeScript generados
supabase/
├── migrations/       Esquema y politicas versionadas
├── functions/        Edge Functions futuras
├── config.toml       Configuracion de Supabase local
└── seed.sql          Datos deterministas de desarrollo
```

Esta fase no añade logica de negocio a `stores/` ni implementa Edge Functions.
