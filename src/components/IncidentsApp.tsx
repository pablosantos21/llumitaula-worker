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
import type { Database } from "../types/database";
import FeedbackToast from "./FeedbackToast";

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

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
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
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
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
                    <p className="mt-1 text-xs text-slate-500">Sense incidències avui</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Notificar a ${child.first_name} ${child.last_name}`}
                  onClick={() => openNotify(child)}
                  className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Notificar
                </button>
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
