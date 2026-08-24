import MealStatusBadge from "./MealStatusBadge";

interface Props {
  name: string;
  status: "all_good" | "incident";
  onClick: () => void;
}

export default function StudentCard({ name, status, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="student-card flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-transform active:scale-[0.98]"
    >
      <span className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-lg font-bold text-slate-400">
          {name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <span className="font-bold leading-tight text-slate-900">{name}</span>
      </span>
      <MealStatusBadge status={status} />
    </button>
  );
}
