# Fase 4 PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the static Astro application installable as a standalone iPad PWA whose cached shell starts offline without caching Supabase data.

**Architecture:** Keep Astro's static output and add a small, manually controlled PWA layer. Source assets and service-worker generation scripts will live in the repository; the build will generate PNG icons and a service worker containing the exact hashed files produced in `dist`. `MainLayout.astro` will provide browser installation metadata and register `/sw.js`.

**Tech Stack:** Astro 7, Vite 8, TypeScript, Node.js ESM scripts, `sharp` for deterministic PNG generation, Web App Manifest, Service Worker Cache API, Node test runner.

---

## File Map

- Create `public/manifest.webmanifest`: install metadata, icons, colors, and standalone display.
- Create `public/icons/pwa-icon.svg`: reusable green-background icon source based on the current favicon symbol.
- Create `public/icons/apple-touch-icon.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-192-maskable.png`, and `public/icons/icon-512-maskable.png` during the asset-generation step.
- Create `public/splash/ipad-portrait.svg` and `public/splash/ipad-landscape.svg`: startup-image source artwork.
- Create `scripts/generate-pwa-assets.mjs`: render the icon source into the required PNG sizes with `sharp`.
- Create `scripts/generate-pwa-service-worker.mjs`: scan the completed `dist` output and write `dist/sw.js` with an exact precache list.
- Create `scripts/sw-template.js`: service-worker source template kept out of the public build.
- Create `tests/pwa.test.mjs`: test manifest, layout metadata, asset sources, and generated service-worker behavior from source/build output.
- Modify `src/layouts/MainLayout.astro`: add PWA links/meta tags and guarded service-worker registration.
- Modify `package.json`: add `sharp`, asset/build validation scripts, and a post-build service-worker generation command.
- Modify `scripts/check-public-build.mjs`: validate required PWA files and manifest values alongside its existing public-data checks.
- Modify `README.md`: document iPad installation and manual offline verification.

### Task 1: Add failing PWA contract tests

**Files:**

- Create: `tests/pwa.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add tests that read the repository source and, after a build exists, assert the following exact contract:

```js
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("manifest declares an installable standalone app", async () => {
  const manifest = JSON.parse(await source("public/manifest.webmanifest"));
  assert.equal(manifest.name, "Llumitaula");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some(({ sizes }) => sizes === "192x192"));
  assert.ok(manifest.icons.some(({ sizes }) => sizes === "512x512"));
});

