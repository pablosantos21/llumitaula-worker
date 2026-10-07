import { useEffect, useMemo, useState, type ReactNode } from "react";

import MealRecordModal from "./MealRecordModal";
import { supabase } from "../lib/supabase/client";
import { localDateString } from "../lib/local-date";
import { buildClassList, childrenInClass, classById } from "../lib/classes";
import {
  buildInitialDailyList,
  isWeekend,
  toggleDailyPresence,
  type DailyListItem,
} from "../lib/daily-list";
import {
  applyConfirmedAttendance,
  buildAttendanceRows,
  canConfirmAttendance,
  getAttendanceConfirmationMeta,
  summarizeAttendance,
  type AttendanceRow,
} from "../lib/attendance";
import type { MealStatus } from "../lib/mealRecord";
import type { Database } from "../types/database";
import FeedbackToast from "./FeedbackToast";
import StudentCard from "./StudentCard";

type Child = Database["public"]["Tables"]["children"]["Row"];
type SchoolClass = Database["public"]["Tables"]["classes"]["Row"];
type MealRecord = Database["public"]["Tables"]["meal_records"]["Row"];
type MealType = Database["public"]["Tables"]["meal_types"]["Row"];
type Incident = Database["public"]["Tables"]["incidents"]["Row"];
type CardStatus = "all_good" | "incident";

const ATTENDANCE_SELECT =
  "child_id, class_id, school_id, attendance_date, present, confirmed_by, confirmed_at";

