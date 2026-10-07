import { MEAL_NOTES_MAX_LENGTH, type MealStatus } from "./mealRecord.ts";

export interface VirtualMealEntry {
  childId: string;
  status: MealStatus;
  notes: string;
}

export interface SavedMealRef {
  child_id: string;
  status: MealStatus;
  notes: string | null;
}

interface MealTypeRef {
  id: string;
  active?: boolean;
  sort_order?: number;
}

/**
 * Lista virtual de comida: un Todo pre-seleccionado por cada presente,
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
    if (!existing) return { childId, status: "todo" as const, notes: "" };
    return {
      childId,
      status: existing.status,
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
  patch: { status?: MealStatus; notes?: string },
): VirtualMealEntry[] {
  let found = false;
  const next = list.map((entry) => {
    if (entry.childId !== childId) return { ...entry };
    found = true;
    return {
      ...entry,
      ...(patch.status !== undefined ? { status: patch.status } : null),
      ...(patch.notes !== undefined ? { notes: patch.notes } : null),
    };
  });
  return found ? next : list.map((entry) => ({ ...entry }));
}

/**
 * Primer meal_type activo por sort_order. Sin ese tipo no hay escrituras
 * ni relleno retroactivo: se devuelve "" y el guardado conjunto no escribe.
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
 * recorded_date = attendance_date y el primer meal_type activo.
 * Lista vacía o sin tipo de comida no produce ninguna fila.
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
    return {
      child_id: childId,
      meal_type_id: input.mealTypeId,
      recorded_date: input.recordedDate,
      recorded_by: input.recordedBy,
      recorded_at: input.recordedAt,
      status: draft?.status ?? "todo",
      notes: draft ? cleanNotes(draft.notes) : null,
    };
  });
}
