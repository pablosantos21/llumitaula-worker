import { useEffect, useMemo, useState } from "react";

import { supabase } from "../lib/supabase/client";
import { localDateString } from "../lib/local-date";
import { buildClassList, childrenInClass, classById } from "../lib/classes";
import {
  INCIDENT_AUDIENCES,
  DEFAULT_INCIDENT_AUDIENCE,
  audienceIncludesFamily,
  mapAudienceToIndicators,
  type IncidentAudience,
} from "../lib/incidentAudience";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_LABELS,
  incidentCategoryLabel,
  isIncidentCategory,
} from "../lib/incidentCategories";
import {
  buildMarkSeenUpdate,
  groupIncidentsByChild,
  incidentAudienceLabelFromIndicators,
  incidentReadState,
  incidentSeenHourLabel,
  incidentTargetsFamily,
  visibleIncidentsForRole,
  type IncidentViewerRole,
} from "../lib/incidentReadStatus";
import type { Database } from "../types/database";
import FeedbackToast from "./FeedbackToast";
import TopNav from "./TopNav";

type Child = Database["public"]["Tables"]["children"]["Row"];
type SchoolClass = Database["public"]["Tables"]["classes"]["Row"];
type Incident = Database["public"]["Tables"]["incidents"]["Row"];

const AUDIENCE_LABELS: Record<IncidentAudience, string> = {
  colegio: "Colegio",
  familia: "Familia",
  ambos: "Ambos",
};

const INCIDENT_SELECT =
  "id, child_id, category, created_at, date, description, family_responded_at, family_response, family_seen, monitor_id, monitor_validated, requires_family_signature, reviewed, send_notification";

