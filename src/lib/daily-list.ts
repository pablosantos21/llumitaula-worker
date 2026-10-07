export type DailyListOrigin =
  "pauta" | "sin-configurar" | "sin-dias" | "fin-de-semana";

export interface DailyListItem {
  childId: string;
  present: boolean;
  origin: DailyListOrigin;
}

interface ChildRef {
  id: string;
}

type LunchByChild =
  | Map<string, readonly number[]>
  | Record<string, readonly number[] | undefined>;

/**
 * 1 = Lunes .. 5 = Viernes. Fines de semana devuelven null: no hay servicio
 * de comedor y nada debe inferirse de la pauta.
 */
export function getLunchWeekday(date: Date): number | null {
  const day = date.getDay();
  if (day === 0 || day === 6) return null;
  return day;
}

export function isWeekend(date: Date): boolean {
  return getLunchWeekday(date) === null;
}

function weekdaysFor(
  lunchByChild: LunchByChild,
  childId: string,
): readonly number[] | undefined {
  if (lunchByChild instanceof Map) return lunchByChild.get(childId);
  return lunchByChild[childId];
}

/**
 * Lista inicial del día: cada alumno pre-marcado según su pauta semanal y el
 * día actual. No muta `children` ni `lunchByChild`; el ajuste diario vive en
 * la lista devuelta y nunca escribe en la pauta habitual.
 */
export function buildInitialDailyList(
  children: readonly ChildRef[],
  lunchByChild: LunchByChild,
  date: Date = new Date(),
): DailyListItem[] {
  const weekday = getLunchWeekday(date);
  if (weekday === null) {
    return children.map((child) => ({
      childId: child.id,
      present: false,
      origin: "fin-de-semana" as const,
    }));
  }

  return children.map((child) => {
    const weekdays = weekdaysFor(lunchByChild, child.id);
    if (weekdays === undefined) {
      return {
        childId: child.id,
        present: false,
        origin: "sin-configurar" as const,
      };
    }
    if (weekdays.length === 0) {
      return {
        childId: child.id,
        present: false,
        origin: "sin-dias" as const,
      };
    }
    return {
      childId: child.id,
      present: weekdays.includes(weekday),
      origin: "pauta" as const,
    };
  });
}

/**
 * Ajuste diario de un alumno. Devuelve una lista nueva sin mutar la original
 * y sin tocar la pauta semanal.
 */
export function toggleDailyPresence(
  list: readonly DailyListItem[],
  childId: string,
): DailyListItem[] {
  return list.map((item) =>
    item.childId === childId
      ? { ...item, present: !item.present }
      : { ...item },
  );
}
