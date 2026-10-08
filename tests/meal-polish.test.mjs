import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  canEditMealForDate,
  MEAL_STATUS_VISUAL,
  mealStatusVisual,
} from "../src/lib/mealRecord.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function migrationSources() {
  const dir = new URL("supabase/migrations/", root);
  const files = await readdir(dir);
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();
  const contents = [];
  for (const file of sqlFiles) {
    contents.push({ file, sql: await readFile(new URL(file, dir), "utf8") });
  }
  return contents;
}

// --- lib: visual final Todo / Casi todo / Casi nada / Nada ---

test("el visual final mapea los cuatro literales con verde / verde-claro / ámbar / rojo", () => {
  assert.equal(MEAL_STATUS_VISUAL.todo.label, "Todo");
  assert.equal(MEAL_STATUS_VISUAL.casi_todo.label, "Casi todo");
  assert.equal(MEAL_STATUS_VISUAL.casi_nada.label, "Casi nada");
  assert.equal(MEAL_STATUS_VISUAL.nada.label, "Nada");

  assert.match(MEAL_STATUS_VISUAL.todo.dotClass, /emerald/);
  assert.match(MEAL_STATUS_VISUAL.casi_todo.dotClass, /lime|green/);
  assert.match(MEAL_STATUS_VISUAL.casi_nada.dotClass, /amber/);
  assert.match(MEAL_STATUS_VISUAL.nada.dotClass, /red/);

  assert.equal(mealStatusVisual("todo").label, "Todo");
  assert.equal(mealStatusVisual("nada").label, "Nada");
});

// --- lib: ventana de edición mismo día vs días pasados ---

test("mismo día monitor y admin editan; días pasados solo admin", () => {
  const today = "2026-10-07";
  assert.equal(canEditMealForDate("monitor", today, today), true);
  assert.equal(canEditMealForDate("admin", today, today), true);

  assert.equal(canEditMealForDate("monitor", "2026-10-06", today), false);
  assert.equal(canEditMealForDate("admin", "2026-10-06", today), true);

  assert.equal(canEditMealForDate("padre", today, today), false);
  assert.equal(canEditMealForDate(null, today, today), false);
});

// --- contrato de datos: policy SELECT para familia (rol remoto 'parent') ---

test("existe policy SELECT para familia sobre meal_records con gate de capability", async () => {
  const migrations = await migrationSources();
  const match = migrations.find(({ sql }) =>
    /CREATE POLICY meal_records_select_parent/i.test(sql),
  );
  assert.ok(match, "expected a migration covering parent meal_records access");
  assert.match(match.sql, /CREATE POLICY meal_records_select_parent/);
  assert.match(match.sql, /FOR SELECT/);
  assert.match(match.sql, /'parent'/);
  assert.match(match.sql, /current_user_can_access_child/);
  assert.match(match.sql, /family_meal_records_enabled_for_child/);
});

// --- contrato de datos: ventana en RLS para monitor ---

test("el monitor solo escribe el día en curso (RLS con recorded_date = CURRENT_DATE)", async () => {
  const migrations = await migrationSources();
  const combined = migrations.map((m) => m.sql).join("\n");
  assert.match(
    combined,
    /meal_records_monitor_update[\s\S]*recorded_date\s*=\s*CURRENT_DATE/,
  );
});

// --- UI: tarjeta/lista con texto literal y color final ---

test("la lista muestra el literal final con color y el todo por defecto igual que el explícito", async () => {
  const app = await source("src/routes/ClassesPage.tsx");

  assert.match(app, /MEAL_STATUS_VISUAL|mealStatusVisual/);
  assert.match(app, /visual\.dotClass|dotClass/);
  assert.match(app, /visual\.textClass|textClass/);
  // El todo por defecto no va atenuado: mismo estilo que un todo explícito.
  assert.doesNotMatch(app, /text-slate-400 opacity-70/);
});

// --- UI: ventana de edición monitor solo lectura, admin rectifica ---

test("días pasados el monitor ve solo lectura y el admin rectifica", async () => {
  const app = await source("src/routes/ClassesPage.tsx");

  assert.match(app, /canEditMealForDate/);
  assert.match(app, /Solo lectura|solo lectura/i);
  assert.match(app, /canRecordMeal|attendanceRows/);
});

// --- UI: notas editables en el mismo modal ---

test("las notas se editan en el mismo modal de comida", async () => {
  const app = await source("src/routes/ClassesPage.tsx");
  const modal = await source("src/components/MealRecordModal.tsx");

  assert.match(app, /initialNotes/);
  assert.match(app, /initialCourses/);
  assert.match(modal, /Notas de la comida/);
  assert.match(modal, /type="checkbox"/);
});
