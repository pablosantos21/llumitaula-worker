import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  INCIDENT_CATEGORIES,
  isIncidentCategory,
  resolveIncidentCategory,
} from "../src/lib/incidentCategories.ts";

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

// --- lib: categorías cerradas ---

test("las 6 categorías cerradas son las del spec, sin texto libre", () => {
  assert.deepEqual(
    [...INCIDENT_CATEGORIES],
    ["salud", "comportamiento", "comedor", "descanso", "recogida", "otro"],
  );
});

test("solo las 6 categorías validan; vacío o texto libre no", () => {
  for (const category of INCIDENT_CATEGORIES) {
    assert.equal(isIncidentCategory(category), true);
  }
  assert.equal(isIncidentCategory(""), false);
  assert.equal(isIncidentCategory(null), false);
  assert.equal(isIncidentCategory(undefined), false);
  assert.equal(isIncidentCategory("fiebre alta"), false);
  assert.equal(isIncidentCategory("Salud"), false);
});

test("el historial antiguo sin categoría se ve como otro", () => {
  assert.equal(resolveIncidentCategory(null), "otro");
  assert.equal(resolveIncidentCategory(undefined), "otro");
  assert.equal(resolveIncidentCategory(""), "otro");
  assert.equal(resolveIncidentCategory("texto libre antiguo"), "otro");
  assert.equal(resolveIncidentCategory("salud"), "salud");
  assert.equal(resolveIncidentCategory("comedor"), "comedor");
});

// --- contrato de datos: columna categoría nullable con valores cerrados ---

test("la migración añade incidents.category nullable con check de 6 valores", async () => {
  const migrations = await migrationSources();
  const match = migrations.find(({ sql }) =>
    /alter table[\s\S]*incidents[\s\S]*category/i.test(sql),
  );
  assert.ok(match, "expected a migration adding incidents.category");
  assert.match(match.sql, /category/i);
  assert.match(match.sql, /salud/);
  assert.match(match.sql, /comportamiento/);
  assert.match(match.sql, /comedor/);
  assert.match(match.sql, /descanso/);
  assert.match(match.sql, /recogida/);
  assert.match(match.sql, /otro/);
});

test("la lectura por centro y rol se conserva tras la columna nueva", async () => {
  const migrations = await migrationSources();
  const combined = migrations.map((m) => m.sql).join("\n");
  assert.match(combined, /incidents_select_tenant/);
  assert.match(combined, /incidents_select_monitor/);
  assert.match(combined, /current_school_id\(\)|current_user_can_access_child/);
});

// --- UI: crear exige categoría y el historial la muestra (otro por defecto) ---

test("crear exige elegir una de las 6 categorías, sin texto libre solo", async () => {
  const nova = await source("src/pages/incidencias/nova.astro");

  assert.match(nova, /name="category"/);
  assert.match(nova, /required/);
  assert.match(nova, /INCIDENT_CATEGORIES/);
  assert.match(nova, /isIncidentCategory/);
  assert.match(nova, /formError|role="alert"/);
  assert.match(nova, /categoria/i);
});

test("la página Incidencias muestra la categoría del día por alumno", async () => {
  const index = await source("src/pages/incidencias/index.astro");

  assert.match(
    index,
    /resolveIncidentCategory|incidentCategoryLabel|INCIDENT_CATEGORY_LABELS/,
  );
  assert.match(index, /description/);
  assert.match(index, /todayStr|date/);
});

test("las incidencias antiguas sin categoría se ven como otro sin romper", async () => {
  const [index, anteriors] = await Promise.all([
    source("src/pages/incidencias/index.astro"),
    source("src/pages/incidencias/anteriors.astro"),
  ]);

  for (const page of [index, anteriors]) {
    assert.match(page, /resolveIncidentCategory|incidentCategoryLabel/);
  }
});

test("escritura y lectura respetan centro y rol desde la página Incidencias", async () => {
  const [nova, index] = await Promise.all([
    source("src/pages/incidencias/nova.astro"),
    source("src/pages/incidencias/index.astro"),
  ]);

  assert.match(nova, /getClassesWithChildren/);
  assert.match(nova, /createIncident/);
  assert.match(nova, /monitor_id/);
  assert.match(index, /getIncidentsByMonitor/);
});

test("la vista Clases no crea incidencias con categoría", async () => {
  const [businessApp, classesIndex] = await Promise.all([
    source("src/components/BusinessApp.tsx"),
    source("src/pages/classes/index.astro"),
  ]);

  assert.doesNotMatch(businessApp, /INCIDENT_CATEGORIES|isIncidentCategory/);
  assert.doesNotMatch(businessApp, /Notificar/);
  assert.doesNotMatch(classesIndex, /INCIDENT_CATEGORIES|name="category"/);
});
