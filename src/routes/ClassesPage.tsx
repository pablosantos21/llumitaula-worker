import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import MealRecordModal from "../components/MealRecordModal";
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
  buildExpectedDinerAllergies,
  buildSchoolForecast,
  buildSchoolSummaryIncidents,
  buildSchoolSummaryNotices,
  DAILY_SUMMARY_CAPABILITY,
  permittedClassIds as permittedSummaryClassIds,
} from "../lib/daily-summary";
import { incidentCategoryLabel } from "../lib/incidentCategories";
import { incidentAudienceLabelFromIndicators } from "../lib/incidentReadStatus";
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
  savedCourses,
  touchMealDraft,
  type MealDraftMap,
} from "../lib/mealDraft.ts";
import {
  canEditMealForDate,
  mealStatusVisual,
  overallMealStatus,
  type MealCourses,
} from "../lib/mealRecord";
import type { Database } from "../types/database";
import FeedbackToast from "../components/FeedbackToast";
import StudentCard from "../components/StudentCard";

type Child = Database["public"]["Tables"]["children"]["Row"];
type SchoolClass = Database["public"]["Tables"]["classes"]["Row"];
type MealRecord = Database["public"]["Tables"]["meal_records"]["Row"];
type MealType = Database["public"]["Tables"]["meal_types"]["Row"];
type Incident = Database["public"]["Tables"]["incidents"]["Row"];
type Allergen = Database["public"]["Tables"]["allergens"]["Row"];
type ChildAllergen = Database["public"]["Tables"]["child_allergens"]["Row"];
type SchoolNotice = Database["public"]["Tables"]["school_notices"]["Row"];
type CardStatus = "all_good" | "incident";

const ATTENDANCE_SELECT =
  "child_id, class_id, school_id, attendance_date, present, confirmed_by, confirmed_at";

