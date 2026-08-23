# Fase 1: Base del proyecto

## Objetivo

Convertir el starter Astro actual en una base reproducible para Llumitaula,
integrada con React, TypeScript estricto, Supabase y tooling de desarrollo,
manteniendo como fuente de verdad el esquema ya existente en el proyecto
Supabase `hjrxyobgukrwrcaslhok`.

## Alcance

- Integrar React en Astro para futuras partes interactivas.
- Mantener y reforzar la configuración estricta de TypeScript.
- Añadir `@supabase/supabase-js` y un cliente público validado con Zod.
- Añadir `.env.example`, ESLint, Prettier y scripts npm reproducibles.
- Crear la estructura local de Supabase para migraciones, seed y funciones.
- Versionar una representación reproducible del esquema remoto actual, sin
  reemplazarlo por un modelo paralelo ni renombrar tablas existentes.
- Crear un seed de desarrollo compatible con las tablas actuales: `schools`,
  `classes`, `children`, `monitors`, sus tablas de relación, menús,
  alérgenos e incidencias.
- Generar los tipos TypeScript del esquema de base de datos.
- Documentar instalación, variables, desarrollo local, migraciones y seed.

## Modelo de datos

El proyecto remoto ya contiene migraciones y políticas RLS para un modelo que
usa `classes`, `monitors` y `users`, además de entidades de menús, incidencias
y alérgenos. Ese modelo se conserva. La PR no crea tablas duplicadas llamadas
`profiles`, `classrooms`, `devices` o `meal_records`, ni ejecuta DDL remoto.

Las migraciones locales deben poder aplicarse desde cero y representar las
dependencias del modelo actual. El seed usa valores deterministas y no incluye
secretos, credenciales reales ni service roles.

## Arquitectura

- `src/lib/supabase/client.ts`: cliente singleton para el navegador, creado
  desde variables `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`.
- `src/lib/env.ts`: validación de variables públicas con Zod y mensajes de
  error claros para configuración incompleta.
- `src/types/database.ts`: tipos generados para las tablas, relaciones y
  enums presentes en el esquema remoto.
- `supabase/migrations/`: SQL ordenado y reproducible para el esquema base,
  índices y políticas necesarias.
- `supabase/seed.sql`: datos de demo repetibles mediante identificadores
  deterministas y upserts donde sea compatible con las claves existentes.
- `src/components`, `src/layouts`, `src/pages`, `src/lib`, `src/stores` y
  `src/types`: estructura preparada para las siguientes fases sin mover
  innecesariamente las páginas existentes.

## Tooling

React se integra con la integración oficial de Astro. ESLint y Prettier se
configuran con scripts explícitos para comprobar y formatear el código fuente.
El build de Astro y la comprobación de TypeScript son verificaciones mínimas;
lint y formato se ejecutan también antes de abrir la PR.

## Flujo de datos y errores

El cliente Supabase solo se inicializa cuando las variables públicas son
válidas. Una configuración ausente produce un error de arranque accionable,
sin hacer fallback silencioso ni exponer credenciales. Las operaciones de
datos futuras deberán manejar los errores devueltos por Supabase en la capa que
las consuma; esta fase no añade consultas de negocio a las páginas actuales.

## Verificación

- `npm run build` debe completar sin errores.
- `npm run check` debe pasar la comprobación de Astro y TypeScript.
- `npm run lint` debe pasar sin errores.
- `npm run format:check` debe pasar sin cambios pendientes.
- Las migraciones deben aplicarse desde una base local limpia.
- El seed debe crear el Colegio Demo, dos clases, entre 20 y 30 niños,
  monitores, relaciones, tipos de menú y datos de desarrollo sin secretos.

## Fuera de alcance

- Autenticación real de monitores.
- Reemplazo o renombrado del esquema remoto existente.
- Nuevas funcionalidades de negocio en las páginas Astro.
- Despliegue automático o aplicación de migraciones al proyecto remoto.
