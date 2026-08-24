import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("business pages keep protected React-only rendering", async () => {
  const [home, search, app] = await Promise.all([
    source("src/pages/index.astro"),
    source("src/pages/search.astro"),
    source("src/components/BusinessApp.tsx"),
  ]);

  assert.match(home, /BusinessApp[\s\S]*client:only="react"/);
  assert.match(search, /BusinessApp[\s\S]*client:only="react"/);
  assert.match(app, /supabase\.auth\.getSession\(\)/);
  assert.match(app, /from\("children"\)/);
  assert.match(app, /from\("meal_records"\)/);
  assert.match(app, /from\("meal_types"\)/);
  assert.doesNotMatch(home, /MOCK_STUDENTS|Ana Martínez|Biel Roca/);
  assert.doesNotMatch(search, /MOCK_STUDENTS|Ana Martínez|Biel Roca/);
});

test("React business UI restores card, meal status, incident and toast components", async () => {
  const paths = [
    "src/components/StudentCard.tsx",
    "src/components/MealStatusBadge.tsx",
    "src/components/IncidentModal.tsx",
    "src/components/FeedbackToast.tsx",
  ];
  await Promise.all(paths.map((path) => access(new URL(path, root))));

  const [card, badge, modal, toast, app] = await Promise.all([
    source(paths[0]),
    source(paths[1]),
    source(paths[2]),
    source(paths[3]),
    source("src/components/BusinessApp.tsx"),
  ]);

  assert.match(card, /onClick/);
  assert.match(badge, /Bien/);
  assert.match(badge, /Incidencia/);
  assert.match(modal, /No ha comido primero/);
  assert.match(modal, /Comentarios adicionales/);
  assert.match(toast, /role="status"/);
  assert.match(app, /Incidencia registrada/);
  assert.match(app, /meal_records.*update|update.*meal_records/s);
  assert.match(app, /recorded_by/);
});
