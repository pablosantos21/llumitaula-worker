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

export interface MealCourses {
  firstCourse: MealStatus;
  secondCourse: MealStatus;
  dessert: MealStatus;
}

export const MEAL_COURSES: readonly {
  key: keyof MealCourses;
  label: string;
}[] = [
  { key: "firstCourse", label: "Primero" },
  { key: "secondCourse", label: "Segundo" },
  { key: "dessert", label: "Postre" },
];

const MEAL_STATUS_RANK: Record<MealStatus, number> = {
  todo: 0,
  casi_todo: 1,
  casi_nada: 2,
  nada: 3,
};

/**
 * Valoración global derivada: el peor de los tres platos. Conserva la
 * regla histórica de la tarjeta (todo en todo = bien, cualquier otra
 * cosa = incidencia) y es lo que se escribe en la columna legacy
 * meal_records.status.
 */
export function overallMealStatus(courses: MealCourses): MealStatus {
  let worst: MealStatus = "todo";
  for (const course of [
    courses.firstCourse,
    courses.secondCourse,
    courses.dessert,
  ] as const) {
    if (MEAL_STATUS_RANK[course] > MEAL_STATUS_RANK[worst]) {
      worst = course;
    }
  }
  return worst;
}

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
    pillClass: "border-emerald-100 bg-emerald-50 text-emerald-700",
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
  firstCourse: MealStatus;
  secondCourse: MealStatus;
  dessert: MealStatus;
  notes: string;
}

export function buildMealRecordPayload(values: MealRecordFormValues) {
  return {
    childId: values.childId,
    firstCourse: values.firstCourse,
    secondCourse: values.secondCourse,
    dessert: values.dessert,
    status: overallMealStatus(values),
    notes: values.notes.trim().slice(0, MEAL_NOTES_MAX_LENGTH) || null,
  };
}
