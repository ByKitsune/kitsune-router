#!/usr/bin/env node
// Reproducible app assets from the official, source-controlled ByKitsune artwork.
// This is the exact 192px ByKitsune favicon retained in public/brand, not a
// redrawn or generated product mark. Larger derivatives retain its raster origin.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "public/brand/bykitsune-favicon.png");
const officialArtwork = await fs.readFile(source);
const imageHref = `data:image/png;base64,${officialArtwork.toString("base64")}`;
const image = (x, y, width, height) => `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${imageHref}"/>`;
const appSvg = (size, padding = 0, background = false) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <title>Kitsune Router — ByKitsune</title>
  ${background ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#fffaf5"/>` : ""}
  ${image(padding, padding, size - padding * 2, size - padding * 2)}
</svg>
`;
// SVG paths stay compatible with existing consumers, but contain only the official
// image. No legacy fox geometry remains, and all resources are self-contained.
for (const destination of ["public/icons/logo.svg", "public/favicon.svg"]) {
  await fs.writeFile(path.join(root, destination), appSvg(192).replace(/^[ \t]+$/gm, ""));
}
for (const size of [192, 512]) {
  await fs.writeFile(path.join(root, `public/icons/icon-${size}.svg`), appSvg(size, size * 0.1, true));
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
const socialSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fffaf5"/>
  <rect x="822" y="80" width="302" height="470" rx="48" fill="#f4e7df"/>
  ${image(836, 162, 276, 276)}
  <g fill="#30241d" font-family="Arial, Helvetica, sans-serif">
    <text x="72" y="118" font-size="32" font-weight="700">Kitsune Router</text>
    <text x="72" y="282" font-size="76" font-weight="700" letter-spacing="-3">Your models.</text>
    <text x="72" y="368" font-size="76" font-weight="700" letter-spacing="-3">Your routes.</text>
    <text x="72" y="452" font-size="29">A provider-neutral AI gateway.</text>
    <text x="72" y="560" font-size="25">Open source. Self-hosted. By ByKitsune.</text>
  </g>
</svg>
`;
await fs.writeFile(path.join(root, "public/brand/social-card.svg"), socialSvg);
await sharp(Buffer.from(socialSvg)).png()
  .toFile(path.join(root, "public/brand/social-card.png"));
// The static documentation site keeps its own public asset snapshot.
for (const relativePath of ["icons/logo.svg", "brand/social-card.svg"]) {
  const destination = path.join(root, "gitbook/public", relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, "public", relativePath), destination);
}
console.log("Exported Kitsune Router assets from the official ByKitsune artwork.");
