import { useEffect, useState } from "react";

import MealRecordModal from "./MealRecordModal";
import { supabase } from "../lib/supabase/client";
import { localDateString } from "../lib/local-date";
import type { MealStatus } from "../lib/mealRecord";
import type { Database } from "../types/database";
import FeedbackToast from "./FeedbackToast";
import StudentCard from "./StudentCard";

type Child = Database["public"]["Tables"]["children"]["Row"];
type MealRecord = Database["public"]["Tables"]["meal_records"]["Row"];
type MealType = Database["public"]["Tables"]["meal_types"]["Row"];
type Incident = Database["public"]["Tables"]["incidents"]["Row"];
type Page = "home" | "search";
type CardStatus = "all_good" | "incident";

function statusFor(records: MealRecord[], incidents: Incident[]): CardStatus {
  return records.some((record) => record.status !== "bien") ||
    incidents.length > 0
    ? "incident"
    : "all_good";
}

export default function BusinessApp({ page }: { page: Page }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [mealTypes, setMealTypes] = useState<MealType[]>([]);
  const [userRole, setUserRole] = useState<
    Database["public"]["Enums"]["user_role"] | null
  >(null);
  const [query, setQuery] = useState("");
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "warning" | "error";
  } | null>(null);
  const [state, setState] = useState<
    "loading" | "signed-out" | "ready" | "error"
  >("loading");

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
        recordsResult,
        incidentsResult,
        mealTypesResult,
        userResult,
      ] = await Promise.all([
        supabase
          .from("children")
          .select("id, first_name, last_name, class_id, created_at")
          .order("last_name"),
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
        supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .single(),
      ]);
      if (!active) return;
      if (
        childrenResult.error ||
        recordsResult.error ||
        incidentsResult.error ||
        mealTypesResult.error ||
        userResult.error
      ) {
        setState("error");
        return;
      }
      setChildren(childrenResult.data ?? []);
      setRecords(recordsResult.data ?? []);
      setIncidents(incidentsResult.data ?? []);
      setMealTypes(mealTypesResult.data ?? []);
      setUserRole(userResult.data.role);
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
    const date = localDateString();
    const result = await supabase
      .from("meal_records")
      .upsert(
        {
          child_id: child.id,
          meal_type_id: mealTypeId,
          recorded_date: date,
          recorded_by: session.user.id,
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

    const monitorsResult = await supabase
      .from("monitors")
      .select("id")
      .limit(1);
    const monitorId = monitorsResult.data?.[0]?.id;
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
    if (monitorsResult.error || !monitorId) {
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
      p_monitor_id: monitorId,
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
          href="/login"
        >
          Ir al login
        </a>
      </section>
    );

  const visibleChildren = children.filter(
    (child) =>
      page !== "search" ||
      `${child.first_name} ${child.last_name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const canManageIncidents = userRole === "admin" || userRole === "supervisor";
  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
        <div>
          <h1 className="text-lg font-bold leading-none text-slate-900">
            {page === "search" ? "Buscar Alumno" : "Mi Clase"}
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Datos visibles según los permisos de tu cuenta
          </p>
        </div>
        <a
          className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600"
          href={page === "search" ? "/" : "/search"}
        >
          {page === "search" ? "Volver" : "Buscar"}
        </a>
      </header>
      {page === "search" && (
        <div className="px-4 pt-4">
          <label className="sr-only" htmlFor="student-search">
            Buscar alumno
          </label>
          <input
            id="student-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar alumno..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 text-sm outline-none focus:border-emerald-500 focus:bg-white"
          />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 p-4 pb-24 md:grid-cols-2 lg:grid-cols-3">
        {visibleChildren.map((child) => (
          <StudentCard
            key={child.id}
            name={`${child.first_name} ${child.last_name}`}
            status={statusFor(
              records.filter((record) => record.child_id === child.id),
              incidents.filter((incident) => incident.child_id === child.id),
            )}
            onClick={() => setSelectedChild(child)}
          />
        ))}
      </div>
      {state === "error" && (
        <p className="px-4 pb-6 text-sm text-slate-500">
          No se han podido cargar los datos autorizados.
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
