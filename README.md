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
supabase --version
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

`.env` debe contener solo variables publicas para el cliente del navegador:

```dotenv
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=<publishable-o-anon-key-local>
```

Nunca pongas una `service_role` key, una clave secreta ni ningun token con privilegios elevados en `.env`, en el frontend o en variables `PUBLIC_*`. La service-role key omite las politicas RLS y solo puede usarse en un entorno backend protegido cuando una tarea futura lo requiera.

## Supabase local

El desarrollo normal usa la instancia local definida en `supabase/config.toml`, no el proyecto remoto. Con Docker en ejecucion, arranca los servicios desde la raiz del repositorio:

```sh
supabase start
```

La API local queda disponible en `http://127.0.0.1:54321` y Studio en `http://127.0.0.1:54323`.

Aplica las migraciones y carga el seed determinista con un reset local:

```sh
supabase db reset
```

`supabase db reset` es destructivo para la base local: recrea el esquema y vuelve a ejecutar `supabase/seed.sql`. No lo ejecutes contra una base de datos de produccion. El seed no crea usuarios de Auth ni credenciales y no debe contener secretos.

Para detener los servicios locales:

```sh
supabase stop
```

El proyecto Supabase remoto de referencia es `hjrxyobgukrwrcaslhok`. Se conserva como fuente del esquema existente, pero no se usa para el desarrollo normal ni se debe ejecutar ninguna migracion remota como parte de este flujo.

## Tipos de base de datos

Con Supabase local iniciado y las migraciones aplicadas, regenera los tipos TypeScript:

```sh
supabase gen types typescript --local > src/types/database.ts
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