function statusFor(records: MealRecord[], incidents: Incident[]): CardStatus {
  const badMeal = records.some((record) => {
    const courses = savedCourses({
      status: record.status,
      first_course: record.first_course,
      second_course: record.second_course,
      dessert: record.dessert,
    });
    return overallMealStatus(courses) !== "todo";
  });
  return badMeal || incidents.length > 0 ? "incident" : "all_good";
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-24 pt-10 text-center">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

// Ruta raíz protegida #46: lista de clases y comedor diario con asistencia
// confirmada, borrador local y registro de valoración. Reutiliza sin
// reescribir los módulos de dominio (clases, pauta diaria, asistencia con
// confirmación, lista virtual de comedor, borrador local, valoración).
// Carga paralela de datos autorizados por RLS, sin mocks ni datos
// fabricados offline. Navegación 100% del router, sin recargas.
export default function ClassesPage() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [mealTypes, setMealTypes] = useState<MealType[]>([]);
  const [lunchByChild, setLunchByChild] = useState<Record<string, number[]>>(
    {},
  );
  // Alergias del resumen (#53): nombres y asociaciones; RLS ya limita al
  // monitor a niños accesibles con el resumen permitido.
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [childAllergens, setChildAllergens] = useState<ChildAllergen[]>([]);
  // Avisos del resumen (#55): generales publicados y vigentes del colegio;
  // RLS ya limita al monitor a publicados de sus colegios, sin gate por el
  // permiso de publicar. Sin interfaz de redacción ni publicación.
  const [schoolNotices, setSchoolNotices] = useState<SchoolNotice[]>([]);
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
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  // Permiso efectivo del resumen diario (#52): override de clase, escuela,
  // defecto del catálogo. Sin clases permitidas el resumen no se muestra.
  const [classSummaryOverrides, setClassSummaryOverrides] = useState<
    Record<string, boolean>
  >({});
  const [schoolSummaryEnabled, setSchoolSummaryEnabled] = useState<
    Record<string, boolean>
  >({});
  const [summaryDefaultEnabled, setSummaryDefaultEnabled] = useState<
    boolean | null
  >(null);
  // Si las capabilities no se pudieron leer, la presentación no finge un
  // permiso conocido: oculta el resumen en vez de suponerlo habilitado.
  const [summaryCapabilitiesFailed, setSummaryCapabilitiesFailed] =
    useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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
        catalogResult,
        schoolCapabilitiesResult,
        classOverridesResult,
        allergensResult,
        childAllergensResult,
        schoolNoticesResult,
      ] = await Promise.all([
        supabase
          .from("children")
          .select("id, first_name, last_name, class_id, created_at")
          .order("last_name"),
        supabase.from("classes").select("id, name, school_id"),
        supabase
          .from("meal_records")
          .select(
            "id, child_id, meal_type_id, notes, recorded_date, recorded_at, recorded_by, status, first_course, second_course, dessert",
          )
          .eq("recorded_date", localDateString()),
        supabase
          .from("incidents")
          .select(
            "id, child_id, category, created_at, date, description, family_responded_at, family_response, family_seen, monitor_id, monitor_validated, requires_family_signature, reviewed, send_notification",
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
        supabase
          .from("capability_catalog")
          .select("capability, default_enabled")
          .eq("capability", DAILY_SUMMARY_CAPABILITY)
          .maybeSingle(),
        supabase
          .from("school_capabilities")
          .select("school_id, capability, enabled")
          .eq("capability", DAILY_SUMMARY_CAPABILITY),
        supabase
          .from("class_capability_overrides")
          .select("class_id, capability, enabled")
          .eq("capability", DAILY_SUMMARY_CAPABILITY),
        supabase.from("allergens").select("id, name"),
        supabase.from("child_allergens").select("child_id, allergen_id"),
        supabase
          .from("school_notices")
          .select("id, school_id, title, body, status, created_at")
          .eq("status", "published")
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (
        childrenResult.error ||
        classesResult.error ||
        recordsResult.error ||
        incidentsResult.error ||
        mealTypesResult.error ||
        lunchDaysResult.error ||
        userResult.error ||
        allergensResult.error ||
        childAllergensResult.error ||
        schoolNoticesResult.error
      ) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setIsOffline(true);
        }
        // No mostrar datos antiguos como actuales: limpiar al fallar.
        setChildren([]);
        setClasses([]);
        setRecords([]);
        setIncidents([]);
        setMealTypes([]);
        setLunchByChild({});
        setAllergens([]);
        setChildAllergens([]);
        setSchoolNotices([]);
        setClassSummaryOverrides({});
        setSchoolSummaryEnabled({});
        setSummaryDefaultEnabled(null);
        setSummaryCapabilitiesFailed(false);
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
      setAllergens(allergensResult.data ?? []);
      setChildAllergens(childAllergensResult.data ?? []);
      setSchoolNotices(schoolNoticesResult.data ?? []);
      setUserRole(userResult.data.role);
      // Capacidades: lo ausente conserva el defecto (habilitado). Si la
      // lectura de capabilities falla, la presentación no supone el
      // permiso: oculta el resumen (RLS ya filtra lo deshabilitado en
      // directo para el monitor).
      const capabilitiesFailed =
        catalogResult.error != null ||
        schoolCapabilitiesResult.error != null ||
        classOverridesResult.error != null;
      setSummaryCapabilitiesFailed(capabilitiesFailed);
      const catalogDefault =
        catalogResult.error || !catalogResult.data
          ? null
          : (catalogResult.data.default_enabled ?? null);
      setSummaryDefaultEnabled(catalogDefault);
      const schoolMap: Record<string, boolean> = {};
      if (!schoolCapabilitiesResult.error) {
        for (const row of schoolCapabilitiesResult.data ?? []) {
          if (row.school_id) schoolMap[row.school_id] = row.enabled;
        }
      }
      setSchoolSummaryEnabled(schoolMap);
      const overrideMap: Record<string, boolean> = {};
      if (!classOverridesResult.error) {
        for (const row of classOverridesResult.data ?? []) {
          if (row.class_id) overrideMap[row.class_id] = row.enabled;
        }
      }
      setClassSummaryOverrides(overrideMap);

      setState("ready");
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const classList = buildClassList(classes, children);
  // Clases con resumen permitido (#52): override de clase, luego escuela,
  // luego defecto del catálogo. RLS ya rechaza lo deshabilitado en directo;
  // aquí se filtra la presentación con el mismo orden.
  const permittedClassIds = useMemo(
    () =>
      permittedSummaryClassIds(classes, {
        classOverrides: classSummaryOverrides,
        schoolEnabledBySchool: schoolSummaryEnabled,
        defaultEnabled: summaryDefaultEnabled,
      }),
    [
      classes,
      classSummaryOverrides,
      schoolSummaryEnabled,
      summaryDefaultEnabled,
    ],
  );
  // Un solo "hoy" por render (#53): previsión y alergias comparten el día
  // para no incoherencias en el límite de medianoche.
  const today = useMemo(() => new Date(), []);
  const schoolForecast = useMemo(
    () =>
      buildSchoolForecast({
        children,
        lunchByChild,
        permittedClassIds,
        date: today,
      }),
    [children, lunchByChild, permittedClassIds, today],
  );
  // Alergias de los comensales previstos (#53): solo previstos de hoy en
  // clases permitidas y con alérgenos asociados; nombre y alérgenos, sin
  // datos clínicos (el modelo no los tiene).
  const expectedDinerAllergies = useMemo(() => {
    const allergenNames: Record<string, string> = {};
    for (const allergen of allergens) {
      allergenNames[allergen.id] = allergen.name;
    }
    const childAllergenIds: Record<string, string[]> = {};
    for (const link of childAllergens) {
      if (!childAllergenIds[link.child_id]) {
        childAllergenIds[link.child_id] = [];
      }
      childAllergenIds[link.child_id].push(link.allergen_id);
    }
    return buildExpectedDinerAllergies({
      children,
      lunchByChild,
      permittedClassIds,
      childAllergenIds,
      allergenNames,
      date: today,
    });
  }, [
    children,
    lunchByChild,
    permittedClassIds,
    allergens,
    childAllergens,
    today,
  ]);
  // Incidencias del colegio (#54): las de hoy con audiencia al colegio
  // (send_notification = true: colegio y ambos; excluye solo-familia),
  // en clases permitidas, sin filtrar por reviewed ni validación.
  const summarySchoolIncidents = useMemo(
    () =>
      buildSchoolSummaryIncidents({
        incidents,
        children,
        permittedClassIds,
        date: today,
      }),
    [incidents, children, permittedClassIds, today],
  );
  // Avisos del colegio (#55): generales publicados y vigentes del colegio
  // del monitor hasta archivar o retirar. Solo lectura: sin redacción ni
  // publicación en este ticket y sin gate por el permiso de publicar.
  const summarySchoolNotices = useMemo(() => {
    const schoolIds = new Set<string>();
    for (const classItem of classes) {
      if (classItem.school_id) schoolIds.add(classItem.school_id);
    }
    return buildSchoolSummaryNotices({
      notices: schoolNotices,
      schoolIds,
    });
  }, [schoolNotices, classes]);
  const selectedClass = selectedClassId
    ? classById(classes, selectedClassId)
    : null;
  const visibleChildren = useMemo(
    () => (selectedClassId ? childrenInClass(children, selectedClassId) : []),
    [children, selectedClassId],
  );
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
        first_course: record.first_course,
        second_course: record.second_course,
        dessert: record.dessert,
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
  const canEditMeals = canEditMealForDate(userRole, attendanceDate, todayStr);
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
      .eq("first_course", "todo")
      .eq("second_course", "todo")
      .eq("dessert", "todo")
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
        first_course: record.first_course,
        second_course: record.second_course,
        dessert: record.dessert,
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

  function handleMealModalSave(
    child: Child,
    payload: {
      firstCourse: MealCourses["firstCourse"];
      secondCourse: MealCourses["secondCourse"];
      dessert: MealCourses["dessert"];
      notes: string | null;
    },
  ) {
    // Edición por modal por alumno (platos + notas en el mismo modal): solo
    // ajusta el borrador virtual de esa fila. Guardar aunque deje Todo en los
    // tres platos pero con notas cuenta como modificado; revertir a Todo sin
    // notas limpia la marca. Salir sin guardar no escribe en el servidor.
    // Ventana (#35): días pasados el monitor es solo lectura y el admin
    // rectifica valor/notas libremente.
    if (rejectUneditableMeal()) return;
    if (rejectUnrecordable(child)) return;
    const nextNotes = payload.notes ?? "";
    setMealDrafts((current) => {
      const next = touchMealDraft(
        current,
        child.id,
        {
          firstCourse: payload.firstCourse,
          secondCourse: payload.secondCourse,
          dessert: payload.dessert,
          notes: nextNotes,
        },
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
    // recorded_date = attendance_date y el tipo de comida implícito (primer
    // meal_type activo; la UI ya no expone selector, hay una sola comida al
    // día). Sin ese tipo no hay escrituras ni relleno retroactivo.
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
        message: "No se puede guardar la lista: falta la comida del día",
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
        "id, child_id, meal_type_id, notes, recorded_date, recorded_at, recorded_by, status, first_course, second_course, dessert",
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
      <section aria-label="Clases" className="flex flex-1 flex-col px-4 py-6">
        <p className="p-6 text-sm text-slate-500">
          Cargando datos autorizados...
        </p>
      </section>
    );
  if (state === "signed-out")
    return (
      <section
        aria-label="Clases"
        className="m-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
      >
        <h1 className="text-lg font-bold text-slate-900">Sesión no iniciada</h1>
        <p className="mt-2 text-sm text-slate-500">
          Inicia sesión para consultar los alumnos autorizados.
        </p>
        <button
          type="button"
          onClick={() => navigate("/setup")}
          className="mt-4 inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white"
        >
          Configurar dispositivo
        </button>
      </section>
    );

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
                  Lista de comida con Todo pre-seleccionado en cada plato por
                  cada presente, sin escribir aún en el servidor. Abre cada
                  alumno para ajustar excepciones y pulsa Guardar lista de
                  comida.
                </p>
                {!defaultMealTypeId && (
                  <p
                    role="alert"
                    className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    No se puede guardar la lista: falta la comida del día.
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
                      ? "Rectificación de un día pasado: la administración puede cambiar platos y notas libremente."
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
                    const courses: MealCourses = {
                      firstCourse: entry?.firstCourse ?? "todo",
                      secondCourse: entry?.secondCourse ?? "todo",
                      dessert: entry?.dessert ?? "todo",
                    };
                    const courseVisuals = (
                      [
                        ["Primero", courses.firstCourse],
                        ["Segundo", courses.secondCourse],
                        ["Postre", courses.dessert],
                      ] as const
                    ).map(([courseLabel, courseStatus]) => ({
                      courseLabel,
                      ...mealStatusVisual(courseStatus),
                    }));
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
                            first_course: savedForChild.first_course,
                            second_course: savedForChild.second_course,
                            dessert: savedForChild.dessert,
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
                        <div className="flex flex-wrap items-center gap-2 px-1 text-sm text-slate-700">
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
                          {courseVisuals.map((course) => (
                            <span
                              key={course.courseLabel}
                              className="inline-flex items-center gap-1.5"
                            >
                              <span
                                aria-hidden="true"
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${course.dotClass}`}
                              />
                              {course.courseLabel}:{" "}
                              <span className={`font-bold ${course.textClass}`}>
                                {course.label}
                              </span>
                            </span>
                          ))}
                          {entry?.notes ? (
                            <span className="w-full truncate text-slate-500">
                              {entry.notes}
                            </span>
                          ) : null}
                        </div>
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
    // Resumen del colegio antes de elegir clase (#52): previsión derivada
    // del horario en clases permitidas. Sin permitidas no se muestra, pero
    // la selección sigue disponible. Sin conexión no se presenta como
    // actualizado; el error ofrece reintento sin datos antiguos.
    const showSummary =
      state === "ready" &&
      !isOffline &&
      !summaryCapabilitiesFailed &&
      permittedClassIds.size > 0;
    content = (
      <div className="flex flex-1 flex-col gap-3 p-4 pb-24">
        {showSummary ? (
          <section
            aria-label="Resumen del día"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-base font-bold text-slate-900">
              Previsión de hoy
            </h2>
            {schoolForecast.isNoServiceDay ? (
              <p
                role="status"
                className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                Hoy no hay servicio de comedor. La previsión queda en pausa
                hasta el próximo día de servicio.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-700">
                  {schoolForecast.expectedCount === 1
                    ? "1 previsto"
                    : `${schoolForecast.expectedCount} previstos`}
                  <span>
                    {" "}
                    Previsión según el horario, no asistencia confirmada.
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Previsión del colegio: cuenta a los niños cuyo horario de
                  comedor incluye hoy en las clases permitidas. No es una lista
                  confirmada ni asistencia marcada.
                </p>
                {schoolForecast.isIncomplete && (
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <span>Previsión incompleta: </span>
                    {schoolForecast.incompleteCount === 1
                      ? "1 niño sin horario configurado"
                      : `${schoolForecast.incompleteCount} niños sin horario configurado`}
                    <span> Podría faltar parte de la previsión.</span>
                  </p>
                )}
              </>
            )}
            {!schoolForecast.isNoServiceDay && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Alergias de los comensales previstos
                </h3>
                {expectedDinerAllergies.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">
                    Sin alergias entre los comensales previstos.
                  </p>
                ) : (
                  <ul
                    aria-label="Alergias de los comensales previstos"
                    className="mt-2 flex flex-col gap-2"
                  >
                    {expectedDinerAllergies.map((row) => (
                      <li
                        key={row.childId}
                        className="rounded-xl bg-slate-50 px-3 py-2"
                      >
                        <p className="text-sm font-bold text-slate-900">
                          {row.childName}
                        </p>
                        <p className="text-sm text-slate-700">
                          {row.allergenNames.join(", ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <h3 className="text-sm font-bold text-slate-900">
                Incidencias de hoy para el colegio
              </h3>
              {summarySchoolIncidents.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">
                  Sin incidencias para el colegio hoy.
                </p>
              ) : (
                <ul
                  aria-label="Incidencias de hoy para el colegio"
                  className="mt-2 flex flex-col gap-2"
                >
                  {summarySchoolIncidents.map((row) => {
                    const raw = incidents.find(
                      (incident) => incident.id === row.incidentId,
                    );
                    return (
                      <li
                        key={row.incidentId}
                        className="rounded-xl bg-slate-50 px-3 py-2"
                      >
                        <p className="text-sm font-bold text-slate-900">
                          {row.childName}
                        </p>
                        <p className="text-sm text-slate-700">
                          {incidentCategoryLabel(row.category)}
                          {raw
                            ? ` · ${incidentAudienceLabelFromIndicators(raw.requires_family_signature, raw.send_notification)}`
                            : null}
                        </p>
                        {row.description ? (
                          <p className="text-sm text-slate-700">
                            {row.description}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <h3 className="text-sm font-bold text-slate-900">
                Avisos del colegio
              </h3>
              {summarySchoolNotices.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">
                  Sin avisos para el colegio hoy.
                </p>
              ) : (
                <ul
                  aria-label="Avisos del colegio"
                  className="mt-2 flex flex-col gap-2"
                >
                  {summarySchoolNotices.map((row) => (
                    <li
                      key={row.noticeId}
                      className="rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <p className="text-sm font-bold text-slate-900">
                        {row.title}
                      </p>
                      {row.body ? (
                        <p className="text-sm text-slate-700">{row.body}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}
        {state === "ready" && isOffline && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            Sin conexión: el resumen no está actualizado. Vuelve a intentarlo
            con conexión para ver la previsión actual.
          </p>
        )}
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
    <section aria-label="Clases" className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 flex flex-col gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
        <div className="flex items-center justify-between">
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
              navigate("/setup");
            }}
            className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200"
          >
            Salir
          </button>
        </div>
      </header>
      {content}
      {isOffline && !selectedClass && state !== "error" && (
        <p
          role="alert"
          className="mx-4 mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Sin conexión: pasar lista y confirmar requieren conexión.
        </p>
      )}
      {state === "error" && (
        <div className="px-4 pb-6">
          <p role="alert" className="text-sm text-slate-500">
            {isOffline ||
            (typeof navigator !== "undefined" && !navigator.onLine)
              ? "Sin conexión: el resumen no está actualizado y pasar lista requiere conexión."
              : "No se han podido cargar los datos autorizados. No se muestra ninguna previsión antigua como actual."}
          </p>
          <button
            type="button"
            onClick={() => {
              setState("loading");
              setReloadKey((current) => current + 1);
            }}
            className="mt-3 w-full rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white"
          >
            Reintentar
          </button>
        </div>
      )}
      <MealRecordModal
        key={selectedChild?.id ?? "closed"}
        child={selectedChild}
        initialCourses={
          selectedChild
            ? (() => {
                const entry = virtualMealList.find(
                  (item) => item.childId === selectedChild.id,
                );
                return {
                  firstCourse: entry?.firstCourse ?? "todo",
                  secondCourse: entry?.secondCourse ?? "todo",
                  dessert: entry?.dessert ?? "todo",
                } as const;
              })()
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
          // (platos + notas); el guardado conjunto persiste a todos los
          // presentes de golpe con upsert simple, sin incidencias.
          if (!selectedChild) return;
          handleMealModalSave(selectedChild, {
            firstCourse: payload.firstCourse,
            secondCourse: payload.secondCourse,
            dessert: payload.dessert,
            notes: payload.notes ?? "",
          });
        }}
      />
      <FeedbackToast
        message={toast?.message ?? null}
        type={toast?.type ?? "success"}
      />
    </section>
  );
}
