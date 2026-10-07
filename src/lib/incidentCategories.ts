export const INCIDENT_CATEGORIES = [
  "salud",
  "comportamiento",
  "comedor",
  "descanso",
  "recogida",
  "otro",
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export function isIncidentCategory(value: unknown): value is IncidentCategory {
  return (
    typeof value === "string" &&
    (INCIDENT_CATEGORIES as readonly string[]).includes(value)
  );
}

export function resolveIncidentCategory(value: unknown): IncidentCategory {
  return isIncidentCategory(value) ? value : "otro";
}

export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  salud: "Salud",
  comportamiento: "Comportamiento",
  comedor: "Comedor",
  descanso: "Descanso",
  recogida: "Recogida",
  otro: "Otro",
};

export function incidentCategoryLabel(value: unknown): string {
  return INCIDENT_CATEGORY_LABELS[resolveIncidentCategory(value)];
}
