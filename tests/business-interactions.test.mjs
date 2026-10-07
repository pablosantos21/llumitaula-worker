import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("business pages keep protected React-only rendering", async () => {
  const [home, app] = await Promise.all([
    source("src/pages/index.astro"),
    source("src/components/BusinessApp.tsx"),
  ]);

  assert.match(home, /BusinessApp[\s\S]*client:only="react"/);
  assert.match(app, /supabase\.auth\.getSession\(\)/);
  assert.match(app, /from\("classes"\)/);
  assert.match(app, /from\("children"\)/);
  assert.match(app, /from\("meal_records"\)/);
  assert.match(app, /from\("incidents"\)/);
  assert.match(app, /from\("meal_types"\)/);
  assert.doesNotMatch(home, /MOCK_STUDENTS|Ana Martínez|Biel Roca/);
  assert.doesNotMatch(app, /MOCK_STUDENTS|Ana Martínez|Biel Roca/);
});

test("monitor entry screen is the class list and never shows all children at once", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /buildClassList/);
  assert.match(app, /childrenInClass/);
  assert.match(app, /"Clases"/);
  assert.match(app, /selectedClassId[\s\S]*null/);
  assert.match(app, /from\("classes"\)\.select\("id, name, school_id"\)/);
  // #34: el borrador de comida vive en localStorage por
  // escuela:clase:fecha:tipo; fuera de ese uso no se persiste nada.
  assert.match(app, /buildMealDraftKey/);
  assert.match(app, /loadMealDrafts|persistMealDrafts|clearMealDrafts/);
  assert.doesNotMatch(app, /Buscar Alumno|Buscar alumno/);
  assert.doesNotMatch(app, /page === "search"|page !== "search"/);
});

test("gaps by class filter children in memory and render clear empty states", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /childrenInClass\(children, selectedClassId\)/);
  assert.match(app, /Esta clase todavía no tiene alumnos\./);
  assert.match(app, /Este centro todavía no tiene clases\./);
  assert.match(app, /← Volver/);
  assert.match(app, /setSelectedClassId/);
  assert.doesNotMatch(app, /type="search"/);
});

