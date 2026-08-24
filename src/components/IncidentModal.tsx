import { useState } from "react";

interface Props {
  studentName: string;
  onClose: () => void;
  onSave: (details: {
    noFirst: boolean;
    noSecond: boolean;
    noGarnish: boolean;
    noDessert: boolean;
    comments: string;
  }) => void;
}

export default function IncidentModal({ studentName, onClose, onSave }: Props) {
  const [noFirst, setNoFirst] = useState(false);
  const [noSecond, setNoSecond] = useState(false);
  const [noGarnish, setNoGarnish] = useState(false);
  const [noDessert, setNoDessert] = useState(false);
  const [comments, setComments] = useState("");

  const save = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    onSave({ noFirst, noSecond, noGarnish, noDessert, comments });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="incident-modal-title"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl md:w-[600px] md:rounded-2xl"
      >
        <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-slate-200" />
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="incident-modal-title"
            className="text-2xl font-bold text-slate-900"
          >
            {studentName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400"
          >
            <span className="sr-only">Cerrar</span>
            <span aria-hidden="true" className="text-2xl">
              ×
            </span>
          </button>
        </div>
        <form onSubmit={save} className="space-y-6">
          <div className="space-y-3">
            {[
              ["No ha comido primero", noFirst, setNoFirst],
              ["No ha comido segundo", noSecond, setNoSecond],
              ["No ha comido guarnición", noGarnish, setNoGarnish],
              ["No ha comido postre", noDessert, setNoDessert],
            ].map(([label, checked, setChecked]) => (
              <label
                key={label as string}
                className="flex cursor-pointer items-center justify-between rounded-xl border-2 border-slate-100 p-4 font-medium text-slate-700 has-[:checked]:border-red-100 has-[:checked]:bg-red-50"
              >
                {label as string}
                <input
                  type="checkbox"
                  checked={checked as boolean}
                  onChange={(event) =>
                    (setChecked as (value: boolean) => void)(
                      event.target.checked,
                    )
                  }
                  className="h-6 w-6 rounded border-slate-300 text-red-600"
                />
              </label>
            ))}
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Comentarios adicionales
            <textarea
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder="Detalla si es necesario..."
              className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-emerald-500"
            />
          </label>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                onSave({
                  noFirst: false,
                  noSecond: false,
                  noGarnish: false,
                  noDessert: false,
                  comments: "",
                })
              }
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-medium text-slate-700"
            >
              Todo bien
            </button>
            <button
              type="submit"
              className="flex-[2] rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white"
            >
              Guardar Cambios
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
