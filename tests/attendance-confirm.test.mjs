import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("confirming persists the whole day list with authorship", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /from\("daily_attendance"\)/);
  assert.match(app, /attendance_date/);
  assert.match(app, /confirmed_by/);
  assert.match(app, /confirmed_at/);
  assert.match(app, /\.upsert\(/);
  assert.match(app, /onConflict:\s*["']child_id,attendance_date["']/);
});

test("reloading the class shows the list already confirmed today", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /applyConfirmedAttendance|attendanceRows/);
  assert.match(app, /summarizeAttendance|confirmed-empty|never-passed/);
  assert.match(app, /localDateString\(\)/);
});

test("empty confirmation needs an explicit gesture", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.match(app, /confirmEmpty|lista vacía|Confirmar.*vacío/i);
});

test("only monitors and admins of the centre can confirm", async () => {
  const app = await source("src/components/BusinessApp.tsx");
  const lib = await source("src/lib/attendance.ts");

  assert.match(lib, /canConfirmAttendance/);
  assert.match(app, /canConfirmAttendance|canConfirm/);
  assert.match(app, /canConfirmAttendance\(userRole\)/);
  assert.match(lib, /"admin"/);
  assert.match(lib, /"monitor"/);
});

test("confirming never writes the weekly pattern nor meal records", async () => {
  const app = await source("src/components/BusinessApp.tsx");

  assert.doesNotMatch(
    app,
    /from\("child_lunch_days"\)\s*\.\s*(upsert|update|insert)\(/,
  );
  const confirmFn = app.match(
    /async function confirmAttendance\(\) \{[\s\S]*?\n {2}\}/,
  );
  assert.ok(confirmFn, "expected a confirmAttendance function");
  assert.doesNotMatch(confirmFn[0], /from\("meal_records"\)/);
  assert.doesNotMatch(confirmFn[0], /from\("child_lunch_days"\)/);
});
