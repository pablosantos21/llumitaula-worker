import type { MealCourses, MealStatus } from "./mealRecord.ts";

export interface MealDraftValue extends MealCourses {
  notes: string;
  updatedAt: string;
}

export type MealDraftMap = Record<string, MealDraftValue>;

export interface MealDraftKeyInput {
  schoolId: string;
  classId: string;
  date: string;
  mealTypeId: string;
}

interface MealStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const MEAL_STATUSES: readonly MealStatus[] = [
  "todo",
  "casi_todo",
  "casi_nada",
  "nada",
];

/**
 * Borrador en dispositivo: clave por escuela:clase:fecha:tipo. Solo los
 * alumnos tocados viven en el mapa (childId -> valor por plato, notas,
 * modificadoEn). El tipo sigue en la clave como discriminante implícito
 * aunque la UI ya no lo exponga.
 */
export function buildMealDraftKey(input: MealDraftKeyInput): string {
  const parts = [
    input.schoolId || "sin-escuela",
    input.classId || "sin-clase",
    input.date || "sin-fecha",
    input.mealTypeId || "sin-tipo",
  ];
  return `meal-draft:${parts.join(":")}`;
}

/** Platos de una fila guardada, con réplica del status legacy si faltan. */
export function savedCourses(saved: {
  status?: MealStatus;
  first_course?: MealStatus | null;
  second_course?: MealStatus | null;
  dessert?: MealStatus | null;
}): MealCourses {
  const fallback = saved.status ?? "todo";
  return {
    firstCourse: saved.first_course ?? fallback,
    secondCourse: saved.second_course ?? fallback,
    dessert: saved.dessert ?? fallback,
  };
}

/**
 * Todo puro sin notas: el valor intacto que ni el borrador ni la fila marcan
 * como modificado, y el único que la re-confirmación puede purgar.
 */
export function isPureTodo(
  courses: MealCourses,
  notes: string | null,
): boolean {
  if (
    courses.firstCourse !== "todo" ||
    courses.secondCourse !== "todo" ||
    courses.dessert !== "todo"
  )
    return false;
  return (notes ?? "").trim().length === 0;
}

/**
 * Guardar en el modal aunque deje Todo pero con notas cuenta como modificado;
 * revertir a Todo en los tres platos sin notas limpia la marca.
 */
export function isMealDraftModified(
  courses: MealCourses,
  notes: string,
): boolean {
  return !isPureTodo(courses, notes);
}

/**
 * Toca el borrador de un alumno. Devuelve un mapa nuevo sin mutar el
 * original; volver a Todo en los tres platos sin notas elimina la entrada
 * (limpia la marca).
 */
export function touchMealDraft(
  drafts: MealDraftMap,
  childId: string,
  patch: {
    firstCourse?: MealStatus;
    secondCourse?: MealStatus;
    dessert?: MealStatus;
    notes?: string;
  },
  nowIso: string = new Date().toISOString(),
): MealDraftMap {
  const current = drafts[childId];
  const courses: MealCourses = {
    firstCourse: patch.firstCourse ?? current?.firstCourse ?? "todo",
    secondCourse: patch.secondCourse ?? current?.secondCourse ?? "todo",
    dessert: patch.dessert ?? current?.dessert ?? "todo",
  };
  const notes = patch.notes ?? current?.notes ?? "";
  if (!isMealDraftModified(courses, notes)) {
    if (!(childId in drafts)) return { ...drafts };
    const next = { ...drafts };
    delete next[childId];
    return next;
  }
  return {
    ...drafts,
    [childId]: { ...courses, notes, updatedAt: nowIso },
  };
}

function isValidDraftValue(value: unknown): value is MealDraftValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  // Acepta borradores nuevos por plato y los antiguos de un solo status.
  if (typeof candidate.notes !== "string") return false;
  if (typeof candidate.updatedAt !== "string") return false;
  const courses = ["firstCourse", "secondCourse", "dessert"].map(
    (key) => candidate[key],
  );
  if (
    courses.every(
      (course): course is MealStatus =>
        typeof course === "string" &&
        (MEAL_STATUSES as readonly string[]).includes(course),
    )
  ) {
    return true;
  }
  // Borrador antiguo {status, notes}: se migra a los tres platos.
  return (
    typeof candidate.status === "string" &&
    (MEAL_STATUSES as readonly string[]).includes(candidate.status)
  );
}

