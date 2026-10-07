import type { DailyListItem } from "./daily-list";
import type { Database } from "../types/database";

export type AttendanceRow =
  Database["public"]["Tables"]["daily_attendance"]["Row"];

export type AttendanceStatus = "never-passed" | "confirmed-empty" | "confirmed";

export interface AttendanceSummary {
  status: AttendanceStatus;
  total: number;
  presentCount: number;
  absentCount: number;
}

export interface AttendanceConfirmationMeta {
  confirmedBy: string;
  confirmedAt: string;
}

type SavedMark = Pick<
  AttendanceRow,
  "child_id" | "present" | "confirmed_by" | "confirmed_at"
>;

/**
 * Estado de la lista del día: sin filas es "aún no pasado"; con filas y
 * nadie presente es "confirmado vacío" y queda distinguible.
 */
export function summarizeAttendance(
  rows: readonly SavedMark[],
): AttendanceSummary {
  if (rows.length === 0) {
    return {
      status: "never-passed",
      total: 0,
      presentCount: 0,
      absentCount: 0,
    };
  }
  const presentCount = rows.filter((row) => row.present).length;
  return {
    status: presentCount === 0 ? "confirmed-empty" : "confirmed",
    total: rows.length,
    presentCount,
    absentCount: rows.length - presentCount,
  };
}

/**
 * La asistencia ya guardada prevalece sobre la lista inicial (pauta del día
 * más ajustes locales). No muta ninguna entrada.
 */
export function applyConfirmedAttendance(
  initial: readonly DailyListItem[],
  saved: readonly SavedMark[],
): DailyListItem[] {
  const presentByChild = new Map(
    saved.map((row) => [row.child_id, row.present]),
  );
  return initial.map((item) => ({
    ...item,
    present: presentByChild.has(item.childId)
      ? (presentByChild.get(item.childId) ?? item.present)
      : item.present,
  }));
}

export function getAttendanceConfirmationMeta(
  rows: readonly SavedMark[],
): AttendanceConfirmationMeta | null {
  if (rows.length === 0) return null;
  let latest = rows[0];
  for (const row of rows) {
    if (row.confirmed_at > latest.confirmed_at) latest = row;
  }
  return { confirmedBy: latest.confirmed_by, confirmedAt: latest.confirmed_at };
}

export function canConfirmAttendance(
  role: Database["public"]["Enums"]["user_role"] | null,
): boolean {
  return role === "monitor" || role === "admin";
}

/**
 * La lista solo desbloquea el registro cuando hay filas confirmadas hoy.
 * Sin filas es "aún no pasado" y el registro queda bloqueado.
 */
export function isAttendanceConfirmed(rows: readonly SavedMark[]): boolean {
  return rows.length > 0;
}

/**
 * Contrato para el registro posterior: solo los presentes de la lista
 * confirmada admiten valoración. Nada se infiere de registros pasados.
 */
export function confirmedPresentChildIds(rows: readonly SavedMark[]): string[] {
  if (rows.length === 0) return [];
  return rows.filter((row) => row.present).map((row) => row.child_id);
}

export function canRecordMeal(
  rows: readonly SavedMark[],
  childId: string,
): boolean {
  if (rows.length === 0) return false;
  return rows.some((row) => row.child_id === childId && row.present);
}

interface AttendanceRowsInput {
  dailyList: readonly DailyListItem[];
  classId: string;
  schoolId: string;
  attendanceDate: string;
  confirmedBy: string;
  confirmedAt: string;
}

/**
 * Una fila por alumno y fecha con marca presente/ausente más quién confirmó
 * y cuándo. La re-confirmación reutiliza la misma clave
 * (child_id, attendance_date) y sobrescribe en su lugar.
 */
export function buildAttendanceRows(
  input: AttendanceRowsInput,
): AttendanceRow[] {
  return input.dailyList.map((item) => ({
    child_id: item.childId,
    class_id: input.classId,
    school_id: input.schoolId,
    attendance_date: input.attendanceDate,
    present: item.present,
    confirmed_by: input.confirmedBy,
    confirmed_at: input.confirmedAt,
  }));
}
