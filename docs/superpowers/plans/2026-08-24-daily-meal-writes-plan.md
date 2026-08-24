# Daily Meal Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make meal writes atomic per child, meal type, and date, and align incident actions with database authorization.

**Architecture:** The database will own daily idempotency through a non-null date and composite unique constraint. The React client will upsert directly on that constraint and derive incident affordances from the authenticated profile role; RLS remains the final enforcement layer.

**Tech Stack:** PostgreSQL/Supabase migrations and SQL tests, Astro React, TypeScript, Node test runner, ESLint, Prettier.

---

### Task 1: Capture failing SQL and client regressions

**Files:**

- Modify: `supabase/tests/fase_2_auth_security.sql`
- Modify: `tests/business-interactions.test.mjs`

- [ ] **Step 1: Add SQL assertions for the schema and daily behavior**

Add assertions that `meal_records.recorded_date` is `not null` with default
`current_date`, that the composite unique constraint/index exists, that a same
day duplicate is rejected, that different dates coexist, and that a historical
row's date cannot be changed through the authorized update path.

- [ ] **Step 2: Add client source regressions**

Assert that `BusinessApp.tsx` selects and upserts `recorded_date`, uses
`onConflict: "child_id,meal_type_id,recorded_date"`, does not query by a
`recorded_at` day range before saving, and does not render incident controls for
worker role while allowing admin/supervisor incident access.

- [ ] **Step 3: Run the focused tests and confirm the new assertions fail**

Run `npm run test:auth-guard` and `node --test tests/business-interactions.test.mjs`.
Expected: existing tests pass where unchanged and the new assertions fail before
implementation.

### Task 2: Implement the daily meal schema and authorization invariants

**Files:**

- Modify: `supabase/migrations/20260824090000_fase_2_auth_security.sql`
- Modify: `supabase/seed.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add `recorded_date` and the composite uniqueness to the migration**

Define `recorded_date date not null default current_date` in the table definition,
add the equivalent incremental `alter table` safeguards for existing migration
state, and create the composite unique index/constraint on
`(child_id, meal_type_id, recorded_date)` without changing historical rows.

- [ ] **Step 2: Update meal policies and trigger validation**

Require `recorded_date <= current_date` on inserts, preserve the existing
tenant/assignment checks, and ensure updates retain the row's original
`recorded_date` so an old daily record cannot be moved to another day. Keep
`recorded_at` as audit time and do not broaden worker update permissions.

- [ ] **Step 3: Allow authorized supervisors to use `public.incidents`**

Change the incident insert/update/delete policies to allow active `admin` and
`supervisor` users, retaining tenant-safe monitor/child relation checks. Do not
grant incident mutation permissions to workers.

- [ ] **Step 4: Update seed fixtures and generated database types**

Include explicit `recorded_date` values for meal fixtures, including at least two
dates for one child/type and fixtures in both tenants. Add `recorded_date` to
`Row`, `Insert`, and `Update` types and preserve existing generated metadata.

### Task 3: Make `BusinessApp` atomic and role-aware

**Files:**

- Modify: `src/components/BusinessApp.tsx`
- Modify: `src/components/IncidentModal.tsx` only if the prop boundary requires it

- [ ] **Step 1: Load the daily column and current user role**

Select `recorded_date` with meal records and read the active profile role from
the existing authorized `users` query or equivalent session bootstrap. Use the
same ISO date representation for the displayed operational day.

- [ ] **Step 2: Replace the read-then-write meal flow**

Remove the preliminary `recorded_at` range lookup. Upsert one payload containing
`child_id`, `meal_type_id`, `recorded_date`, `recorded_by`, `status`, `notes`,
and the existing audit timestamp, with
`{ onConflict: "child_id,meal_type_id,recorded_date" }`. Update local state by
the returned row id.

- [ ] **Step 3: Gate incident UI and calls by role**

Only render/open the incident modal and action for `admin` or `supervisor`.
Workers must see no actionable incident control and `saveIncident` must refuse
to call `public.incidents` if invoked unexpectedly. Admin/supervisor calls must
continue using the `public.incidents` table and surface database errors.

### Task 4: Run full verification and commit

**Files:**

- No additional files unless formatting changes the files above.

- [ ] **Step 1: Run local database verification**

Run `supabase db reset` and the repository SQL test command/configuration used
by the existing test suite. Expected: migration, seed, RLS, uniqueness, and date
invariant tests pass.

- [ ] **Step 2: Run application verification**

Run `npm run check`, `npm run lint`, `npm run build`, `npm run format:check`,
`npm run test:auth-guard`, `node --test tests/business-interactions.test.mjs`,
and `npm run test:public-data`.

- [ ] **Step 3: Inspect the diff and commit only intended changes**

Run `git status --short`, `git diff --check`, and `git diff`, then commit with
`git add` limited to the spec/plan and implementation files and message
`fix: make daily meal writes atomic`.
