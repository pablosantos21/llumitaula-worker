import type { PublicMonitor } from "../lib/deviceSetup";

interface Props {
  monitors: PublicMonitor[];
  onSelect: (monitor: PublicMonitor) => void;
}

export default function MonitorSelectScreen({ monitors, onSelect }: Props) {
  return (
    <div className="flex flex-1 flex-col bg-white px-6 py-12">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-emerald-900">
            ¿Quién eres?
          </h1>
          <p className="text-slate-500">Selecciona tu nombre para continuar</p>
        </div>

        <div className="space-y-3">
          {monitors.map((monitor) => (
            <button
              key={monitor.id}
              type="button"
              onClick={() => onSelect(monitor)}
              className="flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-transform active:scale-[0.98]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-lg font-bold text-emerald-600">
                {monitor.first_name[0]}
                {monitor.last_name[0]}
              </span>
              <span className="font-bold leading-tight text-slate-900">
                {monitor.first_name} {monitor.last_name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
