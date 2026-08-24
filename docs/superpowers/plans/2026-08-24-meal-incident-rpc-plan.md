# Meal Incident RPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atomically record a meal incident through a secure RPC and show incidents in the BusinessApp card state.

**Architecture:** Add one `SECURITY DEFINER` RPC in a new migration. It validates the authenticated active admin/supervisor, tenant/date/monitor relations, upserts the daily meal row, inserts the incident, and returns the meal row. The UI keeps direct meal upserts for all ordinary meals, invokes only the RPC for combined incident submissions, loads current-day incidents, and derives card status from both records and incidents.

**Tech Stack:** PostgreSQL/Supabase RLS and RPC, Astro React, TypeScript, Node test runner, pgTAP, Prettier, ESLint.

---

### Task 1: Add SQL RPC and security tests

**Files:**

- Create: `supabase/migrations/20260824110000_record_meal_incident.sql`
- Modify: `supabase/tests/fase_2_auth_security.sql:3` and append RPC assertions

- [ ] **Step 1: Add failing SQL assertions** for function signature, authenticated-only execute, worker rejection, successful combined write, and rollback after invalid monitor/tenant input.
- [ ] **Step 2: Run the local Supabase pgTAP suite** with `supabase test db` and confirm the new assertions fail because the function is absent.
- [ ] **Step 3: Implement `public.record_meal_incident`** as `plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp`, checking `auth.uid()`, active role in `admin/supervisor`, current date, child/class/meal type same school, monitor same school, and `recorded_at <= now()`. Upsert `meal_records` on `(child_id, meal_type_id, recorded_date)`, insert the incident, return the upserted row, revoke public/anon/service_role execution and grant only authenticated execution.
- [ ] **Step 4: Run the SQL suite** and confirm authorization, tenant, date, worker, atomic rollback, and successful write assertions pass.

### Task 2: Update generated database types

**Files:**

- Modify: `src/types/database.ts:469-487`

- [ ] **Step 1: Add the exact RPC entry** with arguments matching the migration and a meal-record row return type.
- [ ] **Step 2: Run `npm run check`** to verify the Supabase call is type-safe.

### Task 3: Fix BusinessApp loading, status, and save flow

**Files:**

- Modify: `src/components/BusinessApp.tsx:15-260`
- Modify: `tests/business-interactions.test.mjs`

- [ ] **Step 1: Add Node regression coverage** asserting current-day incidents are queried, an incident makes a child card show `incident` even when its meal record is `bien`, successful incident submission uses `.rpc("record_meal_incident", ...)`, and failed RPC submission does not update records or show success.
- [ ] **Step 2: Run the focused Node test** and confirm it fails against the current table-insert flow.
- [ ] **Step 3: Add an `Incident` row type and current-day incident state**, query `incidents` in `loadData`, and change `statusFor(records, incidents)` to return incident when either collection contains the child.
- [ ] **Step 4: Replace the combined `saveIncident` meal/monitor/incident writes with one RPC call**, passing sanitized description, date, meal fields, child, meal type, and a same-tenant monitor selected server-side by the function contract. Update records from the returned row and reload current-day incidents only after RPC success; report one atomic error otherwise.
- [ ] **Step 5: Run the focused Node test** and confirm it passes.

### Task 4: Format, lint, build, and commit

**Files:**

- Modify only files changed by Tasks 1-3 after formatter output.

- [ ] **Step 1: Run `npm run format` and inspect the diff** for unrelated changes.
- [ ] **Step 2: Run `npm run check`, `npm run lint`, `npm run build`, `npm run format:check`, `npm run test:auth-guard`, `npm run test:public-data`, and the BusinessApp Node test.**
- [ ] **Step 3: Run the SQL suite again after formatting.**
- [ ] **Step 4: Inspect `git status`, `git diff`, and recent log; stage only implementation files.**
- [ ] **Step 5: Create a new commit without amend:** `git commit -m "fix: atomize meal incident recording"`.
- [ ] **Step 6: Record the commit SHA and any residual concerns.**
