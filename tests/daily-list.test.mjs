import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInitialDailyList,
  getLunchWeekday,
  isWeekend,
  toggleDailyPresence,
} from "../src/lib/daily-list.ts";

function monday() {
  // 2026-10-05 is a Monday (1 = Lunes)
  return new Date(2026, 9, 5, 12, 0, 0);
}

function saturday() {
  return new Date(2026, 9, 10, 12, 0, 0);
}

function sunday() {
  return new Date(2026, 9, 11, 12, 0, 0);
}

const children = [
  { id: "k1", first_name: "Ana", last_name: "García" },
  { id: "k2", first_name: "Biel", last_name: "Roca" },
  { id: "k3", first_name: "Carla", last_name: "Soler" },
];

test("configured children are marked when the pattern includes today", () => {
  const lunchByChild = new Map([
    ["k1", [1]],
    ["k2", [2]],
  ]);

  const list = buildInitialDailyList(children, lunchByChild, monday());

  assert.deepEqual(
    list.map((item) => [item.childId, item.present]),
    [
      ["k1", true],
      ["k2", false],
      ["k3", false],
    ],
  );
});

test("unconfigured children are unmarked but distinguishable", () => {
  const list = buildInitialDailyList(children, new Map(), monday());

  assert.deepEqual(
    list.map((item) => [item.childId, item.present, item.origin]),
    [
      ["k1", false, "sin-configurar"],
      ["k2", false, "sin-configurar"],
      ["k3", false, "sin-configurar"],
    ],
  );
});

test("configured-but-empty patterns are unmarked and distinguishable", () => {
  const lunchByChild = new Map([["k1", []]]);

  const list = buildInitialDailyList(
    [{ id: "k1", first_name: "Ana", last_name: "García" }],
    lunchByChild,
    monday(),
  );

  assert.deepEqual(list, [
    { childId: "k1", present: false, origin: "sin-dias" },
  ]);
});

test("weekends leave every child unmarked with a weekend origin", () => {
  const lunchByChild = new Map([
    ["k1", [6, 7]],
    ["k2", [1, 2, 3, 4, 5]],
  ]);

  for (const date of [saturday(), sunday()]) {
    assert.equal(isWeekend(date), true);
    assert.equal(getLunchWeekday(date), null);
    const list = buildInitialDailyList(children, lunchByChild, date);
    assert.deepEqual(
      list.map((item) => [item.childId, item.present, item.origin]),
      [
        ["k1", false, "fin-de-semana"],
        ["k2", false, "fin-de-semana"],
        ["k3", false, "fin-de-semana"],
      ],
    );
  }
});

test("an empty class returns an empty list", () => {
  assert.deepEqual(buildInitialDailyList([], new Map(), monday()), []);
});

test("building the list does not mutate its inputs", () => {
  const inputChildren = [
    { id: "k1", first_name: "Ana", last_name: "García" },
    { id: "k2", first_name: "Biel", last_name: "Roca" },
  ];
  const weekdays = [1];
  const lunchByChild = new Map([["k1", weekdays]]);
  const childrenSnapshot = JSON.parse(JSON.stringify(inputChildren));
  const weekdaysSnapshot = [...weekdays];

  const list = buildInitialDailyList(inputChildren, lunchByChild, monday());
  list[0].present = !list[0].present;

  assert.deepEqual(inputChildren, childrenSnapshot);
  assert.deepEqual([...(lunchByChild.get("k1") ?? [])], weekdaysSnapshot);
  assert.deepEqual(weekdays, weekdaysSnapshot);
});

test("toggling one child never writes to the weekly pattern", () => {
  const lunchByChild = new Map([["k1", [1]]]);
  const list = buildInitialDailyList(
    [
      { id: "k1", first_name: "Ana", last_name: "García" },
      { id: "k2", first_name: "Biel", last_name: "Roca" },
    ],
    lunchByChild,
    monday(),
  );
  assert.equal(list.find((item) => item.childId === "k1")?.present, true);

  const toggled = toggleDailyPresence(list, "k1");

  assert.equal(toggled.find((item) => item.childId === "k1")?.present, false);
  assert.equal(toggled.find((item) => item.childId === "k2")?.present, false);
  // Weekly pattern untouched.
  assert.deepEqual(lunchByChild.get("k1"), [1]);
  // Original list untouched.
  assert.equal(list.find((item) => item.childId === "k1")?.present, true);
});
