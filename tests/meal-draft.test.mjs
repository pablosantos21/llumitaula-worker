import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  buildMealDraftKey,
  clearMealDrafts,
  isMealDraftModified,
  isMealRowModified,
  isPureTodo,
  loadMealDrafts,
  persistMealDrafts,
  reconcileMealDraftsOnReconfirm,
  touchMealDraft,
} from "../src/lib/mealDraft.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
    _data: data,
  };
}

// --- lib: clave por escuela:clase:fecha:tipo ---

test("la clave del borrador distingue escuela, clase, fecha y tipo", () => {
  const base = buildMealDraftKey({
    schoolId: "s1",
    classId: "c1",
    date: "2026-10-07",
    mealTypeId: "mt-1",
  });
  assert.notEqual(
    base,
    buildMealDraftKey({
      schoolId: "s2",
      classId: "c1",
      date: "2026-10-07",
      mealTypeId: "mt-1",
    }),
  );
  assert.notEqual(
    base,
    buildMealDraftKey({
      schoolId: "s1",
      classId: "c2",
      date: "2026-10-07",
      mealTypeId: "mt-1",
    }),
  );
  assert.notEqual(
    base,
    buildMealDraftKey({
      schoolId: "s1",
      classId: "c1",
      date: "2026-10-08",
      mealTypeId: "mt-1",
    }),
  );
  assert.notEqual(
    base,
    buildMealDraftKey({
      schoolId: "s1",
      classId: "c1",
      date: "2026-10-07",
      mealTypeId: "mt-2",
    }),
  );
});

// --- lib: solo tocados, marca y limpieza ---

test("Todo con notas cuenta como modificado; Todo sin notas limpia la marca", () => {
  assert.equal(isPureTodo("todo", null), true);
  assert.equal(isPureTodo("todo", "  "), true);
  assert.equal(isPureTodo("todo", "nota"), false);
  assert.equal(isPureTodo("nada", null), false);
  assert.equal(isMealDraftModified("todo", ""), false);
  assert.equal(isMealDraftModified("todo", "   "), false);
  assert.equal(isMealDraftModified("todo", "come despacio"), true);
  assert.equal(isMealDraftModified("nada", ""), true);

  let drafts = {};
  drafts = touchMealDraft(
    drafts,
    "a",
    { status: "todo", notes: "come despacio" },
    "2026-10-07T10:00:00.000Z",
  );
  assert.ok("a" in drafts);

  drafts = touchMealDraft(
    drafts,
    "a",
    { status: "todo", notes: "" },
    "2026-10-07T11:00:00.000Z",
  );
  assert.ok(!("a" in drafts));
});

test("el borrador solo guarda alumnos tocados y sobrevive a recarga", () => {
  const storage = memoryStorage();
  const key = buildMealDraftKey({
    schoolId: "s1",
    classId: "c1",
    date: "2026-10-07",
    mealTypeId: "mt-1",
  });
  let drafts = {};
  drafts = touchMealDraft(
    drafts,
    "a",
    { status: "casi_nada", notes: "mitad" },
    "2026-10-07T10:00:00.000Z",
  );
  persistMealDrafts(storage, key, drafts);

  const reloaded = loadMealDrafts(storage, key);
  assert.deepEqual(Object.keys(reloaded), ["a"]);
  assert.equal(reloaded.a.status, "casi_nada");
  assert.equal(reloaded.a.notes, "mitad");

  clearMealDrafts(storage, key);
  assert.deepEqual(loadMealDrafts(storage, key), {});
});

test("el borrador corrupto se ignora sin romper", () => {
  const storage = memoryStorage({ k: "no-json{{{" });
  assert.deepEqual(loadMealDrafts(storage, "k"), {});
  assert.deepEqual(loadMealDrafts(memoryStorage(), "missing"), {});
});

test("la fila marca modificado con borrador o con valor guardado editado", () => {
  assert.equal(
    isMealRowModified(
      { status: "casi_todo", notes: "", updatedAt: "x" },
      undefined,
    ),
    true,
  );
  assert.equal(
    isMealRowModified(
      { status: "todo", notes: "lento", updatedAt: "x" },
      undefined,
    ),
    true,
  );
  assert.equal(isMealRowModified(undefined, undefined), false);
  assert.equal(
    isMealRowModified(undefined, { status: "todo", notes: null }),
    false,
  );
  assert.equal(
    isMealRowModified(undefined, { status: "todo", notes: "  " }),
    false,
  );
  assert.equal(
    isMealRowModified(undefined, { status: "nada", notes: null }),
    true,
  );
  assert.equal(
    isMealRowModified(undefined, { status: "todo", notes: "nota" }),
    true,
  );
});

