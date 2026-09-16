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
  assert.match(
    form,
    /\.rpc\(\s*["']claim_device["'][\s\S]*p_code:\s*code\.trim\(\)[\s\S]*p_device_identifier:\s*identifier/s,
  );
  assert.match(
    form,
    /\.rpc\(\s*["']get_device_monitors["'][\s\S]*p_device_identifier:\s*identifier/s,
  );
  assert.doesNotMatch(form, /school_id\s*:/);
});

test("setup creates or reuses a random device identifier and persists only safe context", async () => {
  const [form, lib, page] = await Promise.all([
    source("src/components/DeviceSetupForm.tsx"),
    source("src/lib/deviceSetup.ts"),
    source("src/pages/setup.astro"),
  ]);

  assert.match(lib, /crypto\.randomUUID\(\)/);
  assert.match(lib, /const deviceIdentifierKey = ["']device_identifier["']/);
  assert.match(lib, /localStorage\.getItem\(deviceIdentifierKey\)/);
  assert.match(lib, /localStorage\.setItem\(deviceIdentifierKey/);
  assert.match(lib, /localStorage\.setItem\(["']device_context["']/);
  assert.doesNotMatch(
    lib,
    /localStorage\.setItem\(["'](?:code|password|access_token|anon_key|service_role|PUBLIC_SUPABASE_SERVICE)/i,
  );
  assert.doesNotMatch(form, /password|service_role|PUBLIC_SUPABASE_SERVICE/i);
  assert.doesNotMatch(
    lib,
    /localStorage\.setItem\(["']device_context["'][^;]*?(?:password|access_token|anon_key|service_role)/i,
  );
  assert.doesNotMatch(
    page,
    /PUBLIC_SUPABASE_(?:SERVICE|SECRET)|service_role|password/i,
  );
});

test("setup replaces a missing or manipulated persisted identifier", async () => {
  const lib = await source("src/lib/deviceSetup.ts");

  assert.match(
    lib,
    /const uuidPattern\s*=\s*\/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$\/i/,
  );
  assert.match(
    lib,
    /storedIdentifier[\s\S]*uuid[\s\S]*test\(storedIdentifier\)/i,
  );
  assert.match(lib, /if \(storedIdentifier &&[\s\S]*return storedIdentifier/);
  assert.match(lib, /const identifier = crypto\.randomUUID\(\)/);
});

test("setup preflights storage and persists the handoff context atomically", async () => {
  const [lib, form] = await Promise.all([
    source("src/lib/deviceSetup.ts"),
    source("src/components/DeviceSetupForm.tsx"),
  ]);

  assert.match(lib, /export function assertDeviceStorageAvailable\(\)/);
  assert.match(lib, /localStorage\.setItem\(["']__device_setup_probe__["']/);
  assert.match(
    lib,
    /localStorage\.removeItem\(["']__device_setup_probe__["']\)/,
  );
  assert.match(
    lib,
    /localStorage\.setItem\(["']device_context["'],\s*JSON\.stringify\(safeContext\)\)/,
  );
  assert.doesNotMatch(lib, /localStorage\.setItem\(["']device_id["']/);
  assert.match(
    form,
    /assertDeviceStorageAvailable\(\)[\s\S]*?\.rpc\(\s*["']claim_device["']/,
  );
});

test("workers page shows the linked monitors and refreshes them on load", async () => {
  const [page, legacyPage, workers] = await Promise.all([
    source("src/pages/workers.astro"),
    source("src/pages/app/workers.astro"),
    source("src/components/WorkersApp.tsx"),
  ]);

  for (const candidate of [page, legacyPage]) {
    assert.match(candidate, /MainLayout[\s\S]*requiresAuth=\{false\}/);
    assert.match(candidate, /WorkersApp[\s\S]*client:load/);
  }
  assert.match(
    workers,
    /\.rpc\(\s*["']get_device_monitors["'][\s\S]*p_device_identifier/s,
  );
  assert.doesNotMatch(workers, /p_code/);
  assert.match(workers, /MonitorSelectScreen/);
  assert.match(workers, /MonitorPinInput/);
  assert.match(workers, /window\.location\.assign\(["']\/setup["']\)/);
  assert.doesNotMatch(workers, /BusinessApp|MOCK_STUDENTS|data-student/);
});

test("setup keeps retry available and confirms the linked school before continuing", async () => {
  const form = await source("src/components/DeviceSetupForm.tsx");

  assert.match(form, /role=["']alert["']/);
  assert.match(
    form,
    /No se ha podido configurar|int[eé]ntalo de nuevo|c[oó]digo no v[aá]lido/i,
  );
  assert.match(form, /Vinculado a/);
  assert.match(form, /context\.school_name/);
  assert.match(form, /Continuar/);
  assert.match(form, /window\.location\.assign\(["']\/workers["']\)/);
  assert.doesNotMatch(
    form,
    /saveDeviceContext\(context\);[\s\S]{0,120}window\.location\.assign\(["']\/workers["']\)/,
  );
  assert.doesNotMatch(form, /console\.(?:error|log|warn)/);
  assert.doesNotMatch(form, /const\s*\{\s*error\s*\}\s*=/);
  assert.doesNotMatch(form, /error\.(?:message|details|hint)/);
});

test("setup never persists or reads the configuration code", async () => {
  const [form, lib] = await Promise.all([
    source("src/components/DeviceSetupForm.tsx"),
    source("src/lib/deviceSetup.ts"),
  ]);

  assert.doesNotMatch(form, /saveSetupCode|getSetupCode|device_setup_code/i);
  assert.doesNotMatch(lib, /saveSetupCode|getSetupCode|device_setup_code/i);
  assert.doesNotMatch(lib, /localStorage\.(?:get|set)Item\([^\n]*code/i);
});

test("device setup files are part of the application surface", async () => {
  await Promise.all([
    access(new URL("src/pages/setup.astro", root)),
    access(new URL("src/pages/workers.astro", root)),
    access(new URL("src/pages/app/workers.astro", root)),
    access(new URL("src/components/DeviceSetupForm.tsx", root)),
    access(new URL("src/components/WorkersApp.tsx", root)),
  ]);
});
