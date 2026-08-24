import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, URL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(process.env.PWA_DIST_DIR || resolve(root, "dist"));
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

const indexPath = resolve(dist, "index.html");
try {
  if (!(await stat(indexPath)).isFile()) {
    throw new Error("not a regular file");
  }
} catch {
  throw new Error(
    `dist/index.html is required to generate ${resolve(dist, "sw.js")}`,
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
