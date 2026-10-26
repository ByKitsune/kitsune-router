import { ImageResponse } from "next/og";
import { DOCS_IDENTITY } from "@/constants/identity.mjs";

// Generated once by `next build` and included in the static docs export. This
// route deliberately is not a metadata-file route, which would infer a host.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", flexDirection: "column", padding: "64px 72px", background: "#fffefa", color: "#30241d", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>{DOCS_IDENTITY.name} Documentation</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 72, fontSize: 78, fontWeight: 700, letterSpacing: "-3px", lineHeight: 1.12 }}>
          <span>Your models.</span>
          <span>Your routes.</span>
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 28 }}>{DOCS_IDENTITY.description}.</div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 24 }}>{DOCS_IDENTITY.organization}</div>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none" width={310} height={310} style={{ position: "absolute", right: 52, top: 125 }} aria-hidden="true">
          <path d="M13 12 39 25H57L83 12 76 58 48 84 20 58Z" fill="#a63f23" />
          <path d="M20 24 35 32 23 44ZM76 24 61 32 73 44Z" fill="#f3dfba" />
          <path d="M23 48 42 56 48 72 54 56 73 48 68 63 48 81 28 63Z" fill="#fffefa" />
          <path d="m34 43 9 5m19-5-9 5" stroke="#30241d" strokeWidth="5" strokeLinecap="round" />
          <path d="m43 62 5 5 5-5" fill="#30241d" />
          <path d="M48 30V18M41 18h14" stroke="#fffefa" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
