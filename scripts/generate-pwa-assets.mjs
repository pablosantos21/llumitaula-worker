import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const assets = [
  ["public/icons/pwa-icon.svg", "public/icons/apple-touch-icon.png", 180],
  ["public/icons/pwa-icon.svg", "public/icons/icon-192.png", 192],
  ["public/icons/pwa-icon.svg", "public/icons/icon-512.png", 512],
  ["public/icons/pwa-icon.svg", "public/icons/icon-192-maskable.png", 192],
  ["public/icons/pwa-icon.svg", "public/icons/icon-512-maskable.png", 512],
  [
    "public/splash/ipad-portrait.svg",
    "public/splash/ipad-portrait.png",
    2048,
    2732,
  ],
  [
    "public/splash/ipad-landscape.svg",
    "public/splash/ipad-landscape.png",
    2732,
    2048,
  ],
];

await Promise.all(
  assets.map(async ([input, output, width, height = width]) => {
    const outputPath = resolve(root, output);
    await mkdir(dirname(outputPath), { recursive: true });
    await sharp(resolve(root, input))
      .resize(width, height)
      .png()
      .toFile(outputPath);
  }),
);
