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

interface AllergyChildRef {
  id: string;
  class_id: string | null;
  first_name: string;
  last_name: string;
}

export interface ExpectedDinerAllergy {
  childId: string;
  childName: string;
  allergenNames: string[];
}

type AllergenIdsByChild =
  | Map<string, readonly string[]>
  | Record<string, readonly string[] | undefined>;

type AllergenNamesById =
  Map<string, string> | Record<string, string | undefined>;

function allergenIdsFor(
  childAllergenIds: AllergenIdsByChild,
  childId: string,
): readonly string[] | undefined {
  if (childAllergenIds instanceof Map) return childAllergenIds.get(childId);
  return childAllergenIds[childId];
}

function allergenNameFor(
  allergenNames: AllergenNamesById,
  allergenId: string,
): string | undefined {
  if (allergenNames instanceof Map) return allergenNames.get(allergenId);
  return allergenNames[allergenId];
}

interface ExpectedDinerAllergiesInput {
  children: readonly AllergyChildRef[];
  lunchByChild: LunchByChild;
  permittedClassIds: Set<string> | readonly string[];
  childAllergenIds: AllergenIdsByChild;
  allergenNames: AllergenNamesById;
  date?: Date;
}

/**
 * Alergias de los comensales previstos: solo niños cuyo horario de comedor
 * incluye hoy y cuya clase está permitida, y solo cuando tienen alérgenos
 * asociados. Cada resultado muestra la identidad del niño y los nombres de
 * sus alérgenos; el modelo no dispone de gravedad, reacciones, tratamientos
 * ni indicaciones clínicas y no se infieren. Un día sin servicio devuelve una
 * lista vacía sin inferir cierres.
 */
export function buildExpectedDinerAllergies(
  input: ExpectedDinerAllergiesInput,
): ExpectedDinerAllergy[] {
  const date = input.date ?? new Date();
  const weekday = getLunchWeekday(date);
  if (weekday === null) return [];
  const permitted =
    input.permittedClassIds instanceof Set
      ? input.permittedClassIds
      : new Set(input.permittedClassIds);

  const rows: ExpectedDinerAllergy[] = [];
  for (const child of input.children) {
    if (!child.class_id || !permitted.has(child.class_id)) continue;
    const weekdays = weekdaysFor(input.lunchByChild, child.id);
    if (weekdays === undefined || !weekdays.includes(weekday)) continue;
    const names = new Set<string>();
    for (const allergenId of allergenIdsFor(input.childAllergenIds, child.id) ??
      []) {
      const name = allergenNameFor(input.allergenNames, allergenId)?.trim();
      if (name) names.add(name);
    }
    if (names.size === 0) continue;
    rows.push({
      childId: child.id,
      childName: `${child.first_name} ${child.last_name}`.trim(),
      allergenNames: [...names].sort((a, b) => a.localeCompare(b, "es")),
    });
  }

  rows.sort((a, b) => a.childName.localeCompare(b.childName, "es"));
  return rows;
}
