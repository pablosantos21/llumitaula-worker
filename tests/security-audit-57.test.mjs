import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import { buildMealListRows } from "../src/lib/mealList.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("buildMealListRows omits recorded_at when delegated to server now()", () => {
  const rows = buildMealListRows({
    presentChildIds: ["child-1"],
    drafts: [
      {
        childId: "child-1",
        firstCourse: "todo",
        secondCourse: "casi_todo",
        dessert: "todo",
        notes: "  ok  ",
      },
    ],
    mealTypeId: "mt-1",
    recordedDate: "2026-11-25",
    recordedBy: "user-1",
  });

  assert.equal(rows.length, 1);
  assert.equal("recorded_at" in rows[0], false);
  assert.equal(rows[0].status, "casi_todo");
  assert.equal(rows[0].notes, "ok");
});

test("RequireSession validates sessions remotely, subscribes to auth changes, and checks device revocation", async () => {
  const guard = await source("src/app/RequireSession.tsx");

  assert.match(guard, /supabase\.auth\.getSession\(\)/);
  assert.match(guard, /supabase\.auth\.getUser\(\)/);
  assert.match(guard, /supabase\.auth\.onAuthStateChange\(/);
  assert.match(guard, /subscription\.unsubscribe\(\)/);
  assert.match(guard, /get_device_monitors/);
  assert.match(guard, /DEVICE_REVOKED/);
  assert.match(guard, /DEVICE_INACTIVE/);
  assert.match(guard, /clearDeviceLink\(\)/);
  assert.match(guard, /supabase\.auth\.signOut\(\)/);
});

test("MonitorPinInput uses server-side lockout, resets attempts after cooldown, and catches network errors", async () => {
  const pinInput = await source("src/components/MonitorPinInput.tsx");
  const workers = await source("src/routes/WorkersPage.tsx");

  assert.match(pinInput, /get_monitor_pin_lockout/);
  assert.match(pinInput, /verify_monitor_pin/);
  assert.match(pinInput, /setLocked\(false\);\s*setAttempts\(0\);/);
  assert.match(
    pinInput,
    /try\s*\{[\s\S]*?signInWithPassword[\s\S]*?catch[\s\S]*?finally\s*\{\s*setLoading\(false\);/,
  );
  assert.match(workers, /<MonitorPinInput[\s\S]*?deviceIdentifier=/);
});

test("IncidentsPage supports admin monitor selection, retry UI, and try/catch error handling", async () => {
  const incidents = await source("src/routes/IncidentsPage.tsx");

  assert.match(
    incidents,
    /else if \(role === "admin"\) \{[\s\S]*?\.from\("monitors"\)/,
  );
  assert.match(incidents, /Monitor responsable/);
  assert.match(incidents, /userRole === "admin" && schoolMonitors\.length > 0/);
  assert.match(
    incidents,
    /async function loadData\(\)[\s\S]*?try\s*\{[\s\S]*?catch\s*\{[\s\S]*?setState\("error"\)/,
  );
  assert.match(
    incidents,
    /async function saveIncident\(\)[\s\S]*?try\s*\{[\s\S]*?finally\s*\{\s*setSaving\(false\);/,
  );
  assert.match(incidents, /Reintentar/);
});

test("ClassesPage and TodayPage handle network exceptions and collaborative same-day meal updates", async () => {
  const [classes, today, modal] = await Promise.all([
    source("src/routes/ClassesPage.tsx"),
    source("src/routes/TodayPage.tsx"),
    source("src/components/MealRecordModal.tsx"),
  ]);

  assert.match(
    classes,
    /async function loadData\(\)[\s\S]*?try\s*\{[\s\S]*?catch\s*\{[\s\S]*?setState\("error"\)/,
  );
  assert.match(
    classes,
    /async function saveMealList\(\)[\s\S]*?try\s*\{[\s\S]*?finally\s*\{\s*setSavingMealList\(false\);/,
  );
  assert.match(classes, /existing\.recorded_by !== session\.user\.id/);
  assert.match(classes, /upsertResult\.error\?\.code === "42501"/);
  assert.match(
    today,
    /async function loadData\(\)[\s\S]*?try\s*\{[\s\S]*?catch\s*\{[\s\S]*?setState\("error"\)/,
  );
  assert.match(
    modal,
    /const \[submitting, setSubmitting\] = useState\(false\)/,
  );
  assert.match(modal, /const result = await onSave\(/);
});

test("HTTP security headers are configured in public/_headers", async () => {
  const headers = await source("public/_headers");

  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/);
  assert.match(headers, /X-Frame-Options:\s*DENY/);
  assert.match(headers, /Referrer-Policy:\s*strict-origin-when-cross-origin/);
  assert.match(headers, /Strict-Transport-Security:/);
});

test("Supabase config.toml fixes auth hook schema and configures session timeouts", async () => {
  const config = await source("supabase/config.toml");

  assert.match(
    config,
    /uri\s*=\s*"pg-functions:\/\/postgres\/public\/custom_access_token_hook"/,
  );
  assert.match(config, /^\[auth\.sessions\]/m);
  assert.match(config, /^timebox\s*=\s*"/m);
  assert.match(config, /^inactivity_timeout\s*=\s*"/m);
});