test("layout exposes iOS metadata and registers the root service worker", async () => {
  const layout = await source("src/layouts/MainLayout.astro");
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(layout, /apple-mobile-web-app-capable/);
  assert.match(layout, /serviceWorker\.register\(["']\/sw\.js["']\)/);
});

test("build contains PWA runtime resources", async () => {
  for (const path of [
    "dist/manifest.webmanifest",
    "dist/sw.js",
    "dist/icons/apple-touch-icon.png",
    "dist/icons/icon-192.png",
    "dist/icons/icon-512.png",
  ]) {
    await access(new URL(`../${path}`, import.meta.url));
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/pwa.test.mjs`

Expected: FAIL because the manifest, layout metadata, generated assets, and service worker do not exist yet.

### Task 2: Create deterministic icon and splash assets

**Files:**

- Create: `public/icons/pwa-icon.svg`
- Create: `public/splash/ipad-portrait.svg`
- Create: `public/splash/ipad-landscape.svg`
- Create: `scripts/generate-pwa-assets.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the icon source**

Create an SVG with a `#047857` green square background and the existing favicon path centered inside a safe area. Keep the path geometry from `public/favicon.svg`, make the path white, and give the square rounded corners only in the artwork where supported; the maskable versions must remain safe when the platform crops the outer 20%.

- [ ] **Step 2: Add splash source artwork**

Create portrait and landscape SVGs using the same green background and centered white symbol. Use explicit viewBoxes of `2048 2732` for portrait and `2732 2048` for landscape so the artwork can be referenced directly by iPad startup-image media queries without platform-specific binary conversion.

- [ ] **Step 3: Add the asset generator**

Implement `scripts/generate-pwa-assets.mjs` using `sharp`:

```js
import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);
const iconSource = await readFile(new URL("public/icons/pwa-icon.svg", root));
const output = new URL("public/icons/", root);
await mkdir(output, { recursive: true });

for (const [name, size] of [
  ["apple-touch-icon", 180],
  ["icon-192", 192],
  ["icon-512", 512],
  ["icon-192-maskable", 192],
  ["icon-512-maskable", 512],
]) {
  await sharp(iconSource)
    .resize(size, size)
    .png()
    .toFile(new URL(`${name}.png`, output));
}
```

- [ ] **Step 4: Add scripts and dependency**

Add `sharp` as a direct dev dependency and define:

```json
"generate:pwa-assets": "node scripts/generate-pwa-assets.mjs",
"prebuild": "npm run generate:pwa-assets",
"postbuild": "node scripts/generate-pwa-service-worker.mjs"
```

- [ ] **Step 5: Run asset generation and inspect outputs**

Run: `npm install`, then `npm run generate:pwa-assets`

Expected: five PNG files exist under `public/icons/`, each has the configured dimensions, and no source SVG is modified.

### Task 3: Add manifest and layout integration

**Files:**

- Create: `public/manifest.webmanifest`
- Modify: `src/layouts/MainLayout.astro`

- [ ] **Step 1: Add the manifest**

Create `public/manifest.webmanifest` with this structure:

```json
{
  "name": "Llumitaula",
  "short_name": "Llumitaula",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#047857",
  "theme_color": "#047857",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-192-maskable.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 2: Add head metadata and startup images**

In `MainLayout.astro`, add the manifest link, `theme-color`, Apple standalone/status-bar metadata, the 180x180 Apple touch icon, and two startup-image links. Use `media="(orientation: portrait)"` and `media="(orientation: landscape)"` for the two SVG splash resources.

- [ ] **Step 3: Register the service worker safely**

Add a browser script after the document that runs only when `"serviceWorker" in navigator`, calls `navigator.serviceWorker.register("/sw.js", { scope: "/" })`, and logs registration failures with `console.warn` without blocking page rendering or auth.

### Task 4: Generate and implement the service worker

**Files:**

- Create: `scripts/generate-pwa-service-worker.mjs`
- Create: `scripts/sw-template.js`

- [ ] **Step 1: Write the service-worker template**

Use the literal generation token `__PRECACHE_URLS__`, replaced by the generator before the file is written to `dist`:

```js
const CACHE_NAME = "llumitaula-shell-v1";
const PRECACHE_URLS = __PRECACHE_URLS__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            /* retry on a later install */
          }
        }),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("llumitaula-shell-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html")),
    );
    return;
  }
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request)),
  );
});
```

- [ ] **Step 2: Generate the final service worker after Astro build**

The generator must recursively list `dist`, include every `.html`, `.css`, `.js`, `.svg`, `.png`, `.ico`, `.webmanifest`, and `.woff2` file as root-relative URLs, exclude `sw.js`, JSON-encode the list, replace `__PRECACHE_URLS__`, and write `dist/sw.js`. If no `dist/index.html` exists, exit with a clear error. The generated file must not contain `__PRECACHE_URLS__`.

- [ ] **Step 3: Run a production build**

Run: `npm run build`

Expected: Astro builds successfully, `dist/sw.js` exists, and its `PRECACHE_URLS` contains `/index.html` plus generated hashed assets but not Supabase URLs.

### Task 5: Extend build validation and documentation

**Files:**

- Modify: `scripts/check-public-build.mjs`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Validate generated PWA files**

Extend `check-public-build.mjs` to parse `dist/manifest.webmanifest`, assert `display === "standalone"`, assert `/index.html` and `/sw.js` exist, verify the three required PNG paths exist, and assert `dist/sw.js` does not contain `supabase` or `service_role`.

- [ ] **Step 2: Add the public-data script to the build verification command**

Add `"test:pwa": "npm run build && npm run test:public-data && node --test tests/pwa.test.mjs"` without changing the existing script names.

- [ ] **Step 3: Document the iPad flow**

Add a Spanish section to `README.md` explaining that deployment must use HTTPS, then the Safari steps “Compartir” -> “Añadir a pantalla de inicio”, opening from the new icon, and enabling airplane mode to verify the shell. State explicitly that Supabase data and mutations are unavailable offline and are not cached.

- [ ] **Step 4: Run the full static checks**

Run: `npm run test:pwa`

Expected: build, public-data check, and PWA tests pass.

### Task 6: Format, type-check, and review the final diff

**Files:**

- Modify only the files listed above if formatting requires it.

- [ ] **Step 1: Run project verification**

Run: `npm run check`, `npm run lint`, and `npm run format:check`

Expected: all commands exit 0.

- [ ] **Step 2: Review the generated and source diff**

Run: `git status --short`, `git diff --check`, and `git diff --stat`.

Confirm no `.env`, Supabase credentials, `dist/`, or unrelated worktree files are included.

- [ ] **Step 3: Perform the manual iPad verification**

On an HTTPS deployment in Safari for iPad, install from the Share menu, launch from the home-screen icon, rotate to portrait and landscape, enable airplane mode, relaunch, and verify the shell appears while Supabase-backed data/actions fail visibly rather than showing fabricated cached data.
