import { useEffect, useRef, useState } from "react";

import {
  buildMealRecordPayload,
  MEAL_COURSES,
  MEAL_NOTES_MAX_LENGTH,
  MEAL_STATUS_OPTIONS,
  type MealCourses,
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
  initialCourses?: MealCourses;
  initialNotes?: string;
  onClose: () => void;
  onSave: (payload: ReturnType<typeof buildMealRecordPayload>) => void;
}

function baseInitialValues(
  initialCourses?: MealCourses,
  initialNotes?: string,
): Omit<MealRecordFormValues, "childId"> {
  return {
    firstCourse: initialCourses?.firstCourse ?? "todo",
    secondCourse: initialCourses?.secondCourse ?? "todo",
    dessert: initialCourses?.dessert ?? "todo",
    notes: initialNotes ?? "",
  };
}

export default function MealRecordModal({
  child,
  initialCourses,
  initialNotes,
  onClose,
  onSave,
}: MealRecordModalProps) {
  const [values, setValues] = useState(() =>
    baseInitialValues(initialCourses, initialNotes),
  );
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!child) return;
    firstFieldRef.current?.focus();
  }, [child]);

  if (!child) return null;
  const activeChild = child;

  const toggleCourse = (key: keyof MealCourses, value: MealStatus) =>
    setValues((current) => ({
      ...current,
      [key]: current[key] === value ? "todo" : value,
    }));

  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    onSave(
      buildMealRecordPayload({
        childId: activeChild.id,
        ...values,
      }),
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
          <fieldset>
            <legend className="mb-3 text-sm font-bold text-slate-700">
              ¿Cómo ha comido?
            </legend>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-center text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th
                      scope="col"
                      className="px-2 py-2 text-left font-bold text-slate-700"
                    >
                      Plato
                    </th>
                    {MEAL_STATUS_OPTIONS.map(
                      ({ value, label: statusLabel }) => (
                        <th
                          key={value}
                          scope="col"
                          className="whitespace-nowrap px-2 py-2 font-semibold text-slate-500"
                        >
                          {statusLabel}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {MEAL_COURSES.map(({ key, label }, courseIndex) => (
                    <tr key={key} className="border-t border-slate-100">
                      <th
                        scope="row"
                        className="px-2 py-2 text-left font-bold text-slate-700"
                      >
                        {label}
                      </th>
                      {MEAL_STATUS_OPTIONS.map(
                        ({ value, label: statusLabel }) => {
                          const selected = values[key] === value;
                          return (
                            <td
                              key={value}
                              className={`px-2 py-2 transition-colors ${selected ? "bg-emerald-50" : ""}`}
                            >
                              <input
                                ref={
                                  courseIndex === 0 && value === "todo"
                                    ? firstFieldRef
                                    : undefined
                                }
                                type="checkbox"
                                value={value}
                                checked={selected}
                                onChange={() => toggleCourse(key, value)}
                                aria-label={`${label}: ${statusLabel}`}
                                className="h-5 w-5 cursor-pointer accent-emerald-600"
                              />
                            </td>
                          );
                        },
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>

          <label className="block text-sm font-semibold text-slate-700">
            Notas de la comida
            <textarea
              value={values.notes}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Añade una nota si hace falta..."
              rows={2}
              maxLength={MEAL_NOTES_MAX_LENGTH}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

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
