# Fase 1 Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar el starter Astro como base reproducible con React, Supabase, tooling estricto, esquema local y seed compatible con el proyecto remoto existente.

**Architecture:** Se conservará el modelo remoto actual (`schools`, `classes`, `children`, `monitors`, menús, incidencias y alérgenos) y se encapsulará el acceso público a Supabase en un cliente singleton validado por Zod. Las migraciones y el seed vivirán en `supabase/`, mientras que los tipos generados vivirán en `src/types/`.

**Tech Stack:** Astro 5, React, TypeScript, Supabase JS, Supabase CLI, Zod, ESLint, Prettier, Tailwind CSS.

---

## File Map

- Create `astro.config.mjs` integration changes: register React and Tailwind integrations.
- Modify `package.json` and `package-lock.json`: dependencies and scripts for React, Supabase, Zod, ESLint and Prettier.
- Modify `tsconfig.json`: strict project settings compatible with Astro and React JSX.
- Create `.env.example`: public Supabase configuration names only.
- Create `eslint.config.js`: flat ESLint configuration for Astro, TypeScript and React.
- Create `.prettierrc.json` and `.prettierignore`: stable formatting rules and generated/build exclusions.
- Create `src/lib/env.ts`: Zod schema and validated public environment values.
- Create `src/lib/supabase/client.ts`: browser Supabase client singleton.
- Create `src/types/database.ts`: generated database types for the current remote schema.
- Create `supabase/config.toml`: local Supabase project configuration.
- Create `supabase/migrations/<timestamp>_baseline_schema.sql`: reproducible current schema, indexes and required extensions.
- Create `supabase/seed.sql`: deterministic demo school, classes, monitors, children, menus, allergens and relationships.
- Modify `README.md`: setup, local Supabase, environment, seed, types and checks.
- Create `src/stores/.gitkeep` and `supabase/functions/.gitkeep`: preserve the planned directory structure without adding unused behavior.

### Task 1: Establish project tooling

**Files:** `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `.env.example`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`

- [ ] Install the exact dependencies with `npm install @astrojs/react @supabase/supabase-js zod` and dev dependencies with `npm install --save-dev eslint @eslint/js typescript-eslint eslint-plugin-astro eslint-plugin-react-hooks prettier prettier-plugin-astro`.
- [ ] Add scripts: `check` (`astro check`), `lint` (`eslint .`), `lint:fix` (`eslint . --fix`), `format` (`prettier . --write`) and `format:check` (`prettier . --check`). Keep existing `dev`, `build`, `preview` and `astro` scripts.
- [ ] Configure `astro.config.mjs` with `react()` and the existing Tailwind Vite plugin, without changing the current site output mode.
- [ ] Keep `tsconfig.json` extending `astro/tsconfigs/strict`, add `jsx: "react-jsx"` and `jsxImportSource: "react"`, and exclude `dist`, `node_modules` and generated Supabase internals.
- [ ] Add `.env.example` containing only `PUBLIC_SUPABASE_URL=https://your-project.supabase.co` and `PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key`.
- [ ] Configure ESLint flat config to lint `.js`, `.ts`, `.tsx` and `.astro` files, ignore `dist`, `.astro`, `node_modules` and generated files, and report unused variables without disabling TypeScript strictness.
- [ ] Configure Prettier with tabs matching the existing Astro files, double quotes, trailing commas and the Astro plugin; ignore `dist`, `.astro`, `node_modules`, `supabase/.branches` and `supabase/.temp`.
- [ ] Run `npm run check`, `npm run lint` and `npm run format:check`; fix only errors caused by the new configuration or existing source formatting.
- [ ] Commit with `chore: configure project tooling`.

### Task 2: Add the validated Supabase client

**Files:** `src/lib/env.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/.gitkeep` if needed

- [ ] Create a Zod object schema requiring non-empty `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`, then parse `import.meta.env` and export the validated values.
- [ ] Create a browser-safe singleton using `createClient<Database>(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_ANON_KEY)`; do not import service-role credentials or server-only secrets.
- [ ] Make `src/lib/supabase/client.ts` import `Database` from `src/types/database.ts` while keeping the generated type file import-cycle free.
- [ ] Add a small TypeScript testable contract through exported `env` and `supabase` values; missing variables must throw Zod's actionable validation error during module initialization.
- [ ] Run `npm run check` and `npm run build` with a temporary shell environment containing placeholder public values.
- [ ] Commit with `feat: add validated supabase client`.

