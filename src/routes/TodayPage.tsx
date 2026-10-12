import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { supabase } from "../lib/supabase/client";
import { localDateString } from "../lib/local-date";
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
import type { Database } from "../types/database";

type Child = Database["public"]["Tables"]["children"]["Row"];
type SchoolClass = Database["public"]["Tables"]["classes"]["Row"];
type Incident = Database["public"]["Tables"]["incidents"]["Row"];
type Allergen = Database["public"]["Tables"]["allergens"]["Row"];
type ChildAllergen = Database["public"]["Tables"]["child_allergens"]["Row"];
type SchoolNotice = Database["public"]["Tables"]["school_notices"]["Row"];

// Página inicial protegida: previsión de hoy del colegio. Es lo primero que
// ve el monitor tras el login: previsión derivada del horario en clases
// permitidas, alergias de los comensales previstos, incidencias de hoy para
// el colegio y avisos publicados. Sin lista de clases: eso vive en /clases.
// Carga paralela con RLS, sin mocks ni datos fabricados offline.
export default function TodayPage() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [lunchByChild, setLunchByChild] = useState<Record<string, number[]>>(
    {},
  );
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [childAllergens, setChildAllergens] = useState<ChildAllergen[]>([]);
  const [schoolNotices, setSchoolNotices] = useState<SchoolNotice[]>([]);
  const [classSummaryOverrides, setClassSummaryOverrides] = useState<
    Record<string, boolean>
  >({});
  const [schoolSummaryEnabled, setSchoolSummaryEnabled] = useState<
    Record<string, boolean>
  >({});
  const [summaryDefaultEnabled, setSummaryDefaultEnabled] = useState<
    boolean | null
  >(null);
  const [summaryCapabilitiesFailed, setSummaryCapabilitiesFailed] =
    useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [reloadKey, setReloadKey] = useState(0);
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
        incidentsResult,
        lunchDaysResult,
        allergensResult,
        childAllergensResult,
        schoolNoticesResult,
        catalogResult,
        schoolCapabilitiesResult,
        classOverridesResult,
      ] = await Promise.all([
        supabase
          .from("children")
          .select("id, first_name, last_name, class_id, created_at")
          .order("last_name"),
        supabase.from("classes").select("id, name, school_id"),
        supabase
          .from("incidents")
          .select(
            "id, child_id, category, created_at, date, description, family_responded_at, family_response, family_seen, monitor_id, monitor_validated, requires_family_signature, reviewed, send_notification",
          )
          .eq("date", localDateString()),
        supabase.from("child_lunch_days").select("child_id, weekdays"),
        supabase.from("allergens").select("id, name"),
        supabase.from("child_allergens").select("child_id, allergen_id"),
        supabase
          .from("school_notices")
          .select("id, school_id, title, body, status, created_at")
          .eq("status", "published")
          .order("created_at", { ascending: false }),
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
      ]);
      if (!active) return;
      if (
        childrenResult.error ||
        classesResult.error ||
        incidentsResult.error ||
        lunchDaysResult.error ||
        allergensResult.error ||
        childAllergensResult.error ||
        schoolNoticesResult.error
      ) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setIsOffline(true);
        }
        setChildren([]);
        setClasses([]);
        setIncidents([]);
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
      setIncidents(incidentsResult.data ?? []);
      const lunchMap: Record<string, number[]> = {};
      for (const row of lunchDaysResult.data ?? []) {
        lunchMap[row.child_id] = [...(row.weekdays ?? [])];
      }
      setLunchByChild(lunchMap);
      setAllergens(allergensResult.data ?? []);
      setChildAllergens(childAllergensResult.data ?? []);
      setSchoolNotices(schoolNoticesResult.data ?? []);
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

  if (state === "loading")
    return (
      <section aria-label="Hoy" className="flex flex-1 flex-col px-4 py-6">
        <p className="p-6 text-sm text-slate-500">
          Cargando datos autorizados...
        </p>
      </section>
    );
  if (state === "signed-out")
    return (
      <section
        aria-label="Hoy"
        className="m-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
      >
        <h1 className="text-lg font-bold text-slate-900">Sesión no iniciada</h1>
        <p className="mt-2 text-sm text-slate-500">
          Inicia sesión para ver la previsión de hoy.
        </p>
        <button
          type="button"
          onClick={() => navigate("/setup")}
          className="mt-4 inline-flex min-h-[48px] items-center rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white"
        >
          Configurar dispositivo
        </button>
      </section>
    );
  if (state === "error")
    return (
      <section
        aria-label="Hoy"
        className="flex flex-1 flex-col gap-3 p-4 pb-24"
      >
        <p role="alert" className="text-sm text-slate-500">
          {isOffline || (typeof navigator !== "undefined" && !navigator.onLine)
            ? "Sin conexión: el resumen no está actualizado."
            : "No se han podido cargar los datos autorizados. No se muestra ninguna previsión antigua como actual."}
        </p>
        <button
          type="button"
          onClick={() => {
            setState("loading");
            setReloadKey((current) => current + 1);
          }}
          className="min-h-[56px] w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-bold text-white"
        >
          Reintentar
        </button>
      </section>
    );

  const showSummary =
    !isOffline && !summaryCapabilitiesFailed && permittedClassIds.size > 0;

  return (
    <section aria-label="Hoy" className="flex flex-1 flex-col gap-4 p-4 pb-28">
      <header>
        <p className="text-sm font-medium text-slate-500">
          {today.toLocaleDateString("es-ES", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Previsión de hoy</h1>
        <p className="mt-1 text-sm text-slate-500">
          Previsión del colegio según el horario, no asistencia confirmada.
        </p>
      </header>

      {isOffline && (
        <p
          role="alert"
          className="rounded-2xl bg-amber-50 px-4 py-3 text-base text-amber-800"
        >
          Sin conexión: el resumen no está actualizado. Vuelve a intentarlo con
          conexión para ver la previsión actual.
        </p>
      )}

      {!showSummary && !isOffline ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Hoy no hay previsión disponible para tus clases.
        </p>
      ) : null}

      {showSummary ? (
        <>
          <section
            aria-label="Resumen del día"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-lg font-bold text-slate-900">
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
                <p className="mt-2 text-base text-slate-700">
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
        </>
      ) : null}
    </section>
  );
}
