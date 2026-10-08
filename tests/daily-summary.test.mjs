import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  buildExpectedDinerAllergies,
  buildSchoolForecast,
  buildSchoolSummaryIncidents,
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

// --- #53: alergias de los comensales previstos ---

function allergyChildren() {
  return [
    { id: "k1", class_id: "c1", first_name: "Anna", last_name: "Puig" },
    { id: "k2", class_id: "c1", first_name: "Biel", last_name: "Vila" },
    { id: "k3", class_id: "c2", first_name: "Clara", last_name: "Roca" },
  ];
}

function allergyFixtures() {
  return {
    // k1 previsto el lunes con dos alérgenos, k2 previsto sin alergias,
    // k3 previsto el lunes pero en otra clase.
    lunchByChild: { k1: [1], k2: [1], k3: [1] },
    childAllergenIds: { k1: ["a1", "a2"], k3: ["a1"] },
    allergenNames: { a1: "Gluten", a2: "Huevo" },
  };
}

test("solo los previstos con alergias en clases permitidas aparecen con nombre y alérgenos", () => {
  const fixtures = allergyFixtures();

  const rows = buildExpectedDinerAllergies({
    children: allergyChildren(),
    lunchByChild: fixtures.lunchByChild,
    permittedClassIds: new Set(["c1", "c2"]),
    childAllergenIds: fixtures.childAllergenIds,
    allergenNames: fixtures.allergenNames,
    date: monday(),
  });

  assert.deepEqual(rows, [
    {
      childId: "k1",
      childName: "Anna Puig",
      allergenNames: ["Gluten", "Huevo"],
    },
    { childId: "k3", childName: "Clara Roca", allergenNames: ["Gluten"] },
  ]);
});

test("el ámbito del resumen excluye a los comensales de clases no permitidas", () => {
  const fixtures = allergyFixtures();

  const rows = buildExpectedDinerAllergies({
    children: allergyChildren(),
    lunchByChild: fixtures.lunchByChild,
    permittedClassIds: new Set(["c1"]),
    childAllergenIds: fixtures.childAllergenIds,
    allergenNames: fixtures.allergenNames,
    date: monday(),
  });

  assert.deepEqual(
    rows.map((row) => row.childId),
    ["k1"],
  );
});

test("el horario filtra: no previstos y sin horario no aparecen aunque tengan alergias", () => {
  const fixtures = allergyFixtures();

  const rows = buildExpectedDinerAllergies({
    children: [
      ...allergyChildren(),
      { id: "k4", class_id: "c1", first_name: "Dani", last_name: "Sol" },
    ],
    lunchByChild: { ...fixtures.lunchByChild, k4: undefined },
    permittedClassIds: new Set(["c1", "c2"]),
    childAllergenIds: { ...fixtures.childAllergenIds, k4: ["a1"] },
    allergenNames: fixtures.allergenNames,
    date: monday(),
  });

  assert.deepEqual(
    rows.map((row) => row.childId),
    ["k1", "k3"],
  );

  const tuesdayNoOne = buildExpectedDinerAllergies({
    children: allergyChildren(),
    lunchByChild: { k1: [3], k2: [1], k3: [1] },
    permittedClassIds: new Set(["c1", "c2"]),
    childAllergenIds: { k1: ["a1"], k2: ["a1"], k3: ["a1"] },
    allergenNames: fixtures.allergenNames,
    date: monday(),
  });
  assert.deepEqual(
    tuesdayNoOne.map((row) => row.childId),
    ["k2", "k3"],
  );
});

test("un día sin servicio no lista alergias; horarios vacíos no infieren cierre", () => {
  const fixtures = allergyFixtures();

  const weekend = buildExpectedDinerAllergies({
    children: allergyChildren(),
    lunchByChild: fixtures.lunchByChild,
    permittedClassIds: new Set(["c1", "c2"]),
    childAllergenIds: fixtures.childAllergenIds,
    allergenNames: fixtures.allergenNames,
    date: saturday(),
  });
  assert.deepEqual(weekend, []);
});

test("cada resultado muestra solo identidad y nombres de alérgenos", () => {
  const fixtures = allergyFixtures();

  const rows = buildExpectedDinerAllergies({
    children: allergyChildren(),
    lunchByChild: fixtures.lunchByChild,
    permittedClassIds: new Set(["c1", "c2"]),
    childAllergenIds: fixtures.childAllergenIds,
    allergenNames: fixtures.allergenNames,
    date: monday(),
  });

  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      "allergenNames",
      "childId",
      "childName",
    ]);
  }
});

