import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { stdout } from "node:process";
import { URL } from "node:url";

const distDirectory = new URL("../dist/", import.meta.url);
const publicHtml = [];

async function collectHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory.pathname, entry.name);
    if (entry.isDirectory()) await collectHtml(new URL(`file://${path}/`));
    if (entry.isFile() && entry.name.endsWith(".html")) {
      publicHtml.push(await readFile(path, "utf8"));
    }
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
