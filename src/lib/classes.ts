import type { Database } from "../types/database";

type SchoolClass = Database["public"]["Tables"]["classes"]["Row"];
type Child = Database["public"]["Tables"]["children"]["Row"];

export interface ClassListItem {
  id: string;
  name: string;
  childCount: number;
}

export function buildClassList(
  classes: SchoolClass[],
  children: Child[],
): ClassListItem[] {
  const childCountByClass = new Map<string, number>();
  for (const child of children) {
    if (!child.class_id) continue;
    childCountByClass.set(
      child.class_id,
      (childCountByClass.get(child.class_id) ?? 0) + 1,
    );
  }
  return [...classes]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((classItem) => ({
      id: classItem.id,
      name: classItem.name,
      childCount: childCountByClass.get(classItem.id) ?? 0,
    }));
}

export function childrenInClass(children: Child[], classId: string): Child[] {
  return children.filter((child) => child.class_id === classId);
}

export function classById(
  classes: SchoolClass[],
  classId: string,
): SchoolClass | null {
  return classes.find((classItem) => classItem.id === classId) ?? null;
}
