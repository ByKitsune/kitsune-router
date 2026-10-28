import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file));
const dimensions = (file) => {
  const bytes = read(file);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from("89504e470d0a1a0a", "hex"));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

describe("ByKitsune brand assets", () => {
  it("retains the approved original mascot and wordmark bytes", () => {
    const digest = (file) => createHash("sha256").update(read(file)).digest("hex");
    expect(digest("public/brand/bykitsune-favicon.png")).toBe("564137a12269aaac9c9c8f4ccb8e355cbbe690afcec481fac0510ff9cab9d9b2");
    expect(digest("public/brand/bykitsune-favicon-512.png")).toBe("b33d10c133d8cb7cff8ce9858b9cc373a38e4ff6723ec12504bb76b9d0ce0323");
    expect(digest("public/brand/bykitsune-favicon.ico")).toBe("f86cbe423c7d9dfe48e11a98756a584a90c4d99d4a2796a18205cd2983a28a84");
    expect(digest("public/brand/bykitsune-wordmark.webp")).toBe("6918abc7555791781d300dfffad49933bdd5f4924096cd2e12b110d39cd31d62");
    expect(read("src/shared/components/Footer.js").toString("utf8")).toContain("/brand/bykitsune-wordmark.webp");
  });

  it("uses the original mascot for each shared SVG logo and favicon", () => {
    const mascot = read("public/brand/bykitsune-favicon.png");
    for (const file of ["public/icons/logo.svg", "public/icons/icon-192.svg", "public/icons/icon-512.svg", "public/favicon.svg", "gitbook/public/icons/logo.svg"]) {
      const svg = read(file).toString("utf8");
      const embedded = svg.match(/data:image\/png;base64,([^"\s]+)/)?.[1];
      expect(embedded, file).toBeTruthy();
      expect(Buffer.from(embedded, "base64").equals(mascot), file).toBe(true);
    }
  });

  it("keeps browser, app and tray icons aligned with the original ByKitsune assets", () => {
    expect(read("public/icons/icon-192.png").equals(read("public/brand/bykitsune-favicon.png"))).toBe(true);
    expect(read("public/icons/icon-512.png").equals(read("public/brand/bykitsune-favicon-512.png"))).toBe(true);
    const favicon = read("public/brand/bykitsune-favicon.ico");
    for (const file of ["public/favicon.ico", "src/app/favicon.ico", "cli/src/cli/tray/icon.ico"]) {
      expect(read(file).equals(favicon), file).toBe(true);
    }
    expect(dimensions("public/icons/apple-touch-icon.png")).toEqual([180, 180]);
    expect(dimensions("public/icons/icon-512-maskable.png")).toEqual([512, 512]);
    expect(read("src/app/manifest.js").toString("utf8")).toContain("/icons/icon-512-maskable.png");
  });

  it("generates branded social cards for the app and documentation", () => {
    expect(dimensions("public/brand/social-card.png")).toEqual([1200, 630]);
    expect(dimensions("gitbook/public/brand/docs-social-card.png")).toEqual([1200, 630]);
  });
});
