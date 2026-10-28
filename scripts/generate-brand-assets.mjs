#!/usr/bin/env node
// Reproducible exports from the approved ByKitsune mascot and favicon.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const mascot192 = path.join(root, "public/brand/bykitsune-favicon.png");
const mascot512 = path.join(root, "public/brand/bykitsune-favicon-512.png");
const originalIco = path.join(root, "public/brand/bykitsune-favicon.ico");
const embedded = (await fs.readFile(mascot192)).toString("base64");
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" role="img" aria-labelledby="title">\n  <title id="title">Kitsune Router — ByKitsune</title>\n  <image width="192" height="192" href="data:image/png;base64,${embedded}"/>\n</svg>\n`;

// Keep existing SVG URLs working while using the same official mascot on every
// surface. The embedded bitmap works when the SVG itself is loaded as an image.
for (const destination of ["public/icons/logo.svg", "public/icons/icon-192.svg", "public/icons/icon-512.svg", "public/favicon.svg", "gitbook/public/icons/logo.svg"]) {
  await fs.writeFile(path.join(root, destination), logo);
}
for (const [source, destination] of [
  [mascot192, "public/icons/icon-192.png"],
  [mascot192, "gitbook/public/brand/bykitsune-favicon.png"],
  [mascot512, "public/icons/icon-512.png"],
  [originalIco, "public/favicon.ico"],
  [originalIco, "src/app/favicon.ico"],
  [originalIco, "cli/src/cli/tray/icon.ico"],
]) {
  await fs.copyFile(source, path.join(root, destination));
}
await sharp(mascot512).resize(180, 180).png().toFile(path.join(root, "public/icons/apple-touch-icon.png"));
await sharp(mascot512).resize(64, 64).png().toFile(path.join(root, "cli/src/cli/tray/icon.png"));
const safeMascot = await sharp(mascot512).resize(408, 408).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#fffefa" } })
  .composite([{ input: safeMascot, left: 52, top: 52 }]).png()
  .toFile(path.join(root, "public/icons/icon-512-maskable.png"));

const socialMascot = await sharp(mascot512).resize(330, 330).png().toBuffer();
for (const [template, destination] of [
  ["public/brand/social-card.svg", "public/brand/social-card.png"],
  ["gitbook/public/brand/social-card.svg", "gitbook/public/brand/docs-social-card.png"],
]) {
  const svg = await fs.readFile(path.join(root, template), "utf8");
  const marker = /<image\s+data-brand-mascot="true"[^>]*\/>/;
  if (!marker.test(svg)) throw new Error(`Missing mascot marker in ${template}`);
  // Composite from the local original instead of relying on an external SVG
  // image fetch, which is often blocked during image rendering.
  await sharp(Buffer.from(svg.replace(marker, "")))
    .composite([{ input: socialMascot, left: 825, top: 115 }]).png()
    .toFile(path.join(root, destination));
}
console.log("Exported ByKitsune mascot, app, tray, favicon, and social artwork.");
