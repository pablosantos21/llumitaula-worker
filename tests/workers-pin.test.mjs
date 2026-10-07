import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("workers route is public in the React router with a single path", async () => {
  const router = await source("src/app/router.tsx");

  assert.match(router, /path:\s*["']\/workers["']/);
  assert.match(router, /WorkersPage/);
  assert.match(
    router,
    /path:\s*["']\/workers["']\s*,\s*element:\s*<WorkersPage\s*\/>/,
  );
  const workersRoutes = router.match(/path:\s*["']\/workers["']/g) || [];
  assert.equal(workersRoutes.length, 1);
  assert.doesNotMatch(router, /app\/workers/);
  const guardedRoutes = router.match(/<RequireSession>/g) || [];
  assert.equal(guardedRoutes.length, 2);
});

test("workers route lists device monitors with carga, lista, vacia, error y fuera de servicio", async () => {
  const page = await source("src/routes/WorkersPage.tsx");

  assert.match(page, /aria-label=["']Monitores["']/);
  assert.match(page, /Cargando monitores/);
  assert.match(page, /MonitorSelectScreen/);
  assert.match(page, /Sin monitores/);
  assert.match(page, /No se han podido cargar los monitores/);
  assert.match(page, /dado de baja/i);
  assert.match(page, /status === ["']loading["']/);
  assert.match(page, /status === ["']empty["']/);
  assert.match(page, /status === ["']error["']/);
  assert.match(page, /status === ["']decommissioned["']/);
});

test("workers route refreshes monitors from the device context RPC", async () => {
  const page = await source("src/routes/WorkersPage.tsx");

  assert.match(
    page,
    /\.rpc\(\s*["']get_device_monitors["'][\s\S]*p_device_identifier/s,
  );
  assert.doesNotMatch(page, /p_code/);
  assert.match(page, /getDeviceContext|hasLinkedDevice/);
  assert.match(page, /saveDeviceContext/);
  assert.match(page, /DEVICE_INACTIVE/);
  assert.match(page, /DEVICE_REVOKED/);
  assert.match(page, /Recargar lista|Reintentar/);
});

test("workers route redirects through the router without full reloads", async () => {
  const page = await source("src/routes/WorkersPage.tsx");

  assert.match(page, /useNavigate|Navigate/);
  assert.match(page, /Navigate[\s\S]*to=["']\/setup["']/);
  assert.doesNotMatch(page, /window\.location\.assign/);
});

test("pin keeps five attempts and a five minute cooldown per monitor", async () => {
  const [page, pin] = await Promise.all([
    source("src/routes/WorkersPage.tsx"),
    source("src/components/MonitorPinInput.tsx"),
  ]);

  assert.match(pin, /MAX_ATTEMPTS\s*=\s*5/);
  assert.match(pin, /COOLDOWN_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(pin, /signInWithPassword/);
  assert.match(pin, /Demasiados intentos/);
  assert.match(pin, /5 minutos/);
  // Sin bloquear a otros monitores: el estado se aisla por monitor.
  assert.match(pin, /monitor\.id/);
  assert.match(
    `${pin}\n${page}`,
    /key=\{[^}]*monitor\.id[^}]*\}|useEffect[^;]*monitor\.id|Record<string|Map<.*>|attemptsByMonitor|pinStateByMonitor/i,
  );
});

test("pin success enters the protected root keeping the Supabase session", async () => {
  const [page, pin] = await Promise.all([
    source("src/routes/WorkersPage.tsx"),
    source("src/components/MonitorPinInput.tsx"),
  ]);
  const combined = `${page}\n${pin}`;

  assert.match(pin, /supabase\.auth\.signInWithPassword/);
  assert.match(pin, /login_email/);
  assert.match(combined, /navigate\(["']\/["']/);
  assert.doesNotMatch(page, /window\.location\.assign/);
  assert.doesNotMatch(pin, /window\.location\.assign\(["']\/["']\)/);
});

test("workers pin files are part of the application surface", async () => {
  await Promise.all([
    access(new URL("src/routes/WorkersPage.tsx", root)),
    access(new URL("src/app/router.tsx", root)),
    access(new URL("src/components/MonitorPinInput.tsx", root)),
    access(new URL("src/components/MonitorSelectScreen.tsx", root)),
  ]);
});
