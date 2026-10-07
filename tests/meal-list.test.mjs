import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  applyMealDraft,
  buildMealListRows,
  buildVirtualMealList,
  pickDefaultMealTypeId,
} from "../src/lib/mealList.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

// --- lib: lista virtual ---

test("confirmar muestra Todo virtual por plato y presente sin escribir", () => {
  const list = buildVirtualMealList(["a", "b"]);

  assert.deepEqual(list, [
    {
      childId: "a",
      firstCourse: "todo",
      secondCourse: "todo",
      dessert: "todo",
      notes: "",
    },
    {
      childId: "b",
      firstCourse: "todo",
      secondCourse: "todo",
      dessert: "todo",
      notes: "",
    },
  ]);
});

test("la lista virtual parte de lo ya guardado hoy para re-guardar", () => {
  const list = buildVirtualMealList(
    ["a", "b"],
    [
      {
        child_id: "a",
        status: "todo",
        first_course: "todo",
        second_course: "nada",
        dessert: "casi_todo",
        notes: "poco",
      },
    ],
  );

  assert.deepEqual(list, [
    {
      childId: "a",
      firstCourse: "todo",
      secondCourse: "nada",
      dessert: "casi_todo",
      notes: "poco",
    },
    {
      childId: "b",
      firstCourse: "todo",
      secondCourse: "todo",
      dessert: "todo",
      notes: "",
    },
  ]);
});

test("la fila legacy sin platos replica el status a los tres", () => {
  const list = buildVirtualMealList(
    ["a"],
    [{ child_id: "a", status: "nada", notes: null }],
  );

  assert.deepEqual(list, [
    {
      childId: "a",
      firstCourse: "nada",
      secondCourse: "nada",
      dessert: "nada",
      notes: "",
    },
  ]);
});

test("el ajuste por modal actualiza solo esa fila sin mutar", () => {
  const initial = buildVirtualMealList(["a", "b"]);
  const snapshot = JSON.parse(JSON.stringify(initial));

  const next = applyMealDraft(initial, "a", {
    secondCourse: "casi_nada",
    notes: "mitad",
  });

  assert.deepEqual(next, [
    {
      childId: "a",
      firstCourse: "todo",
      secondCourse: "casi_nada",
      dessert: "todo",
      notes: "mitad",
    },
    {
      childId: "b",
      firstCourse: "todo",
      secondCourse: "todo",
      dessert: "todo",
      notes: "",
    },
  ]);
  assert.deepEqual(initial, snapshot);
});

// --- lib: tipo implícito y filas ---

test("el guardado usa el primer meal_type activo por sort_order", () => {
  assert.equal(
    pickDefaultMealTypeId([
      { id: "segundo", active: true, sort_order: 2 },
      { id: "primero", active: true, sort_order: 1 },
    ]),
    "primero",
  );
  assert.equal(pickDefaultMealTypeId([]), "");
  assert.equal(
    pickDefaultMealTypeId([{ id: "x", active: false, sort_order: 0 }]),
    "",
  );
});

test("el guardado conjunto hace una fila por presente con attendance_date", () => {
  const rows = buildMealListRows({
    presentChildIds: ["a", "b"],
    drafts: [
      {
        childId: "a",
        firstCourse: "casi_todo",
        secondCourse: "nada",
        dessert: "todo",
        notes: " bien ",
      },
      {
        childId: "b",
        firstCourse: "todo",
        secondCourse: "todo",
        dessert: "todo",
        notes: "",
      },
    ],
    mealTypeId: "mt-1",
    recordedDate: "2026-10-07",
    recordedBy: "user-1",
    recordedAt: "2026-10-07T10:00:00.000Z",
  });

  assert.deepEqual(rows, [
    {
      child_id: "a",
      meal_type_id: "mt-1",
      recorded_date: "2026-10-07",
      recorded_by: "user-1",
      recorded_at: "2026-10-07T10:00:00.000Z",
      status: "nada",
      first_course: "casi_todo",
      second_course: "nada",
      dessert: "todo",
      notes: "bien",
    },
    {
      child_id: "b",
      meal_type_id: "mt-1",
      recorded_date: "2026-10-07",
      recorded_by: "user-1",
      recorded_at: "2026-10-07T10:00:00.000Z",
      status: "todo",
      first_course: "todo",
      second_course: "todo",
      dessert: "todo",
      notes: null,
    },
  ]);
});

