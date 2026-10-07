import assert from "node:assert/strict";
import test from "node:test";
import {
  canRecordMeal,
  confirmedPresentChildIds,
  isAttendanceConfirmed,
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

test("no rows means attendance is not confirmed: recording is blocked", () => {
  assert.equal(isAttendanceConfirmed([]), false);
  assert.equal(canRecordMeal([], "k1"), false);
  assert.deepEqual(confirmedPresentChildIds([]), []);
});

test("confirmed-empty day confirms the list but nobody is recordable", () => {
  const rows = [row("k1", false), row("k2", false)];

  assert.equal(isAttendanceConfirmed(rows), true);
  assert.deepEqual(confirmedPresentChildIds(rows), []);
  assert.equal(canRecordMeal(rows, "k1"), false);
  assert.equal(canRecordMeal(rows, "k2"), false);
});

test("only present children of a confirmed list are recordable", () => {
  const rows = [row("k1", true), row("k2", false)];

  assert.equal(isAttendanceConfirmed(rows), true);
  assert.deepEqual(confirmedPresentChildIds(rows), ["k1"]);
  assert.equal(canRecordMeal(rows, "k1"), true);
  assert.equal(canRecordMeal(rows, "k2"), false);
});

test("unknown children are never recordable, even on a confirmed day", () => {
  const rows = [row("k1", true)];

  assert.equal(canRecordMeal(rows, "ghost"), false);
});
