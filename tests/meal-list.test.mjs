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

test("confirmar muestra Todo virtual por cada presente sin escribir", () => {
  const list = buildVirtualMealList(["a", "b"]);

  assert.deepEqual(list, [
    { childId: "a", status: "todo", notes: "" },
    { childId: "b", status: "todo", notes: "" },
  ]);
});

test("la lista virtual parte de lo ya guardado hoy para re-guardar", () => {
  const list = buildVirtualMealList(
    ["a", "b"],
    [{ child_id: "a", status: "nada", notes: "poco" }],
  );

  assert.deepEqual(list, [
    { childId: "a", status: "nada", notes: "poco" },
    { childId: "b", status: "todo", notes: "" },
  ]);
});

test("el ajuste por modal actualiza solo esa fila sin mutar", () => {
  const initial = buildVirtualMealList(["a", "b"]);
  const snapshot = JSON.parse(JSON.stringify(initial));

  const next = applyMealDraft(initial, "a", {
    status: "casi_nada",
    notes: "mitad",
  });

  assert.deepEqual(next, [
    { childId: "a", status: "casi_nada", notes: "mitad" },
    { childId: "b", status: "todo", notes: "" },
  ]);
  assert.deepEqual(initial, snapshot);
});

// --- lib: tipo por defecto y filas ---

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
      { childId: "a", status: "casi_todo", notes: " bien " },
      { childId: "b", status: "todo", notes: "" },
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
      status: "casi_todo",
      notes: "bien",
    },
    {
      child_id: "b",
      meal_type_id: "mt-1",
      recorded_date: "2026-10-07",
      recorded_by: "user-1",
      recorded_at: "2026-10-07T10:00:00.000Z",
      status: "todo",
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
      drafts: [{ childId: "a", status: "todo", notes: "" }],
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
  assert.match(app, /Todo pre-seleccionado virtual|Todo.*virtual/i);
});

test("la edición es por modal por alumno y la lista muestra el valor", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /handleMealModalSave/);
  assert.match(app, /Valor elegido/);
  assert.match(app, /Ajustar comida de/);
  assert.match(app, /initialStatus/);
  assert.match(app, /initialNotes/);
});

test("guardar la lista hace upsert conjunto con attendance_date y primer tipo", async () => {
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