test("React business UI restores card, meal status and toast components", async () => {
  const paths = [
    "src/components/StudentCard.tsx",
    "src/components/MealStatusBadge.tsx",
    "src/components/MealRecordModal.tsx",
    "src/components/FeedbackToast.tsx",
  ];
  await Promise.all(paths.map((path) => access(new URL(path, root))));

  const [card, badge, modal, toast, app, mealRecord] = await Promise.all([
    source(paths[0]),
    source(paths[1]),
    source(paths[2]),
    source(paths[3]),
    source("src/components/BusinessApp.tsx"),
    source("src/lib/mealRecord.ts"),
  ]);

  assert.match(card, /onClick/);
  assert.match(badge, /Bien/);
  assert.match(badge, /Incidencia/);
  assert.match(modal, /MEAL_COURSES/);
  assert.match(mealRecord, /Primero/);
  assert.match(mealRecord, /Segundo/);
  assert.match(mealRecord, /Postre/);
  assert.doesNotMatch(modal, /Tipo de comida/);
  assert.doesNotMatch(modal, /Incidencias/);
  assert.doesNotMatch(modal, /Comentarios de la incidencia/);
  assert.match(toast, /role="status"/);
  assert.match(app, /meal_records.*upsert|upsert.*meal_records/s);
  assert.match(app, /recorded_by/);
  assert.match(app, /recorded_date/);
  assert.doesNotMatch(app, /record_meal_incident/);
  assert.match(app, /localDateString/);
  assert.doesNotMatch(app, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(
    app,
    /onConflict:\s*["']child_id,meal_type_id,recorded_date["']/,
  );
});

test("worker meal types stay implicit and meal writes never use incidents", async () => {
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
  assert.doesNotMatch(app, /canManageIncidents/);
  assert.doesNotMatch(app, /<IncidentModal/);
  assert.doesNotMatch(modal, /canManageIncidents &&/);
  assert.match(app, /recorded_by/);
  assert.match(app, /recorded_at/);
  assert.doesNotMatch(app, /\.from\("meal_records"\)\n\s*\.update\(\{ status/);
  assert.doesNotMatch(app, /\.in\(\s*"id"/);
  assert.doesNotMatch(app, /No se puede registrar la incidencia/);
});

test("the meal modal no longer manages incidents", async () => {
  const app = await source("src/components/BusinessApp.tsx");
  const modal = await source("src/components/MealRecordModal.tsx");

  assert.doesNotMatch(app, /canManageIncidents/);
  assert.doesNotMatch(modal, /Incidencias/);
  assert.doesNotMatch(modal, /noFirst|noSecond|noGarnish|noDessert/);
  assert.match(modal, /Notas de la comida/);
});

test("meal records never call the incident RPC from the UI", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.doesNotMatch(app, /saveIncident/);
  assert.doesNotMatch(app, /\.rpc\("record_meal_incident"/);
});

test("local meal dates use the browser date and timestamps use ISO UTC", async () => {
  const helper = await source("src/lib/local-date.ts");
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(helper, /localDateString/);
  assert.match(helper, /getFullYear\(\)/);
  assert.match(helper, /padStart\(2, "0"\)/);
  assert.match(app, /recordedDate: attendanceDate/);
  assert.match(app, /recordedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(new Date().toISOString(), /Z$/);
});

test("the meal upsert writes one row per course with the derived status", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /async function saveMealList\(/);
  assert.match(app, /first_course/);
  assert.match(app, /second_course/);
  assert.match(app, /dessert/);
  assert.match(app, /setRecords\(/);
  assert.match(app, /No se ha podido guardar la lista de comida/);
  assert.doesNotMatch(
    app,
    /saveMealList[\s\S]*?\.from\("meal_records"\)[\s\S]*?\.upsert\([\s\S]*?\.from\("incidents"\)[\s\S]*?\.insert\(/,
  );
});

test("a bad course overrides a good meal in the visual card status", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(
    app,
    /function statusFor\(records: MealRecord\[], incidents: Incident\[\]\)/,
  );
  assert.match(app, /overallMealStatus\(courses\) !== "todo"/);
  assert.match(
    app,
    /statusFor\([\s\S]*?records\.filter\([\s\S]*?incidents\.filter\(/,
  );
});

test("course descriptions show primero, segundo y postre", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /Primero/);
  assert.match(app, /Segundo/);
  assert.match(app, /Postre/);
  assert.doesNotMatch(app, /No ha comido primero/);
  assert.doesNotMatch(app, /No ha comido segundo/);
  assert.doesNotMatch(app, /No ha comido guarnici[oó]n/);
  assert.doesNotMatch(app, /Comentarios:/);
});

test("modal edits keep courses and notes in the virtual draft", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  // #33: la edición por modal solo ajusta el borrador virtual de la fila
  // (platos + notas, sin escribir en servidor); el guardado conjunto persiste.
  assert.match(app, /handleMealModalSave/);
  assert.match(app, /handleMealModalSave\(selectedChild/);
  assert.match(app, /handleMealModalSave\([\s\S]*?payload\.firstCourse/);
  assert.match(app, /handleMealModalSave\([\s\S]*?payload\.notes/);
});

test("a plain todo stays on the ordinary meal upsert path", async () => {
  const [mealRecord, app] = await Promise.all([
    source("src/lib/mealRecord.ts"),
    source("src/components/BusinessApp.tsx"),
  ]);

  assert.match(mealRecord, /overallMealStatus/);
  assert.match(mealRecord, /firstCourse/);
  assert.match(mealRecord, /secondCourse/);
  assert.match(mealRecord, /dessert/);
  assert.doesNotMatch(mealRecord, /hasIncident/);
  assert.doesNotMatch(mealRecord, /incidentComments/);
  // #33: el modal guarda en borrador y el botón conjunto hace el upsert.
  assert.match(app, /onSave=\{\(payload\) => \{[\s\S]*?handleMealModalSave\(/);
  assert.match(app, /async function saveMealList\(/);
  assert.match(app, /buildMealListRows\(/);
});

test("no incident path remains in the meal flow", async () => {
  const [mealRecord, app] = await Promise.all([
    source("src/lib/mealRecord.ts"),
    source("src/components/BusinessApp.tsx"),
  ]);

  assert.doesNotMatch(mealRecord, /incident: \{/);
  assert.doesNotMatch(app, /record_meal_incident/);
  assert.doesNotMatch(app, /saveIncident/);
});
