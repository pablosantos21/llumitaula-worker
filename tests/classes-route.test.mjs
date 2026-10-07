import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("classes route is protected as the root path in the React router", async () => {
  const router = await source("src/app/router.tsx");

  assert.match(router, /path:\s*["']\/["']/);
  assert.match(router, /ClassesPage/);
  assert.match(router, /<RequireSession>/);
  assert.match(router, /path:\s*["']\/["']\s*,\s*element:\s*\(\s*<RequireSession>/s);
});

test("classes route lists classes with counts and children with day incidence mark", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /aria-label=["']Clases["']/);
  assert.match(page, /buildClassList/);
  assert.match(page, /childrenInClass/);
  assert.match(page, /classById|selectedClassId/);
  assert.match(page, /from\("classes"\)/);
  assert.match(page, /from\("children"\)/);
  assert.match(page, /1 alumno|alumnos/);
  assert.match(page, /function statusFor\(records: MealRecord\[\], incidents: Incident\[\]\)/);
  assert.match(page, /overallMealStatus\(courses\) !== "todo"/);
  assert.match(page, /from\("incidents"\)/);
});

test("daily attendance confirms with author and moment; comedor requires confirmed attendance", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /from\("daily_attendance"\)/);
  assert.match(page, /attendance_date/);
  assert.match(page, /confirmed_by/);
  assert.match(page, /confirmed_at/);
  assert.match(page, /\.upsert\(/);
  assert.match(page, /onConflict:\s*["']child_id,attendance_date["']/);
  assert.match(page, /buildAttendanceRows/);
  assert.match(page, /getAttendanceConfirmationMeta|confirmedByName/);
  assert.match(page, /isAttendanceConfirmed|attendanceConfirmed/);
  assert.match(page, /canRecordMeal|confirmedPresentChildIds/);
  assert.match(page, /Confirma la lista para habilitar el registro/);
  assert.match(page, /Ausente hoy/);
});

test("local draft by school, class, date and type stays separate from joint persistence", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /buildMealDraftKey/);
  assert.match(page, /loadMealDrafts/);
  assert.match(page, /persistMealDrafts/);
  assert.match(page, /clearMealDrafts/);
  assert.match(page, /localStorage/);
  assert.match(page, /schoolId.*classId.*date.*mealTypeId|school_id.*classId/s);
  assert.match(page, /async function saveMealList\(/);
  assert.match(page, /buildMealListRows\(/);
  assert.match(page, /onConflict:\s*["']child_id,meal_type_id,recorded_date["']/);
  assert.match(page, /Guardar lista de comida/);
});

test("valuation edit keeps primero, segundo, postre notes without duplicating records", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /handleMealModalSave/);
  assert.match(page, /Primero/);
  assert.match(page, /Segundo/);
  assert.match(page, /Postre/);
  assert.match(page, /Ajustar comida de/);
  assert.match(page, /initialCourses/);
  assert.match(page, /initialNotes/);
  assert.match(page, /Modificado/);
  assert.match(page, /isMealRowModified/);
  assert.match(page, /reconcileMealDraftsOnReconfirm/);
  assert.match(page, /purgeAbsentPureTodoMeals/);
});

test("classes route loads authorized data in parallel without mocks or offline fabrication", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /supabase\.auth\.getSession\(\)/);
  assert.match(page, /Promise\.all\(\[/);
  assert.match(page, /from\("children"\)/);
  assert.match(page, /from\("classes"\)/);
  assert.match(page, /from\("meal_records"\)/);
  assert.match(page, /from\("incidents"\)/);
  assert.match(page, /from\("meal_types"\)/);
  assert.match(page, /Sin conexión/);
  assert.doesNotMatch(page, /MOCK_STUDENTS|Ana Martínez|Biel Roca/);
  assert.doesNotMatch(page, /window\.location\.assign/);
  assert.doesNotMatch(page, /from\("TopNav"|import TopNav/);
});

test("classes route navigates through the router without full reloads", async () => {
  const page = await source("src/routes/ClassesPage.tsx");

  assert.match(page, /useNavigate/);
  assert.match(page, /navigate\(["']\/setup["']\)/);
  assert.doesNotMatch(page, /window\.location\.assign/);
});

test("classes route files are part of the application surface", async () => {
  await Promise.all([
    access(new URL("src/routes/ClassesPage.tsx", root)),
    access(new URL("src/app/router.tsx", root)),
  ]);
});
