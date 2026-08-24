import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("MainLayout protects business content by default and leaves login public", async () => {
  const layout = await source("src/layouts/MainLayout.astro");
  const login = await source("src/pages/login.astro");

  assert.match(layout, /requiresAuth\??\s*:\s*boolean/);
  assert.match(layout, /requiresAuth\s*=\s*true/);
  assert.match(layout, /AuthGuard/);
  assert.match(layout, /hidden=\{requiresAuth\}/);
  assert.match(login, /requiresAuth=\{false\}/);
});

test("AuthGuard checks the session before revealing protected content", async () => {
  const guard = await source("src/components/AuthGuard.tsx");

  assert.match(guard, /supabase\.auth\.getSession\(\)/);
  assert.match(guard, /window\.location\.assign\(["']\/login["']\)/);
  assert.match(guard, /removeAttribute\(["']hidden["']\)/);
});
