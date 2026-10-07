import {
  cp,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, URL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distRoot = resolve(process.env.PWA_DIST_DIR || resolve(root, "dist"));
const clientDir = resolve(distRoot, "client");
const templatePath = resolve(root, "scripts/sw-template.js");
const supportedExtensions = new Set([
  ".html",
  ".css",
  ".js",
  ".svg",
  ".png",
  ".ico",
  ".webmanifest",
  ".woff2",
]);

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesIn(path)));
    } else if (
      entry.name !== "sw.js" &&
      supportedExtensions.has(extname(entry.name).toLowerCase())
    ) {
      files.push(path);
    }
  }

  return files;
}

async function isRegularFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// Astro with `output: "server"` emits the public shell to `dist/client/`,
// while `output: "static"` emits it to `dist/`. Support both layouts.
let dist = distRoot;
if (!(await isRegularFile(resolve(distRoot, "index.html")))) {
  if (await isRegularFile(resolve(clientDir, "index.html"))) {
    dist = clientDir;
  }
}

const indexPath = resolve(dist, "index.html");
try {
  if (!(await stat(indexPath)).isFile()) {
    throw new Error("not a regular file");
  }
} catch {
  throw new Error(
    `dist/index.html is required to generate ${resolve(distRoot, "sw.js")}`,
  );
}

const urls = (await filesIn(dist))
  .map(
    (path) =>
      `/${relative(dist, path)
        .split(sep)
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/")}`,
  )
  .sort();
const template = await readFile(templatePath, "utf8");
const cacheVersion = `${Date.now().toString(36)}-${randomUUID()}`;
const output = template
  .replace("__CACHE_VERSION__", cacheVersion)
  .replace("__PRECACHE_URLS__", JSON.stringify(urls));

if (
  output.includes("__CACHE_VERSION__") ||
  output.includes("__PRECACHE_URLS__")
) {
  throw new Error(
    "Service worker generation left replacement tokens unresolved",
  );
}

await writeFile(resolve(dist, "sw.js"), output);

// Keep the contract path (`dist/sw.js`) in sync when Astro serves static
// assets from `dist/client/` in server mode.
if (resolve(dist) !== resolve(distRoot)) {
  await writeFile(resolve(distRoot, "sw.js"), output);

  // Mirror the contract PWA assets so `dist/*` checks keep passing while
  // the Node server serves `dist/client/*`.
  const contractAssets = [
    "index.html",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-192-maskable.png",
    "icons/icon-512.png",
    "icons/icon-512-maskable.png",
    "icons/apple-touch-icon.png",
    "splash/ipad-portrait.png",
    "splash/ipad-landscape.png",
  ];
  await Promise.all(
    contractAssets.map(async (asset) => {
      const from = resolve(dist, asset);
      if (!(await isRegularFile(from))) return;
      const to = resolve(distRoot, asset);
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to);
    }),
  );
}
