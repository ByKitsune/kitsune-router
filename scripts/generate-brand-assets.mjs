#!/usr/bin/env node
// Reproducible bitmap exports from source-controlled product artwork.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "public/icons/icon-192.svg");
for (const size of [192, 512]) {
  await sharp(path.join(root, `public/icons/icon-${size}.svg`)).resize(size, size).png()
    .toFile(path.join(root, `public/icons/icon-${size}.png`));
}
await sharp(source).resize(180, 180).png().toFile(path.join(root, "public/icons/apple-touch-icon.png"));
await sharp(source).resize(64, 64).png().toFile(path.join(root, "cli/src/cli/tray/icon.png"));
const images = await Promise.all([16, 32, 48, 64, 128, 256].map(async (size) => ({
  size, png: await sharp(source).resize(size, size).png().toBuffer(),
})));
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
for (const [index, { size, png }] of images.entries()) {
  const entry = 6 + index * 16;
  header.writeUInt8(size === 256 ? 0 : size, entry);
  header.writeUInt8(size === 256 ? 0 : size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
}
const ico = Buffer.concat([header, ...images.map(({ png }) => png)]);
for (const destination of ["src/app/favicon.ico", "public/favicon.ico", "cli/src/cli/tray/icon.ico"]) {
  await fs.writeFile(path.join(root, destination), ico);
}
await sharp(path.join(root, "public/brand/social-card.svg")).png()
  .toFile(path.join(root, "public/brand/social-card.png"));
console.log("Exported Kitsune Router app, tray, favicon, and social artwork.");
