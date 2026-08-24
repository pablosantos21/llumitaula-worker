interface Props {
  status: "all_good" | "incident";
}

export default function MealStatusBadge({ status }: Props) {
  const incident = status === "incident";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
        incident
          ? "border-amber-100 bg-amber-50 text-amber-700"
          : "border-emerald-100 bg-emerald-50 text-emerald-700"
      }`}
    >
      <span aria-hidden="true">{incident ? "!" : "✓"}</span>
      {incident ? "Incidencia" : "Bien"}
    </span>
  );
}
