import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  buildSchoolForecast,
  DAILY_SUMMARY_CAPABILITY,
  permittedClassIds,
  resolveDailySummaryEnabled,
} from "../src/lib/daily-summary.ts";

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

function monday() {
  return new Date(2026, 9, 5, 12, 0, 0);
}

function saturday() {
  return new Date(2026, 9, 10, 12, 0, 0);
}

// --- lib: resolución efectiva clase > colegio > defecto ---

test("la capacidad usa el override de clase, luego colegio, luego defecto", () => {
  assert.equal(DAILY_SUMMARY_CAPABILITY, "monitor_daily_summary");
  assert.equal(
    resolveDailySummaryEnabled({
      classOverride: false,
      schoolEnabled: true,
      defaultEnabled: true,
    }),
    false,
  );
  assert.equal(
    resolveDailySummaryEnabled({
      classOverride: true,
      schoolEnabled: false,
      defaultEnabled: false,
    }),
    true,
  );
  assert.equal(
    resolveDailySummaryEnabled({
      classOverride: null,
      schoolEnabled: false,
      defaultEnabled: true,
    }),
    false,
  );
  assert.equal(
    resolveDailySummaryEnabled({
      classOverride: null,
      schoolEnabled: null,
      defaultEnabled: true,
    }),
    true,
  );
  assert.equal(
    resolveDailySummaryEnabled({
      classOverride: undefined,
      schoolEnabled: undefined,
      defaultEnabled: undefined,
    }),
    true,
  );
});

// --- lib: previsión solo con horario que incluye hoy, en clases permitidas ---

test("la previsión cuenta el horario que incluye hoy solo en clases permitidas", () => {
  const children = [
    { id: "k1", class_id: "c1" },
    { id: "k2", class_id: "c1" },
    { id: "k3", class_id: "c2" },
  ];
  const lunchByChild = { k1: [1], k2: [2], k3: [1] };

  const forecast = buildSchoolForecast({
    children,
    lunchByChild,
    permittedClassIds: new Set(["c1"]),
    date: monday(),
  });

  assert.equal(forecast.expectedCount, 1);
  assert.deepEqual(forecast.expectedChildIds, ["k1"]);
  assert.equal(forecast.isNoServiceDay, false);
});

test("sin horario configurado es previsión incompleta, no ausencia silenciosa", () => {
  const children = [
    { id: "k1", class_id: "c1" },
    { id: "k2", class_id: "c1" },
  ];
  const forecast = buildSchoolForecast({
    children,
    lunchByChild: { k1: [1] },
    permittedClassIds: new Set(["c1"]),
    date: monday(),
  });

  assert.equal(forecast.expectedCount, 1);
  assert.equal(forecast.incompleteCount, 1);
  assert.deepEqual(forecast.incompleteChildIds, ["k2"]);
  assert.equal(forecast.isIncomplete, true);
});

test("horario configurado que excluye hoy no es previsto ni incompleto", () => {
  const forecast = buildSchoolForecast({
    children: [{ id: "k1", class_id: "c1" }],
    lunchByChild: { k1: [] },
    permittedClassIds: new Set(["c1"]),
    date: monday(),
  });

  assert.equal(forecast.expectedCount, 0);
  assert.equal(forecast.incompleteCount, 0);
  assert.equal(forecast.isIncomplete, false);
});

test("un día sin servicio se indica explícito; horarios vacíos no infieren cierre", () => {
  const emptyWeekend = buildSchoolForecast({
    children: [{ id: "k1", class_id: "c1" }],
    lunchByChild: {},
    permittedClassIds: new Set(["c1"]),
    date: saturday(),
  });
  assert.equal(emptyWeekend.isNoServiceDay, true);

  const emptyWeekday = buildSchoolForecast({
    children: [{ id: "k1", class_id: "c1" }],
    lunchByChild: {},
    permittedClassIds: new Set(["c1"]),
    date: monday(),
  });
  assert.equal(emptyWeekday.isNoServiceDay, false);
  assert.equal(emptyWeekday.expectedCount, 0);
});

test("solo las clases con permiso efectivo entran en el resumen", () => {
  const classes = [
    { id: "c1", school_id: "s1" },
    { id: "c2", school_id: "s1" },
    { id: "c3", school_id: "s2" },
  ];

  assert.deepEqual(
    [
      ...permittedClassIds(classes, {
        classOverrides: { c1: false },
        schoolEnabledBySchool: {},
        defaultEnabled: true,
      }),
    ].sort(),
    ["c2", "c3"],
  );
  assert.deepEqual(
    [
      ...permittedClassIds(classes, {
        classOverrides: { c1: true },
        schoolEnabledBySchool: { s1: false },
        defaultEnabled: false,
      }),
    ].sort(),
    ["c1"],
  );
  assert.deepEqual([...permittedClassIds(classes, {})].sort(), [
    "c1",
    "c2",
    "c3",
  ]);
  assert.deepEqual([...permittedClassIds([], {})], []);
});

// --- seam ruta protegida: resumen antes de elegir clase ---

test("la raíz protegida muestra la previsión del colegio antes de elegir clase", async () => {
  const [router, page] = await Promise.all([
    source("src/app/router.tsx"),
    source("src/routes/ClassesPage.tsx"),
  ]);

  assert.match(router, /path:\s*["']\/["']/);
  assert.match(router, /ClassesPage/);
  assert.match(router, /RequireSession/);
  assert.match(page, /Previsi/);
  assert.match(page, /buildSchoolForecast|resolveDailySummaryEnabled/);
  assert.match(page, /from\("classes"\)/);
  assert.match(page, /from\("children"\)/);
  assert.match(page, /from\("child_lunch_days"\)/);
  assert.match(page, /Selecciona una clase|buildClassList/);
});

test("la previsión se presenta como previsión, no como asistencia confirmada", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /Previsi.n/);
  assert.doesNotMatch(
    page,
    /Lista confirmada.*Previsi|Previsi.*Lista confirmada/,
  );
  assert.match(page, /isNoServiceDay|Hoy no hay servicio/);
  assert.match(page, /previsi.n incompleta|incompleta/i);
});

test("el error de carga ofrece reintento sin datos antiguos; sin conexión no finge actualidad", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /Reintentar|reintento/i);
  assert.match(page, /Sin conexi.n/i);
  assert.match(page, /navigator\.onLine|isOffline/);
});

// --- seam acceso a datos: lo deshabilitado no se puede consultar ---

test("el acceso directo a clases deshabilitadas se rechaza en RLS", async () => {
  const migrations = await migrationSources();
  const combined = migrations.map((m) => m.sql).join("\n");

  assert.match(combined, /monitor_daily_summary/);
  assert.match(combined, /monitor_daily_summary_enabled_for_(child|class)/);
  assert.match(combined, /class_capability_overrides/);
  assert.match(combined, /school_capabilities/);
  assert.match(combined, /capability_catalog/);
  assert.match(combined, /COALESCE/);
});

test("ninguna clase permitida oculta el resumen pero conserva la selección", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /permittedClassIds|allowedClass|effectiveCapability/i);
  assert.match(page, /permittedClassIds\.size > 0/);
  assert.match(page, /summaryCapabilitiesFailed/);
  assert.match(page, /Selecciona una clase|buildClassList/);
});
