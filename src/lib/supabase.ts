import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Allow missing variables during build, they'll be required at runtime
let supabase: ReturnType<typeof createClient> | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export { supabase };

export interface Monitor {
  id: string;
  first_name: string;
  last_name: string;
  code: number;
  created_at: string;
}

export interface Child {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string;
  created_at: string;
}

export interface ClassData {
  id: string;
  name: string;
  school_id: string;
}

/**
 * Authenticate a monitor using their code
 */
export async function authenticateMonitor(code: number): Promise<Monitor | null> {
  if (!supabase) {
    console.error(
      "Supabase not configured. Check PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("monitors")
      .select("*")
      .eq("code", code)
      .single();

    if (error) {
      console.error("Error authenticating monitor:", error);
      return null;
    }

    return data as Monitor;
  } catch (error) {
    console.error("Error in authenticateMonitor:", error);
    return null;
  }
}

/**
 * Get all children in a specific class
 */
export async function getChildrenByClass(classId: string): Promise<Child[]> {
  if (!supabase) {
    console.error(
      "Supabase not configured. Check PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("children")
      .select("*")
      .eq("class_id", classId);

    if (error) {
      console.error("Error fetching children:", error);
      return [];
    }

    return (data as Child[]) || [];
  } catch (error) {
    console.error("Error in getChildrenByClass:", error);
    return [];
  }
}

/**
 * Get all children grouped by their class
 */
export async function getChildrenGroupedByClass(
  monitorId: string
): Promise<Record<string, { class: ClassData; children: Child[] }>> {
  if (!supabase) {
    console.error(
      "Supabase not configured. Check PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
    return {};
  }

  try {
    // First get the monitor's school
    const { data: monitorSchoolData, error: monitorSchoolError } =
      await supabase
        .from("monitors_schools")
        .select("school_id")
        .eq("monitor_id", monitorId)
        .single();

    if (monitorSchoolError) {
      console.error("Error fetching monitor school:", monitorSchoolError);
      return {};
    }

    const schoolId = monitorSchoolData.school_id;

    // Get all classes for this school
    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select("*")
      .eq("school_id", schoolId);

    if (classesError) {
      console.error("Error fetching classes:", classesError);
      return {};
    }

    // For each class, get the children
    const result: Record<string, { class: ClassData; children: Child[] }> = {};

    for (const classItem of classesData || []) {
      const children = await getChildrenByClass(classItem.id);
      result[classItem.id] = {
        class: classItem as ClassData,
        children,
      };
    }

    return result;
  } catch (error) {
    console.error("Error in getChildrenGroupedByClass:", error);
    return {};
  }
}

/**
 * Get monitor info by ID
 */
export async function getMonitorById(monitorId: string): Promise<Monitor | null> {
  if (!supabase) {
    console.error(
      "Supabase not configured. Check PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("monitors")
      .select("*")
      .eq("id", monitorId)
      .single();

    if (error) {
      console.error("Error fetching monitor:", error);
      return null;
    }

    return data as Monitor;
  } catch (error) {
    console.error("Error in getMonitorById:", error);
    return null;
  }
}
