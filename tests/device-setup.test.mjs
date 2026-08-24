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
    /\.rpc\(["']claim_device_setup["']\s*,\s*\{\s*p_code:\s*code\.trim\(\)\s*,\s*p_device_identifier:\s*identifier\s*\}\s*\)/s,
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
  assert.match(lib, /localStorage\.setItem\(["']device_id["']/);
  assert.match(lib, /localStorage\.setItem\(["']device_context["']/);
  assert.doesNotMatch(
    lib,
    /localStorage\.setItem\(["'](?:code|password|access_token|anon_key|service_role|PUBLIC_SUPABASE_SERVICE)/i,
  );
  assert.doesNotMatch(form, /password|service_role|PUBLIC_SUPABASE_SERVICE/i);
  assert.doesNotMatch(
    lib,
    /localStorage\.setItem\(["']device_context["'][\s\S]*?(?:code|password|access_token)/i,
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

test("setup keeps retry available on generic RPC errors and redirects after success", async () => {
  const form = await source("src/components/DeviceSetupForm.tsx");

  assert.match(form, /role=["']alert["']/);
  assert.match(
    form,
    /No se ha podido configurar|int[eé]ntalo de nuevo|c[oó]digo no v[aá]lido/i,
  );
  assert.match(form, /["']\/app\/workers["']/);
  assert.doesNotMatch(form, /console\.(?:error|log|warn)\([\s\S]*error/i);
  assert.doesNotMatch(form, /\{\s*error\s*\}/);
  assert.doesNotMatch(form, /error\.(?:message|details|hint)/);
});

test("device setup files are part of the application surface", async () => {
  await Promise.all([
    access(new URL("src/pages/setup.astro", root)),
    access(new URL("src/components/DeviceSetupForm.tsx", root)),
  ]);
});