// --- seam acceso a datos (#53): alérgenos del resumen con permiso efectivo ---

async function summaryAllergyMigration() {
  const migrations = await migrationSources();
  const migration = migrations.find((m) =>
    m.file.includes("daily_summary_allergies"),
  );
  assert.ok(migration, "existe una migración para las alergias del resumen");
  return migration.sql;
}

test("el acceso directo del monitor a alérgenos de clases deshabilitadas se rechaza", async () => {
  const sql = await summaryAllergyMigration();

  // El monitor lee nombres de alérgenos vinculados a niños accesibles…
  assert.match(sql, /create policy allergens_select_tenant/);
  assert.match(sql, /current_user_role\(\) = 'monitor'/);
  // …pero solo cuando el resumen está permitido para ese niño.
  assert.match(sql, /monitor_daily_summary_enabled_for_child\(ch\.id\)/);
  // La asociación directa también se filtra por el permiso efectivo.
  assert.match(sql, /create policy child_allergens_select_tenant/);
  assert.match(
    sql,
    /create policy child_allergens_select_tenant[\s\S]*?monitor_daily_summary_enabled_for_child\(/,
  );
});

test("el tenant y rol existentes de alérgenos se conservan", async () => {
  const migrations = await migrationSources();
  const combined = migrations.map((m) => m.sql).join("\n");

  assert.match(
    combined,
    /create policy allergens_select_tenant[\s\S]*?current_user_role\(\) = 'admin'/,
  );
  assert.match(
    combined,
    /create policy allergens_select_tenant[\s\S]*?current_user_role\(\) = 'padre'/,
  );
  assert.match(
    combined,
    /create policy child_allergens_select_tenant[\s\S]*?current_user_can_access_child/,
  );
});

// --- seam ruta protegida (#53): alergias visibles antes de elegir clase ---

test("la raíz protegida muestra las alergias de los comensales previstos", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /buildExpectedDinerAllergies/);
  assert.match(page, /from\("allergens"\)/);
  assert.match(page, /from\("child_allergens"\)/);
  assert.match(page, /Alergias de los comensales previstos/);
});

test("la sección de alergias no infiere datos clínicos", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /Alergias de los comensales previstos/);
  assert.doesNotMatch(page, /gravedad|severidad|reacci.n|tratamiento/i);
});

// --- #54: incidencias del colegio en el resumen ---

function summaryIncidentChildren() {
  return [
    { id: "k1", class_id: "c1", first_name: "Anna", last_name: "Puig" },
    { id: "k2", class_id: "c1", first_name: "Biel", last_name: "Vila" },
    { id: "k3", class_id: "c2", first_name: "Clara", last_name: "Roca" },
  ];
}

function summaryIncidentRows() {
  // i1 colegio (send_notification true, sin firma), i2 ambos (con firma),
  // i3 solo-familia (sin envío al colegio).
  return [
    {
      id: "i1",
      child_id: "k1",
      date: "2026-10-05",
      category: "salud",
      description: "Se ha mareado",
      send_notification: true,
      requires_family_signature: false,
      reviewed: false,
      monitor_validated: false,
    },
    {
      id: "i2",
      child_id: "k2",
      date: "2026-10-05",
      category: "comedor",
      description: "No ha comido",
      send_notification: true,
      requires_family_signature: true,
      reviewed: true,
      monitor_validated: true,
    },
    {
      id: "i3",
      child_id: "k1",
      date: "2026-10-05",
      category: "descanso",
      description: "Solo familia",
      send_notification: false,
      requires_family_signature: false,
      reviewed: false,
      monitor_validated: false,
    },
  ];
}

test("colegio y ambos aparecen; solo-familia queda fuera", () => {
  const rows = buildSchoolSummaryIncidents({
    incidents: summaryIncidentRows(),
    children: summaryIncidentChildren(),
    permittedClassIds: new Set(["c1", "c2"]),
    date: monday(),
  });

  assert.deepEqual(
    rows.map((row) => row.incidentId),
    ["i1", "i2"],
  );
});

test("fechas distintas quedan fuera; solo la fecha local actual", () => {
  const rows = buildSchoolSummaryIncidents({
    incidents: [
      {
        id: "i-yesterday",
        child_id: "k1",
        date: "2026-10-04",
        category: "salud",
        description: "Ayer",
        send_notification: true,
        requires_family_signature: false,
      },
      {
        id: "i-tomorrow",
        child_id: "k1",
        date: "2026-10-06",
        category: "salud",
        description: "Mañana",
        send_notification: true,
        requires_family_signature: true,
      },
      {
        id: "i-today",
        child_id: "k1",
        date: "2026-10-05",
        category: "salud",
        description: "Hoy",
        send_notification: true,
        requires_family_signature: false,
      },
    ],
    children: summaryIncidentChildren(),
    permittedClassIds: new Set(["c1"]),
    date: monday(),
  });

  assert.deepEqual(
    rows.map((row) => row.incidentId),
    ["i-today"],
  );
});