export default function IncidentsApp() {
  const [children, setChildren] = useState<Child[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<IncidentViewerRole | null>(null);
  const [parentChildIds, setParentChildIds] = useState<string[]>([]);
  const [markingSeen, setMarkingSeen] = useState<Record<string, boolean>>({});
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [notifyChild, setNotifyChild] = useState<Child | null>(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<IncidentAudience>(
    DEFAULT_INCIDENT_AUDIENCE,
  );
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "warning" | "error";
  } | null>(null);
  const [state, setState] = useState<
    "loading" | "signed-out" | "ready" | "error"
  >("loading");

  const todayStr = useMemo(() => localDateString(), []);

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

      const userResult = await supabase
        .from("users")
        .select("role")
        .eq("id", session.user.id)
        .single();
      if (!active) return;

      const role = (userResult.data?.role ?? null) as IncidentViewerRole | null;
      if (userResult.error || !role) {
        // Compatibilidad con sesión de monitor sin perfil en users:
        // intenta resolver como monitor por monitors.user_id.
        const monitorFallback = await supabase
          .from("monitors")
          .select("id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (!active) return;
        if (monitorFallback.error || !monitorFallback.data) {
          setState("error");
          return;
        }
        setUserRole("monitor");
        setMonitorId(monitorFallback.data.id);
      } else {
        setUserRole(role);
        if (role === "monitor") {
          const monitorResult = await supabase
            .from("monitors")
            .select("id")
            .eq("user_id", session.user.id)
            .maybeSingle();
          if (!active) return;
          if (monitorResult.error || !monitorResult.data) {
            setState("error");
            return;
          }
          setMonitorId(monitorResult.data.id);
        }
      }

      const effectiveRole: IncidentViewerRole =
        (userResult.data?.role as IncidentViewerRole | undefined) ?? "monitor";

      if (effectiveRole === "padre") {
        const linksResult = await supabase
          .from("parents_children")
          .select("child_id")
          .eq("parent_id", session.user.id);
        if (!active) return;
        if (linksResult.error) {
          setState("error");
          return;
        }
        const ownedIds = (linksResult.data ?? []).map((row) => row.child_id);
        setParentChildIds(ownedIds);
        if (ownedIds.length === 0) {
          setChildren([]);
          setClasses([]);
          setIncidents([]);
          setState("ready");
          return;
        }
        const [childrenResult, classesResult, incidentsResult] =
          await Promise.all([
            supabase
              .from("children")
              .select("id, first_name, last_name, class_id, created_at")
              .in("id", ownedIds)
              .order("last_name"),
            supabase.from("classes").select("id, name, school_id"),
            supabase
              .from("incidents")
              .select(INCIDENT_SELECT)
              .eq("date", localDateString())
              .in("child_id", ownedIds),
          ]);
        if (!active) return;
        if (
          childrenResult.error ||
          classesResult.error ||
          incidentsResult.error
        ) {
          setState("error");
          return;
        }
        // Defensa en profundidad: RLS ya filtra a familia, aquí también.
        const familyOnly = visibleIncidentsForRole(
          (incidentsResult.data ?? []) as Incident[],
          "padre",
          ownedIds,
        );
        setChildren(childrenResult.data ?? []);
        setClasses(classesResult.data ?? []);
        setIncidents(familyOnly);
        setState("ready");
        return;
      }

      const [childrenResult, classesResult, incidentsResult] =
        await Promise.all([
          supabase
            .from("children")
            .select("id, first_name, last_name, class_id, created_at")
            .order("last_name"),
          supabase.from("classes").select("id, name, school_id"),
          supabase
            .from("incidents")
            .select(INCIDENT_SELECT)
            .eq("date", localDateString()),
        ]);
      if (!active) return;
      if (
        childrenResult.error ||
        classesResult.error ||
        incidentsResult.error
      ) {
        setState("error");
        return;
      }
      setChildren(childrenResult.data ?? []);
      setClasses(classesResult.data ?? []);
      setIncidents(incidentsResult.data ?? []);
      setState("ready");
    }

    void loadData();
    return () => {
      active = false;
    };
  }, []);

  // El cambio a visto llega sin recargar: suscripción en vivo a incidencias.
  // Informativo, sin bloqueo operativo: solo fusiona el estado entrante.
  // La familia refiltra por hijos y audiencia para no colar avisos ajenos.
  useEffect(() => {
    if (state !== "ready") return;
    const channel = supabase
      .channel("incidents-day")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, (payload) => {
        if (payload.eventType === "DELETE" && payload.old) {
          const oldRow = payload.old as { id?: string };
          if (!oldRow.id) return;
          setIncidents((current) =>
            current.filter((incident) => incident.id !== oldRow.id),
          );
          return;
        }
        const row = (payload.new ?? null) as Incident | null;
        if (!row || !row.id) return;
        if (row.date !== todayStr) return;
        if (userRole === "padre") {
          if (!parentChildIds.includes(row.child_id ?? "")) return;
          if (!incidentTargetsFamily(row)) return;
        }
        setIncidents((current) => {
          const exists = current.some((incident) => incident.id === row.id);
          if (!exists) {
            if (userRole === "padre") {
              const merged = visibleIncidentsForRole(
                [...current, row],
                "padre",
                parentChildIds,
              );
              return merged;
            }
            return [row, ...current];
          }
          return current.map((incident) =>
            incident.id === row.id ? row : incident,
          );
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [state, todayStr, userRole, parentChildIds]);

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
  const incidentsByChild = useMemo(() => {
    const map = new Map<string, Incident[]>();
    for (const incident of incidents) {
      if (!incident.child_id) continue;
      const list = map.get(incident.child_id) ?? [];
      list.push(incident);
      map.set(incident.child_id, list);
    }
    return map;
  }, [incidents]);

  function openNotify(child: Child) {
    setNotifyChild(child);
    setCategory("");
    setDescription("");
    setAudience(DEFAULT_INCIDENT_AUDIENCE);
    setRequiresConfirmation(false);
  }

  function closeNotify() {
    if (saving) return;
    setNotifyChild(null);
  }

  async function saveIncident() {
    if (saving || !notifyChild) return;
    if (!isIncidentCategory(category)) {
      setToast({
        message: "Cal triar una categoria per crear la incidència.",
        type: "error",
      });
      return;
    }
    if (!monitorId) {
      setToast({
        message: "No se ha podido guardar la incidencia",
        type: "error",
      });
      return;
    }
    setSaving(true);
    const indicators = mapAudienceToIndicators(audience, requiresConfirmation);
    const result = await supabase
      .from("incidents")
      .insert({
        child_id: notifyChild.id,
        monitor_id: monitorId,
        category,
        date: todayStr,
        description: description.trim() ? description.trim() : null,
        requires_family_signature: indicators.requires_family_signature,
        send_notification: indicators.send_notification,
        reviewed: false,
        family_seen: false,
        monitor_validated: false,
      })
      .select(INCIDENT_SELECT)
      .single();
    setSaving(false);
    if (result.error || !result.data) {
      setToast({
        message: "No se ha podido guardar la incidencia",
        type: "error",
      });
      return;
    }
    setIncidents((current) => [result.data as Incident, ...current]);
    setNotifyChild(null);
    setToast({ message: "Incidència registrada", type: "success" });
  }

  async function markSeen(incident: Incident) {
    if (markingSeen[incident.id]) return;
    // Solo la familia confirma cuando se le exige; gesto único sin respuesta.
    if (!incidentTargetsFamily(incident)) return;
    setMarkingSeen((current) => ({ ...current, [incident.id]: true }));
    const nowIso = new Date().toISOString();
    const update = buildMarkSeenUpdate(nowIso);
    const result = await supabase
      .from("incidents")
      .update(update)
      .eq("id", incident.id)
      .select(INCIDENT_SELECT)
      .single();
    setMarkingSeen((current) => ({ ...current, [incident.id]: false }));
    if (result.error || !result.data) {
      setToast({
        message: "No se ha podido marcar como visto",
        type: "error",
      });
      return;
    }
    const updated = result.data as Incident;
    setIncidents((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setToast({ message: "Visto registrado", type: "success" });
  }

  function renderIncidentHistory(incident: Incident, showAck: boolean) {
    const read = incidentReadState(incident);
    const audienceLabel = incidentAudienceLabelFromIndicators(
      incident.requires_family_signature,
      incident.send_notification,
    );
    const hourLabel = incidentSeenHourLabel(read.seenAt);
    const needsAck =
      showAck &&
      incident.requires_family_signature === true &&
      incident.family_seen !== true;
    return (
      <li
        key={incident.id}
        className="rounded-xl border border-slate-100 bg-slate-50 p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-800">
            {incidentCategoryLabel(incident.category)}
          </span>
          <span className="text-xs text-slate-500">{audienceLabel}</span>
        </div>
        {incident.description ? (
          <p className="mt-1 text-sm text-slate-700">{incident.description}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-400">Sense descripció</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {read.status === "visto" ? (
            <span className="text-xs font-medium text-emerald-700">
              visto{hourLabel ? ` ${hourLabel}` : ""}
            </span>
          ) : (
            <span className="text-xs font-medium text-amber-700">
              pendiente
            </span>
          )}
          {needsAck && (
            <button
              type="button"
              aria-label={`Marcar como visto la incidencia de ${incidentCategoryLabel(incident.category)}`}
              onClick={() => void markSeen(incident)}
              disabled={markingSeen[incident.id] === true}
              className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {markingSeen[incident.id] === true
                ? "Guardando…"
                : "Marcar como visto"}
            </button>
          )}
        </div>
      </li>
    );
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
          Inicia sesión para notificar incidencias.
        </p>
        <a
          className="mt-4 inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white"
          href="/setup"
        >
          Configurar dispositivo
        </a>
      </section>
    );
  if (state === "error")
    return (
      <p className="p-6 text-sm text-slate-500">
        No se han podido cargar los datos autorizados.
      </p>
    );

  const isFamily = userRole === "padre";
  const canNotify = userRole === "monitor" && monitorId != null;

  if (isFamily) {
    const ownedChildren = children.filter((child) =>
      parentChildIds.includes(child.id),
    );
    const familyIncidents = visibleIncidentsForRole(
      incidents,
      "padre",
      parentChildIds,
    );
    const familyByChild = groupIncidentsByChild(familyIncidents);
    return (
      <>
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
          <div>
            <h1 className="text-lg font-bold leading-none text-slate-900">
              Incidencias
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Avisos de hoy dirigidos a tu familia
            </p>
          </div>
        </header>
        {ownedChildren.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Hoy no hay avisos para tus hijos.
          </p>
        ) : (
          <ul className="flex flex-1 flex-col gap-3 p-4 pb-24">
            {ownedChildren.map((child) => {
              const todays = familyByChild.get(child.id) ?? [];
              return (
                <li
                  key={child.id}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <p className="truncate text-sm font-bold text-slate-900">
                    {`${child.first_name} ${child.last_name}`}
                  </p>
                  {todays.length > 0 ? (
                    <ul
                      aria-label={`Historial de hoy de ${child.first_name} ${child.last_name}`}
                      className="mt-3 flex flex-col gap-2"
                    >
                      {todays.map((incident) =>
                        renderIncidentHistory(incident, true),
                      )}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      Sense incidències avui
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <FeedbackToast message={toast?.message ?? null} type={toast?.type} />
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex flex-col gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedClass && (
              <button
                type="button"
                onClick={() => {
                  setSelectedClassId(null);
                  setNotifyChild(null);
                }}
                className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200"
              >
                ← Volver
              </button>
            )}
            <div>
              <h1 className="text-lg font-bold leading-none text-slate-900">
                {selectedClass ? selectedClass.name : "Incidencias"}
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {selectedClass
                  ? "Notifica una incidencia por alumno"
                  : "Selecciona una clase para notificar"}
              </p>
            </div>
          </div>
          <a
            href="/incidencias"
            className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200"
          >
            Historial
          </a>
        </div>
        <TopNav active="incidencias" />
      </header>

      {!selectedClass ? (
        classList.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Este centro todavía no tiene clases.
          </p>
        ) : (
          <div className="flex flex-1 flex-col gap-3 p-4 pb-24">
            {classList.map((classItem) => (
              <button
                key={classItem.id}
                type="button"
                onClick={() => setSelectedClassId(classItem.id)}
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
        )
      ) : visibleChildren.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">
          Esta clase todavía no tiene alumnos.
        </p>
      ) : (
        <ul className="flex flex-1 flex-col gap-3 p-4 pb-24">
          {visibleChildren.map((child) => {
            const todays = incidentsByChild.get(child.id) ?? [];
            return (
              <li
                key={child.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {`${child.first_name} ${child.last_name}`}
                    </p>
                    {todays.length > 0 ? (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Incidència avui:{" "}
                        {todays
                          .map((incident) =>
                            incidentCategoryLabel(incident.category),
                          )
                          .join(", ")}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        Sense incidències avui
                      </p>
                    )}
                  </div>
                  {canNotify && (
                    <button
                      type="button"
                      aria-label={`Notificar a ${child.first_name} ${child.last_name}`}
                      onClick={() => openNotify(child)}
                      className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Notificar
                    </button>
                  )}
                </div>
                {todays.length > 0 && (
                  <ul
                    aria-label={`Historial de hoy de ${child.first_name} ${child.last_name}`}
                    className="mt-3 flex flex-col gap-2"
                  >
                    {todays.map((incident) =>
                      renderIncidentHistory(incident, false),
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {notifyChild && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeNotify}
          />
          <div className="relative flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl md:w-[600px] md:max-w-[90vw] md:rounded-2xl">
            <h2 className="text-xl font-bold text-slate-900">
              Notificar a {`${notifyChild.first_name} ${notifyChild.last_name}`}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Fecha de hoy {todayStr}
            </p>

            <label
              htmlFor="incident-category"
              className="mt-4 text-sm font-medium text-slate-700"
            >
              Categoría
            </label>
            <select
              id="incident-category"
              name="category"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 h-12 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-emerald-500"
            >
              <option value="">Selecciona una categoria</option>
              {INCIDENT_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {INCIDENT_CATEGORY_LABELS[option]}
                </option>
              ))}
            </select>

            <label
              htmlFor="incident-description"
              className="mt-4 text-sm font-medium text-slate-700"
            >
              Descripción de la incidencia
            </label>
            <textarea
              id="incident-description"
              name="description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Explica què ha passat..."
              className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500"
            />

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-slate-700">
                Audiencia del aviso
              </legend>
              <div className="mt-2 flex flex-col gap-2">
                {INCIDENT_AUDIENCES.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-800"
                  >
                    <input
                      type="radio"
                      name="audience"
                      value={option}
                      required
                      checked={audience === option}
                      onChange={() => {
                        setAudience(option);
                        if (!audienceIncludesFamily(option)) {
                          setRequiresConfirmation(false);
                        }
                      }}
                    />
                    {AUDIENCE_LABELS[option]}
                  </label>
                ))}
              </div>
            </fieldset>

            {audienceIncludesFamily(audience) && (
              <label className="mt-4 flex cursor-pointer items-center justify-between rounded-2xl border border-slate-100 bg-white p-4">
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-slate-800">
                    Requiere confirmación de lectura
                  </span>
                  <span className="text-xs text-slate-500">
                    La familia debe marcar el visto
                  </span>
                </span>
                <input
                  type="checkbox"
                  name="requiresConfirmation"
                  checked={requiresConfirmation}
                  onChange={(event) =>
                    setRequiresConfirmation(event.target.checked)
                  }
                  aria-label="Requiere confirmación de lectura"
                />
              </label>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeNotify}
                className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveIncident()}
                disabled={saving}
                className="flex-[2] rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar incidencia"}
              </button>
            </div>
          </div>
        </div>
      )}

      <FeedbackToast message={toast?.message ?? null} type={toast?.type} />
    </>
  );
}
