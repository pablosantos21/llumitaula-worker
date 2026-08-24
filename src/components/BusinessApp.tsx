import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase/client";
import type { Database } from "../types/database";
import FeedbackToast from "./FeedbackToast";
import IncidentModal from "./IncidentModal";
import StudentCard from "./StudentCard";

type Child = Database["public"]["Tables"]["children"]["Row"];
type MealRecord = Database["public"]["Tables"]["meal_records"]["Row"];
type MealType = Database["public"]["Tables"]["meal_types"]["Row"];
type Page = "home" | "search";
type CardStatus = "all_good" | "incident";

function statusFor(records: MealRecord[]): CardStatus {
  return records.some((record) => record.status !== "bien")
    ? "incident"
    : "all_good";
}

export default function BusinessApp({ page }: { page: Page }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [mealTypes, setMealTypes] = useState<MealType[]>([]);
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

      const [childrenResult, recordsResult, mealTypesResult] =
        await Promise.all([
          supabase
            .from("children")
            .select("id, first_name, last_name, class_id, created_at")
            .order("last_name"),
          supabase
            .from("meal_records")
            .select(
              "id, child_id, meal_type_id, notes, recorded_at, recorded_by, status",
            )
            .gte("recorded_at", new Date().toISOString().slice(0, 10)),
          supabase
            .from("meal_types")
            .select("id, name, active, school_id, sort_order, created_at")
            .eq("active", true)
            .order("sort_order"),
        ]);
      if (!active) return;
      if (
        childrenResult.error ||
        recordsResult.error ||
        mealTypesResult.error
      ) {
        setState("error");
        return;
      }
      setChildren(childrenResult.data ?? []);
      setRecords(recordsResult.data ?? []);
      setMealTypes(mealTypesResult.data ?? []);
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
    status: Database["public"]["Enums"]["meal_status"],
    notes: string,
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session || mealTypes.length === 0) {
      setToast({ message: "No se ha podido guardar el estado", type: "error" });
      return;
    }
    const childRecords = records.filter(
      (record) => record.child_id === child.id,
    );
    const result = childRecords.length
      ? await supabase
          .from("meal_records")
          .update({ status, notes, recorded_by: session.user.id })
          .in(
            "id",
            childRecords.map((record) => record.id),
          )
          .select()
      : await supabase
          .from("meal_records")
          .insert({
            child_id: child.id,
            meal_type_id: mealTypes[0].id,
            recorded_by: session.user.id,
            status,
            notes,
          })
          .select();
    if (result.error) {
      setToast({ message: "No se ha podido guardar el estado", type: "error" });
      return;
    }
    const saved = result.data ?? [];
    setRecords((current) => [
      ...current.filter(
        (record) => !childRecords.some((old) => old.id === record.id),
      ),
      ...saved,
    ]);
    setSelectedChild(null);
    setToast({
      message:
        status === "bien"
          ? 'Marcado como "Ha comido bien"'
          : "Incidencia registrada",
      type: status === "bien" ? "success" : "warning",
    });
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
      {selectedChild && (
        <IncidentModal
          studentName={`${selectedChild.first_name} ${selectedChild.last_name}`}
          onClose={() => setSelectedChild(null)}
          onSave={({ noFirst, noSecond, noGarnish, noDessert, comments }) => {
            const incident = noFirst || noSecond || noGarnish || noDessert;
            void saveStatus(
              selectedChild,
              incident ? "mal" : comments ? "regular" : "bien",
              comments,
            );
          }}
        />
      )}
      <FeedbackToast
        message={toast?.message ?? null}
        type={toast?.type ?? "success"}
      />
    </>
  );
}