test("no se filtra por reviewed ni por validación del monitor", () => {
  const rows = buildSchoolSummaryIncidents({
    incidents: [
      {
        id: "i-pending",
        child_id: "k1",
        date: "2026-10-05",
        category: "salud",
        description: "Pendiente",
        send_notification: true,
        reviewed: false,
        monitor_validated: false,
      },
      {
        id: "i-reviewed",
        child_id: "k1",
        date: "2026-10-05",
        category: "comedor",
        description: "Revisada",
        send_notification: true,
        reviewed: true,
        monitor_validated: true,
      },
      {
        id: "i-mixed",
        child_id: "k2",
        date: "2026-10-05",
        category: "otro",
        description: "Mixta",
        send_notification: true,
        reviewed: true,
        monitor_validated: false,
      },
    ],
    children: summaryIncidentChildren(),
    permittedClassIds: new Set(["c1"]),
    date: monday(),
  });

  assert.deepEqual(
    rows.map((row) => row.incidentId).sort(),
    ["i-mixed", "i-pending", "i-reviewed"],
  );
});

test("el ámbito del resumen excluye clases no permitidas y conserva identidad", () => {
  const rows = buildSchoolSummaryIncidents({
    incidents: summaryIncidentRows().concat([
      {
        id: "i4",
        child_id: "k3",
        date: "2026-10-05",
        category: "recogida",
        description: "Otra clase",
        send_notification: true,
        requires_family_signature: false,
      },
    ]),
    children: summaryIncidentChildren(),
    permittedClassIds: new Set(["c1"]),
    date: monday(),
  });

  assert.deepEqual(
    rows.map((row) => row.incidentId),
    ["i1", "i2"],
  );
  const first = rows.find((row) => row.incidentId === "i1");
  assert.equal(first?.childName, "Anna Puig");
  assert.equal(first?.category, "salud");
  assert.equal(first?.description, "Se ha mareado");
});

test("cada resultado muestra solo identidad, categoría, descripción y fecha", () => {
  const rows = buildSchoolSummaryIncidents({
    incidents: summaryIncidentRows(),
    children: summaryIncidentChildren(),
    permittedClassIds: new Set(["c1", "c2"]),
    date: monday(),
  });

  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      "category",
      "childId",
      "childName",
      "date",
      "description",
      "incidentId",
    ]);
  }
});

// --- seam acceso a datos (#54): incidencias del monitor con permiso efectivo ---

async function summaryIncidentsMigration() {
  const migrations = await migrationSources();
  const migration = migrations.find((m) =>
    m.file.includes("daily_summary_incidents"),
  );
  assert.ok(
    migration,
    "existe una migración para las incidencias del resumen",
  );
  return migration.sql;
}

test("el acceso directo del monitor a incidencias de clases deshabilitadas se rechaza", async () => {
  const sql = await summaryIncidentsMigration();

  assert.match(sql, /create policy incidents_select_monitor/);
  assert.match(sql, /current_user_can_access_child\(/);
  assert.match(sql, /monitor_daily_summary_enabled_for_child\(/);
});

test("el tenant y rol existentes de incidencias se conservan", async () => {
  const migrations = await migrationSources();
  const combined = migrations.map((m) => m.sql).join("\n");

  assert.match(combined, /create policy incidents_select_tenant/);
  assert.match(combined, /create policy incidents_select_parent/);
  assert.match(combined, /create policy incidents_select_monitor/);
});

// --- seam ruta protegida (#54): incidencias visibles antes de elegir clase ---

test("la raíz protegida muestra las incidencias de hoy para el colegio", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /buildSchoolSummaryIncidents/);
  assert.match(page, /from\("incidents"\)/);
  assert.match(page, /Incidencias de hoy para el colegio/);
  assert.match(page, /incidentCategoryLabel/);
  assert.match(page, /incidentAudienceLabelFromIndicators/);
  assert.match(page, /description/);
});

test("el resumen no filtra incidencias por revisión ni validación", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /buildSchoolSummaryIncidents/);
  assert.doesNotMatch(page, /\.eq\("reviewed"/);
  assert.doesNotMatch(page, /\.eq\("monitor_validated"/);
});
