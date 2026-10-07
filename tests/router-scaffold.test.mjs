import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("router exposes protected root and incidencias plus public setup and workers", async () => {
  const router = await source("src/app/router.tsx");

  assert.match(router, /path:\s*["']\/["']/);
  assert.match(router, /path:\s*["']\/incidencias["']/);
  assert.match(router, /path:\s*["']\/setup["']/);
  assert.match(router, /path:\s*["']\/workers["']/);
  assert.match(router, /RequireSession/);
  assert.match(router, /path:\s*["']\*["']/);
  assert.match(router, /Navigate.*to=["']\/["']/);
});

test("session guard requires a Supabase session and redirects without legacy cookies", async () => {
  const guard = await source("src/app/RequireSession.tsx");

  assert.match(guard, /supabase\.auth\.getSession\(\)/);
  assert.match(guard, /Navigate.*to=["']\/setup["']/);
  assert.match(guard, /to=["']\/workers["']/);
  assert.doesNotMatch(guard, /monitor_id/);
  assert.doesNotMatch(guard, /document\.cookie/);
  assert.doesNotMatch(guard, /\/login/);
});

test("shell keeps a single navigation with deferred service worker registration", async () => {
  const layout = await source("src/app/RootLayout.tsx");
  const index = await source("index.html");

  assert.match(layout, /serviceWorker/);
  assert.match(layout, /register\(["']\/sw\.js["']/);
  assert.match(layout, /window.*addEventListener\(["']load["']/);
  assert.match(index, /<link rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(index, /<meta name="theme-color" content="#[0-9a-fA-F]{6}"/);
  assert.match(
    index,
    /<link rel="apple-touch-icon"[^>]+href="\/icons\/apple-touch-icon\.png"/,
  );
  assert.match(index, /ipad-portrait\.png/);
  assert.match(index, /ipad-landscape\.png/);
  const navCount = (layout.match(/<nav/g) || []).length;
  assert.equal(navCount, 1);
});

test("environment is validated with zod under the Vite prefix without client secrets", async () => {
  const env = await source("src/lib/env.ts");

  assert.match(env, /VITE_SUPABASE_URL/);
  assert.match(env, /VITE_SUPABASE_ANON_KEY/);
  assert.match(env, /z\.object/);
  assert.doesNotMatch(env, /SERVICE_ROLE/);
  assert.doesNotMatch(env, /PUBLIC_SUPABASE_URL\s*:/);
});
