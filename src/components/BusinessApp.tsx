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
  canRecordMeal,
  confirmedPresentChildIds,
  getAttendanceConfirmationMeta,
  isAttendanceConfirmed,
  summarizeAttendance,
  type AttendanceRow,
} from "../lib/attendance";
import {
  applyMealDraft,
  buildMealListRows,
  buildVirtualMealList,
  pickDefaultMealTypeId,
} from "../lib/mealList.ts";
import {
  buildMealDraftKey,
  clearMealDrafts,
  isMealRowModified,
  loadMealDrafts,
  persistMealDrafts,
  reconcileMealDraftsOnReconfirm,
  touchMealDraft,
  type MealDraftMap,
} from "../lib/mealDraft.ts";
import {
  canEditMealForDate,
  mealStatusVisual,
  type MealStatus,
} from "../lib/mealRecord";
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
  return records.some((record) => record.status !== "todo") ||
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
  const [attendanceListOpen, setAttendanceListOpen] = useState(true);
  const [mealDrafts, setMealDrafts] = useState<MealDraftMap>({});
  const [savingMealList, setSavingMealList] = useState(false);
  const [confirmedByName, setConfirmedByName] = useState<string | null>(null);
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
  const attendanceConfirmed = isAttendanceConfirmed(attendanceRows);
  const presentChildIds = useMemo(
    () => confirmedPresentChildIds(attendanceRows),
    [attendanceRows],
  );
  const recordableChildren = useMemo(
    () => visibleChildren.filter((child) => presentChildIds.includes(child.id)),
    [visibleChildren, presentChildIds],
  );
  const absentChildren = useMemo(
    () =>
      visibleChildren.filter((child) => !presentChildIds.includes(child.id)),
    [visibleChildren, presentChildIds],
  );
  const attendanceDate =
    attendanceRows[0]?.attendance_date ?? localDateString();
  const defaultMealTypeId = useMemo(
    () => pickDefaultMealTypeId(mealTypes),
    [mealTypes],
  );
  const mealDraftKey = useMemo(
    () =>
      selectedClass?.school_id && selectedClassId
        ? buildMealDraftKey({
            schoolId: selectedClass.school_id,
            classId: selectedClassId,
            date: attendanceDate,
            mealTypeId: defaultMealTypeId,
          })
        : "",
    [selectedClass, selectedClassId, attendanceDate, defaultMealTypeId],
  );
  // Precarga del borrador al entrar a la clase (misma escuela:clase:fecha:tipo
  // conserva lo tocado aunque se salga y se vuelva a entrar). Cambiar de
  // día/clase carga otra clave y deja la memoria limpia para ese contexto.
  useEffect(() => {
    let active = true;
    async function preloadMealDrafts() {
      if (!mealDraftKey || typeof localStorage === "undefined") return;
      await Promise.resolve();
      if (!active) return;
      setMealDrafts(loadMealDrafts(localStorage, mealDraftKey));
    }
    void preloadMealDrafts();
    return () => {
      active = false;
    };
  }, [mealDraftKey]);
  const virtualMealList = useMemo(() => {
    const savedForDay = records
      .filter(
        (record) =>
          record.recorded_date === attendanceDate &&
          (defaultMealTypeId
            ? record.meal_type_id === defaultMealTypeId
            : true),
      )
      .map((record) => ({
        child_id: record.child_id,
        status: record.status,
        notes: record.notes,
      }));
    const base = buildVirtualMealList(presentChildIds, savedForDay);
    let withDrafts = base;
    for (const [childId, draft] of Object.entries(mealDrafts)) {
      withDrafts = applyMealDraft(withDrafts, childId, draft);
    }
    return withDrafts;
  }, [presentChildIds, records, attendanceDate, defaultMealTypeId, mealDrafts]);
  // Ventana de edición (#35): mismo día monitor|admin editan libremente;
  // días pasados el monitor queda en solo lectura y el admin rectifica.
  const todayStr = localDateString();
  const canEditMeals = canEditMealForDate(
    userRole,
    attendanceDate,
    todayStr,
  );
  const isPastMealDay = attendanceDate < todayStr;

  function rejectUneditableMeal(): boolean {
    if (canEditMeals) return false;
    setToast({
      message:
        userRole === "monitor" && isPastMealDay
          ? "Solo lectura: los días pasados solo los rectifica la administración"
          : "No se puede editar la valoración de este día",
      type: "error",
    });
    return true;
  }

  function rejectUnrecordable(child: Child): boolean {
    // El registro filtra a los presentes de la lista confirmada: sin
    // confirmar, o con el alumno ausente, no se admite valoración.
    if (canRecordMeal(attendanceRows, child.id)) return false;
    setToast({
      message: attendanceConfirmed
        ? "Solo se puede registrar a alumnos presentes de la lista confirmada"
        : "Confirma la lista antes de registrar cómo ha comido",
      type: "error",
    });
    return true;
  }

  async function resolveConfirmedByName(
    userId: string,
  ): Promise<string | null> {
    const monitorResult = await supabase
      .from("monitors")
      .select("first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!monitorResult.error && monitorResult.data) {
      const fullName =
        `${monitorResult.data.first_name ?? ""} ${monitorResult.data.last_name ?? ""}`.trim();
      if (fullName) return fullName;
    }
    const userResult = await supabase
      .from("users")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    if (!userResult.error && userResult.data?.full_name) {
      return userResult.data.full_name;
    }
    return null;
  }

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
        const rows = result.data ?? [];
        setAttendanceRows(rows);
        if (rows.length > 0) {
          setAttendanceListOpen(false);
          const meta = getAttendanceConfirmationMeta(rows);
          if (meta) {
            const name = await resolveConfirmedByName(meta.confirmedBy);
            if (!active) return;
            setConfirmedByName(name);
          }
        } else {
          setAttendanceListOpen(true);
          setConfirmedByName(null);
        }
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
    setAttendanceListOpen(true);
    setConfirmedByName(null);
    setMealDrafts({});
    setSelectedChild(null);
  }

  // Purga en servidor solo de Todo puro sin notas para ausentes tras
  // re-confirmar (#34). Un valor editado nunca se sobrescribe ni se borra:
  // el predicado vive también en la query por si los datos en memoria
  // estuvieran desfasados.
  async function purgeAbsentPureTodoMeals(
    childIds: readonly string[],
    mealTypeId: string,
    purgeDate: string,
  ) {
    if (childIds.length === 0 || !mealTypeId) return;
    const purgeResult = await supabase
      .from("meal_records")
      .delete()
      .in("child_id", [...childIds])
      .eq("recorded_date", purgeDate)
      .eq("meal_type_id", mealTypeId)
      .eq("status", "todo")
      .is("notes", null);
    if (!purgeResult.error) {
      const purged = new Set(childIds);
      setRecords((current) =>
        current.filter(
          (record) =>
            !(
              purged.has(record.child_id) &&
              record.recorded_date === purgeDate &&
              record.meal_type_id === mealTypeId
            ),
        ),
      );
    }
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
    setAttendanceListOpen(false);
    // Confirmar solo escribe daily_attendance: la lista de comida queda en
    // Todo virtual por cada presente, sin crear filas en meal_records.
    // Re-confirmación: el nuevo presente consigue Todo virtual, el ausente
    // sale del borrador y su fila de servidor solo se borra si era Todo puro
    // sin notas; nunca se sobrescribe un valor editado y sin cambios no se
    // toca nada.
    const nextPresentIds = confirmedPresentChildIds(result.data ?? rows);
    const prevPresentIds = confirmedPresentChildIds(attendanceRows);
    const savedForReconfirm = records
      .filter(
        (record) =>
          record.recorded_date === attendanceDate &&
          (defaultMealTypeId
            ? record.meal_type_id === defaultMealTypeId
            : true),
      )
      .map((record) => ({
        child_id: record.child_id,
        status: record.status,
        notes: record.notes,
      }));
    const reconciled = reconcileMealDraftsOnReconfirm({
      prevPresentIds,
      nextPresentIds,
      drafts: mealDrafts,
      savedRecords: savedForReconfirm,
    });
    setMealDrafts(reconciled.drafts);
    if (mealDraftKey && typeof localStorage !== "undefined") {
      persistMealDrafts(localStorage, mealDraftKey, reconciled.drafts);
    }
    if (reconciled.purgeChildIds.length > 0 && defaultMealTypeId) {
      await purgeAbsentPureTodoMeals(
        reconciled.purgeChildIds,
        defaultMealTypeId,
        attendanceDate,
      );
    }
    const confirmerName = await resolveConfirmedByName(session.user.id);
    setConfirmedByName(confirmerName);
    setToast({
      message:
        presentCount === 0
          ? "Lista confirmada sin presentes"
          : "Lista confirmada",
      type: "success",
    });
  }

  // Registro individual inmediato (vía #32): superseded por la lista
  // virtual y el guardado conjunto de #33. Se conserva para el contrato
  // existente (tests de gating/incidencias) y como vía de reintento puntual.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function saveStatus(
    child: Child,
    mealTypeId: string,
    status: Database["public"]["Enums"]["meal_status"],
    notes: string,
  ) {
    if (rejectUnrecordable(child)) return;
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
        status === "todo" ? 'Marcado como "Todo"' : "Estado de comida guardado",
      type: status === "todo" ? "success" : "warning",
    });
  }

  // Incidencia atómica individual (vía #32): conservada para el contrato
  // existente; el guardado conjunto de #33 hace upsert simple sin incidencias.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // Igual que el registro ordinario: solo presentes confirmados.
    if (rejectUnrecordable(child)) return;
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

  function handleMealModalSave(
    child: Child,
    payload: { status: MealStatus; notes: string | null },
  ) {
    // Edición por modal por alumno (valor + notas en el mismo modal): solo
    // ajusta el borrador virtual de esa fila. Guardar aunque deje Todo pero
    // con notas cuenta como modificado; revertir a Todo sin notas limpia la
    // marca. Salir sin guardar no escribe en el servidor.
    // Ventana (#35): días pasados el monitor es solo lectura y el admin
    // rectifica valor/notas libremente.
    if (rejectUneditableMeal()) return;
    if (rejectUnrecordable(child)) return;
    const nextStatus = payload.status;
    const nextNotes = payload.notes ?? "";
    setMealDrafts((current) => {
      const next = touchMealDraft(
        current,
        child.id,
        { status: nextStatus, notes: nextNotes },
        new Date().toISOString(),
      );
      // El borrador se conserva en el dispositivo; la subida solo ocurre con
      // la pulsación explícita de Guardar lista de comida.
      if (mealDraftKey && typeof localStorage !== "undefined") {
        persistMealDrafts(localStorage, mealDraftKey, next);
      }
      return next;
    });
    setSelectedChild(null);
  }

  async function saveMealList() {
    // Guardado conjunto: upsert de todos los presentes con
    // recorded_date = attendance_date y meal_type = primer meal_type activo
    // por sort_order. Sin ese tipo no hay escrituras ni relleno retroactivo.
    // La lista confirmada vacía no crea ningún meal_record.
    // La subida solo ocurre con la pulsación explícita de este botón: sin
    // conexión queda bloqueado con aviso y el borrador se conserva.
    // Ventana (#35): mismo día monitor|admin guardan libremente; días
    // pasados solo el admin rectifica y el monitor es solo lectura.
    if (savingMealList) return;
    if (rejectUneditableMeal()) return;
    if (isOffline) {
      setToast({
        message:
          "Sin conexión: el borrador se conserva en este dispositivo. Vuelve a pulsar Guardar lista de comida con conexión.",
        type: "error",
      });
      return;
    }
    if (!attendanceConfirmed || presentChildIds.length === 0) return;
    if (!defaultMealTypeId) {
      setToast({
        message: "Sin tipo de comida activo: no se puede guardar la lista",
        type: "error",
      });
      return;
    }
    for (const childId of presentChildIds) {
      if (!canRecordMeal(attendanceRows, childId)) {
        setToast({
          message:
            "Solo se puede registrar a alumnos presentes de la lista confirmada",
          type: "error",
        });
        return;
      }
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setToast({
        message: "No se ha podido guardar la lista de comida",
        type: "error",
      });
      return;
    }
    const rows = buildMealListRows({
      presentChildIds,
      drafts: virtualMealList,
      mealTypeId: defaultMealTypeId,
      recordedDate: attendanceDate,
      recordedBy: session.user.id,
      recordedAt: new Date().toISOString(),
    });
    if (rows.length === 0) return;
    setSavingMealList(true);
    const result = await supabase
      .from("meal_records")
      .upsert(rows, { onConflict: "child_id,meal_type_id,recorded_date" })
      .select(
        "id, child_id, meal_type_id, notes, recorded_date, recorded_at, recorded_by, status",
      );
    setSavingMealList(false);
    if (result.error) {
      setToast({
        message: "No se ha podido guardar la lista de comida",
        type: "error",
      });
      return;
    }
    const saved = result.data ?? [];
    setRecords((current) => {
      const savedIds = new Set(saved.map((row) => row.id));
      return [
        ...current.filter((record) => !savedIds.has(record.id)),
        ...saved,
      ];
    });
    // Re-guardar el mismo día sobrescribe libremente: limpiamos el borrador
    // para que la lista muestre lo guardado.
    setMealDrafts({});
    if (mealDraftKey && typeof localStorage !== "undefined") {
      clearMealDrafts(localStorage, mealDraftKey);
    }
    setToast({ message: "Lista de comida guardada", type: "success" });
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">
                Pasar lista
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                <p className="text-sm text-slate-500">
                  {presentCount === 1
                    ? "1 previsto"
                    : `${presentCount} previstos`}
                </p>
                {attendanceConfirmed && (
                  <button
                    type="button"
                    aria-expanded={attendanceListOpen}
                    aria-controls="lista-asistencia"
                    onClick={() => setAttendanceListOpen((current) => !current)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  >
                    {attendanceListOpen ? "Ocultar lista" : "Ver lista"}
                  </button>
                )}
              </div>
            </div>
            {attendanceConfirmed && !attendanceListOpen ? (
              <>
                {attendanceSummary.status !== "never-passed" &&
                  attendanceMeta && (
                    <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      {attendanceSummary.status === "confirmed-empty"
                        ? "Lista confirmada vacía"
                        : "Lista confirmada"}
                      {` · ${attendanceSummary.presentCount} presentes · confirmada por ${confirmedByName ?? attendanceMeta.confirmedBy} · ${new Date(attendanceMeta.confirmedAt).toLocaleTimeString()}`}
                    </p>
                  )}
              </>
            ) : (
              <>
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
                    Sin conexión: pasar lista y confirmar requieren conexión.
                  </p>
                )}
                <ul id="lista-asistencia" className="mt-3 flex flex-col gap-2">
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
                {attendanceSummary.status !== "never-passed" &&
                  attendanceMeta && (
                    <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      {attendanceSummary.status === "confirmed-empty"
                        ? "Lista confirmada vacía"
                        : "Lista confirmada"}
                      {` · ${attendanceSummary.presentCount} presentes · confirmada por ${confirmedByName ?? attendanceMeta.confirmedBy} · ${new Date(attendanceMeta.confirmedAt).toLocaleTimeString()}`}
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
                    Solo el monitor o la administración puede confirmar la
                    lista.
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
              </>
            )}
          </section>
          <section
            aria-label="Registro de comida"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-base font-bold text-slate-900">
              Registro de comida
            </h2>
            {!attendanceConfirmed ? (
              <p
                role="alert"
                className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700"
              >
                Confirma la lista para habilitar el registro de comida. Sin
                lista confirmada hoy, el registro está bloqueado.
              </p>
            ) : presentChildIds.length === 0 ? (
              <p
                role="status"
                className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700"
              >
                Lista confirmada vacía: hoy no hay alumnos presentes para
                registrar.
              </p>
            ) : (
              <>
                <p className="mt-2 text-xs text-slate-500">
                  Lista de comida con Todo pre-seleccionado virtual por cada
                  presente, sin escribir aún en el servidor. Abre cada alumno
                  para ajustar excepciones y pulsa Guardar lista de comida.
                </p>
                {!defaultMealTypeId && (
                  <p
                    role="alert"
                    className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    Sin tipo de comida activo: no se puede guardar la lista.
                  </p>
                )}
                {isOffline && (
                  <p
                    role="alert"
                    className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    Sin conexión: el borrador se conserva en este dispositivo.
                    La subida es manual con Guardar lista de comida.
                  </p>
                )}
                {isPastMealDay && (
                  <p
                    role="status"
                    className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700"
                  >
                    {canEditMeals
                      ? "Rectificación de un día pasado: la administración puede cambiar valor/notas libremente."
                      : "Solo lectura: los días pasados solo los rectifica la administración."}
                  </p>
                )}
                <ul
                  aria-label="Lista de comida"
                  className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
                >
                  {recordableChildren.map((child) => {
                    const entry = virtualMealList.find(
                      (item) => item.childId === child.id,
                    );
                    const visual = mealStatusVisual(entry?.status ?? "todo");
                    const label = visual.label;
                    const savedForChild = records.find(
                      (record) =>
                        record.child_id === child.id &&
                        record.recorded_date === attendanceDate &&
                        (defaultMealTypeId
                          ? record.meal_type_id === defaultMealTypeId
                          : true),
                    );
                    const modified = isMealRowModified(
                      mealDrafts[child.id],
                      savedForChild
                        ? {
                            status: savedForChild.status,
                            notes: savedForChild.notes,
                          }
                        : undefined,
                    );
                    return (
                      <li
                        key={child.id}
                        className="flex flex-col gap-2 rounded-2xl border border-slate-100 p-3 shadow-sm"
                      >
                        <StudentCard
                          name={`${child.first_name} ${child.last_name}`}
                          status={statusFor(
                            records.filter(
                              (record) => record.child_id === child.id,
                            ),
                            incidents.filter(
                              (incident) => incident.child_id === child.id,
                            ),
                          )}
                          onClick={() => {
                            if (!canEditMeals) return;
                            setSelectedChild(child);
                          }}
                        />
                        <p className="flex items-center gap-2 px-1 text-sm text-slate-700">
                          <span
                            aria-hidden="true"
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${visual.dotClass}`}
                          />
                          {modified && (
                            <span
                              aria-label="Modificado"
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800"
                            >
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full bg-emerald-600"
                              />
                              Modificado
                            </span>
                          )}
                          Valor elegido:{" "}
                          <span className={`font-bold ${visual.textClass}`}>
                            {label}
                          </span>
                          {entry?.notes ? ` · ${entry.notes}` : ""}
                        </p>
                        <button
                          type="button"
                          aria-label={`Ajustar comida de ${child.first_name} ${child.last_name}`}
                          onClick={() => {
                            if (!canEditMeals) {
                              rejectUneditableMeal();
                              return;
                            }
                            setSelectedChild(child);
                          }}
                          disabled={!canEditMeals}
                          className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                        >
                          {canEditMeals ? "Ajustar" : "Solo lectura"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  onClick={() => void saveMealList()}
                  disabled={
                    savingMealList ||
                    !defaultMealTypeId ||
                    isOffline ||
                    !canEditMeals
                  }
                  className="mt-3 w-full rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white disabled:opacity-50"
                >
                  {savingMealList ? "Guardando…" : "Guardar lista de comida"}
                </button>
              </>
            )}
            {attendanceConfirmed && absentChildren.length > 0 && (
              <ul
                aria-label="Alumnos ausentes hoy"
                className="mt-3 flex flex-col gap-2"
              >
                {absentChildren.map((child) => (
                  <li
                    key={child.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 opacity-70"
                  >
                    <p className="truncate text-sm font-medium text-slate-500">
                      {`${child.first_name} ${child.last_name}`}
                    </p>
                    <p className="shrink-0 text-xs text-slate-500">
                      Ausente hoy: no valorable
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
          Sin conexión: pasar lista y confirmar requieren conexión.
        </p>
      )}
      {state === "error" && (
        <p className="px-4 pb-6 text-sm text-slate-500">
          {isOffline
            ? "Sin conexión: pasar lista y confirmar requieren conexión."
            : "No se han podido cargar los datos autorizados."}
        </p>
      )}
      <MealRecordModal
        key={selectedChild?.id ?? "closed"}
        child={selectedChild}
        mealTypes={mealTypes}
        canManageIncidents={canManageIncidents}
        initialStatus={
          selectedChild
            ? (virtualMealList.find(
                (entry) => entry.childId === selectedChild.id,
              )?.status ?? "todo")
            : undefined
        }
        initialNotes={
          selectedChild
            ? (virtualMealList.find(
                (entry) => entry.childId === selectedChild.id,
              )?.notes ?? "")
            : undefined
        }
        onClose={() => setSelectedChild(null)}
        onSave={(payload) => {
          // La edición por modal solo ajusta el borrador virtual de la fila
          // (valor + notas); el guardado conjunto persiste a todos los
          // presentes de golpe con upsert simple, sin incidencias.
          if (!selectedChild) return;
          handleMealModalSave(selectedChild, {
            status: payload.status,
            notes: payload.notes ?? "",
          });
        }}
      />
      <FeedbackToast
        message={toast?.message ?? null}
        type={toast?.type ?? "success"}
      />
    </>
  );
}