function normalizeDraftValue(value: MealDraftValue): MealDraftValue {
  const candidate = value as MealDraftValue & { status?: MealStatus };
  if (
    typeof candidate.firstCourse === "string" &&
    typeof candidate.secondCourse === "string" &&
    typeof candidate.dessert === "string"
  ) {
    return {
      firstCourse: candidate.firstCourse,
      secondCourse: candidate.secondCourse,
      dessert: candidate.dessert,
      notes: candidate.notes,
      updatedAt: candidate.updatedAt,
    };
  }
  const fallback = candidate.status ?? "todo";
  return {
    firstCourse: fallback,
    secondCourse: fallback,
    dessert: fallback,
    notes: candidate.notes,
    updatedAt: candidate.updatedAt,
  };
}

/**
 * Precarga del borrador al entrar a la clase. Lo corrupto o ausente se
 * ignora y devuelve un mapa vacío, sin lanzar.
 */
export function loadMealDrafts(
  storage: MealStorage | null | undefined,
  key: string,
): MealDraftMap {
  if (!storage || !key) return {};
  const raw = (() => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  })();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const next: MealDraftMap = {};
    for (const [childId, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (isValidDraftValue(value))
        next[childId] = normalizeDraftValue(value as MealDraftValue);
    }
    return next;
  } catch {
    return {};
  }
}

/**
 * Conserva el borrador en el dispositivo. Un mapa vacío elimina la clave
 * para no dejar restos.
 */
export function persistMealDrafts(
  storage: MealStorage | null | undefined,
  key: string,
  drafts: MealDraftMap,
): void {
  if (!storage || !key) return;
  try {
    if (Object.keys(drafts).length === 0) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify(drafts));
  } catch {
    // Sin almacenamiento disponible: el borrador en memoria sigue valiendo.
  }
}

/** Limpieza al guardar OK. */
export function clearMealDrafts(
  storage: MealStorage | null | undefined,
  key: string,
): void {
  if (!storage || !key) return;
  try {
    storage.removeItem(key);
  } catch {
    // Sin almacenamiento disponible: nada que limpiar.
  }
}

interface SavedMealValue {
  status?: MealStatus;
  first_course?: MealStatus | null;
  second_course?: MealStatus | null;
  dessert?: MealStatus | null;
  notes: string | null;
}

/**
 * Marca de modificado en la fila: hay borrador tocado, o el valor guardado
 * en servidor ya viene editado (no Todo puro sin notas).
 */
export function isMealRowModified(
  draft: MealDraftValue | undefined,
  saved: SavedMealValue | undefined,
): boolean {
  if (draft) return true;
  if (!saved) return false;
  return !isPureTodo(savedCourses(saved), saved.notes);
}

interface ReconfirmInput {
  prevPresentIds: readonly string[];
  nextPresentIds: readonly string[];
  drafts: MealDraftMap;
  savedRecords: readonly (SavedMealValue & { child_id: string })[];
}

interface ReconfirmOutput {
  drafts: MealDraftMap;
  purgeChildIds: string[];
}

/**
 * Re-confirmación de asistencia sin perder ediciones:
 * - El nuevo presente consigue Todo virtual (sin entrada en el borrador).
 * - El presente que pasa a ausente sale del borrador.
 * - Su fila de servidor solo se purga si era Todo puro sin notas; un valor
 *   editado nunca se sobrescribe ni se borra.
 * - Sin cambios no se toca nada.
 */
export function reconcileMealDraftsOnReconfirm(
  input: ReconfirmInput,
): ReconfirmOutput {
  const nextSet = new Set(input.nextPresentIds);
  const savedByChild = new Map(
    input.savedRecords.map((row) => [row.child_id, row] as const),
  );

  let draftsChanged = false;
  const drafts: MealDraftMap = {};
  for (const [childId, value] of Object.entries(input.drafts)) {
    if (nextSet.has(childId)) {
      drafts[childId] = value;
    } else {
      draftsChanged = true;
    }
  }

  const prevSet = new Set(input.prevPresentIds);
  const purgeChildIds: string[] = [];
  for (const childId of prevSet) {
    if (nextSet.has(childId)) continue;
    const saved = savedByChild.get(childId);
    if (!saved) continue;
    if (!isPureTodo(savedCourses(saved), saved.notes)) continue;
    purgeChildIds.push(childId);
  }

  const sameDrafts =
    !draftsChanged &&
    Object.keys(drafts).length === Object.keys(input.drafts).length;
  return {
    drafts: sameDrafts ? input.drafts : drafts,
    purgeChildIds,
  };
}
