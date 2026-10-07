export const INCIDENT_AUDIENCES = ["colegio", "familia", "ambos"] as const;

export type IncidentAudience = (typeof INCIDENT_AUDIENCES)[number];

export const DEFAULT_INCIDENT_AUDIENCE: IncidentAudience = "ambos";

export function isIncidentAudience(value: unknown): value is IncidentAudience {
  return (
    typeof value === "string" &&
    (INCIDENT_AUDIENCES as readonly string[]).includes(value)
  );
}

export function resolveIncidentAudience(value: unknown): IncidentAudience {
  return isIncidentAudience(value) ? value : DEFAULT_INCIDENT_AUDIENCE;
}

export function audienceIncludesFamily(audience: IncidentAudience): boolean {
  return audience === "familia" || audience === "ambos";
}

export interface IncidentAudienceIndicators {
  requires_family_signature: boolean;
  send_notification: boolean;
}

export function mapAudienceToIndicators(
  audience: IncidentAudience,
  requiresConfirmation: boolean,
): IncidentAudienceIndicators {
  const normalized = resolveIncidentAudience(audience);
  if (normalized === "colegio") {
    return { requires_family_signature: false, send_notification: true };
  }
  if (normalized === "familia") {
    return {
      requires_family_signature: requiresConfirmation,
      send_notification: false,
    };
  }
  return {
    requires_family_signature: requiresConfirmation,
    send_notification: true,
  };
}
