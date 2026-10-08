import { getLunchWeekday, isWeekend } from "./daily-list.ts";

export const DAILY_SUMMARY_CAPABILITY = "monitor_daily_summary";

interface EffectiveCapabilityInput {
  classOverride?: boolean | null;
  schoolEnabled?: boolean | null;
  defaultEnabled?: boolean | null;
}

/**
 * Permiso efectivo del resumen: el ajuste de clase prevalece, seguido por
 * el del colegio; sin configurar conserva el comportamiento por defecto
 * de la capacidad (habilitado).
 */
export function resolveDailySummaryEnabled(
  input: EffectiveCapabilityInput,
): boolean {
  if (input.classOverride !== null && input.classOverride !== undefined) {
    return input.classOverride;
  }
  if (input.schoolEnabled !== null && input.schoolEnabled !== undefined) {
    return input.schoolEnabled;
  }
  if (input.defaultEnabled !== null && input.defaultEnabled !== undefined) {
    return input.defaultEnabled;
  }
  return true;
}

interface ClassRef {
  id: string;
  school_id?: string | null;
}

interface SummaryCapabilityState {
  classOverrides?: Record<string, boolean | undefined>;
  schoolEnabledBySchool?: Record<string, boolean | undefined>;
  defaultEnabled?: boolean | null;
}

/**
 * Clases con el permiso efectivo habilitado. Sin clases permitidas el
 * resumen no se muestra, pero la selección de clase sigue disponible.
 */
export function permittedClassIds(
  classes: readonly ClassRef[],
  capability: SummaryCapabilityState,
): Set<string> {
  const permitted = new Set<string>();
  for (const classItem of classes) {
    const enabled = resolveDailySummaryEnabled({
      classOverride: capability.classOverrides?.[classItem.id] ?? null,
      schoolEnabled:
        classItem.school_id != null
          ? (capability.schoolEnabledBySchool?.[classItem.school_id] ?? null)
          : null,
      defaultEnabled: capability.defaultEnabled,
    });
    if (enabled) permitted.add(classItem.id);
  }
  return permitted;
}

interface ChildRef {
  id: string;
  class_id: string | null;
}

type LunchByChild =
  | Map<string, readonly number[]>
  | Record<string, readonly number[] | undefined>;

function weekdaysFor(
  lunchByChild: LunchByChild,
  childId: string,
): readonly number[] | undefined {
  if (lunchByChild instanceof Map) return lunchByChild.get(childId);
  return lunchByChild[childId];
}

export interface SchoolForecast {
  expectedCount: number;
  expectedChildIds: string[];
  incompleteCount: number;
  incompleteChildIds: string[];
  isIncomplete: boolean;
  isNoServiceDay: boolean;
}

interface SchoolForecastInput {
  children: readonly ChildRef[];
  lunchByChild: LunchByChild;
  permittedClassIds: Set<string> | readonly string[];
  date?: Date;
}

/**
 * Previsión escolar derivada del horario: un niño es previsto cuando el día
 * actual está en sus días de comedor configurados y su clase está
 * permitida. Sin horario configurado es previsión incompleta, no ausencia.
 * Un día sin servicio (fin de semana) es estado explícito; horarios vacíos
 * o ausentes nunca infieren un cierre.
 */
export function buildSchoolForecast(
  input: SchoolForecastInput,
): SchoolForecast {
  const date = input.date ?? new Date();
  const isNoServiceDay = isWeekend(date);
  const permitted =
    input.permittedClassIds instanceof Set
      ? input.permittedClassIds
      : new Set(input.permittedClassIds);

  if (isNoServiceDay) {
    return {
      expectedCount: 0,
      expectedChildIds: [],
      incompleteCount: 0,
      incompleteChildIds: [],
      isIncomplete: false,
      isNoServiceDay: true,
    };
  }

  const weekday = getLunchWeekday(date);
  const expectedChildIds: string[] = [];
  const incompleteChildIds: string[] = [];

  if (weekday === null) {
    return {
      expectedCount: 0,
      expectedChildIds: [],
      incompleteCount: 0,
      incompleteChildIds: [],
      isIncomplete: false,
      isNoServiceDay: true,
    };
  }

  for (const child of input.children) {
    if (!child.class_id || !permitted.has(child.class_id)) continue;
    const weekdays = weekdaysFor(input.lunchByChild, child.id);
    if (weekdays === undefined) {
      incompleteChildIds.push(child.id);
      continue;
    }
    if (weekdays.includes(weekday)) {
      expectedChildIds.push(child.id);
    }
  }

  return {
    expectedCount: expectedChildIds.length,
    expectedChildIds,
    incompleteCount: incompleteChildIds.length,
    incompleteChildIds,
    isIncomplete: incompleteChildIds.length > 0,
    isNoServiceDay: false,
  };
}
