import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClassList,
  childrenInClass,
  classById,
} from "../src/lib/classes.ts";

const classes = [
  { id: "c2", name: "2º Primaria", school_id: "s1" },
  { id: "c1", name: "1º Primaria", school_id: "s1" },
  { id: "c3", name: "Infantil B", school_id: "s1" },
];

const children = [
  {
    id: "k1",
    class_id: "c1",
    first_name: "Ana",
    last_name: "García",
    created_at: null,
  },
  {
    id: "k2",
    class_id: "c1",
    first_name: "Biel",
    last_name: "Roca",
    created_at: null,
  },
  {
    id: "k3",
    class_id: "c2",
    first_name: "Carla",
    last_name: "Soler",
    created_at: null,
  },
  {
    id: "k4",
    class_id: null,
    first_name: "Sin",
    last_name: "Clase",
    created_at: null,
  },
];

test("buildClassList sorts classes alphabetically with per-class child counts", () => {
  assert.deepEqual(buildClassList(classes, children), [
    { id: "c1", name: "1º Primaria", childCount: 2 },
    { id: "c2", name: "2º Primaria", childCount: 1 },
    { id: "c3", name: "Infantil B", childCount: 0 },
  ]);
});

test("buildClassList does not mutate its inputs", () => {
  const classesSnapshot = [...classes];
  const childrenSnapshot = [...children];
  buildClassList(classes, children);
  assert.deepEqual(classes, classesSnapshot);
  assert.deepEqual(children, childrenSnapshot);
});

test("buildClassList returns an empty list for a school without classes", () => {
  assert.deepEqual(buildClassList([], children), []);
});

test("childrenInClass returns only the children of the given class", () => {
  assert.deepEqual(
    childrenInClass(children, "c1").map((child) => child.id),
    ["k1", "k2"],
  );
});

test("childrenInClass ignores children without a class", () => {
  assert.deepEqual(childrenInClass(children, "__missing__"), []);
});

test("classById returns the matching class or null", () => {
  assert.equal(classById(classes, "c2")?.name, "2º Primaria");
  assert.equal(classById(classes, "__missing__"), null);
  assert.equal(classById([], "c1"), null);
});
