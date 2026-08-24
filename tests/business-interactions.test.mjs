import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("business pages keep protected React-only rendering", async () => {
  const [home, search, app] = await Promise.all([
    source("src/pages/index.astro"),
    source("src/pages/search.astro"),
    source("src/components/BusinessApp.tsx"),
  ]);

  assert.match(home, /BusinessApp[\s\S]*client:only="react"/);
  assert.match(search, /BusinessApp[\s\S]*client:only="react"/);
  assert.match(app, /supabase\.auth\.getSession\(\)/);
  assert.match(app, /from\("children"\)/);
  assert.match(app, /from\("meal_records"\)/);
  assert.match(app, /from\("meal_types"\)/);
  assert.doesNotMatch(home, /MOCK_STUDENTS|Ana Martínez|Biel Roca/);
  assert.doesNotMatch(search, /MOCK_STUDENTS|Ana Martínez|Biel Roca/);
});

test("React business UI restores card, meal status, incident and toast components", async () => {
  const paths = [
    "src/components/StudentCard.tsx",
    "src/components/MealStatusBadge.tsx",
    "src/components/IncidentModal.tsx",
    "src/components/FeedbackToast.tsx",
  ];
  await Promise.all(paths.map((path) => access(new URL(path, root))));

  const [card, badge, modal, toast, app] = await Promise.all([
    source(paths[0]),
    source(paths[1]),
    source(paths[2]),
    source(paths[3]),
    source("src/components/BusinessApp.tsx"),
  ]);

  assert.match(card, /onClick/);
  assert.match(badge, /Bien/);
  assert.match(badge, /Incidencia/);
  assert.match(modal, /No ha comido primero/);
  assert.match(modal, /Comentarios adicionales/);
  assert.match(toast, /role="status"/);
  assert.match(app, /Incidencia registrada/);
  assert.match(app, /meal_records.*upsert|upsert.*meal_records/s);
  assert.match(app, /recorded_by/);
  assert.match(app, /recorded_date/);
  assert.match(app, /localDateString/);
  assert.doesNotMatch(app, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(
    app,
    /onConflict:\s*["']child_id,meal_type_id,recorded_date["']/,
  );
});

test("worker meal types are tenant-scoped and incidents never use meal records", async () => {
  const migration = await source(
    "supabase/migrations/20260824100000_scope_worker_meal_types.sql",
  );
  const app = await source("src/components/BusinessApp.tsx");
  const modal = await source("src/components/IncidentModal.tsx");

  assert.match(migration, /meal_types_select_worker/);
  assert.match(migration, /current_user_role\(\) = 'worker'/);
  assert.match(migration, /school_id = public\.current_school_id\(\)/);
  assert.match(app, /from\("incidents"\)/);
  assert.match(app, /from\("meal_records"\)/);
  assert.match(app, /\.upsert\(/);
  assert.match(app, /onConflict/);
  assert.match(app, /mealTypeId/);
  assert.match(app, /meal_type_id/);
  assert.doesNotMatch(app, /\.gte\("recorded_at"/);
  assert.doesNotMatch(app, /\.lt\("recorded_at"/);
  assert.match(app, /currentUserRole|userRole|role/);
  assert.match(app, /canManageIncidents/);
  assert.match(app, /userRole === "admin"/);
  assert.match(app, /userRole === "supervisor"/);
  assert.match(app, /canManageIncidents=\{canManageIncidents\}/);
  assert.match(app, /selectedChild &&/);
  assert.doesNotMatch(app, /canManageIncidents && selectedChild/);
  assert.match(modal, /canManageIncidents &&/);
  assert.match(app, /recorded_by/);
  assert.match(app, /recorded_at/);
  assert.doesNotMatch(app, /\.from\("meal_records"\)\n\s*\.update\(\{ status/);
  assert.doesNotMatch(app, /\.in\(\s*"id"/);
  assert.match(app, /monitor_id/);
  assert.match(app, /No se puede registrar la incidencia/);
});

test("local meal dates use the browser date and timestamps use ISO UTC", async () => {
  const helper = await source("src/lib/local-date.ts");
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(helper, /localDateString/);
  assert.match(helper, /getFullYear\(\)/);
  assert.match(helper, /padStart\(2, "0"\)/);
  assert.match(app, /recorded_date: date/);
  assert.match(app, /recorded_at:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(new Date().toISOString(), /Z$/);
});
