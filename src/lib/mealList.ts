import {
  MEAL_NOTES_MAX_LENGTH,
  overallMealStatus,
  type MealStatus,
} from "./mealRecord.ts";

export interface VirtualMealEntry {
  childId: string;
  firstCourse: MealStatus;
  secondCourse: MealStatus;
  dessert: MealStatus;
  notes: string;
}

export interface SavedMealRef {
  child_id: string;
  /** Fila anterior a los platos: se replica a los tres. */
  status?: MealStatus;
  first_course?: MealStatus | null;
  second_course?: MealStatus | null;
  dessert?: MealStatus | null;
  notes: string | null;
}

interface MealTypeRef {
  id: string;
  active?: boolean;
  sort_order?: number;
}

/**
 * Lista virtual de comida: un Todo pre-seleccionado por plato y presente,
 * sin escribir aún en meal_records. Si ya existe un registro guardado hoy
 * para ese alumno, se usa como punto de partida para re-guardar.
 * No muta ninguna entrada.
 */
export function buildVirtualMealList(
  presentChildIds: readonly string[],
  saved: readonly SavedMealRef[] = [],
): VirtualMealEntry[] {
  const savedByChild = new Map(
    saved.map((row) => [row.child_id, row] as const),
  );
  return presentChildIds.map((childId) => {
    const existing = savedByChild.get(childId);
    if (!existing)
      return {
        childId,
        firstCourse: "todo" as const,
        secondCourse: "todo" as const,
        dessert: "todo" as const,
        notes: "",
      };
    const fallback = existing.status ?? "todo";
    return {
      childId,
      firstCourse: existing.first_course ?? fallback,
      secondCourse: existing.second_course ?? fallback,
      dessert: existing.dessert ?? fallback,
      notes: existing.notes ?? "",
    };
  });
}

/**
 * Ajuste de un alumno en la lista virtual. Devuelve una lista nueva sin
 * mutar la original; un childId desconocido deja la lista intacta.
 */
export function applyMealDraft(
  list: readonly VirtualMealEntry[],
  childId: string,
  patch: {
    firstCourse?: MealStatus;
    secondCourse?: MealStatus;
    dessert?: MealStatus;
    notes?: string;
  },
): VirtualMealEntry[] {
  let found = false;
  const next = list.map((entry) => {
    if (entry.childId !== childId) return { ...entry };
    found = true;
    return {
      ...entry,
      ...(patch.firstCourse !== undefined
        ? { firstCourse: patch.firstCourse }
        : null),
      ...(patch.secondCourse !== undefined
        ? { secondCourse: patch.secondCourse }
        : null),
      ...(patch.dessert !== undefined ? { dessert: patch.dessert } : null),
      ...(patch.notes !== undefined ? { notes: patch.notes } : null),
    };
  });
  return found ? next : list.map((entry) => ({ ...entry }));
}

/**
 * Tipo de comida implícito: primer meal_type activo por sort_order. La UI
 * ya no expone selector (una sola comida al día); sin tipo no hay
 * escrituras ni relleno retroactivo: se devuelve "" y el guardado conjunto
 * no escribe.
 */
export function pickDefaultMealTypeId(
  mealTypes: readonly MealTypeRef[],
): string {
  const actives = mealTypes.filter((type) => type.active !== false);
  if (actives.length === 0) return "";
  const ordered = [...actives].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  return ordered[0]?.id ?? "";
}

export interface MealListRow {
  child_id: string;
  meal_type_id: string;
  recorded_date: string;
  recorded_by: string;
  recorded_at: string;
  status: MealStatus;
  first_course: MealStatus;
  second_course: MealStatus;
  dessert: MealStatus;
  notes: string | null;
}

interface MealListRowsInput {
  presentChildIds: readonly string[];
  drafts: readonly VirtualMealEntry[];
  mealTypeId: string;
  recordedDate: string;
  recordedBy: string;
  recordedAt: string;
}

function cleanNotes(notes: string): string | null {
  const clean = notes.trim().slice(0, MEAL_NOTES_MAX_LENGTH);
  return clean || null;
}

/**
 * Filas para el guardado conjunto: un upsert por cada presente con
 * recorded_date = attendance_date y el tipo de comida implícito.
 * status es la valoración global derivada (peor plato) para compat.
 * Lista vacía o sin tipo no produce ninguna fila.
 * Re-guardar el mismo día sobrescribe libremente (misma clave
 * child_id, meal_type_id, recorded_date).
 */
export function buildMealListRows(input: MealListRowsInput): MealListRow[] {
  if (input.presentChildIds.length === 0) return [];
  if (!input.mealTypeId) return [];
  const draftByChild = new Map(
    input.drafts.map((entry) => [entry.childId, entry] as const),
  );
  return input.presentChildIds.map((childId) => {
    const draft = draftByChild.get(childId);
    const courses = {
      firstCourse: draft?.firstCourse ?? "todo",
      secondCourse: draft?.secondCourse ?? "todo",
      dessert: draft?.dessert ?? "todo",
    } as const;
    return {
      child_id: childId,
      meal_type_id: input.mealTypeId,
      recorded_date: input.recordedDate,
      recorded_by: input.recordedBy,
      recorded_at: input.recordedAt,
      status: overallMealStatus(courses),
      first_course: courses.firstCourse,
      second_course: courses.secondCourse,
      dessert: courses.dessert,
      notes: draft ? cleanNotes(draft.notes) : null,
    };
  });
}
