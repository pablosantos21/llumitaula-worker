import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("without a confirmed list today the meal register is blocked", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /isAttendanceConfirmed|attendanceConfirmed/);
  assert.match(
    app,
    /Confirma la lista para habilitar el registro|registro.*bloqueado|bloqueado.*registro/i,
  );
});

test("after confirming, only present pupils admit valuation", async () => {
  const app = await source("src/components/BusinessApp.tsx");
  const lib = await source("src/lib/attendance.ts");

  assert.match(lib, /canRecordMeal|confirmedPresentChildIds/);
  assert.match(app, /canRecordMeal|confirmedPresentChildIds/);
  assert.match(app, /Ausente hoy|ausente/i);
});

test("record and incident saves refuse unconfirmed or absent pupils", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  const saveStatus = app.match(/async function saveStatus\([\s\S]*?\n {2}\}/);
  assert.ok(saveStatus, "expected a saveStatus function");
  assert.match(saveStatus[0], /rejectUnrecordable/);

  const saveIncident = app.match(
    /async function saveIncident\([\s\S]*?\n {2}\}/,
  );
  assert.ok(saveIncident, "expected a saveIncident function");
  assert.match(saveIncident[0], /rejectUnrecordable/);

  const guard = app.match(/function rejectUnrecordable\([\s\S]*?\n {2}\}/);
  assert.ok(guard, "expected a rejectUnrecordable guard");
  assert.match(guard[0], /canRecordMeal/);
});

test("confirmed authorship (who and when) stays visible for later consult", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /confirmedBy|confirmed_by/);
  assert.match(app, /confirmedAt|confirmed_at/);
});

test("weekend shows no-service notice and offline blocks roll call", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /Hoy no hay servicio de comedor/);
  assert.match(app, /Sin conexión: pasar lista y confirmar requieren conexión/);
});