### Task 3: Capture the existing database schema

**Files:** `supabase/config.toml`, `supabase/migrations/<timestamp>_baseline_schema.sql`, `src/types/database.ts`

- [ ] Install or use the Supabase CLI available in the environment and initialize `supabase/config.toml` without replacing any existing project files.
- [ ] Inspect the remote schema for tables, enum definitions, foreign keys, indexes, functions, triggers and RLS policies using a read-only schema dump or SQL introspection.
- [ ] Write one ordered baseline migration for a clean local database that creates the current model: `users`, `schools`, `classes`, `monitors`, `monitors_schools`, `children`, `parents_children`, `menus`, `menus_schools`, `allergens`, `child_allergens` and `incidents`, plus the existing `user_role` enum and required dependencies.
- [ ] Include indexes for the issue's access paths: school foreign keys, child foreign keys, monitor foreign keys, incident date, menu date and menu type fields where those columns exist in the retained schema.
- [ ] Preserve the existing RLS behavior in the local baseline, including security-definer helper functions where needed to avoid policy recursion. Do not weaken policies to make the seed pass.
- [ ] Generate `src/types/database.ts` from the inspected schema using the Supabase CLI or an equivalent generated output; do not hand-write table shapes that can drift from SQL.
- [ ] Run the migration against a clean local Supabase database, then run `supabase db lint` or the available migration validation command and confirm no SQL errors.
- [ ] Commit with `feat: version existing supabase schema`.

### Task 4: Add deterministic development seed

**Files:** `supabase/seed.sql`

- [ ] Seed one `Colegio Demo`, exactly two demo classes and 5-10 monitors using deterministic UUIDs or stable natural-key lookups.
- [ ] Seed 20-30 children distributed across both classes, three meal/menu categories represented by the retained schema (`Desayuno`, `Comida`, `Merienda`), and a small deterministic allergen catalog.
- [ ] Seed monitor-school and parent-child relationships only where the current schema supports them; do not insert fake auth users unless the schema explicitly permits a safe local-only record.
- [ ] Seed representative menu and incident records only if all required foreign keys can be satisfied by deterministic rows.
- [ ] Make repeated seed execution safe using fixed IDs and `ON CONFLICT` clauses or delete/reinsert ordering that cannot touch non-demo rows.
- [ ] Verify the seed in a clean local database with read-only count queries: one school, two classes, 20-30 children and three menu categories; verify no secret-like values occur in the file.
- [ ] Commit with `test: add deterministic supabase development seed`.

### Task 5: Align repository structure and documentation

**Files:** `README.md`, `src/stores/.gitkeep`, `supabase/functions/.gitkeep`

- [ ] Replace the starter README with project-specific instructions for Node/npm, copying `.env.example` to `.env`, obtaining the project's publishable/anon key, starting Supabase locally, applying migrations, running seed and generating types.
- [ ] Document that the remote project is `hjrxyobgukrwrcaslhok` but that normal development uses local Supabase; explicitly prohibit service-role keys in frontend `.env` files.
- [ ] Document scripts `npm run dev`, `npm run build`, `npm run check`, `npm run lint`, `npm run format:check` and the exact Supabase CLI commands used by the repository.
- [ ] Add the planned empty directories with `.gitkeep` only, without introducing unused stores or edge-function behavior.
- [ ] Run Prettier on changed Markdown, Astro, TypeScript, JavaScript, JSON and SQL files, then run all documented checks.
- [ ] Commit with `docs: document local development workflow`.

### Task 6: Final verification and pull request

**Files:** no new implementation files; inspect all changed files

- [ ] Run `npm ci` from a clean dependency state.
- [ ] Run `npm run check` and verify Astro/TypeScript completes successfully.
- [ ] Run `npm run lint` and verify zero errors.
- [ ] Run `npm run format:check` and verify no files need formatting.
- [ ] Run `npm run build` with valid placeholder public Supabase variables and verify the production build completes.
- [ ] Recreate a clean local Supabase database, apply all migrations, execute `supabase db reset` or the documented equivalent, and verify seed counts.
- [ ] Inspect `git diff --check`, `git status`, the complete diff against `main`, and confirm no `.env` file, service-role key or generated secret is tracked.
- [ ] Push the feature branch and create a PR targeting `main` with `gh pr create --base main`, linking `Closes #1` and summarizing checks and the explicit decision to preserve the remote schema.
