import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("setup page is public and renders the temporary-code form", async () => {
  const page = await source("src/pages/setup.astro");

  assert.match(page, /MainLayout[\s\S]*requiresAuth=\{false\}/);
  assert.match(page, /DeviceSetupForm[\s\S]*client:load/);
  assert.match(page, /setup|configuraci[oó]n/i);
});

test("device setup form submits the code through the secure RPC", async () => {
  const form = await source("src/components/DeviceSetupForm.tsx");

  assert.match(form, /<form[\s\S]*onSubmit/);
  assert.match(form, /name=["']code["']/);
  assert.match(form, /\.rpc\(["']claim_device_setup["']/);
  assert.match(form, /code/);
  assert.match(form, /device_identifier/);
  assert.doesNotMatch(form, /school_id\s*:/);
});

test("setup creates or reuses a random device identifier and persists only safe context", async () => {
  const [form, page] = await Promise.all([
    source("src/components/DeviceSetupForm.tsx"),
    source("src/pages/setup.astro"),
  ]);

  assert.match(form, /crypto\.randomUUID\(\)/);
  assert.match(form, /localStorage\.getItem\(["']device_identifier["']\)/);
  assert.match(form, /localStorage\.setItem\(["']device_identifier["']/);
  assert.match(form, /localStorage\.setItem\(["']device_id["']/);
  assert.match(form, /localStorage\.setItem\(["']device_context["']/);
  assert.doesNotMatch(
    form,
    /localStorage\.setItem\(["'](?:code|password|access_token|anon_key|service_role)/i,
  );
  assert.doesNotMatch(
    page,
    /PUBLIC_SUPABASE_(?:SERVICE|SECRET)|service_role|password/i,
  );
});

test("setup keeps retry available on generic RPC errors and redirects after success", async () => {
  const form = await source("src/components/DeviceSetupForm.tsx");

  assert.match(form, /role=["']alert["']/);
  assert.match(
    form,
    /No se ha podido configurar|int[eé]ntalo de nuevo|c[oó]digo no v[aá]lido/i,
  );
  assert.match(form, /window\.location\.(?:assign|href)/);
  assert.match(form, /worker|trabajador/i);
  assert.doesNotMatch(form, /error\.(?:message|details|hint)/);
});

test("device setup files are part of the application surface", async () => {
  await Promise.all([
    access(new URL("src/pages/setup.astro", root)),
    access(new URL("src/components/DeviceSetupForm.tsx", root)),
  ]);
});
