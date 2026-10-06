export type MealStatus = "bien" | "regular" | "mal";

export interface MealRecordFormValues {
  childId: string;
  mealTypeId: string;
  status: MealStatus;
  notes: string;
  noFirst: boolean;
  noSecond: boolean;
  noGarnish: boolean;
  noDessert: boolean;
  incidentComments: string;
}

export function buildMealRecordPayload(
  values: MealRecordFormValues,
  canManageIncidents: boolean,
) {
  const payload = {
    childId: values.childId,
    mealTypeId: values.mealTypeId,
    status: values.status,
    notes: values.notes.trim() || null,
  };

  const hasIncident =
    values.noFirst ||
    values.noSecond ||
    values.noGarnish ||
    values.noDessert ||
    values.incidentComments.trim().length > 0;

  if (!canManageIncidents || !hasIncident) return payload;

  return {
    ...payload,
    incident: {
      noFirst: values.noFirst,
      noSecond: values.noSecond,
      noGarnish: values.noGarnish,
      noDessert: values.noDessert,
      comments: values.incidentComments.trim() || null,
    },
  };
}
