import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("web manifest exposes the standalone app contract", async () => {
  const manifest = JSON.parse(await source("public/manifest.webmanifest"));

  assert.equal(manifest.name, "Llumitaula");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "any");
  assert.ok(manifest.theme_color);
  assert.ok(manifest.background_color);
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type, purpose }) => ({
      src,
      sizes,
      type,
      purpose,
    })),
    [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  );
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
    /navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(\s*["']\/sw\.js["']\s*\)/,
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