// --- lib: re-confirmación ---

test("re-confirmar: nuevo presente consigue Todo virtual sin tocar el borrador", () => {
  const result = reconcileMealDraftsOnReconfirm({
    prevPresentIds: ["a"],
    nextPresentIds: ["a", "b"],
    drafts: {
      a: { status: "nada", notes: "", updatedAt: "2026-10-07T10:00:00.000Z" },
    },
    savedRecords: [],
  });
  assert.deepEqual(result.drafts, {
    a: { status: "nada", notes: "", updatedAt: "2026-10-07T10:00:00.000Z" },
  });
  assert.deepEqual(result.purgeChildIds, []);
});

test("re-confirmar: el ausente sale del borrador y solo se purga el todo puro", () => {
  const result = reconcileMealDraftsOnReconfirm({
    prevPresentIds: ["a", "b", "c"],
    nextPresentIds: ["a"],
    drafts: {
      b: { status: "nada", notes: "", updatedAt: "t" },
      c: { status: "todo", notes: "nota", updatedAt: "t" },
    },
    savedRecords: [
      { child_id: "b", status: "todo", notes: null },
      { child_id: "c", status: "todo", notes: "nota" },
    ],
  });
  assert.deepEqual(result.drafts, {});
  assert.deepEqual(result.purgeChildIds, ["b"]);
});

test("re-confirmar: nunca se sobrescribe un valor editado ni se purga con notas", () => {
  const drafts = {
    a: { status: "casi_todo", notes: "", updatedAt: "t" },
  };
  const result = reconcileMealDraftsOnReconfirm({
    prevPresentIds: ["a", "b"],
    nextPresentIds: ["a"],
    drafts,
    savedRecords: [
      { child_id: "a", status: "nada", notes: null },
      { child_id: "b", status: "casi_nada", notes: null },
    ],
  });
  assert.deepEqual(result.drafts, drafts);
  assert.deepEqual(result.purgeChildIds, []);
});

test("re-confirmar sin cambios no toca nada", () => {
  const drafts = {
    a: { status: "nada", notes: "", updatedAt: "t" },
  };
  const result = reconcileMealDraftsOnReconfirm({
    prevPresentIds: ["a"],
    nextPresentIds: ["a"],
    drafts,
    savedRecords: [{ child_id: "a", status: "todo", notes: null }],
  });
  assert.deepEqual(result.drafts, drafts);
  assert.deepEqual(result.purgeChildIds, []);
});

// --- UI: BusinessApp ---

test("el borrador vive en localStorage por escuela:clase:fecha:tipo y se precarga", async () => {
  const app = await source("src/components/BusinessApp.tsx");
  assert.match(app, /localStorage/);
  assert.match(app, /buildMealDraftKey/);
  assert.match(app, /loadMealDrafts/);
  assert.match(app, /persistMealDrafts|setItem/);
  assert.match(app, /clearMealDrafts|removeItem/);
});

test("la fila muestra marca Modificado y el Todo intacto va atenuado", async () => {
  const app = await source("src/components/BusinessApp.tsx");
  assert.match(app, /Modificado/);
  assert.match(app, /isMealRowModified|mealDrafts\[child\.id\]/);
});

test("re-confirmar ajusta borrador sin perder ediciones y purga solo todo puro", async () => {
  const app = await source("src/components/BusinessApp.tsx");
  assert.match(app, /reconcileMealDraftsOnReconfirm/);
  assert.match(app, /purgeChildIds/);
  assert.match(app, /purgeAbsentPureTodoMeals/);
  assert.match(app, /\.eq\("status", "todo"\)/);
});

test("sin conexión guardar queda bloqueado con aviso y el borrador se conserva", async () => {
  const app = await source("src/components/BusinessApp.tsx");
  const saveFn = app.match(
    /async function saveMealList\(\) \{[\s\S]*?\n {2}\}/,
  );
  assert.ok(saveFn, "expected a saveMealList function");
  assert.match(saveFn[0], /isOffline/);
  assert.match(app, /Sin conexión.*borrador|borrador.*Sin conexión/i);
  assert.match(saveFn[0], /setMealDrafts|clearMealDrafts/);
});

test("la subida solo ocurre con pulsación explícita", async () => {
  const app = await source("src/components/BusinessApp.tsx");
  assert.match(app, /Guardar lista de comida/);
  assert.doesNotMatch(app, /useEffect\(\(\) => \{\s*\n?.*saveMealList\(\)/);
});
