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
  assert.match(app, /from\("incidents"\)/);
  assert.match(app, /from\("meal_types"\)/);
  assert.doesNotMatch(home, /MOCK_STUDENTS|Ana Martínez|Biel Roca/);
  assert.doesNotMatch(search, /MOCK_STUDENTS|Ana Martínez|Biel Roca/);
});

test("React business UI restores card, meal status, incident and toast components", async () => {
  const paths = [
    "src/components/StudentCard.tsx",
    "src/components/MealStatusBadge.tsx",
    "src/components/MealRecordModal.tsx",
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
  assert.match(modal, /Comentarios de la incidencia/);
  assert.match(toast, /role="status"/);
  assert.match(app, /Incidencia registrada/);
  assert.match(app, /meal_records.*upsert|upsert.*meal_records/s);
  assert.match(app, /recorded_by/);
  assert.match(app, /recorded_date/);
  assert.match(app, /record_meal_incident/);
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
  const modal = await source("src/components/MealRecordModal.tsx");

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
  assert.match(
    app,
    /<MealRecordModal[\s\S]*?canManageIncidents=\{canManageIncidents\}[\s\S]*?onSave=/,
  );
  assert.doesNotMatch(app, /<IncidentModal/);
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

test("incidence uses one atomic RPC and refreshes incident state", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /async function saveIncident\(/);
  assert.match(app, /mealTypeId: string/);
  assert.match(app, /status: MealStatus/);
  assert.match(app, /noFirst: boolean/);
  assert.match(app, /comments: string/);
  assert.match(
    app,
    /saveIncident[\s\S]*?\.rpc\("record_meal_incident",[\s\S]*?p_child_id[\s\S]*?p_monitor_id/,
  );
  assert.match(app, /setIncidents\(incidentsResult\.data/);
  assert.match(app, /No se han podido guardar la comida ni la incidencia/);
  assert.doesNotMatch(
    app,
    /saveIncident[\s\S]*?\.from\("meal_records"\)[\s\S]*?\.upsert\([\s\S]*?\.from\("incidents"\)[\s\S]*?\.insert\(/,
  );
});

test("incidents override a good meal in the visual card status", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(
    app,
    /function statusFor\(records: MealRecord\[], incidents: Incident\[\]\)/,
  );
  assert.match(app, /record\.status !== "bien"[\s\S]*incidents\.length > 0/);
  assert.match(
    app,
    /statusFor\([\s\S]*?records\.filter\([\s\S]*?incidents\.filter\(/,
  );
});

test("incidence descriptions preserve flags and comments as readable text", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /No ha comido primero/);
  assert.match(app, /No ha comido segundo/);
  assert.match(app, /No ha comido guarnici[oó]n/);
  assert.match(app, /No ha comido postre/);
  assert.match(app, /Comentarios:/);
  assert.match(app, /replace\([^\n]*\\s\+\/g/);
});

test("incident-capable users keep comments even when no flag is checked", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(
    app,
    /if \([\s\S]*?"incident" in payload[\s\S]*?payload\.incident[\s\S]*?\) \{[\s\S]*?saveIncident\(selectedChild!,[\s\S]*?return;/,
  );
  assert.match(app, /saveStatus\([\s\S]*?payload\.status/);
});

test("manager todo bien stays on the ordinary meal upsert path", async () => {
  const [mealRecord, app] = await Promise.all([
    source("src/lib/mealRecord.ts"),
    source("src/components/BusinessApp.tsx"),
  ]);

  assert.match(
    mealRecord,
    /const hasIncident =\s+values\.noFirst \|\|\s+values\.noSecond \|\|\s+values\.noGarnish \|\|\s+values\.noDessert \|\|\s+values\.incidentComments\.trim\(\)\.length > 0/,
  );
  assert.match(
    mealRecord,
    /if \(!canManageIncidents \|\| !hasIncident\) return payload;/,
  );
  assert.match(
    app,
    /if \("incident" in payload && payload\.incident\) \{[\s\S]*?saveIncident\([\s\S]*?return;[\s\S]*?\}[\s\S]*?void saveStatus\(/,
  );
});

test("manager incidence stays on the atomic RPC path", async () => {
  const [mealRecord, app] = await Promise.all([
    source("src/lib/mealRecord.ts"),
    source("src/components/BusinessApp.tsx"),
  ]);

  assert.match(mealRecord, /incident: \{/);
  assert.match(
    app,
    /saveIncident[\s\S]*?\.rpc\("record_meal_incident",[\s\S]*?p_child_id/,
  );
  assert.doesNotMatch(
    app,
    /saveIncident[\s\S]*?\.from\("meal_records"\)[\s\S]*?\.upsert\(/,
  );
});
