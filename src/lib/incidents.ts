import { supabaseAdmin } from "./supabase-admin";
import type { Database } from "./database.types";

type IncidentRow = Database["public"]["Tables"]["incidents"]["Row"];
type IncidentInsert = Database["public"]["Tables"]["incidents"]["Insert"];

export interface IncidentWithChild extends IncidentRow {
  child: {
    id: string;
    first_name: string;
    last_name: string;
    class: {
      id: string;
      name: string;
    } | null;
  } | null;
}

function getClient() {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase admin client not configured. Check SUPABASE_SERVICE_ROLE_KEY environment variable.",
    );
  }
  return supabaseAdmin;
}

export async function getIncidentsByMonitor(
  monitorId: string,
): Promise<IncidentWithChild[]> {
  try {
    const { data, error } = await getClient()
      .from("incidents")
      .select(
        `
        *,
        child:children (
          id,
          first_name,
          last_name,
          class:classes (
            id,
            name
          )
        )
      `,
      )
      .eq("monitor_id", monitorId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching incidents:", error);
      return [];
    }

    return (data as unknown as IncidentWithChild[]) || [];
  } catch (error) {
    console.error("Error in getIncidentsByMonitor:", error);
    return [];
  }
}

export async function getIncidentById(
  id: string,
): Promise<IncidentWithChild | null> {
  try {
    const { data, error } = await getClient()
      .from("incidents")
      .select(
        `
        *,
        child:children (
          id,
          first_name,
          last_name,
          class:classes (
            id,
            name
          )
        )
      `,
      )
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching incident:", error);
      return null;
    }

    return data as unknown as IncidentWithChild;
  } catch (error) {
    console.error("Error in getIncidentById:", error);
    return null;
  }
}

export async function createIncident(
  data: Omit<IncidentInsert, "id" | "created_at">,
): Promise<IncidentRow | null> {
  try {
    const { data: result, error } = await getClient()
      .from("incidents")
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error("Error creating incident:", error);
      return null;
    }

    return result;
  } catch (error) {
    console.error("Error in createIncident:", error);
    return null;
  }
}

export async function updateIncident(
  id: string,
  updates: Database["public"]["Tables"]["incidents"]["Update"],
): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("incidents")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.error("Error updating incident:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in updateIncident:", error);
    return false;
  }
}

export async function getClassesWithChildren(
  monitorId: string,
): Promise<{ className: string; children: { id: string; name: string }[] }[]> {
  try {
    const { data: monitorSchool, error: msError } = await getClient()
      .from("monitors_schools")
      .select("school_id")
      .eq("monitor_id", monitorId)
      .single();

    if (msError || !monitorSchool) {
      console.error("Error fetching monitor school:", msError);
      return [];
    }

    const { data: classes, error: cError } = await getClient()
      .from("classes")
      .select("id, name")
      .eq("school_id", monitorSchool.school_id);

    if (cError || !classes) {
      console.error("Error fetching classes:", cError);
      return [];
    }

    const result = await Promise.all(
      classes.map(async (cls) => {
        const { data: children } = await getClient()
          .from("children")
          .select("id, first_name, last_name")
          .eq("class_id", cls.id);

        return {
          className: cls.name,
          children:
            children?.map((c) => ({
              id: c.id,
              name: `${c.first_name} ${c.last_name}`,
            })) || [],
        };
      }),
    );

    return result;
  } catch (error) {
    console.error("Error in getClassesWithChildren:", error);
    return [];
  }
}
