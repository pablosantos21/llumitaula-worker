import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import vm from "node:vm";
import { promisify } from "node:util";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const execFileAsync = promisify(execFile);
const Response = globalThis.Response;

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function loadServiceWorker({ cache, fetch, open = async () => cache }) {
  const listeners = new Map();
  const warnings = [];
  const self = {
    location: { origin: "https://app.example" },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };
  const caches = {
    open,
    keys: async () => [],
    delete: async () => true,
  };
  const context = {
    caches,
    console: { warn: (...args) => warnings.push(args) },
    fetch,
    Response: globalThis.Response,
    self,
    URL,
  };
  const template = await source("scripts/sw-template.js");

  vm.runInNewContext(template.replace("__PRECACHE_URLS__", "[]"), context);
  return { fetchHandler: listeners.get("fetch"), warnings };
}

function request(url, { mode = "cors", destination = "script" } = {}) {
  return { url: `https://app.example${url}`, method: "GET", mode, destination };
}

async function dispatch(fetchHandler, requestValue) {
  const waits = [];
  const event = {
    request: requestValue,
    respondWith(value) {
      event.response = Promise.resolve(value);
    },
    waitUntil(value) {
      waits.push(Promise.resolve(value));
    },
  };

  fetchHandler(event);
  const response = await event.response;
  await Promise.all(waits);
  return response;
}

test("web manifest exposes the standalone app contract", async () => {
  const manifest = JSON.parse(await source("public/manifest.webmanifest"));

  assert.equal(manifest.name, "Llumitaula");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "any");
  assert.ok(manifest.theme_color);
  assert.ok(manifest.background_color);
  assert.equal(manifest.icons.length, 4);
  for (const expected of [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-192-maskable.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ]) {
    assert.deepEqual(
      manifest.icons.find(({ src }) => src === expected.src),
      expected,
    );
  }
});

test("PWA artwork and asset generation contract is present", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const icon = await source("public/icons/pwa-icon.svg");
  const portraitSplash = await source("public/splash/ipad-portrait.svg");
  const landscapeSplash = await source("public/splash/ipad-landscape.svg");

  assert.equal(packageJson.devDependencies.sharp, "0.35.3");
  assert.equal(
    packageJson.scripts["generate:pwa-assets"],
    "node scripts/generate-pwa-assets.mjs",
  );
  assert.equal(packageJson.scripts.prebuild, "npm run generate:pwa-assets");
  assert.equal(
    packageJson.scripts.postbuild,
    "node scripts/generate-pwa-service-worker.mjs",
  );
  assert.match(icon, /viewBox="0 0 128 128"/);
  assert.match(icon, /fill="#047857"/);
  assert.match(icon, /fill="#fff"/i);
  assert.doesNotMatch(icon, /\brx=/i);
  assert.match(portraitSplash, /viewBox="0 0 2048 2732"/);
  assert.match(landscapeSplash, /viewBox="0 0 2732 2048"/);
});

