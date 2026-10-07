import type { IncidentAudience } from "./incidentAudience";

export type IncidentReadStatus = "pendiente" | "visto";

export interface IncidentReadState {
  status: IncidentReadStatus;
  seenAt: string | null;
}

interface ReadFields {
  family_seen?: boolean | null;
  family_responded_at?: string | null;
}

interface AudienceFields {
  requires_family_signature?: boolean | null;
  send_notification?: boolean | null;
}

interface ChildScoped extends AudienceFields {
  child_id?: string | null;
}

export function incidentReadState(incident: ReadFields): IncidentReadState {
  if (incident.family_seen === true) {
    return {
      status: "visto",
      seenAt: incident.family_responded_at ?? null,
    };
  }
  return { status: "pendiente", seenAt: null };
}

export function incidentRequiresConfirmation(
  incident: AudienceFields,
): boolean {
  return incident.requires_family_signature === true;
}

/**
 * La audiencia vive solo en interfaz sobre los dos indicadores existentes.
 * (false, true) es ambiguo entre colegio y ambos-sin-confirmación: se
 * interpreta como colegio para no filtrar avisos solo-colegio a la familia.
 */
export function incidentTargetsFamily(incident: AudienceFields): boolean {
  return (
    incident.requires_family_signature === true ||
    incident.send_notification !== true
  );
}

export function incidentTargetsSchool(incident: AudienceFields): boolean {
  return incident.send_notification === true;
}

export function resolveIncidentAudienceFromIndicators(
  requiresFamilySignature: boolean | null | undefined,
  sendNotification: boolean | null | undefined,
): IncidentAudience {
  if (sendNotification !== true) return "familia";
  if (requiresFamilySignature === true) return "ambos";
  return "colegio";
}

export const INCIDENT_AUDIENCE_LABELS: Record<IncidentAudience, string> = {
  colegio: "Colegio",
  familia: "Familia",
  ambos: "Ambos",
};

export function incidentAudienceLabelFromIndicators(
  requiresFamilySignature: boolean | null | undefined,
  sendNotification: boolean | null | undefined,
): string {
  return INCIDENT_AUDIENCE_LABELS[
    resolveIncidentAudienceFromIndicators(
      requiresFamilySignature,
      sendNotification,
    )
  ];
}

export function filterIncidentsForFamily<T extends AudienceFields>(
  incidents: readonly T[],
): T[] {
  return incidents.filter((incident) => incidentTargetsFamily(incident));
}

export type IncidentViewerRole = "monitor" | "admin" | "padre";

export function visibleIncidentsForRole<T extends ChildScoped>(
  incidents: readonly T[],
  role: IncidentViewerRole,
  parentChildIds: readonly string[],
): T[] {
  if (role === "padre") {
    const allowed = new Set(parentChildIds);
    return incidents.filter(
      (incident) =>
        incident.child_id != null &&
        allowed.has(incident.child_id) &&
        incidentTargetsFamily(incident),
    );
  }
  return [...incidents];
}

export function groupIncidentsByChild<T extends ChildScoped>(
  incidents: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const incident of incidents) {
    if (!incident.child_id) continue;
    const list = map.get(incident.child_id) ?? [];
    list.push(incident);
    map.set(incident.child_id, list);
  }
  return map;
}

export interface MarkSeenUpdate {
  family_seen: true;
  family_responded_at: string;
}

/** Gesto único de la familia: registra el momento, sin respuesta obligatoria. */
export function buildMarkSeenUpdate(nowIso: string): MarkSeenUpdate {
  return { family_seen: true, family_responded_at: nowIso };
}

export function applyMarkSeen<T extends ReadFields>(
  incident: T,
  nowIso: string,
): T {
  return { ...incident, family_seen: true, family_responded_at: nowIso };
}

export function incidentSeenHourLabel(
  seenAt: string | null | undefined,
): string {
  if (!seenAt) return "";
  const date = new Date(seenAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
