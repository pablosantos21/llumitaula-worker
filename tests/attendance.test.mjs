import assert from "node:assert/strict";
import test from "node:test";
import {
  applyConfirmedAttendance,
  buildAttendanceRows,
  canConfirmAttendance,
  getAttendanceConfirmationMeta,
  summarizeAttendance,
} from "../src/lib/attendance.ts";

function row(childId, present, extra = {}) {
  return {
    child_id: childId,
    class_id: "class-1",
    school_id: "school-1",
    attendance_date: "2026-10-06",
    present,
    confirmed_by: "user-1",
    confirmed_at: "2026-10-06T12:00:00.000Z",
    ...extra,
  };
}

test("no rows means the list was never passed", () => {
  assert.deepEqual(summarizeAttendance([]), {
    status: "never-passed",
    total: 0,
    presentCount: 0,
    absentCount: 0,
  });
});

test("all-absent rows are a confirmed empty day, not never-passed", () => {
  const summary = summarizeAttendance([row("k1", false), row("k2", false)]);

  assert.equal(summary.status, "confirmed-empty");
  assert.equal(summary.total, 2);
  assert.equal(summary.presentCount, 0);
  assert.equal(summary.absentCount, 2);
});

test("rows with anyone present are a confirmed day", () => {
  const summary = summarizeAttendance([row("k1", true), row("k2", false)]);

  assert.equal(summary.status, "confirmed");
  assert.equal(summary.total, 2);
  assert.equal(summary.presentCount, 1);
  assert.equal(summary.absentCount, 1);
});

test("saved attendance prevails over the initial list without mutating it", () => {
  const initial = [
    { childId: "k1", present: true, origin: "pauta" },
    { childId: "k2", present: false, origin: "sin-configurar" },
  ];
  const saved = [row("k1", false), row("k2", true)];
  const snapshot = JSON.parse(JSON.stringify(initial));

  const merged = applyConfirmedAttendance(initial, saved);

  assert.deepEqual(
    merged.map((item) => [item.childId, item.present]),
    [
      ["k1", false],
      ["k2", true],
    ],
  );
  // Origins stay so the pauta source remains visible after reload.
  assert.equal(merged[0].origin, "pauta");
  assert.deepEqual(initial, snapshot);
});

test("children without a saved row keep their initial mark", () => {
  const initial = [
    { childId: "k1", present: true, origin: "pauta" },
    { childId: "k2", present: false, origin: "pauta" },
  ];

  const merged = applyConfirmedAttendance(initial, [row("k1", false)]);

  assert.deepEqual(
    merged.map((item) => [item.childId, item.present]),
    [
      ["k1", false],
      ["k2", false],
    ],
  );
});

test("confirming builds one row per child with authorship metadata", () => {
  const dailyList = [
    { childId: "k1", present: true, origin: "pauta" },
    { childId: "k2", present: false, origin: "sin-dias" },
  ];

  const rows = buildAttendanceRows({
    dailyList,
    classId: "class-1",
    schoolId: "school-1",
    attendanceDate: "2026-10-06",
    confirmedBy: "user-1",
    confirmedAt: "2026-10-06T12:00:00.000Z",
  });

  assert.deepEqual(rows, [
    {
      child_id: "k1",
      class_id: "class-1",
      school_id: "school-1",
      attendance_date: "2026-10-06",
      present: true,
      confirmed_by: "user-1",
      confirmed_at: "2026-10-06T12:00:00.000Z",
    },
    {
      child_id: "k2",
      class_id: "class-1",
      school_id: "school-1",
      attendance_date: "2026-10-06",
      present: false,
      confirmed_by: "user-1",
      confirmed_at: "2026-10-06T12:00:00.000Z",
    },
  ]);
});

test("confirmation metadata reports who confirmed and when", () => {
  assert.equal(getAttendanceConfirmationMeta([]), null);

  const meta = getAttendanceConfirmationMeta([
    row("k1", true, { confirmed_at: "2026-10-06T12:00:00.000Z" }),
    row("k2", false, {
      confirmed_by: "user-2",
      confirmed_at: "2026-10-06T12:05:00.000Z",
    }),
  ]);

  assert.deepEqual(meta, {
    confirmedBy: "user-2",
    confirmedAt: "2026-10-06T12:05:00.000Z",
  });
});

test("only monitors and admins of the centre can confirm", () => {
  assert.equal(canConfirmAttendance("monitor"), true);
  assert.equal(canConfirmAttendance("admin"), true);
  assert.equal(canConfirmAttendance("padre"), false);
  assert.equal(canConfirmAttendance(null), false);
});
