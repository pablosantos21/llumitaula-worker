import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { stdout } from "node:process";
import { URL } from "node:url";

const distDirectory = new URL("../dist/", import.meta.url);
const publicHtml = [];

const requiredPwaAssets = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "icons/icon-192.png",
  "icons/icon-192-maskable.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",
  "icons/apple-touch-icon.png",
  "splash/ipad-portrait.png",
  "splash/ipad-landscape.png",
];

async function collectHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory.pathname, entry.name);
    if (entry.isDirectory()) await collectHtml(new URL(`file://${path}/`));
    if (entry.isFile() && entry.name.endsWith(".html")) {
      publicHtml.push(await readFile(path, "utf8"));
    }
  }
}

async function assertRequiredFile(path) {
  const resource = `dist/${path}`;
  let details;
  try {
    details = await stat(new URL(path, distDirectory));
  } catch (error) {
    throw new Error(`Required PWA resource must be a file: ${resource}`, {
      cause: error,
    });
  }
  if (!details.isFile()) {
    throw new Error(`Required PWA resource must be a file: ${resource}`);
  }
}

await collectHtml(distDirectory);

const sensitiveMockValues = [
  "Ana Martínez",
  "Biel Roca",
  "Carla Soler",
  "Laura García",
];

for (const html of publicHtml) {
  for (const value of sensitiveMockValues) {
    if (html.includes(value)) {
      throw new Error(`Sensitive mock value found in generated HTML: ${value}`);
    }
  }
}

await Promise.all(requiredPwaAssets.map(assertRequiredFile));

let manifest;
try {
  manifest = JSON.parse(
    await readFile(new URL("manifest.webmanifest", distDirectory), "utf8"),
  );
} catch (error) {
  throw new Error(
    "Generated manifest is not valid JSON: dist/manifest.webmanifest",
    {
      cause: error,
    },
  );
}
if (manifest.display !== "standalone") {
  throw new Error('Generated manifest must use display: "standalone"');
}

const generatedServiceWorker = await readFile(
  new URL("sw.js", distDirectory),
  "utf8",
);
if (/supabase|service_role/i.test(generatedServiceWorker)) {
  throw new Error("Generated service worker must not contain Supabase secrets");
}

const source = await Promise.all(
  ["src/pages/index.astro", "src/pages/search.astro"].map((path) =>
    readFile(new URL(`../${path}`, import.meta.url), "utf8"),
  ),
);

if (
  source.some((page) =>
    /MOCK_STUDENTS|CURRENT_MONITOR|data-student-name/.test(page),
  )
) {
  throw new Error(
    "Business pages must not expose child mock data in Astro HTML",
  );
}

stdout.write(`Public data check passed for ${publicHtml.length} HTML files\n`);
