export type MealStatus = "todo" | "casi_todo" | "casi_nada" | "nada";

export const MEAL_NOTES_MAX_LENGTH = 280;

export const MEAL_STATUS_OPTIONS: readonly {
  value: MealStatus;
  label: string;
}[] = [
  { value: "todo", label: "Todo" },
  { value: "casi_todo", label: "Casi todo" },
  { value: "casi_nada", label: "Casi nada" },
  { value: "nada", label: "Nada" },
];

export interface MealStatusVisual {
  label: string;
  dotClass: string;
  textClass: string;
  pillClass: string;
}

/**
 * Visual final en tarjeta/lista: texto literal Todo / Casi todo /
 * Casi nada / Nada con color verde / verde-claro / ámbar / rojo.
 * El Todo por defecto se ve igual que un Todo explícito: el color
 * depende solo del valor, nunca de si la fila fue modificada.
 */
export const MEAL_STATUS_VISUAL: Record<MealStatus, MealStatusVisual> = {
  todo: {
    label: "Todo",
    dotClass: "bg-emerald-600",
    textClass: "text-emerald-700",
    pillClass:
      "border-emerald-100 bg-emerald-50 text-emerald-700",
  },
  casi_todo: {
    label: "Casi todo",
    dotClass: "bg-lime-500",
    textClass: "text-lime-700",
    pillClass: "border-lime-100 bg-lime-50 text-lime-700",
  },
  casi_nada: {
    label: "Casi nada",
    dotClass: "bg-amber-500",
    textClass: "text-amber-700",
    pillClass: "border-amber-100 bg-amber-50 text-amber-700",
  },
  nada: {
    label: "Nada",
    dotClass: "bg-red-600",
    textClass: "text-red-700",
    pillClass: "border-red-100 bg-red-50 text-red-700",
  },
};

export function mealStatusVisual(status: MealStatus): MealStatusVisual {
  return MEAL_STATUS_VISUAL[status] ?? MEAL_STATUS_VISUAL.todo;
}

export type MealEditRole = "admin" | "monitor" | "padre" | null;

/**
 * Ventana de edición (#35): mismo día cualquier monitor|admin del centro
 * cambia valor/notas libremente; días pasados el monitor queda en solo
 * lectura y el admin rectifica. Futuros nunca editables; el resto de
 * roles nunca edita en este issue.
 */
export function canEditMealForDate(
  role: MealEditRole,
  recordedDate: string,
  today: string,
): boolean {
  if (!role || !recordedDate || !today) return false;
  if (recordedDate > today) return false;
  if (role === "admin") return recordedDate <= today;
  if (role === "monitor") return recordedDate === today;
  return false;
}

export interface MealRecordFormValues {
  childId: string;
  mealTypeId: string;
  status: MealStatus;
  notes: string;
  noFirst: boolean;
  noSecond: boolean;
  noGarnish: boolean;
  noDessert: boolean;
  incidentComments: string;
}

export function buildMealRecordPayload(
  values: MealRecordFormValues,
  canManageIncidents: boolean,
) {
  const payload = {
    childId: values.childId,
    mealTypeId: values.mealTypeId,
    status: values.status,
    notes: values.notes.trim().slice(0, MEAL_NOTES_MAX_LENGTH) || null,
  };

  const hasIncident =
    values.noFirst ||
    values.noSecond ||
    values.noGarnish ||
    values.noDessert ||
    values.incidentComments.trim().length > 0;

  if (!canManageIncidents || !hasIncident) return payload;

  return {
    ...payload,
    incident: {
      noFirst: values.noFirst,
      noSecond: values.noSecond,
      noGarnish: values.noGarnish,
      noDessert: values.noDessert,
      comments: values.incidentComments.trim() || null,
    },
  };
}