test("lista vacía o sin tipo no produce ninguna fila", () => {
  assert.deepEqual(
    buildMealListRows({
      presentChildIds: [],
      drafts: [],
      mealTypeId: "mt-1",
      recordedDate: "2026-10-07",
      recordedBy: "user-1",
      recordedAt: "2026-10-07T10:00:00.000Z",
    }),
    [],
  );
  assert.deepEqual(
    buildMealListRows({
      presentChildIds: ["a"],
      drafts: [
        {
          childId: "a",
          firstCourse: "todo",
          secondCourse: "todo",
          dessert: "todo",
          notes: "",
        },
      ],
      mealTypeId: "",
      recordedDate: "2026-10-07",
      recordedBy: "user-1",
      recordedAt: "2026-10-07T10:00:00.000Z",
    }),
    [],
  );
});

// --- UI: BusinessApp ---

test("confirmar solo escribe daily_attendance y muestra Todo virtual", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  const confirmFn = app.match(
    /async function confirmAttendance\(\) \{[\s\S]*?\n {2}\}/,
  );
  assert.ok(confirmFn, "expected a confirmAttendance function");
  assert.doesNotMatch(confirmFn[0], /from\("meal_records"\)/);
  assert.match(app, /buildVirtualMealList/);
  assert.match(app, /Todo pre-seleccionado en cada plato|Todo.*plato/i);
});

test("la edición es por modal por alumno y la lista muestra los platos", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /handleMealModalSave/);
  assert.match(app, /Primero/);
  assert.match(app, /Segundo/);
  assert.match(app, /Postre/);
  assert.match(app, /Ajustar comida de/);
  assert.match(app, /initialCourses/);
  assert.match(app, /initialNotes/);
});

test("el modal ya no pide tipo de comida ni incidencias", async () => {
  const [modal, mealRecord] = await Promise.all([
    source("src/components/MealRecordModal.tsx"),
    source("src/lib/mealRecord.ts"),
  ]);

  assert.doesNotMatch(modal, /Tipo de comida/);
  assert.doesNotMatch(modal, /Incidencias/);
  assert.doesNotMatch(modal, /incidentComments|canManageIncidents/);
  assert.match(modal, /MEAL_COURSES/);
  assert.match(modal, /¿[Cc]ómo ha comido\?/);
  assert.match(mealRecord, /Primero/);
  assert.match(mealRecord, /Segundo/);
  assert.match(mealRecord, /Postre/);
});

test("guardar la lista hace upsert conjunto con attendance_date y tipo implícito", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /Guardar lista de comida/);
  assert.match(app, /async function saveMealList\(/);
  assert.match(app, /buildMealListRows\(/);
  assert.match(app, /recordedDate: attendanceDate/);
  assert.match(app, /attendanceRows\[0\]\?\.attendance_date/);
  assert.match(app, /pickDefaultMealTypeId\(mealTypes\)/);
  assert.match(
    app,
    /onConflict:\s*["']child_id,meal_type_id,recorded_date["']/,
  );
  assert.doesNotMatch(app, /record_meal_incident/);
  assert.doesNotMatch(app, /saveIncident/);
});

test("sin tipo activo o lista vacía no hay escrituras", async () => {
  const app = await source("src/components/BusinessApp.tsx");
  const saveFn = app.match(
    /async function saveMealList\(\) \{[\s\S]*?\n {2}\}/,
  );
  assert.ok(saveFn, "expected a saveMealList function");
  assert.match(saveFn[0], /presentChildIds\.length === 0/);
  assert.match(saveFn[0], /if \(rows\.length === 0\) return/);
  assert.match(saveFn[0], /!defaultMealTypeId/);
});

test("salir sin guardar no escribe en el servidor", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  const modalSave = app.match(/function handleMealModalSave\([\s\S]*?\n {2}\}/);
  assert.ok(modalSave, "expected a handleMealModalSave function");
  assert.doesNotMatch(modalSave[0], /supabase/);
  assert.doesNotMatch(modalSave[0], /from\("meal_records"\)/);
  assert.match(modalSave[0], /setMealDrafts/);
});