test("MainLayout declares iOS metadata and registers the root service worker", async () => {
  const layout = await source("src/layouts/MainLayout.astro");

  assert.match(
    layout,
    /<link rel="manifest" href="\/manifest\.webmanifest"\s*\/>/,
  );
  assert.match(
    layout,
    /<meta name="theme-color" content="#[0-9a-fA-F]{6}"\s*\/>/,
  );
  assert.match(
    layout,
    /<meta name="apple-mobile-web-app-capable" content="yes"\s*\/>/,
  );
  assert.match(
    layout,
    /<meta name="apple-mobile-web-app-status-bar-style" content="(?:default|black|black-translucent)"\s*\/>/,
  );
  assert.match(
    layout,
    /<link rel="apple-touch-icon"[^>]+href="\/icons\/apple-touch-icon\.png"/,
  );
  assert.match(
    layout,
    /navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(\s*["']\/sw\.js["']\s*,\s*\{\s*scope:\s*["']\/["']\s*\}\s*\)/,
  );
  assert.match(
    layout,
    /href="\/splash\/ipad-portrait\.png"\s+media="\(orientation: portrait\) and \(min-device-width: 768px\)"/,
  );
  assert.match(
    layout,
    /href="\/splash\/ipad-landscape\.png"\s+media="\(orientation: landscape\) and \(min-device-width: 768px\)"/,
  );
  assert.equal(
    (layout.match(/rel="apple-touch-startup-image"/g) || []).length,
    2,
  );
});

test("built PWA resources are published at the required paths", async () => {
  const resources = [
    "dist/manifest.webmanifest",
    "dist/sw.js",
    "dist/icons/icon-192.png",
    "dist/icons/icon-512.png",
    "dist/icons/apple-touch-icon.png",
    "dist/splash/ipad-landscape.png",
    "dist/splash/ipad-portrait.png",
  ];

  await Promise.all(resources.map((path) => access(new URL(path, root))));
});

test("public build checker validates the complete PWA output contract", async () => {
  const checker = await source("scripts/check-public-build.mjs");
  const packageJson = JSON.parse(await source("package.json"));

  assert.equal(
    packageJson.scripts["test:pwa"],
    "npm run build && npm run test:public-data && node --test tests/pwa.test.mjs",
  );
  assert.match(checker, /manifest\.webmanifest/);
  assert.match(checker, /display.*standalone/s);
  assert.match(checker, /index\.html/);
  assert.match(checker, /sw\.js/);
  assert.match(checker, /icon-192\.png/);
  assert.match(checker, /icon-512\.png/);
  assert.match(checker, /apple-touch-icon\.png/);
  assert.match(checker, /ipad-landscape\.png/);
  assert.match(checker, /ipad-portrait\.png/);
  assert.match(checker, /supabase/);
  assert.match(checker, /service_role/);
  assert.match(checker, /sensitiveMockValues/);
});

test("service worker template declares the shell cache and safe request boundaries", async () => {
  const template = await source("scripts/sw-template.js");

  assert.match(template, /llumitaula-shell-v1/);
  assert.match(template, /addAll|cache\.put/);
  assert.match(template, /catch/);
  assert.match(template, /self\.skipWaiting\(\)/);
  assert.match(template, /clients\.claim/);
  assert.match(
    template,
    /key\.startsWith\(["']llumitaula-shell-["']\).*key\s*!==\s*CACHE_NAME/s,
  );
  assert.match(template, /network-first|Network-first/i);
  assert.match(template, /index\.html/);
  assert.match(template, /function readCache[\s\S]*cache\.match\(request\)/);
  assert.doesNotMatch(template, /caches\.match\(/);
  assert.match(template, /url\.pathname\s*===\s*["']\/["']/);
  assert.match(template, /event\.waitUntil\(/);
  assert.match(template, /event\.waitUntil\([\s\S]*cache\.put[\s\S]*catch/);
  assert.match(template, /console\.warn/);
  assert.match(template, /request\.mode\s*===\s*["']navigate["']/);
  assert.match(template, /request\.method\s*!==\s*["']GET["']/);
  assert.match(template, /url\.origin\s*!==\s*self\.location\.origin/);
  assert.doesNotMatch(template, /supabase|fetch\([^)]*https?:/i);
});

test("service worker serves assets from a named cache on misses and hits", async () => {
  let fetches = 0;
  const cacheNames = [];
  const putKeys = [];
  const storedResponses = new Map();
  const cacheKey = (requestValue) =>
    typeof requestValue === "string" ? requestValue : requestValue.url;
  const cache = {
    async match(requestValue) {
      return storedResponses.get(cacheKey(requestValue));
    },
    async put(requestValue, response) {
      const key = cacheKey(requestValue);
      putKeys.push(key);
      storedResponses.set(key, response);
    },
  };
  const { fetchHandler } = await loadServiceWorker({
    cache,
    open: async (name) => {
      cacheNames.push(name);
      return cache;
    },
    fetch: async () => {
      fetches += 1;
      return new Response(
        fetches === 1 ? "network data" : "fresh network data",
      );
    },
  });

  const miss = await dispatch(fetchHandler, request("/app.js"));
  assert.equal(await miss.text(), "network data");
  assert.ok(cacheNames.length > 0);
  assert.ok(cacheNames.every((name) => name === "llumitaula-shell-v1"));
  assert.deepEqual(putKeys, ["https://app.example/app.js"]);
  assert.ok(storedResponses.has("https://app.example/app.js"));
  const hit = await dispatch(fetchHandler, request("/app.js"));
  assert.equal(await hit.text(), "network data");
  assert.equal(fetches, 2);
});

test("service worker returns the named shell when navigation is offline", async () => {
  const cache = {
    async match(path) {
      return path === "/index.html" ? new Response("shell") : undefined;
    },
    async put() {},
  };
  const { fetchHandler } = await loadServiceWorker({
    cache,
    fetch: async () => {
      throw new Error("offline");
    },
  });

  const response = await dispatch(
    fetchHandler,
    request("/login/", { mode: "navigate", destination: "document" }),
  );
  assert.equal(await response.text(), "shell");
});

test("service worker handles cache storage errors without rejecting a response", async () => {
  const { fetchHandler, warnings } = await loadServiceWorker({
    cache: {
      async match() {
        return undefined;
      },
      async put() {
        throw new Error("quota exceeded");
      },
    },
    fetch: async () => new Response("network"),
  });

  const response = await dispatch(fetchHandler, request("/app.js"));
  assert.equal(await response.text(), "network");
  assert.ok(warnings.length >= 1);
});

test("service worker falls back to network when opening the named cache fails", async () => {
  const { fetchHandler, warnings } = await loadServiceWorker({
    cache: undefined,
    open: async () => {
      throw new Error("storage unavailable");
    },
    fetch: async () => new Response("network"),
  });

  const response = await dispatch(fetchHandler, request("/app.js"));
  assert.equal(await response.text(), "network");
  assert.ok(warnings.length >= 1);
});

test("service worker generator recursively precaches supported dist files", async () => {
  const fixture = await mkdtemp(join("/tmp", "llumitaula-pwa-"));
  try {
    await writeFile(join(fixture, "index.html"), "<main>shell</main>");
    await mkdir(join(fixture, "nested", "assets"), { recursive: true });
    for (const path of [
      "page.html",
      "styles.css",
      "app.js",
      "icon.svg",
      "image.png",
      "favicon.ico",
      "manifest.webmanifest",
      "font.woff2",
      "safe name #?.js",
    ]) {
      await writeFile(join(fixture, "nested", "assets", path), "asset");
    }
    await writeFile(join(fixture, "nested", "assets", "ignored.txt"), "ignore");
    await writeFile(join(fixture, "sw.js"), "old worker");

    await execFileAsync(
      process.execPath,
      ["scripts/generate-pwa-service-worker.mjs"],
      {
        cwd: new URL("../", import.meta.url),
        env: { ...process.env, PWA_DIST_DIR: fixture },
      },
    );

    const generated = await readFile(join(fixture, "sw.js"), "utf8");
    assert.match(generated, /["']\/index\.html["']/);
    for (const path of [
      "page.html",
      "styles.css",
      "app.js",
      "icon.svg",
      "image.png",
      "favicon.ico",
      "manifest.webmanifest",
      "font.woff2",
    ]) {
      assert.match(generated, new RegExp(`\\"/nested/assets/${path}\\"`));
    }
    assert.match(generated, /"\/nested\/assets\/safe%20name%20%23%3F\.js"/);
    assert.doesNotMatch(generated, /ignored\.txt|\/sw\.js|__PRECACHE_URLS__/);
    assert.doesNotMatch(generated, /PWA_DIST_DIR|dist[\\/]/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("service worker generator clearly rejects a dist without index.html", async () => {
  const fixture = await mkdtemp(join("/tmp", "llumitaula-pwa-"));
  try {
    await assert.rejects(
      execFileAsync(
        process.execPath,
        ["scripts/generate-pwa-service-worker.mjs"],
        {
          cwd: new URL("../", import.meta.url),
          env: { ...process.env, PWA_DIST_DIR: fixture },
        },
      ),
      /dist\/index\.html is required/i,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("service worker generator rejects an index.html directory", async () => {
  const fixture = await mkdtemp(join("/tmp", "llumitaula-pwa-"));
  try {
    await mkdir(join(fixture, "index.html"));
    await assert.rejects(
      execFileAsync(
        process.execPath,
        ["scripts/generate-pwa-service-worker.mjs"],
        {
          cwd: new URL("../", import.meta.url),
          env: { ...process.env, PWA_DIST_DIR: fixture },
        },
      ),
      /dist\/index\.html is required/i,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