function statusFor(records: MealRecord[], incidents: Incident[]): CardStatus {
  return records.some((record) => record.status !== "bien") ||
    incidents.length > 0
    ? "incident"
    : "all_good";
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-24 pt-10 text-center">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

export default function BusinessApp() {
  const [children, setChildren] = useState<Child[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [mealTypes, setMealTypes] = useState<MealType[]>([]);
  const [lunchByChild, setLunchByChild] = useState<Record<string, number[]>>(
    {},
  );
  const [presenceOverride, setPresenceOverride] = useState<
    Record<string, boolean>
  >({});
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [confirmingAttendance, setConfirmingAttendance] = useState(false);
  const [confirmEmptyChecked, setConfirmEmptyChecked] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [userRole, setUserRole] = useState<
    Database["public"]["Enums"]["user_role"] | null
  >(null);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "warning" | "error";
  } | null>(null);
  const [state, setState] = useState<
    "loading" | "signed-out" | "ready" | "error"
  >("loading");

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      const session = sessionData.session;
      if (!session) {
        setState("signed-out");
        return;
      }

      const [
        childrenResult,
        classesResult,
        recordsResult,
        incidentsResult,
        mealTypesResult,
        lunchDaysResult,
        userResult,
      ] = await Promise.all([
        supabase
          .from("children")
          .select("id, first_name, last_name, class_id, created_at")
          .order("last_name"),
        supabase.from("classes").select("id, name, school_id"),
        supabase
          .from("meal_records")
          .select(
            "id, child_id, meal_type_id, notes, recorded_date, recorded_at, recorded_by, status",
          )
          .eq("recorded_date", localDateString()),
        supabase
          .from("incidents")
          .select(
            "id, child_id, created_at, date, description, family_responded_at, family_response, family_seen, monitor_id, monitor_validated, requires_family_signature, reviewed, send_notification",
          )
          .eq("date", localDateString()),
        supabase
          .from("meal_types")
          .select("id, name, active, school_id, sort_order, created_at")
          .eq("active", true)
          .order("sort_order"),
        supabase.from("child_lunch_days").select("child_id, weekdays"),
        supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .single(),
      ]);
      if (!active) return;
      if (
        childrenResult.error ||
        classesResult.error ||
        recordsResult.error ||
        incidentsResult.error ||
        mealTypesResult.error ||
        lunchDaysResult.error ||
        userResult.error
      ) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setIsOffline(true);
        }
        setState("error");
        return;
      }
      setChildren(childrenResult.data ?? []);
      setClasses(classesResult.data ?? []);
      setRecords(recordsResult.data ?? []);
      setIncidents(incidentsResult.data ?? []);
      setMealTypes(mealTypesResult.data ?? []);
      const lunchMap: Record<string, number[]> = {};
      for (const row of lunchDaysResult.data ?? []) {
        lunchMap[row.child_id] = [...(row.weekdays ?? [])];
      }
      setLunchByChild(lunchMap);
      setUserRole(userResult.data.role);

      if (userResult.data.role === "monitor") {
        const { data: monitorResult } = await supabase
          .from("monitors")
          .select("id")
          .eq("user_id", session.user.id)
          .single();
        if (active && monitorResult) {
          setMonitorId(monitorResult.id);
        }
      }

      setState("ready");
    }

    void loadData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const classList = buildClassList(classes, children);
  const selectedClass = selectedClassId
    ? classById(classes, selectedClassId)
    : null;
  const visibleChildren = useMemo(
    () => (selectedClassId ? childrenInClass(children, selectedClassId) : []),
    [children, selectedClassId],
  );
  const today = useMemo(() => new Date(), []);
  const weekend = isWeekend(today);
  const initialDailyList: DailyListItem[] = useMemo(
    () => buildInitialDailyList(visibleChildren, lunchByChild, today),
    [visibleChildren, lunchByChild, today],
  );
  const dailyList: DailyListItem[] = useMemo(() => {
    const savedApplied =
      attendanceRows.length > 0
        ? applyConfirmedAttendance(initialDailyList, attendanceRows)
        : initialDailyList;
    return savedApplied.map((item) => ({
      ...item,
      present: presenceOverride[item.childId] ?? item.present,
    }));
  }, [initialDailyList, presenceOverride, attendanceRows]);
  const attendanceSummary = useMemo(
    () => summarizeAttendance(attendanceRows),
    [attendanceRows],
  );
  const attendanceMeta = useMemo(
    () => getAttendanceConfirmationMeta(attendanceRows),
    [attendanceRows],
  );
  const canConfirm = canConfirmAttendance(userRole);

  useEffect(() => {
    if (!selectedClassId || state !== "ready") return;
    const classId = selectedClassId;
    let active = true;

    async function loadAttendance() {
      const result = await supabase
        .from("daily_attendance")
        .select(ATTENDANCE_SELECT)
        .eq("class_id", classId)
        .eq("attendance_date", localDateString());
      if (!active) return;
      if (!result.error) {
        setAttendanceRows(result.data ?? []);
      }
    }

    void loadAttendance();
    return () => {
      active = false;
    };
  }, [selectedClassId, state]);

  function handleSelectClass(classId: string | null) {
    setSelectedClassId(classId);
    setPresenceOverride({});
    setAttendanceRows([]);
    setConfirmEmptyChecked(false);
  }

  async function confirmAttendance() {
    if (!selectedClass || confirmingAttendance) return;
    if (!canConfirm) {
      setToast({
        message: "Solo el monitor o la administración puede confirmar la lista",
        type: "error",
      });
      return;
    }
    const schoolId = selectedClass.school_id;
    if (!schoolId) {
      setToast({
        message: "No se ha podido confirmar la lista",
        type: "error",
      });
      return;
    }
    if (dailyList.length === 0) return;
    const presentCount = dailyList.filter((item) => item.present).length;
    if (presentCount === 0 && !confirmEmptyChecked) {
      setToast({
        message: "Marca la casilla para confirmar la lista vacía",
        type: "error",
      });
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setToast({
        message: "No se ha podido confirmar la lista",
        type: "error",
      });
      return;
    }
    setConfirmingAttendance(true);
    const rows = buildAttendanceRows({
      dailyList,
      classId: selectedClass.id,
      schoolId,
      attendanceDate: localDateString(),
      confirmedBy: session.user.id,
      confirmedAt: new Date().toISOString(),
    });
    const result = await supabase
      .from("daily_attendance")
      .upsert(rows, { onConflict: "child_id,attendance_date" })
      .select(ATTENDANCE_SELECT);
    setConfirmingAttendance(false);
    if (result.error) {
      setToast({
        message: "No se ha podido confirmar la lista",
        type: "error",
      });
      return;
    }
    setAttendanceRows(result.data ?? rows);
    setPresenceOverride({});
    setConfirmEmptyChecked(false);
    setToast({
      message:
        presentCount === 0
          ? "Lista confirmada sin presentes"
          : "Lista confirmada",
      type: "success",
    });
  }

  async function saveStatus(
    child: Child,
    mealTypeId: string,
    status: Database["public"]["Enums"]["meal_status"],
    notes: string,
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session || !mealTypeId) {
      setToast({ message: "No se ha podido guardar el estado", type: "error" });
      return;
    }

    // recorded_by references public.users(id): always the authenticated
    // user, for every role. The DB trigger and RLS enforce this.
    const recordedBy = session.user.id;

    const date = localDateString();
    const result = await supabase
      .from("meal_records")
      .upsert(
        {
          child_id: child.id,
          meal_type_id: mealTypeId,
          recorded_date: date,
          recorded_by: recordedBy,
          status,
          notes,
          recorded_at: new Date().toISOString(),
        },
        { onConflict: "child_id,meal_type_id,recorded_date" },
      )
      .select()
      .single();
    if (result.error) {
      setToast({ message: "No se ha podido guardar el estado", type: "error" });
      return;
    }
    const saved = result.data;
    setRecords((current) => [
      ...current.filter((record) => record.id !== saved.id),
      saved,
    ]);
    setSelectedChild(null);
    setToast({
      message:
        status === "bien"
          ? 'Marcado como "Ha comido bien"'
          : "Estado de comida guardado",
      type: status === "bien" ? "success" : "warning",
    });
  }

  async function saveIncident(
    child: Child,
    details: {
      mealTypeId: string;
      status: MealStatus;
      notes: string;
      noFirst: boolean;
      noSecond: boolean;
      noGarnish: boolean;
      noDessert: boolean;
      comments: string;
    },
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session || !canManageIncidents || !details.mealTypeId) {
      setToast({
        message: "No se puede registrar la incidencia",
        type: "error",
      });
      return;
    }

    const activeMonitorId = monitorId;
    const date = localDateString();
    const cleanComments = details.comments
      .replace(/\p{Cc}/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const description = [
      `No ha comido primero: ${details.noFirst ? "sí" : "no"}`,
      `No ha comido segundo: ${details.noSecond ? "sí" : "no"}`,
      `No ha comido guarnición: ${details.noGarnish ? "sí" : "no"}`,
      `No ha comido postre: ${details.noDessert ? "sí" : "no"}`,
      `Comentarios: ${cleanComments || "sin comentarios"}`,
    ].join("; ");
    if (!activeMonitorId) {
      setToast({
        message: "No se han podido cargar los datos de la incidencia",
        type: "error",
      });
      return;
    }

    const mealResult = await supabase.rpc("record_meal_incident", {
      p_child_id: child.id,
      p_description: description,
      p_meal_type_id: details.mealTypeId,
      p_monitor_id: activeMonitorId,
      p_notes: details.notes,
      p_recorded_at: new Date().toISOString(),
      p_recorded_date: date,
      p_status: details.status,
    });
    if (mealResult.error) {
      setToast({
        message: "No se han podido guardar la comida ni la incidencia",
        type: "error",
      });
      return;
    }

    const incidentsResult = await supabase
      .from("incidents")
      .select(
        "id, child_id, created_at, date, description, family_responded_at, family_response, family_seen, monitor_id, monitor_validated, requires_family_signature, reviewed, send_notification",
      )
      .eq("date", date);
    if (incidentsResult.error) {
      setToast({
        message:
          "Incidencia guardada, pero no se ha podido actualizar su estado",
        type: "error",
      });
      return;
    }
    setRecords((current) => [
      ...current.filter((record) => record.id !== mealResult.data.id),
      mealResult.data,
    ]);
    setIncidents(incidentsResult.data ?? []);

    setSelectedChild(null);
    setToast({ message: "Incidencia registrada", type: "warning" });
  }

  if (state === "loading")
    return (
      <p className="p-6 text-sm text-slate-500">
        Cargando datos autorizados...
      </p>
    );
  if (state === "signed-out")
    return (
      <section className="m-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Sesión no iniciada</h1>
        <p className="mt-2 text-sm text-slate-500">
          Inicia sesión para consultar los alumnos autorizados.
        </p>
        <a
          className="mt-4 inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white"
          href="/setup"
        >
          Configurar dispositivo
        </a>
      </section>
    );

  const canManageIncidents = userRole === "admin" || userRole === "monitor";

  function handleTogglePresence(childId: string) {
    // Ajuste solo local: nunca escribe en la pauta habitual ni persiste.
    const next = toggleDailyPresence(dailyList, childId);
    const nextPresent = next.find((item) => item.childId === childId)?.present;
    setPresenceOverride((current) => ({
      ...current,
      [childId]: nextPresent ?? !current[childId],
    }));
  }

  function originLabel(origin: DailyListItem["origin"]): string {
    if (origin === "pauta") return "Previsto hoy";
    if (origin === "sin-dias") return "Sin días habituales";
    if (origin === "fin-de-semana") return "Fin de semana";
    return "Sin configurar";
  }

  let content: ReactNode;
  if (selectedClass) {
    const presentCount = dailyList.filter((item) => item.present).length;
    const dailyRows = visibleChildren.map((child) => {
      const item = dailyList.find(
        (dailyItem) => dailyItem.childId === child.id,
      );
      return {
        child,
        present: item?.present ?? false,
        origin: item?.origin ?? ("sin-configurar" as const),
      };
    });
    content =
      visibleChildren.length === 0 ? (
        <EmptyState
          title="Sin alumnos"
          message="Esta clase todavía no tiene alumnos."
        />
      ) : (
        <div className="flex flex-1 flex-col gap-4 p-4 pb-24">
          <section
            aria-label="Pasar lista"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">
                Pasar lista
              </h2>
              <p className="text-sm text-slate-500">
                {presentCount === 1
                  ? "1 previsto"
                  : `${presentCount} previstos`}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Lista pre-marcada según la pauta semanal. El ajuste de hoy no
              modifica la pauta habitual.
            </p>
            {weekend && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                Hoy no hay servicio de comedor. La lista aparece desmarcada.
              </p>
            )}
            {isOffline && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                Sin conexión: pasar lista requiere conexión.
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-2">
              {dailyRows.map(({ child, present, origin }) => (
                <li
                  key={child.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {`${child.first_name} ${child.last_name}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {originLabel(origin)}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={present}
                    aria-label={`Asistencia de ${child.first_name} ${child.last_name}`}
                    onClick={() => handleTogglePresence(child.id)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                      present ? "bg-emerald-600" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        present ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
            {attendanceSummary.status !== "never-passed" && attendanceMeta && (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {attendanceSummary.status === "confirmed-empty"
                  ? "Lista confirmada vacía"
                  : "Lista confirmada"}
                {` · ${attendanceSummary.presentCount} presentes · ${new Date(attendanceMeta.confirmedAt).toLocaleTimeString()}`}
              </p>
            )}
            {presentCount === 0 && (
              <label className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmEmptyChecked}
                  onChange={(event) =>
                    setConfirmEmptyChecked(event.target.checked)
                  }
                  aria-label="Confirmo que hoy no viene nadie: lista vacía"
                />
                <span>Confirmo que hoy no viene nadie (lista vacía)</span>
              </label>
            )}
            {!canConfirm && (
              <p className="mt-3 text-sm text-slate-500">
                Solo el monitor o la administración puede confirmar la lista.
              </p>
            )}
            <button
              type="button"
              onClick={() => void confirmAttendance()}
              disabled={
                !canConfirm ||
                confirmingAttendance ||
                isOffline ||
                (presentCount === 0 && !confirmEmptyChecked)
              }
              className="mt-3 w-full rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white disabled:opacity-50"
            >
              {confirmingAttendance
                ? "Confirmando…"
                : attendanceSummary.status === "never-passed"
                  ? "Confirmar lista"
                  : "Re-confirmar lista"}
            </button>
          </section>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleChildren.map((child) => (
              <StudentCard
                key={child.id}
                name={`${child.first_name} ${child.last_name}`}
                status={statusFor(
                  records.filter((record) => record.child_id === child.id),
                  incidents.filter(
                    (incident) => incident.child_id === child.id,
                  ),
                )}
                onClick={() => setSelectedChild(child)}
              />
            ))}
          </div>
        </div>
      );
  } else if (classList.length === 0) {
    content = (
      <EmptyState
        title="Sin clases"
        message="Este centro todavía no tiene clases."
      />
    );
  } else {
    content = (
      <div className="flex flex-1 flex-col gap-3 p-4 pb-24">
        {classList.map((classItem) => (
          <button
            key={classItem.id}
            type="button"
            onClick={() => handleSelectClass(classItem.id)}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="font-bold leading-tight text-slate-900">
              {classItem.name}
            </span>
            <span className="text-sm text-slate-500">
              {classItem.childCount === 1
                ? "1 alumno"
                : `${classItem.childCount} alumnos`}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3">
          {selectedClass && (
            <button
              type="button"
              onClick={() => handleSelectClass(null)}
              className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200"
            >
              ← Volver
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold leading-none text-slate-900">
              {selectedClass ? selectedClass.name : "Clases"}
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {selectedClass
                ? "Datos visibles según los permisos de tu cuenta"
                : "Selecciona una clase para ver sus alumnos"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.assign("/setup");
          }}
          className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200"
        >
          Salir
        </button>
      </header>
      {content}
      {isOffline && !selectedClass && (
        <p
          role="alert"
          className="mx-4 mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Sin conexión: pasar lista requiere conexión.
        </p>
      )}
      {state === "error" && (
        <p className="px-4 pb-6 text-sm text-slate-500">
          {isOffline
            ? "Sin conexión: pasar lista requiere conexión."
            : "No se han podido cargar los datos autorizados."}
        </p>
      )}
      <MealRecordModal
        key={selectedChild?.id ?? "closed"}
        child={selectedChild}
        mealTypes={mealTypes}
        canManageIncidents={canManageIncidents}
        onClose={() => setSelectedChild(null)}
        onSave={(payload) => {
          if ("incident" in payload && payload.incident) {
            void saveIncident(selectedChild!, {
              mealTypeId: payload.mealTypeId,
              status: payload.status,
              notes: payload.notes ?? "",
              ...payload.incident,
              comments: payload.incident.comments ?? "",
            });
            return;
          }
          void saveStatus(
            selectedChild!,
            payload.mealTypeId,
            payload.status,
            payload.notes ?? "",
          );
        }}
      />
      <FeedbackToast
        message={toast?.message ?? null}
        type={toast?.type ?? "success"}
      />
    </>
  );
}
