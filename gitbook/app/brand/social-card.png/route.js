import { readFileSync } from "node:fs";
import path from "node:path";

// Export the locally generated artwork at a stable URL, without an external
// image request or an inferred deployment host.
export const dynamic = "force-static";

export function GET() {
  const image = readFileSync(path.join(process.cwd(), "public/brand/docs-social-card.png"));
  return new Response(image, { headers: { "Content-Type": "image/png" } });
}
