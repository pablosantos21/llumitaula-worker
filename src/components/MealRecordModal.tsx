import { useEffect, useRef, useState } from "react";

import {
  buildMealRecordPayload,
  type MealRecordFormValues,
  type MealStatus,
} from "../lib/mealRecord";

interface Child {
  id: string;
  first_name: string;
  last_name: string;
}

interface MealRecordModalProps {
  child: Child | null;
  mealTypes: { id: string; name: string }[];
  canManageIncidents: boolean;
  onClose: () => void;
  onSave: (payload: ReturnType<typeof buildMealRecordPayload>) => void;
}

const initialValues: Omit<MealRecordFormValues, "childId"> = {
  mealTypeId: "",
  status: "bien",
  notes: "",
  noFirst: false,
  noSecond: false,
  noGarnish: false,
  noDessert: false,
  incidentComments: "",
};

export default function MealRecordModal({
  child,
  mealTypes,
  canManageIncidents,
  onClose,
  onSave,
}: MealRecordModalProps) {
  const [values, setValues] = useState(initialValues);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!child) return;
    firstFieldRef.current?.focus();
  }, [child]);

  if (!child) return null;
  const activeChild = child;

  const update = <K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    onSave(
      buildMealRecordPayload(
        {
          childId: activeChild.id,
          ...values,
          mealTypeId: values.mealTypeId || mealTypes[0]?.id || "",
        },
        canManageIncidents,
      ),
    );
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm md:items-center md:p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl md:max-w-xl md:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-modal-title"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
              Registro de comida
            </p>
            <h2
              id="meal-modal-title"
              className="mt-1 text-2xl font-bold text-slate-900"
            >
              {activeChild.first_name} {activeChild.last_name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-2xl text-slate-400"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <form className="space-y-6" onSubmit={submit}>
          <label className="block text-sm font-semibold text-slate-700">
            Tipo de comida
            <select
              value={values.mealTypeId || mealTypes[0]?.id || ""}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-emerald-500"
              required
              disabled={mealTypes.length === 0}
              onChange={(event) => update("mealTypeId", event.target.value)}
            >
              {mealTypes.map((mealType) => (
                <option key={mealType.id} value={mealType.id}>
                  {mealType.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="mb-3 text-sm font-bold text-slate-700">
              ¿Cómo ha comido?
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {(["bien", "regular", "mal"] as MealStatus[]).map((status) => (
                <label
                  key={status}
                  className={`cursor-pointer rounded-xl border-2 p-3 text-center text-sm font-semibold capitalize transition-colors ${values.status === status ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-100 text-slate-500"}`}
                >
                  <input
                    ref={status === "bien" ? firstFieldRef : undefined}
                    className="sr-only"
                    type="radio"
                    name="status"
                    value={status}
                    checked={values.status === status}
                    onChange={() => update("status", status)}
                  />
                  {status}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm font-semibold text-slate-700">
            Notas de la comida
            <textarea
              value={values.notes}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Añade una nota si hace falta..."
              rows={2}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          {canManageIncidents && (
            <fieldset className="space-y-2">
              <legend className="mb-3 text-sm font-bold text-slate-700">
                Incidencias
              </legend>
              {(
                [
                  ["noFirst", "No ha comido primero"],
                  ["noSecond", "No ha comido segundo"],
                  ["noGarnish", "No ha comido guarnición"],
                  ["noDessert", "No ha comido postre"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 text-sm text-slate-700 has-[:checked]:border-red-200 has-[:checked]:bg-red-50"
                >
                  {label}
                  <input
                    type="checkbox"
                    checked={values[key]}
                    onChange={(event) => update(key, event.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                </label>
              ))}
              <textarea
                value={values.incidentComments}
                onChange={(event) =>
                  update("incidentComments", event.target.value)
                }
                placeholder="Comentarios de la incidencia..."
                rows={2}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
              />
            </fieldset>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            Guardar registro
          </button>
        </form>
      </section>
    </div>
  );
}
